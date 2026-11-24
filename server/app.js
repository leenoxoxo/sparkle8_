import express from 'express';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {productInput, storefrontProducts} from './catalog.js';
import {HttpError} from './errors.js';
import {createPool,repository} from './database.js';
import {cloudImages} from './images.js';
import {adminAuthentication} from './auth.js';
import {cart, customer, integer, invalid, slug, text, uuid} from './validation.js';
import {orderConfirmation} from './whatsapp.js';

const states = ['Confirmed','Preparing','Shipped','Delivered','Cancelled','Paid'];

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
  const authentication = adminAuthentication({env,pool,db,store:sessionStore});

  app.disable('x-powered-by');
  if (env.RENDER) app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY'});
    if (env.NODE_ENV === 'production') {
      res.set('Content-Security-Policy', [
        "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: https://res.cloudinary.com",
        "media-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"
      ].join('; '));
    }
    next();
  });
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
    const rows = await db.catalog(true);
    res.json(storefrontProducts(rows));
  });
  api.get('/delivery', async (req, res) => {
    const rows = (await db.delivery()).filter(area => area.active);
    res.json(rows.flatMap(area => {
      const fee = area.fee ?? rows.find(region => region.code === area.region)?.fee;
      return fee == null || !area.selectable ? [] : [{code: area.code, name: area.name, nameAr: area.name_ar, fee}];
    }));
  });
  api.post('/checkout/quote', orderLimit, async (req, res) => {
    if (!slug(req.body?.area)) invalid('delivery_unavailable');
    res.json(await db.quote(cart(req.body.items),req.body.area));
  });
  api.post('/checkout/orders', orderLimit, async (req, res) => {
    const {submission, items, expected, language} = req.body ?? {};
    if (!uuid(submission) || !['en','ar'].includes(language) || !expected || typeof expected !== 'object') invalid();
    const order = await db.submit({submission,items:cart(items),customer:customer(req.body.customer),expected,language});
    res.status(201).json(orderConfirmation(order));
  });
  api.get('/checkout/orders/:token', orderLimit, async (req, res) => {
    if (!uuid(req.params.token)) invalid();
    const order = await db.order(req.params.token);
    if (!order) throw new HttpError(404, 'not_found');
    res.json(orderConfirmation(order));
  });
  api.post('/custom-requests', orderLimit, async (req, res) => {
    const description = text(req.body?.description, 1500);
    const name = text(req.body?.name, 120);
    const phone = text(req.body?.phone, 30);
    if (!/^\+?[\d\s().-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g,''))) invalid('invalid_phone');
    const result = await db.createRequest({name,phone,description});
    res.status(201).json({id:result.id});
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
  admin.post('/logout', authentication.logout);
  admin.get('/products', async (req, res) => res.json(await db.catalog()));
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
    res.json(await db.orders(offset));
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
  admin.get('/customers', async (req,res) => res.json(await db.customers()));
  admin.get('/categories', async (req,res) => res.json(await db.categories()));
  admin.patch('/categories', async (req,res) => {
    await db.renameCategory(req.body?.from == null ? null : text(req.body.from,80),text(req.body?.to,80),text(req.body?.ar ?? '',80,0));
    res.json({ok:true});
  });
  api.get('/content', async (req,res) => {
    const visible = rows => rows.map(row => row.body.published ? row : {key:row.key,body:{published:false}});
    res.json({workshops:visible(await db.content('workshops')),website:visible(await db.content('website'))});
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
  api.post('/workshops/:key/register', orderLimit, async (req,res) => {
    const phone = text(req.body?.phone,30);
    if (!slug(req.params.key) || !/^\+?[\d\s().-]{7,30}$/.test(phone)) invalid();
    res.status(201).json({id:await db.registerWorkshop(req.params.key,text(req.body?.name,120),phone)});
  });
  admin.get('/content/:section', async (req,res) => {
    const {section} = req.params;
    if (!['workshops','website'].includes(section)) invalid();
    res.json({items:await db.content(section),registrations:section === 'workshops' ? await db.registrations() : []});
  });
  admin.put('/content/:section/:key', async (req,res) => {
    const {section,key} = req.params;
    const body = req.body;
    if (!slug(key) || !['workshops','website'].includes(section) || typeof body?.published !== 'boolean') invalid();
    const fields = {name:text(body.name,180),nameAr:text(body.nameAr ?? '',180,0), description:text(body.description ?? '',1500,0),
      descriptionAr:text(body.descriptionAr ?? '',1500,0),published:body.published};
    if (section === 'workshops') {
      fields.date = text(body.date ?? '',60,0);
      fields.seats = integer(body.seats,9999);
      fields.price = integer(body.price,1000000);
    }
    await db.saveContent(section,key,fields);
    res.json({ok:true});
  });
  admin.get('/reports', async (req,res) => {
    const dates = [req.query.from,req.query.to].map(value => {
      if (value === undefined) return null;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
      const day = new Date(value + 'T00:00:00Z');
      if (!Number.isFinite(+day) || day.toISOString().slice(0,10) !== value || value.startsWith('0000')) invalid();
      return value;
    });
    if (dates[0] && dates[1] && dates[0] > dates[1]) invalid();
    res.json(await db.report(...dates));
  });
  api.use('/admin', admin);
  api.use((req,res) => res.status(404).json({error:'not_found'}));
  app.use('/api',api);
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('/{*path}', (req,res) => res.sendFile(resolve(staticDir,'index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof HttpError ? error.status : [400,413,415].includes(error.status) ? error.status : 500;
    res.status(status).json({error:error instanceof HttpError ? error.message : status === 500 ? 'server_error' : 'invalid_input'});
  });
  return app;
}
