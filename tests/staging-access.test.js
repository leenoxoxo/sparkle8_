import assert from 'node:assert/strict';
import test from 'node:test';
import session from 'express-session';
import {resolve} from 'node:path';
import {createApp} from '../server/app.js';

const password='staging-test-password-example';
const env={NODE_ENV:'production',RENDER:'true',APP_ORIGIN:'https://staging.example.test',
  SESSION_SECRET:'staging-test-session-secret-example',STAGING_ACCESS_ENABLED:'true',STAGING_ACCESS_PASSWORD:password};
const options={env,pool:null,sessionStore:new session.MemoryStore(),staticDir:resolve('public'),
  db:{catalog:async()=>[],quote:async()=>({total:4200})}};

async function start(t,settings=env) {
  const server=createApp({...options,env:settings}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return (path,{forwarded='https',headers={},...init}={})=>fetch('http://127.0.0.1:'+server.address().port+path,
    {redirect:'manual',...init,headers:{'X-Forwarded-Proto':forwarded,...headers}});
}

test('staging access fails closed for incomplete configuration',()=>{
  assert.throws(()=>createApp({...options,env:{...env,STAGING_ACCESS_PASSWORD:''}}),/requires a password/);
  assert.throws(()=>createApp({...options,env:{...env,STAGING_ACCESS_ENABLED:'yes'}}),/must be true or false/);
});

test('staging gate protects pages, assets and APIs while leaving health and admin authentication intact',async t=>{
  const call=await start(t);
  const health=await call('/api/health',{forwarded:'http'});
  assert.equal(health.status,200);
  assert.match(health.headers.get('x-robots-tag'),/noindex/);
  for(const [path,method] of [['/','GET'],['/admin','GET'],['/favicon.svg','GET'],['/api/catalog','GET'],['/api/checkout/orders','POST'],['/api/admin/me','GET']]){
    const response=await call(path,{method});
    assert.equal(response.status,401);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const signIn=await call('/admin',{headers:{Accept:'text/html'}});
  assert.match(await signIn.text(),/Staging password/);
  const unlock=(value,origin=env.APP_ORIGIN,forwarded='https')=>call('/staging-access',{method:'POST',forwarded,
    headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:value})});
  assert.equal((await unlock(password,'https://other.example')).status,403);
  assert.equal((await unlock(password,env.APP_ORIGIN,'http')).status,403);
  assert.equal((await unlock('wrong')).status,401);
  const success=await unlock(password);
  assert.equal(success.status,303);
  const header=success.headers.get('set-cookie');
  for(const attribute of [/^__Host-sparkle_staging=/,/HttpOnly/,/Secure/,/SameSite=Strict/,/Path=\//])assert.match(header,attribute);
  assert.doesNotMatch(header,/Domain=/i);
  const Cookie=header.split(';')[0];
  for(const path of ['/favicon.svg','/api/catalog']){
    const response=await call(path,{headers:{Cookie}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.match(response.headers.get('x-robots-tag'),/noindex/);
  }
  assert.equal((await call('/api/catalog',{headers:{Cookie:Cookie.slice(0,-1)+(Cookie.endsWith('A')?'B':'A')}})).status,401);
  assert.equal((await call('/api/admin/me',{headers:{Cookie}})).status,401);
  const quote=await call('/api/checkout/quote',{method:'POST',headers:{Cookie,Origin:env.APP_ORIGIN,'Content-Type':'application/json'},
    body:JSON.stringify({items:[{productId:'preview-item',quantity:1}]})});
  assert.deepEqual(await quote.json(),{total:4200});
  for(let i=0;i<5;i++)assert.equal((await unlock('wrong')).status,401);
  assert.equal((await unlock(password)).status,429);
});

test('disabling staging restores public catalog and caching',async t=>{
  const call=await start(t,{...env,STAGING_ACCESS_ENABLED:'false',STAGING_ACCESS_PASSWORD:undefined});
  const response=await call('/api/catalog');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-robots-tag'),null);
  assert.match(response.headers.get('cache-control'),/public/);
});
