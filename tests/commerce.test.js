import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../server/app.js';
import {catalogImportPlan} from '../server/import-catalog.js';
import {hashPassword,verifyPassword} from '../server/auth.js';
import {orderConfirmation} from '../server/whatsapp.js';

const customer = {name:'ليان & Noor',phone:'+970 599 111 111',area:'nablus',address:'شارع 1\nالطابق #2',notes:'هدية + بطاقة'};
const basket = [{productId:'mirror',variantId:'pink',quantity:1}];

async function migrate(db) {
  for (const file of (await readdir('db/migrations')).sort()) await db.exec(await readFile('db/migrations/' + file,'utf8'));
}

test('legacy import retains 22 shop products, 3 DIY kits, featured order, images and variant identities', async () => {
  const {products,images} = await catalogImportPlan();
  assert.equal(products.filter(row => row.product.presentation.kind === 'shop').length,22);
  assert.equal(products.filter(row => row.product.presentation.kind === 'kit').length,3);
  assert.equal(images.length,60);
  assert.deepEqual(products.filter(row => row.product.presentation.featured).map(row => row.target),
    ['soft-blue-pink-cream-case','marshmallow-mirror','candy-cloud-brush']);
  for (const row of products) {
    assert.equal(new Set(row.skus.map(sku => sku.variant)).size,row.skus.length);
    assert.ok(row.skus.every(sku => sku.stock === null));
    assert.ok(row.product.presentation.images.length);
  }
});

test('PostgreSQL checkout, delivery rules, snapshots and inventory lifecycle', async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    await db.exec(`
      insert into public.delivery_areas(code,name,name_ar,fee) values
        ('region','Region','المنطقة',1500),('nablus','Nablus','نابلس',1000);
      insert into public.delivery_areas(code,name,name_ar,region) values ('village','Village','القرية','region');
      update public.delivery_areas set region = 'region' where code = 'nablus';
      update public.delivery_areas set selectable = false where code = 'region';
    `);
    const quote = async (items,area) => (await db.query('select public.sparkle_quote($1,$2) as quote',[JSON.stringify(items),area])).rows[0].quote;
    const save = (target,product,skus) => db.query('select public.sparkle_save_product($1,$2,$3)',[target,JSON.stringify(product),JSON.stringify(skus)]);
    const presentation = {published:true,archived:false,presentation:{name:'Mirror',nameAr:'مرآة',variants:[{id:'pink',name:'Pink',nameAr:'وردي'}]}};
    const sku = {variant:'pink',base_price:3999,sale_price:2999,stock:1,low_stock:2};
    await save('mirror',presentation,[sku]);
    const current = await quote(basket,'nablus');
    assert.equal(current.subtotal,3999);
    assert.equal(current.discount,1000);
    assert.equal(current.deliveryFee,1000);
    assert.equal(current.total,3999);
    assert.equal((await quote(basket,'village')).deliveryFee,1500);
    await assert.rejects(quote(basket,'region'),/delivery_unavailable/);
    await assert.rejects(quote(basket,'unknown'),/delivery_unavailable/);
    await assert.rejects(quote([...basket,...basket],'nablus'),/stock_unavailable/);
    const identity = randomUUID();
    const submit = async (id,expected = current,language = 'ar') => (await db.query(
      'select (public.sparkle_submit($1,$2,$3,$4,$5)).*',[id,JSON.stringify(basket),JSON.stringify(customer),JSON.stringify(expected),language])).rows[0];
    await assert.rejects(submit(identity,{...current,total:1}),/quote_changed/);
    const order = await submit(identity);
    assert.equal(order.status,'Pending');
    assert.equal(order.paid,false);
    assert.equal((await submit(identity)).id,order.id);
    const second = await submit(randomUUID());
    const stock = async () => (await db.query('select stock from public.catalog_skus')).rows[0].stock;
    assert.equal(await stock(),1);
    const transition = async (id,status) => (await db.query(
      'select (public.sparkle_transition($1,$2,null)).*',[id,status])).rows[0];
    await assert.rejects(transition(order.id,'Paid'),/invalid_transition/);
    await transition(order.id,'Confirmed');
    await transition(order.id,'Confirmed');
    assert.equal(await stock(),0);
    await assert.rejects(save('mirror',presentation,[{...sku,expectedStock:1}]),/inventory_changed/);
    await assert.rejects(transition(second.id,'Confirmed'),/stock_unavailable/);
    await transition(order.id,'Preparing');
    await transition(order.id,'Cancelled');
    await transition(order.id,'Cancelled');
    assert.equal(await stock(),1);
    await transition(second.id,'Confirmed');
    await transition(second.id,'Preparing');
    await transition(second.id,'Shipped');
    await assert.rejects(transition(second.id,'Cancelled'),/invalid_transition/);
    await transition(second.id,'Delivered');
    assert.equal((await transition(second.id,'Paid')).paid,true);
    assert.equal(await stock(),0);
    await db.exec("update public.delivery_areas set fee = 2000 where code = 'nablus'");
    assert.equal((await submit(identity)).snapshot.deliveryFee,1000);
    const reports = (await db.query('select public.sparkle_stats() as stats')).rows[0].stats;
    assert.equal(reports.orders,2);
    assert.equal(reports.revenue,3999);
    assert.equal(reports.lowStock[0].stock,0);
    await db.exec(`
      insert into public.shop_promotions(name,scope,targets,type,amount,active) values
      ('Store sale','store','{}','percent',25,true),('Mirror offer','products','{mirror}','amount',2000,true);
      update public.catalog_skus set stock=1 where product_slug='mirror';
      insert into public.shop_content(section,key,body) values('workshops','test','{"seats":1,"published":true}');
    `);
    assert.equal((await quote(basket,'nablus')).lines[0].unitPrice,1999);
    await db.query("select public.sparkle_register_workshop('test','Workshop test','0594000000')");
    await assert.rejects(db.query("select public.sparkle_register_workshop('test','Other test','0594000001')"),/stock_unavailable/);
    const arabic = new URL(orderConfirmation(order).whatsappUrl);
    assert.equal(arabic.origin,'https://wa.me');
    assert.equal(arabic.pathname,'/970594503571');
    assert.equal(arabic.searchParams.size,1);
    const message = arabic.searchParams.get('text');
    assert.ok(message.includes(customer.name));
    assert.ok(message.includes(customer.address));
    assert.ok(message.includes(customer.notes));
    assert.ok(message.includes('اللون / الخيار: وردي'));
    assert.ok(message.includes('الدفع عند الاستلام'));
    assert.ok(new URL(orderConfirmation({...order,snapshot:{...order.snapshot,language:'en'}}).whatsappUrl)
      .searchParams.get('text').includes('Payment Method: Cash on Delivery'));
    await db.exec('set role sparkle_runtime');
    assert.equal((await db.query('select public.sparkle_stats() as stats')).rows[0].stats.orders,2);
    await assert.rejects(db.query("insert into public.admin_members(email,password_hash) values('a@b.c','invalid')"),/permission denied/);
    await db.exec('reset role; create role commerce_outsider; set role commerce_outsider');
    await assert.rejects(db.query('select * from public.shop_orders'),/permission denied/);
    await assert.rejects(db.query("select public.sparkle_stats()"),/permission denied/);
  } finally {await db.close();}
});

test('Passport login and persistent sessions protect product, image and delivery operations across app restarts', async () => {
  const db = new PGlite();
  const password = 'A long local test password';
  const user = randomUUID();
  const signedOrigin = 'https://sparkle.example';
  const env = {NODE_ENV:'production',RENDER:'true',APP_ORIGIN:signedOrigin,SESSION_SECRET:'local-test-secret-at-least-32-characters'};
  const uploaded = [];
  const upload = async (bytes,key,{format}) => {
    uploaded.push({bytes,key,format});
    return 'https://res.cloudinary.com/sparkle-test/image/upload/v1/sparkle/products/' + key + '.' + format;
  };
  let server;
  let base;
  async function start() {
    server = createApp({env,pool:db,upload}).listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    base = 'http://127.0.0.1:' + server.address().port + '/api';
  }
  const stop = () => new Promise(resolve => server.close(resolve));
  const call = (path,{method='GET',body,cookie,origin=signedOrigin}={}) => fetch(base + path,{
    method,headers:{'X-Forwarded-Proto':'https',Origin:origin,...(cookie ? {Cookie:cookie} : {}),
      ...(body === undefined ? {} : {'Content-Type':Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json'})},
    body:Buffer.isBuffer(body) ? body : body === undefined ? undefined : JSON.stringify(body)
  });
  try {
    await migrate(db);
    const hash = await hashPassword(password);
    assert.match(hash,/^scrypt-v1:/);
    assert.notEqual(hash,await hashPassword(password));
    assert.equal(await verifyPassword('wrong',hash),false);
    await db.query('insert into public.admin_members(user_id,email,password_hash) values($1,$2,$3)',[user,'admin@example.test',hash]);
    await db.exec('set role sparkle_runtime');
    await start();
    assert.equal((await call('/admin/stats')).status,401);
    assert.equal((await call('/admin/login',{method:'POST',body:{},origin:'https://other.example'})).status,403);
    assert.equal((await call('/admin/login',{method:'POST',body:{email:'admin@example.test',password:'wrong'}})).status,401);
    const login = await call('/admin/login',{method:'POST',body:{email:'admin@example.test',password}});
    assert.equal(login.status,200);
    const header = login.headers.get('set-cookie');
    assert.match(header,/HttpOnly/);
    assert.match(header,/Secure/);
    assert.match(header,/SameSite=Strict/);
    const cookie = header.split(';')[0];
    const write = (method,path,body) => call('/admin' + path,{method,body,cookie});
    assert.equal((await call('/admin/stats',{cookie})).status,200);
    assert.equal((await write('POST','/images',Buffer.from('bad image'))).status,400);
    const image = await readFile('public/SHOP IMGS/Cherry Cream Mirror.png');
    const imageResponse = await write('POST','/images',image);
    assert.equal(imageResponse.status,201);
    const {url} = await imageResponse.json();
    assert.equal(uploaded[0].format,'png');
    assert.ok(uploaded[0].bytes.equals(image));
    assert.equal((await write('PUT','/products/new-product',{
      published:true,archived:false,presentation:{name:'New creation',category:'Mirrors',images:[url]},
      skus:[{variant:'',base_price:3999,discountPercent:50,stock:4,low_stock:1}]
    })).status,200);
    assert.equal((await write('PUT','/delivery/nablus',{name:'Nablus',name_ar:'نابلس',fee:1000,active:true,selectable:true})).status,200);
    assert.equal((await write('PUT','/settings/whatsapp',{whatsapp:'+970 594 503 571'})).status,200);
    const items = [{productId:'new-product',quantity:1}];
    const quote = await (await call('/checkout/quote',{method:'POST',body:{area:'nablus',items}})).json();
    assert.equal(quote.total,3000);
    const submission = randomUUID();
    const body = {submission,items,expected:quote,language:'en',customer};
    assert.equal((await call('/checkout/orders',{method:'POST',body:{...body,customer:{...customer,phone:'invalid'}}})).status,400);
    const initial = await (await call('/checkout/orders',{method:'POST',body})).json();
    assert.match(initial.reference,/^#SPK-/);
    assert.match(initial.whatsappUrl,/^https:\/\/wa.me\/970594503571/);
    await stop();
    await start();
    assert.equal((await call('/admin/stats',{cookie})).status,200);
    assert.deepEqual(await (await call('/checkout/orders/' + submission)).json(),initial);
    assert.deepEqual(await (await call('/checkout/orders',{method:'POST',body})).json(),initial);
    const products = await (await call('/catalog')).json();
    assert.equal(products[0].image,url);
    const orders = await (await call('/admin/orders',{cookie})).json();
    assert.equal(orders.length,1);
    assert.equal(orders[0].status,'Pending');
    assert.equal((await write('PATCH','/orders/' + orders[0].id,{status:'Confirmed'})).status,200);
    assert.equal((await write('POST','/logout',{})).status,200);
    assert.equal((await call('/admin/stats',{cookie})).status,401);
  } finally {
    if (server?.listening) await stop();
    await db.close();
  }
});
