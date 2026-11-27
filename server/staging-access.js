import express from 'express';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

const unlockPath='/staging-access';
const duration=8*60*60*1000;
const digest=value=>createHash('sha256').update(value).digest();

function unlockPage(res,status,message='') {
  return res.status(status).type('html').send(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Sparkle staging</title>
<style>body{margin:0;background:#fffaf5;color:#543841;font:16px system-ui,sans-serif}main{max-width:26rem;margin:12vh auto 0;padding:1.5rem}.card{padding:1.5rem;border:1px solid #ecd8d5;border-radius:20px;background:#fffdfb}h1{font:2rem Georgia,serif;margin-top:0}label,input,button{display:block}input,button{box-sizing:border-box;width:100%;padding:.8rem;font:inherit;margin-top:.5rem;border-radius:12px;border:1px solid #a94f68}button{background:#a94f68;color:white;margin-top:1rem}</style>
<main><div class="card"><h1>Sparkle staging</h1><form method="post" action="${unlockPath}">
<label for="password">Staging password</label><input required id="password" name="password" type="password" autocomplete="current-password" maxlength="256">
${message?'<p role="alert">'+message+'</p>':''}<button type="submit">Continue</button></form></div></main></html>`);
}

export function stagingAccess(env,limit) {
  const enabled=env.STAGING_ACCESS_ENABLED;
  if (enabled!==undefined && !['true','false'].includes(enabled)) throw new Error('STAGING_ACCESS_ENABLED must be true or false.');
  if (enabled!=='true') return null;
  const {STAGING_ACCESS_PASSWORD:password,SESSION_SECRET:secret}=env;
  if (!password || password.trim().length<20 || Buffer.byteLength(password)>256) {
    throw new Error('Staging access requires a password of at least 20 characters and at most 256 bytes.');
  }
  if (!secret || secret.length<32) throw new Error('Staging access requires a SESSION_SECRET of at least 32 characters.');
  const secure=env.NODE_ENV==='production';
  const cookie=secure?'__Host-sparkle_staging':'sparkle_staging';
  const expected=digest(password);
  const key=createHmac('sha256',secret).update('sparkle staging v1:').update(expected).digest();
  const signature=expiry=>createHmac('sha256',key).update(expiry).digest('base64url');
  function unlocked(req) {
    const value=req.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(cookie+'='))?.slice(cookie.length+1);
    const match=value?.match(/^(\d{13})\.([\w-]{43})$/);
    return Boolean(match && Number(match[1])>Date.now() && timingSafeEqual(Buffer.from(match[2]),Buffer.from(signature(match[1]))));
  }
  const gate=express.Router({caseSensitive:true,strict:true});
  gate.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive'});
    if (req.path==='/api/health' && ['GET','HEAD'].includes(req.method)) return next();
    if (secure && !req.secure) return res.sendStatus(403);
    next();
  });
  gate.get(unlockPath,(_req,res)=>unlockPage(res,200));
  gate.post(unlockPath,limit,express.urlencoded({extended:false,limit:'2kb',parameterLimit:4}),(req,res)=>{
    if (req.get('origin')!==(env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`)) return res.sendStatus(403);
    const attempt=req.body?.password;
    if (typeof attempt!=='string' || !timingSafeEqual(digest(attempt),expected)) return unlockPage(res,401,'Incorrect staging password.');
    const expiry=String(Date.now()+duration);
    res.cookie(cookie,expiry+'.'+signature(expiry),{httpOnly:true,secure,sameSite:'strict',path:'/',maxAge:duration});
    res.redirect(303,'/');
  });
  gate.use((req,res,next)=>{
    if ((req.path==='/api/health' && ['GET','HEAD'].includes(req.method)) || unlocked(req)) return next();
    if (req.method==='GET' && !req.path.startsWith('/api/') && req.get('accept')?.includes('text/html')) return unlockPage(res,401);
    res.status(401).json({error:'staging_access_required'});
  });
  return gate;
}
