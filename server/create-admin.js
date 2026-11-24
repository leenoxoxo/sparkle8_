import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {createPool} from './database.js';
import {hashPassword} from './auth.js';

const pool = createPool(process.env.MIGRATION_DATABASE_URL);
if (!pool || !process.stdin.isTTY) {
  console.error('Run this command in an interactive terminal with MIGRATION_DATABASE_URL set in .env.');
  process.exitCode = 1;
  if (pool) await pool.end();
} else {
  let hidden = false;
  const output = new Writable({write(chunk,encoding,done) {
    if (!hidden) process.stdout.write(chunk,encoding);
    done();
  }});
  const prompt = createInterface({input:process.stdin,output,terminal:true});
  const passwordPrompt = async message => {
    process.stdout.write(message);
    hidden = true;
    try {return await prompt.question('');}
    finally {hidden = false;process.stdout.write('\n');}
  };
  prompt.on('SIGINT',() => {prompt.close();process.exit(130);});
  try {
    const email = (await prompt.question('Administrator email: ')).trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    const password = await passwordPrompt('Password (hidden): ');
    if (password.length < 15 || Buffer.byteLength(password) > 256) throw new Error('Use a password with at least 15 characters and at most 256 bytes.');
    if (password !== await passwordPrompt('Repeat password (hidden): ')) throw new Error('Passwords do not match.');
    const hash = await hashPassword(password);
    await pool.query(`with account as (
      insert into public.admin_members(email,password_hash) values($1,$2)
      on conflict(email) do update set password_hash=excluded.password_hash,active=true
      returning user_id
    ) delete from public.admin_sessions where sess->'passport'->>'user' in (select user_id::text from account)`,[email,hash]);
    console.log('Administrator is ready. Previous sessions for this account were revoked.');
  } catch (error) {
    console.error(error.code ? 'Unable to update the administrator. Check the database setup.' : error.message);
    process.exitCode = 1;
  } finally {prompt.close();await pool.end();}
}
