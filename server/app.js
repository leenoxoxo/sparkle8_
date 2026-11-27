import express from 'express';
import compression from 'compression';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {basename,relative,resolve,sep} from 'node:path';
import {productInput, storefrontProducts} from './catalog.js';
import {HttpError} from './errors.js';
import {createPool,repository} from './database.js';
import {cloudImages} from './images.js';
import {adminAuthentication} from './auth.js';
import {cart, customer, integer, invalid, slug, text, uuid} from './validation.js';
import {orderConfirmation} from './whatsapp.js';
import {homepageInput} from './homepage.js';
import {cloudinaryPath} from './images.js';
import {stagingAccess} from './staging-access.js';

const states = ['Confirmed','Preparing','Shipped','Delivered','Cancelled','Paid'];

function dateRange(query) {
  const dates = [query.from,query.to].map(value => {
    if (value === undefined) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
    const day = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(+day) || day.toISOString().slice(0,10) !== value || value.startsWith('0000')) invalid();
    return value;
  });
  if (dates[0] && dates[1] && dates[0]>dates[1]) invalid();
  return dates;
}

function limiter(max, windowMs) {
  const clients = new Map();
  let lastSweep = 0;
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [key, value] of clients) if (value.ends <= now) clients.delete(key);
      lastSweep = now;
    }
    const previous = clients.get(req.ip);
    const current = previous?.ends > now ? previous : {ends: now + windowMs, count: 0};
    clients.set(req.ip, current);
    if (++current.count > max) return next(new HttpError(429, 'too_many_requests'));
    next();
  };
}

function imageType(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16) invalid('invalid_image');
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'jpg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (bytes.toString('ascii', 4, 8) === 'ftyp' && ['avif','avis'].includes(bytes.toString('ascii', 8, 12))) return 'avif';
  invalid('invalid_image');
}

export function createApp({env = process.env, pool = createPool(env.DATABASE_URL), db = repository(pool), upload = cloudImages(env), sessionStore, staticDir = resolve('dist')} = {}) {
  const app = express();
  const api = express.Router();
  const admin = express.Router();
  const authLimit = limiter(12, 15 * 60 * 1000);
  const orderLimit = limiter(20, 10 * 60 * 1000);
  const previewLimit = limiter(180, 10 * 60 * 1000);
  const receiptLimit = limiter(60, 10 * 60 * 1000);
  const staging=stagingAccess(env,limiter(8,15*60*1000));
  const authentication = adminAuthentication({env,pool,db,store:sessionStore});
  const publicReads = new Map();
  const publicLifetime = 10000;
  function cached(key,load) {
    const cachedValue=publicReads.get(key);
    if(cachedValue && cachedValue.expires>Date.now()) return cachedValue.promise;
    const entry={expires:Infinity};
    entry.promise=Promise.resolve().then(load).then(value=>{
      entry.expires=Date.now()+publicLifetime;
      return value;
    }).catch(error=>{
      if(publicReads.get(key)===entry)publicReads.delete(key);
      throw error;
    });
    publicReads.set(key,entry);
    return entry.promise;
  }
  const sendPublic=(res,data)=>res.set('Cache-Control',staging?'no-store':'public, max-age=0, must-revalidate').json(data);

  app.disable('x-powered-by');
  app.use(compression({threshold:1024}));
  if (env.RENDER) app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY'});
    if (env.NODE_ENV === 'production') {
      res.set('Content-Security-Policy', [
        "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: https://res.cloudinary.com",
        "media-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"
      ].join('; '));
    }
    next();
  });
  if (staging) app.use(staging);
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET','HEAD'].includes(req.method)) {
      const expected = env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
      if (req.get('origin') !== expected) return next(new HttpError(403, 'invalid_origin'));
    }
    next();
  });
  api.use(express.json({limit: '160kb'}));
  api.get('/health', (req, res) => res.json({ok: true}));
  api.get('/catalog', async (req, res) => {
    const products=cached('products',async()=>storefrontProducts(await db.catalog(true)));
    if(req.query.withCategories!=='1') return sendPublic(res,await products);
    const [catalog,categories]=await Promise.all([products,publicCategories()]);
    sendPublic(res,{products:catalog,categories});
  });
  const publicCategories=()=>cached('categories',async()=>{
    const rows = await db.categories();
    const visible=new Set(rows.filter(row=>row.published).map(row=>row.name));
    return rows.filter(row=>row.published && (!row.parent || visible.has(row.parent)));
  });
  api.get('/categories', async (req,res) => sendPublic(res,await publicCategories()));
  api.get('/delivery', async (req, res) => {
    const rows = (await db.delivery()).filter(area => area.active);
    res.json(rows.flatMap(area => {
      const fee = area.fee ?? rows.find(region => region.code === area.region)?.fee;
      return fee == null || !area.selectable ? [] : [{code: area.code, name: area.name, nameAr: area.name_ar, fee}];
    }));
  });
  api.post('/checkout/quote', previewLimit, async (req, res) => {
    res.json(await db.quote(cart(req.body?.items)));
  });
  api.post('/checkout/preview', previewLimit, async (req,res) => {
    res.json(await db.quote(cart(req.body?.items)));
  });
  api.post('/checkout/orders', orderLimit, async (req, res) => {
    const {submission, items, expected, language} = req.body ?? {};
    if (!uuid(submission) || submission[14]!=='4' || !/[89ab]/i.test(submission[19]) ||
      !['en','ar'].includes(language) || !expected || typeof expected !== 'object' || Array.isArray(expected)) invalid();
    const order = await db.submit({submission,items:cart(items),customer:customer(req.body.customer),expected,language});
    res.status(201).json(orderConfirmation(order));
  });
  api.get('/checkout/orders/:token', receiptLimit, async (req, res) => {
    if (!uuid(req.params.token)) invalid();
    const order = await db.order(req.params.token);
    if (!order) throw new HttpError(404, 'not_found');
    res.json(orderConfirmation(order));
  });
  admin.use(authentication.middleware);
  admin.post('/login', authLimit, (req,res,next) => {
    text(req.body?.email,254);
    if (typeof req.body?.password !== 'string' || !req.body.password || Buffer.byteLength(req.body.password) > 256) invalid();
    authentication.login(req,res,next);
  });
  admin.use((req,res,next) => {
    if (!req.isAuthenticated()) throw new HttpError(401,'login_required');
    next();
  });
  admin.use((req,res,next)=>{
    if (['PUT','PATCH','DELETE'].includes(req.method)) res.once('finish',()=>{
      if(res.statusCode<300) publicReads.clear();
    });
    next();
  });
  admin.post('/logout', authentication.logout);
  admin.get('/products', async (req, res) => res.json(await db.catalog()));
  admin.patch('/products/bulk', async (req,res) => {
    const {targets,price,stock,category,published}=req.body ?? {};
    if (!Array.isArray(targets) || !targets.length || targets.length>50 || !targets.every(slug) ||
      new Set(targets).size!==targets.length || (published!==undefined && typeof published!=='boolean')) invalid();
    const changes={};
    if (price!==undefined) changes.price=integer(price,100000000);
    if (stock!==undefined) changes.stock=integer(stock,1000000);
    if (published!==undefined) changes.published=published;
    if (category!==undefined) {
      const name=text(category,80);
      const row=(await db.categories()).find(item=>item.name===name);
      if (!row) invalid();
      Object.assign(changes,{category:row.name,categoryAr:row.name_ar});
    }
    if (!Object.keys(changes).length) invalid();
    await db.bulkProducts(targets,changes);
    res.json({ok:true});
  });
  admin.put('/products/:slug', async (req, res) => {
    const {skus, ...product} = productInput(req.params.slug, req.body);
    await db.saveProduct(req.params.slug,product,skus,req.body.createOnly === true);
    res.json({ok: true});
  });
  admin.delete('/products/:slug', async (req, res) => {
    if (!slug(req.params.slug)) invalid();
    if (req.query.permanent === 'true') await db.deleteProduct(req.params.slug);
    else await db.archiveProduct(req.params.slug);
    res.json({ok: true});
  });
  admin.post('/images', express.raw({type: 'application/octet-stream', limit:'10mb'}), async (req, res) => {
    const format = imageType(req.body);
    const url = await upload(req.body,randomUUID(),{format});
    res.status(201).json({url});
  });
  admin.get('/orders', async (req, res) => {
    const offset = Number(req.query.offset ?? 0);
    integer(offset, 1000000);
    const group = req.query.group ?? null;
    if (group !== null && !['pending','processed','confirmed'].includes(group)) invalid();
    const {status,paid,sort='recent',search}=req.query;
    if ((status!==undefined && !['Pending',...states.filter(value=>value!=='Paid')].includes(status)) ||
      (paid!==undefined && !['true','false'].includes(paid)) || !['recent','oldest','highest'].includes(sort)) invalid();
    const [from,to]=dateRange(req.query);
    res.json(await db.orders(offset,group,{status,paid:paid===undefined?null:paid==='true',sort,from,to,
      search:search===undefined?null:text(search,100,0) || null}));
  });
  admin.patch('/orders/:id/notes', async (req,res)=>{
    if (!uuid(req.params.id)) invalid();
    if (!await db.updateOrderNotes(req.params.id,text(req.body?.notes ?? '',4000,0))) throw new HttpError(404,'not_found');
    res.json({ok:true});
  });
  admin.patch('/orders/:id/direct-costs', async (req,res)=>{
    const {delivery,costs}=req.body ?? {};
    if (!uuid(req.params.id) || !costs || typeof costs!=='object' || Array.isArray(costs) ||
      Object.keys(costs).length>40 || Object.keys(costs).some(key=>!/^([1-9]|[1-3][0-9]|40)$/.test(key))) invalid();
    const values=Object.fromEntries(Object.entries(costs).map(([key,value])=>[key,integer(value,100000000)]));
    if (!await db.updateDirectCosts(req.params.id,delivery==null?null:integer(delivery,100000000),values)) invalid();
    res.json({ok:true});
  });
  admin.patch('/orders/:id/delivery', async (req,res) => {
    if (!uuid(req.params.id)) invalid();
    const details = text(req.body?.details ?? '',1200,0);
    const fee = req.body?.fee == null ? null : integer(req.body.fee,1000000);
    const prices = req.body?.prices;
    if (prices != null && (!Array.isArray(prices) || prices.length > 40)) invalid();
    const agreed = prices?.map(value => value === null ? null : integer(value,100000000));
    if (!await db.updateDelivery(req.params.id,details,fee,agreed)) throw new HttpError(409,'delivery_locked');
    res.json({ok:true});
  });
  admin.patch('/orders/:id', async (req, res) => {
    if (!uuid(req.params.id) || !states.includes(req.body?.status)) invalid();
    res.json(await db.transition(req.params.id,req.body.status,req.user.user_id));
  });
  admin.get('/custom-requests', async (req, res) => {
    const offset = integer(Number(req.query.offset ?? 0), 1000000);
    res.json(await db.requests(offset));
  });
  admin.patch('/custom-requests/:id', async (req, res) => {
    const status = req.body?.status;
    if (!uuid(req.params.id) || !['Pending','Quoted',...states.slice(0,-1)].includes(status)) invalid();
    const quote = req.body.quote == null ? null : integer(req.body.quote,100000000);
    await db.saveRequest(req.params.id,status,quote);
    res.json({ok:true});
  });
  admin.get('/settings', async (req, res) => {
    const [settings, areas] = await Promise.all([db.settings(),db.delivery()]);
    res.json({whatsapp: settings.whatsapp, areas});
  });
  admin.put('/settings/whatsapp', async (req, res) => {
    const whatsapp = text(req.body?.whatsapp, 40).replace(/[+\s()-]/g,'');
    if (!/^[1-9][0-9]{7,14}$/.test(whatsapp)) invalid();
    await db.setWhatsapp(whatsapp);
    res.json({ok:true});
  });
  admin.put('/delivery/:code', async (req, res) => {
    const {code} = req.params;
    const {name, name_ar, region, fee, active, selectable} = req.body ?? {};
    if (!slug(code) || (region != null && (!slug(region) || region === code)) ||
      typeof active !== 'boolean' || typeof selectable !== 'boolean') invalid();
    if (region) {
      const membership = await db.regions(region,code);
      if (!membership.valid || membership.parent) invalid();
    }
    await db.saveDelivery({code,name:text(name,120),name_ar:text(name_ar,120),region:region ?? null,
      fee:fee == null ? null : integer(fee,1000000),active,selectable});
    res.json({ok:true});
  });
  admin.get('/stats', async (req, res) => res.json(await db.stats()));
  admin.get('/me', (req,res) => res.json({email:req.user.email}));
  admin.get('/inventory', async (req,res) => res.json({products:await db.catalog(),movements:await db.movements()}));
  admin.get('/customers', async (req,res) => {
    const offset=integer(Number(req.query.offset ?? 0),1000000);
    const {search,filter}=req.query;
    if (filter!==undefined && !['returning','outstanding','collected'].includes(filter)) invalid();
    res.json(await db.customers(offset,search===undefined?null:text(search,100,0) || null,filter ?? null));
  });
  admin.patch('/customers/:phone', async (req,res) => {
    const {phone} = req.params;
    if (!/^\+(9705[69]|9725[0-689])[0-9]{7}$/.test(phone)) invalid();
    if (!await db.saveCustomerNotes(phone,text(req.body?.notes ?? '',4000,0))) throw new HttpError(404,'not_found');
    res.json({ok:true});
  });
  admin.get('/categories', async (req,res) => res.json(await db.categories()));
  admin.patch('/categories', async (req,res) => {
    const data=req.body;
    const from=data?.from == null ? null : text(data.from,80);
    const to=text(data?.to,80);
    const parent=data.parent == null || data.parent === '' ? null : text(data.parent,80);
    const section=data.section ?? 'ready';
    const image=data.image || null;
    const rows=await db.categories();
    const sectionIntro = rows.some(row=>row.name===from && row.section_intro);
    if (!['ready','kits','cakes'].includes(section) || (data.published != null && typeof data.published !== 'boolean') ||
      (sectionIntro && (parent || section !== 'cakes')) ||
      (image && (typeof image !== 'string' || !cloudinaryPath.test(image))) ||
      (from !== to && rows.some(row=>row.name===to)) ||
      (parent && (parent === from || parent === to || rows.some(row=>row.parent===from && from) ||
        !rows.some(row=>row.name===parent && !row.parent && row.section===section)))) invalid();
    await db.renameCategory(from,to,text(data?.ar ?? '',80,0),{parent,section,image,sectionIntro,
      description:text(data.description ?? '',2000,0),descriptionAr:text(data.descriptionAr ?? '',2000,0),
      published:data.published !== false,displayOrder:integer(data.displayOrder ?? 0,1000000)});
    res.json({ok:true});
  });
  const publicContent=()=>cached('content',async()=>{
    const visible = rows => rows.map(row => row.body.published ? row : {key:row.key,body:{published:false}});
    const [workshops,website]=await Promise.all([db.content('workshops'),db.content('website')]);
    const home=website.find(row=>row.key==='homepage-live' && row.body.published)?.body.config;
    if (home) {
      home.reviews=home.reviews.filter(review=>review.approved && review.visible);
      home.banners=home.banners.filter(banner=>banner.active);
    }
    return {workshops:visible(workshops),website:visible(website.filter(row=>!row.key.startsWith('homepage-'))),home};
  });
  api.get('/content',async (req,res)=>sendPublic(res,await publicContent()));
  admin.get('/homepage', async (req,res) => {
    const [website,products,workshops]=await Promise.all([db.content('website'),db.catalog(true),db.content('workshops')]);
    res.json({draft:website.find(row=>row.key==='homepage-draft')?.body.config ?? null,
      published:website.find(row=>row.key==='homepage-live')?.body.config ?? null,products:storefrontProducts(products),workshops});
  });
  admin.put('/homepage', async (req,res) => {
    if (typeof req.body?.publish!=='boolean') invalid();
    await db.saveHomepage(homepageInput(req.body.home),req.body.publish);
    res.json({ok:true});
  });
  admin.get('/quantity-promotions', async (req,res) => {
    const [items,products]=await Promise.all([db.quantityPromotions(),db.catalog()]);
    res.json({items,products:products.filter(row=>row.presentation.kind!=='kit' && (row.presentation.priceMode ?? 'exact')==='exact')
      .map(row=>({slug:row.slug,name:row.presentation.name,nameAr:row.presentation.nameAr,archived:row.archived,
        price:row.catalog_skus.find(sku=>sku.active && sku.variant===(row.presentation.defaultVariant ?? ''))?.base_price
          ?? row.presentation.defaultPrice ?? row.catalog_skus.find(sku=>sku.active && sku.base_price!=null)?.base_price ?? null}))});
  });
  admin.put('/quantity-promotions/:id', async (req,res) => {
    const p=req.body;
    if (!uuid(req.params.id) || !slug(p?.product_slug) || !['fixed','percent'].includes(p.mode) ||
      [p.enabled,p.archived,p.stack].some(value=>typeof value!=='boolean')) invalid();
    const date=value=>{
      if (value == null || value==='') return null;
      if (typeof value!=='string' || value.length>35 || !Number.isFinite(Date.parse(value))) invalid();
      return new Date(value).toISOString();
    };
    const starts_at=date(p.starts_at), ends_at=date(p.ends_at);
    if (starts_at && ends_at && starts_at>=ends_at) invalid();
    await db.saveQuantityPromotion(req.params.id,{product_slug:p.product_slug,mode:p.mode,
      amount:integer(p.amount,p.mode==='percent' ? 100 : 100000000),starts_at,ends_at,
      title:text(p.title ?? '',100,0),title_ar:text(p.title_ar ?? '',100,0),
      description:text(p.description ?? '',400,0),description_ar:text(p.description_ar ?? '',400,0),
      enabled:p.enabled,archived:p.archived,stack:p.stack});
    res.json({ok:true});
  });
  admin.get('/promotions', async (req,res) => res.json({items:await db.promotions(),products:await db.catalog()}));
  admin.put('/promotions/:id', async (req,res) => {
    const p = req.body;
    if (!uuid(req.params.id) || !['store','category','products'].includes(p?.scope) || !['percent','amount'].includes(p.type)
      || typeof p.active !== 'boolean' || !Array.isArray(p.targets) || p.targets.length > 200) invalid();
    const dates = [p.starts,p.ends].map(value => {
      if (!value) return null;
      if (typeof value !== 'string' || value.length > 35 || !Number.isFinite(Date.parse(value))) invalid();
      return new Date(value).toISOString();
    });
    if (dates[0] && dates[1] && dates[1] <= dates[0]) invalid();
    const targets = p.targets.map(target => text(target,120));
    if (p.scope !== 'store' && !targets.length) invalid();
    await db.savePromotion(req.params.id,{...p,name:text(p.name,120),targets,
      amount:integer(p.amount,p.type === 'percent' ? 100 : 100000000),starts:dates[0],ends:dates[1]});
    res.json({ok:true});
  });
  admin.get('/content/:section', async (req,res) => {
    const {section} = req.params;
    if (!['workshops','website'].includes(section)) invalid();
    res.json({items:(await db.content(section)).filter(row=>!row.key.startsWith('homepage-')),registrations:section === 'workshops' ? await db.registrations() : []});
  });
  admin.put('/content/:section/:key', async (req,res) => {
    const {section,key} = req.params;
    const body = req.body;
    if (!slug(key) || key.startsWith('homepage-') || !['workshops','website'].includes(section) || typeof body?.published !== 'boolean') invalid();
    const fields = {name:text(body.name,180),nameAr:text(body.nameAr ?? '',180,0), description:text(body.description ?? '',1500,0),
      descriptionAr:text(body.descriptionAr ?? '',1500,0),published:body.published};
    if (section === 'workshops') {
      fields.date = text(body.date ?? '',60,0);
      const date = new Date(fields.date+'T00:00:00Z');
      if (fields.date && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date) || !Number.isFinite(+date) || date.toISOString().slice(0,10)!==fields.date)) invalid();
      fields.startTime=text(body.startTime ?? '',5,0);
      if (fields.startTime && !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(fields.startTime)) invalid();
      fields.location=text(body.location ?? '',160,0);
      fields.duration=text(body.duration ?? '',100,0);
      fields.image=body.image || '';
      if (fields.image && (typeof fields.image!=='string' || !cloudinaryPath.test(fields.image))) invalid();
      fields.seats = integer(body.seats,9999);
      fields.price = body.price==null ? null : integer(body.price,1000000);
    }
    await db.saveContent(section,key,fields);
    res.json({ok:true});
  });
  admin.get('/reports', async (req,res) => {
    if (req.query.summary!==undefined && req.query.summary!=='true') invalid();
    res.json(await db.report(...dateRange(req.query),req.query.summary==='true'));
  });
  api.use('/admin', admin);
  api.use((req,res) => res.status(404).json({error:'not_found'}));
  app.use('/api',api);
  app.get('/diy-kits', (req,res) => res.redirect(302,'/shop?tab=kits'));
  app.get('/custom-orders', (req,res) => res.redirect(302,'/shop?tab=cakes'));
  app.get(/^\/products\/fake-cake-box-\d{2}\/?$/, (req,res) => res.redirect(302,'/shop/fake-cake-box'));
  if (existsSync(staticDir)) {
    app.use((req,res,next) => {
      const path = decodeURIComponent(req.path);
      if (/^\/(?:videos|media-source)(?:\/|$)|\.(?:mp4|mov|webm|avi|mkv|m4v|ogv|wmv|flv|mpe?g|m3u8|3gp|ts)$/i.test(path)) {
        return res.sendStatus(404);
      }
      next();
    });
    app.use(express.static(staticDir,{dotfiles:'deny',cacheControl:false,setHeaders:(res,file)=>{
      const top=relative(staticDir,file).split(sep)[0];
      const fingerprinted=(top==='assets' && /-[\w-]{8}\.[a-z]+$/i.test(basename(file))) ||
        (top==='optimized' && /-[0-9a-f]{12}\.webp$/.test(file));
      res.setHeader('Cache-Control',staging ? 'no-store' : fingerprinted ? 'public, max-age=31536000, immutable' :
        file.endsWith('.html') ? 'no-cache' : 'public, max-age=86400');
    }}));
    app.get('/{*path}', (req,res) => {
      if (decodeURIComponent(req.path).split('/').some(segment=>segment.startsWith('.'))) return res.sendStatus(404);
      res.set('Cache-Control',staging?'no-store':'no-cache').sendFile(resolve(staticDir,'index.html'));
    });
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof HttpError ? error.status : [400,413,415].includes(error.status) ? error.status : 500;
    res.status(status).json({error:error instanceof HttpError ? error.message : status === 500 ? 'server_error' : 'invalid_input'});
  });
  return app;
}
