import {randomBytes} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createPool} from './database.js';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const pool = createPool(migrationUrl);
if (!pool) {
  console.error('Set MIGRATION_DATABASE_URL in .env first.');
  process.exitCode = 1;
} else {
  try {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(5136724)');
      await client.query('create table if not exists public.sparkle_migrations (name text primary key, applied_at timestamptz not null default now())');
      const {rows} = await client.query('select name from public.sparkle_migrations');
      const applied = new Set(rows.map(row => row.name));
      const path = new URL('../db/migrations/',import.meta.url);
      for (const name of (await readdir(path)).filter(file => file.endsWith('.sql')).sort()) {
        if (applied.has(name)) continue;
        await client.query(await readFile(new URL(name,path),'utf8'));
        await client.query('insert into public.sparkle_migrations(name) values($1)',[name]);
        console.log('Applied ' + name);
      }
      let runtime;
      if (!process.env.DATABASE_URL) {
        const password = randomBytes(32).toString('base64url');
        const {rows:[role]} = await client.query("select exists(select 1 from pg_roles where rolname='sparkle_web') as present");
        await client.query(`${role.present ? 'alter' : 'create'} role sparkle_web login inherit password '${password}'`);
        await client.query('grant sparkle_runtime to sparkle_web');
        runtime = new URL(migrationUrl);
        runtime.username = 'sparkle_web';
        runtime.password = password;
      }
      await client.query('commit');
      if (runtime) {
        const current = await readFile('.env','utf8');
        const next = current.replace(/^DATABASE_URL=.*(?:\r?\n|$)/gm,'');
        await writeFile('.env',next.trimEnd() + '\nDATABASE_URL=' + runtime + '\n');
        console.log('Created the restricted application connection in .env.');
      }
      console.log('Database is ready.');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {client.release();}
  } catch (error) {
    console.error('Database preparation failed' + (error.code ? ' (' + error.code + ')' : '') + '. Check the Neon owner connection and database permissions.');
    process.exitCode = 1;
  } finally {await pool.end();}
}
