import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {get} from 'node:http';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../server/app.js';
import {catalogImportPlan} from '../server/import-catalog.js';
import {hashPassword,verifyPassword} from '../server/auth.js';
import {orderConfirmation} from '../server/whatsapp.js';
import {normalizeWhatsApp} from '../src/whatsapp-phone.js';
import {defaultHomepage,homepageWorkshops,workshopSchedule} from '../src/homepage-model.js';
import {repository} from '../server/database.js';
import {productInput} from '../server/catalog.js';
import {restoreCart} from '../src/cart-model.js';
import {variantCombinations} from '../src/variant-options.js';
import {seasonalDefaults,winterIsActive} from '../src/seasonal-settings.js';

test('homepage omits expired and booked workshops and keeps configurable ordering', () => {
  const clock=new Date('2026-11-25T07:00:00Z');
  assert.equal(workshopSchedule({date:'2026-11-25',startTime:'10:00'},clock),'upcoming');
  assert.equal(workshopSchedule({date:'2026-11-25',startTime:'08:00'},clock),'past');
  assert.equal(workshopSchedule({},clock),'unscheduled');
  const events=[{slug:'undated'},{slug:'past',date:'2026-11-24'},{slug:'full',date:'2026-11-26',seats:0},
    {slug:'future',date:'2026-11-26',seats:2}];
  assert.deepEqual(homepageWorkshops(events,null,clock).map(item=>item.slug),['future','undated']);
  assert.deepEqual(homepageWorkshops(events,['past','undated','future','full'],clock).map(item=>item.slug),['undated','future']);
});

test('checkout normalizes both WhatsApp prefixes and rejects invalid mobile numbers', () => {
  assert.equal(normalizeWhatsApp('+970','0594 000 123'),'+970594000123');
  assert.equal(normalizeWhatsApp('+972','+972 054-000-0123'),'+972540000123');
  assert.equal(normalizeWhatsApp('+970','٠٥٩٤٠٠٠١٢٣'),'+970594000123');
  for (const input of ['+972540000123','022000123','0594','not a phone','05940001234']) assert.equal(normalizeWhatsApp('+970',input),null);
});

const customer = {name:'ليان & Noor',phone:'+970 599 111 111',area:'nablus',address:'شارع 1\nالطابق #2',notes:'هدية + بطاقة'};
const basket = [{productId:'mirror',variantId:'pink',quantity:1}];

test('winter date windows include both dates in the storefront timezone',()=>{
  const winter={...seasonalDefaults,enabled:true,startDate:'2026-12-01',endDate:'2026-12-02'};
  assert.equal(winterIsActive(winter,new Date('2026-11-30T21:59:59Z')),false);
  assert.equal(winterIsActive(winter,new Date('2026-11-30T22:00:00Z')),true);
  assert.equal(winterIsActive(winter,new Date('2026-12-02T21:59:59Z')),true);
  assert.equal(winterIsActive(winter,new Date('2026-12-02T22:00:00Z')),false);
});

async function migrate(db) {
  for (const file of (await readdir('db/migrations')).sort()) await db.exec(await readFile('db/migrations/' + file,'utf8'));
}

test('back office separates confirmed, collected and outstanding totals and treats missing costs as incomplete',async()=>{
  const database=new PGlite();
  try {
    await migrate(database);
    const db=repository(database);
    const {skus,...product}=productInput('report-fixture',{published:true,archived:false,
      presentation:{name:'Report item',category:'Mirrors',cost:900,variants:[{id:'blue',name:'Blue'}]},
      skus:[{variant:'blue',base_price:1500,unit_cost:500,stock:3,low_stock:2}]});
    await db.saveProduct('report-fixture',product,skus);
    const items=[{productId:'report-fixture',variantId:'blue',quantity:1}];
    const quote=await db.quote(items);
    assert.equal(quote.lines[0].cost,undefined);
    const create=()=>db.submit({submission:randomUUID(),items,expected:quote,language:'en',
      customer:{firstName:'Fixture',lastName:'Buyer',name:'Fixture Buyer',phone:'+970594000000'}});
    const paid=await create(), cancelled=await create(), pending=await create(), due=await create();
    assert.equal(paid.snapshot.lines[0].cost,500);
    assert.equal(paid.snapshot.lines[0].category,'Mirrors');
    assert.equal((await db.catalog(true))[0].catalog_skus[0].unit_cost,500);
    for(const state of ['Confirmed','Preparing','Shipped','Delivered','Paid']) await db.transition(paid.id,state,null);
    await db.transition(cancelled.id,'Cancelled',null);
    await db.transition(due.id,'Confirmed',null);
    await db.updateDelivery(due.id,'Example',600);
    await db.updateDirectCosts(due.id,400,{1:800});
    const report=await db.report(null,null);
    assert.deepEqual([report.orders,report.sales,report.revenue,report.outstanding,report.margin.gross],[4,3600,1500,2100,1700]);
    assert.equal(report.stock.units,1);
    assert.equal(report.stock.low,1);
    assert.equal(report.best[0].units,2);
    assert.equal(report.breakdown.find(row=>row.dimension==='category').sales,3000);
    assert.equal((await db.orders(0,'confirmed',{paid:false,search:'Fixture'}))[0].id,due.id);
    assert.equal((await db.orders(0,null,{status:'Pending'}))[0].id,pending.id);
    const [customer]=await db.customers(0,'594','outstanding');
    assert.deepEqual([Number(customer.confirmed_total),Number(customer.completed_total),customer.order_count],[3600,1500,4]);
    await db.updateOrderNotes(due.id,'Internal only');
    assert.equal((await db.orders(0,null,{status:'Confirmed'}))[0].admin_notes,'Internal only');
    await database.query(`update public.shop_orders set snapshot=jsonb_set(snapshot,'{lines,0,cost}','null')
      where id=$1`,[paid.id]);
    const incomplete=await db.report(null,null,true);
    assert.equal(incomplete.margin.gross,null);
    assert.equal(incomplete.margin.costed,1);
    assert.deepEqual(incomplete.breakdown,[]);
    await db.bulkProducts(['report-fixture'],{price:1600,stock:4,published:false});
    const [updated]=await db.catalog();
    assert.deepEqual([updated.published,updated.catalog_skus[0].base_price,updated.catalog_skus[0].stock,updated.catalog_skus[0].unit_cost],
      [false,1600,4,500]);
  }finally{await database.close();}
});

test('quantity promotions repeat by parent product, respect sale stacking and preserve snapshots',async()=>{
  const database=new PGlite();
  try {
    await migrate(database);
    const db=repository(database);
    async function product(slug,blue=1500){
      const presentation={name:slug,category:'Mirrors',priceMode:'exact',variants:[{id:'pink',name:'Pink'},{id:'blue',name:'Blue'}]};
      await db.saveProduct(slug,{published:true,archived:false,presentation},[
        {variant:'pink',base_price:1500,stock:20,low_stock:1},
        {variant:'blue',base_price:blue,stock:20,low_stock:1}]);
    }
    await product('first');await product('other');await product('different',1300);
    const draft={mode:'fixed',amount:800,title:'Second-unit offer',title_ar:'عرض القطعة الثانية',description:'',description_ar:'',
      starts_at:null,ends_at:null,enabled:true,archived:false,stack:false};
    const ids=Object.fromEntries(['first','other','different'].map(slug=>[slug,randomUUID()]));
    const save=(product_slug,patch={},id=ids[product_slug])=>db.saveQuantityPromotion(id,{...draft,product_slug,...patch});
    for(const slug in ids) await save(slug);
    const line=(quantity=1,variantId='pink',productId='first')=>({productId,variantId,quantity});
    for(const [index,total] of [1500,2300,3800,4600,6100,6900].entries()) {
      assert.equal((await db.quote([line(index+1)])).total,total);
    }
    const quote=await db.quote([line(),line(1,'blue')]);
    assert.deepEqual([quote.lines.length,quote.subtotal,quote.quantityDiscount,quote.total],[2,3000,700,2300]);
    await db.saveProduct('promo-test-kit',{published:true,archived:false,presentation:{name:'Example kit',category:'DIY Kits',kind:'kit',
      kitOptions:['Mirror'],kitPieces:1}},[{variant:'',base_price:7000,stock:4,low_stock:1}]);
    await db.saveProduct('promo-test-range',{published:true,archived:false,presentation:{name:'Example box',category:'Fake Cake Boxes',
      priceMode:'range',minPrice:8000,maxPrice:14000,trackStock:false}},[{variant:'',stock:null,low_stock:0}]);
    await assert.rejects(save('promo-test-kit',{},randomUUID()),/promotion_ineligible/);
    await assert.rejects(save('promo-test-range',{},randomUUID()),/promotion_ineligible/);
    const mixed=await db.quote([line(),line(1,'blue'),{productId:'promo-test-kit',quantity:1,kitChoices:['Mirror']},
      {productId:'promo-test-range',quantity:1}]);
    assert.deepEqual([mixed.estimatedMin,mixed.estimatedMax,mixed.total],[17300,23300,null]);
    assert.equal((await db.quote([line(),line(1,'pink','other')])).total,3000);
    assert.equal((await db.quote([line(1,'pink','different'),line(1,'blue','different')])).total,2300);
    await save('different',{amount:1400});
    assert.equal((await db.quote([line(1,'pink','different'),line(1,'blue','different')])).total,2800);
    await save('different',{mode:'percent',amount:50});
    assert.equal((await db.quote([line(2,'pink','different'),line(2,'blue','different')])).total,4200);
    await assert.rejects(save('first',{},randomUUID()),/promotion_conflict/);
    await assert.rejects(db.quote([line(21)]),/stock_unavailable/);
    const token=randomUUID();
    const order=await db.submit({submission:token,items:[line(),line(1,'blue')],expected:quote,
      language:'ar',customer:{firstName:'Example',lastName:'Buyer',name:'Example Buyer',phone:'+970594000000'}});
    const receipt=orderConfirmation(order);
    assert.equal(order.snapshot.quantityDiscount,700);
    assert.doesNotMatch(new URL(receipt.whatsappUrl).searchParams.get('text'),/₪|خصم/);
    await database.exec("update public.catalog_skus set sale_price=1000 where product_slug='first' and variant='pink'");
    assert.equal((await db.quote([line(),line(1,'blue')])).total,2500);
    await save('first',{stack:true});
    assert.equal((await db.quote([line(),line(1,'blue')])).total,2300);
    await save('first',{enabled:false});
    assert.equal((await db.quote([line(2,'blue')])).total,3000);
    await save('first',{starts_at:'2999-01-01T00:00:00Z'});
    assert.equal((await db.quote([line(2,'blue')])).total,3000);
    await save('first',{ends_at:'2000-01-01T00:00:00Z'});
    assert.equal((await db.quote([line(2,'blue')])).total,3000);
    await save('first',{archived:true});
    assert.deepEqual(orderConfirmation(await db.order(token)),receipt);
    await db.updateDelivery(order.id,'Example',1200);
    assert.equal((await db.order(token)).snapshot.total,3500);
  }finally{await database.close();}
});

test('typed variants retain independent identity, price, visibility, snapshots and inventory',async()=>{
  const database=new PGlite();
  try {
    await migrate(database);
    const db=repository(database);
    const groups=[
      {id:'model',kind:'model',name:'Phone model',nameAr:'طراز الهاتف',values:[{id:'one',name:'Model One',nameAr:'طراز واحد'},{id:'two',name:'Model Two'}]},
      {id:'color',kind:'color',name:'Color',nameAr:'اللون',values:[{id:'rose',name:'Rose',nameAr:'وردي',color:'#ee99aa'},{id:'mint',name:'Mint',color:'#99ccaa'}]}
    ];
    const combinations=variantCombinations(groups);
    assert.equal(combinations.length,4);
    const variants=combinations.map((selections,index)=>({id:'option-'+index,selections,visible:index!==3,enabled:index!==2,displayOrder:4-index}));
    const make=(draftOptions=variants,stocks=[1,2,1,1],expected=[])=>({published:true,archived:false,
      presentation:{name:'Fixture case',category:'Phone Cases',optionGroups:groups,variants:draftOptions,priceMode:'exact',defaultPrice:4500},
      skus:draftOptions.map(({id})=>{
        const index=Number(id.at(-1));
        return {variant:id,stock:stocks[index],expectedStock:expected[index],base_price:index===1?5500:null,
          sale_price:index===1?5000:null,low_stock:1};
      })});
    const save=async body=>{
      const {skus,...product}=productInput('test-case',body);
      await db.saveProduct('test-case',product,skus);
    };
    const first={productId:'test-case',variantId:'option-0',quantity:1};
    const second={productId:'test-case',variantId:'option-1',quantity:1};
    const bad=make(variants.map((variant,index)=>index===1 ? {...variant,selections:variants[0].selections} : variant));
    assert.throws(()=>productInput('test-case',bad),/invalid_input/);
    await save(make());
    const catalog=(await import('../server/catalog.js')).storefrontProducts(await db.catalog(true));
    assert.deepEqual(catalog[0].variants.map(v=>v.id),['option-2','option-1','option-0']);
    assert.equal(catalog[0].variants[0].purchasable,false);
    assert.equal(catalog[0].variants.at(-1).price,'₪45');
    assert.equal(restoreCart(catalog,[first,first,second]).length,2);
    for(const variantId of ['','option-2','option-3','option-4']){
      await assert.rejects(db.quote([{...first,variantId}]),/stock_unavailable/);
    }
    const quote=await db.quote([first,second]);
    assert.deepEqual(quote.lines.map(line=>line.unitPrice),[4500,5000]);
    assert.equal(quote.lines[0].option.choices[1].value,'Rose');
    const submit=(items,expected)=>db.submit({submission:randomUUID(),items,expected,
      customer:{firstName:'Example',lastName:'Shopper',name:'Example Shopper',phone:'+970594000000'},language:'ar'});
    const order=await submit([first,second],quote);
    const competing=await submit([first],await db.quote([first]));
    assert.equal(order.snapshot.lines[0].option.choices[0].valueAr,'طراز واحد');
    assert.doesNotMatch(new URL(orderConfirmation(order).whatsappUrl).searchParams.get('text'),/طراز الهاتف|اللون/);
    await db.transition(order.id,'Confirmed',null);
    await assert.rejects(db.transition(competing.id,'Confirmed',null),/stock_unavailable/);
    await assert.rejects(db.quote([first]),/stock_unavailable/);
    await save(make(variants.slice(1),[0,1,1,1],[0,1,1,1]));
    await db.transition(order.id,'Cancelled',null);
    await db.transition(order.id,'Cancelled',null);
    let skus=(await db.catalog())[0].catalog_skus;
    assert.deepEqual([skus[0].active,skus[0].stock,skus[1].stock],[false,1,2]);
    await assert.rejects(db.quote([first]),/stock_unavailable/);
    assert.equal((await db.orders(0,null)).find(row=>row.id===order.id).snapshot.lines[0].option.choices[1].value,'Rose');
  }finally{await database.close();}
});

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
    const historical={...order,snapshot:{...order.snapshot,customer:{...order.snapshot.customer,name:''}}};
    const historicalDraft=new URL(orderConfirmation(historical).whatsappUrl).searchParams.get('text');
    assert.doesNotMatch(historicalDraft,/الاسم:/);
    assert.match(historicalDraft,/#SPK-/);
    assert.ok(message.includes('#SPK-'));
    assert.ok(!message.includes(customer.address));
    assert.ok(!message.includes(customer.notes));
    assert.ok(!message.includes(customer.phone));
    assert.match(message,/بدي أكد طلبي وأعرف تكلفة التوصيل/);
    assert.match(new URL(orderConfirmation({...order,snapshot:{...order.snapshot,language:'en'}}).whatsappUrl)
      .searchParams.get('text'),/check the delivery fee/);
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
    const mp4 = Buffer.from('000000186674797069736f6d0000020069736f6d6d703431', 'hex');
    assert.equal((await write('POST','/images',mp4)).status,400);
    assert.equal(uploaded.length,0);
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
    assert.equal((await write('PATCH','/categories',{to:'Mirrors',from:'Mirrors',ar:'مرايا',displayOrder:2,published:false})).status,200);
    assert.equal((await (await call('/catalog')).json()).length,0);
    assert.equal((await write('PATCH','/categories',{to:'Mirrors',from:'Mirrors',ar:'مرايا',displayOrder:2,published:true})).status,200);
    const publicCatalog=await call('/catalog?withCategories=1');
    assert.equal(publicCatalog.status,200);
    assert.match(publicCatalog.headers.get('cache-control'),/must-revalidate/);
    assert.ok(publicCatalog.headers.get('etag'));
    assert.equal((await publicCatalog.json()).products.length,1);
    const conditional=await new Promise((resolve,reject)=>get(base+'/catalog?withCategories=1',{
      headers:{'If-None-Match':publicCatalog.headers.get('etag')}
    },response=>{response.resume();resolve(response.statusCode);}).on('error',reject));
    assert.equal(conditional,304);
    assert.equal((await call('/admin/products',{cookie})).headers.get('cache-control'),'no-store');
    assert.equal((await write('PATCH','/categories',{to:'Small mirrors',ar:'مرايا صغيرة',parent:'Mirrors',published:true})).status,200);
    assert.equal((await (await call('/categories')).json()).find(row=>row.name==='Small mirrors').parent,'Mirrors');
    assert.equal((await write('PATCH','/categories',{to:'Decorated mirrors',from:'Mirrors',published:true})).status,200);
    assert.equal((await (await call('/categories')).json()).find(row=>row.name==='Small mirrors').parent,'Decorated mirrors');
    assert.equal((await write('PUT','/delivery/nablus',{name:'Nablus',name_ar:'نابلس',fee:1000,active:true,selectable:true})).status,200);
    assert.equal((await write('PUT','/settings/whatsapp',{whatsapp:'+970 594 503 571'})).status,200);
    const items = [{productId:'new-product',quantity:1}];
    const quote = await (await call('/checkout/quote',{method:'POST',body:{items}})).json();
    assert.equal(quote.total,2000);
    assert.equal(quote.deliveryFee,null);
    const submission = randomUUID();
    const buyer = {name:'Noor Test',destinationCode:'nablus',destinationRegion:'west-bank',address:'Example street 12',prefix:'+970',phone:'0594000123',alternativePrefix:'+972',alternativePhone:'0541234567'};
    const body = {submission,items,expected:quote,language:'en',customer:buyer};
    for (const name of [undefined,'',' \t ']) {
      const rejected=await call('/checkout/orders',{method:'POST',body:{...body,customer:{...buyer,name}}});
      assert.equal(rejected.status,400);
      assert.equal((await rejected.json()).error,'invalid_name');
    }
    for (const changes of [{phone:'invalid'},{phone:''},{phone:'059400012'},{phone:'05940001234'},{phone:'0594-000123'},{destinationCode:' ',city:'Nablus'},{address:''},{alternativePhone:'invalid'}]) {
      assert.equal((await call('/checkout/orders',{method:'POST',body:{...body,customer:{...buyer,...changes}}})).status,400);
    }
    assert.equal((await call('/checkout/orders',{method:'POST',body:{...body,customer:{...buyer,destinationRegion:'inside-1948'}}})).status,409);
    assert.equal((await call('/checkout/orders',{method:'POST',body:{...body,customer:{...buyer,destinationCode:'nonexistent'}}})).status,409);
    assert.equal((await call('/admin/delivery-destinations')).status,401);
    const testTown={name:'Fixture Town',nameAr:'مدينة تجريبية',region:'west-bank',active:true,displayOrder:0};
    assert.equal((await write('PUT','/delivery-destinations/fixture-town',testTown)).status,200);
    assert.equal((await (await call('/delivery-destinations')).json())[0].code,'fixture-town');
    assert.equal((await write('PUT','/delivery-destinations/fixture-town',{...testTown,name:'Renamed Fixture Town',active:false})).status,200);
    assert.ok(!(await (await call('/delivery-destinations')).json()).some(row=>row.code==='fixture-town'));
    assert.equal((await call('/checkout/orders',{method:'POST',body:{...body,customer:{...buyer,destinationCode:'fixture-town'}}})).status,409);
    const initial = await (await call('/checkout/orders',{method:'POST',body})).json();
    assert.match(initial.reference,/^SP-\d{6}$/);
    assert.match(initial.whatsappUrl,/^https:\/\/wa.me\/970594503571/);
    const message = new URL(initial.whatsappUrl).searchParams.get('text');
    assert.match(message,/Noor Test/);
    assert.match(message,/check the delivery fee/);
    assert.doesNotMatch(message,/594000123|Example street|New creation|₪/);
    assert.equal((await call('/checkout/orders/'+initial.reference)).status,400);
    assert.equal((await call('/checkout/orders/'+randomUUID())).status,404);
    await stop();
    await start();
    assert.equal((await call('/admin/stats',{cookie})).status,200);
    assert.deepEqual(await (await call('/checkout/orders/' + submission)).json(),initial);
    assert.deepEqual(await (await call('/checkout/orders',{method:'POST',body})).json(),initial);
    const products = await (await call('/catalog')).json();
    assert.equal(products[0].image,url);
    assert.equal((await (await call('/admin/products',{cookie})).json())[0].catalog_skus[0].stock,4);
    const orders = await (await call('/admin/orders',{cookie})).json();
    assert.equal(orders.length,1);
    assert.equal(orders[0].status,'Pending');
    assert.equal(orders[0].customer_phone,'+970594000123');
    assert.equal(orders[0].snapshot.customer.alternativePhone,'+972541234567');
    assert.equal(orders[0].snapshot.customer.address,'Example street 12');
    assert.deepEqual(orders[0].snapshot.customer.deliveryDestination,{code:'nablus',region:'west-bank',name:'Nablus',nameAr:'نابلس'});
    for (const search of [initial.reference,'Nablus','0541234567','Noor Test']) {
      assert.equal((await (await call('/admin/orders?search='+encodeURIComponent(search),{cookie})).json())[0].id,orders[0].id);
    }
    assert.equal((await write('PATCH','/orders/' + orders[0].id + '/delivery',{details:'Arrange via WhatsApp',fee:1500})).status,200);
    assert.equal((await (await call('/admin/orders',{cookie})).json())[0].snapshot.total,3500);
    assert.deepEqual(await (await call('/checkout/orders/' + submission)).json(),initial);
    assert.equal((await write('PATCH','/orders/' + orders[0].id,{status:'Confirmed'})).status,200);
    assert.equal((await (await call('/admin/products',{cookie})).json())[0].catalog_skus[0].stock,3);
    assert.equal((await (await call('/admin/orders?group=pending',{cookie})).json()).length,0);
    assert.equal((await (await call('/admin/orders?group=processed',{cookie})).json()).length,1);
    assert.equal((await write('PATCH','/orders/' + orders[0].id,{status:'Cancelled'})).status,200);
    assert.equal((await (await call('/admin/products',{cookie})).json())[0].catalog_skus[0].stock,4);
    let reference=Number(initial.reference.slice(3));
    for (const contact of [{...buyer,phone:'٠٥٩٤٠٠٠١٢٣',destinationCode:'ramallah',address:'New address'},
      {...buyer,prefix:'+972',phone:'0540000123',alternativePhone:''}]) {
      const order = await call('/checkout/orders',{method:'POST',body:{...body,submission:randomUUID(),customer:contact,language:'ar'}});
      assert.equal(order.status,201);
      const second=await order.json();
      assert.equal(Number(second.reference.slice(3)),++reference);
      const draft=new URL(second.whatsappUrl).searchParams.get('text');
      assert.match(draft,/بدي أكد طلبي وأعرف تكلفة التوصيل/);
      assert.match(draft,/الاسم: Noor Test/);
    }
    assert.equal((await write('PATCH','/customers/%2B970594000123',{notes:'Internal test'})).status,200);
    assert.equal((await call('/admin/customers')).status,401);
    const directory = await (await call('/admin/customers',{cookie})).json();
    assert.equal(directory.length,2);
    assert.equal(directory.find(row=>row.phone==='+970594000123').first_name,'Noor');
    assert.equal(directory.find(row=>row.phone==='+970594000123').contact.city,'Ramallah');
    assert.equal(directory.find(row=>row.phone==='+972540000123').contact.alternativePhone,null);
    assert.equal((await (await call('/admin/orders?search=Nablus',{cookie})).json()).find(row=>row.id===orders[0].id).snapshot.customer.address,'Example street 12');
    assert.equal(directory.find(row=>row.phone==='+970594000123').order_count,2);
    assert.equal(directory.find(row=>row.phone==='+970594000123').admin_notes,'Internal test');
    assert.equal((await write('PUT','/products/test-kit',{
      published:true,archived:false,presentation:{name:'Test Kit',category:'DIY Kits',kind:'kit',kitPieces:1,kitOptions:['Mirror','Brush']},
      skus:[{variant:'',base_price:7000,stock:1,low_stock:1}]
    })).status,200);
    const kitLine={productId:'test-kit',quantity:1,kitChoices:['Mirror']};
    const quoteCart=items=>call('/checkout/quote',{method:'POST',body:{items}});
    assert.equal((await quoteCart([{...kitLine,kitChoices:['Unknown']}])).status,409);
    assert.equal((await quoteCart([kitLine,{...kitLine,kitChoices:['Brush']}])).status,409);
    const mixed=await (await quoteCart([...items,kitLine])).json();
    assert.equal(mixed.total,9000);
    assert.deepEqual(mixed.lines.find(line=>line.productId==='test-kit').kitChoices,['Mirror']);
    const mixedSubmission=randomUUID();
    const mixedOrder=await call('/checkout/orders',{method:'POST',body:{...body,items:[...items,kitLine],expected:mixed,submission:mixedSubmission}});
    assert.equal(mixedOrder.status,201);
    assert.doesNotMatch(new URL((await mixedOrder.json()).whatsappUrl).searchParams.get('text'),/Mirror|Test Kit|₪/);
    assert.equal((await quoteCart([kitLine])).status,409);
    const heldKit=(await (await call('/admin/orders',{cookie})).json()).find(order=>order.submission===mixedSubmission);
    assert.equal((await write('PATCH','/orders/'+heldKit.id,{status:'Cancelled'})).status,200);
    const legacy = await fetch(new URL('/custom-orders',base),{redirect:'manual'});
    assert.equal(legacy.status,302);
    assert.equal(legacy.headers.get('location'),'/shop?tab=cakes');
    const category = {from:'Fake Cake Boxes',to:'Cake Box Collection',ar:'تشكيلة علب الكيك',section:'cakes',
      description:'Designs made just for you.',descriptionAr:'تصاميم من أجلك.'};
    assert.equal((await write('PATCH','/categories',category)).status,200);
    assert.equal((await (await call('/categories')).json()).find(row=>row.section_intro).description_ar,category.descriptionAr);
    const cake = {published:true,archived:false,presentation:{name:'Range Cake Box',nameAr:'علبة كيك',category:category.to,
      priceMode:'range',minPrice:8000,maxPrice:14000,variants:[{id:'pink',name:'Pink',nameAr:'وردي'}]},
      skus:[{variant:'pink',stock:3,low_stock:1}]};
    for (const invalidPrices of [{minPrice:-1},{maxPrice:7999},{maxPrice:null},{maxPrice:14000.5}]) {
      assert.equal((await write('PUT','/products/range-cake',{...cake,presentation:{...cake.presentation,...invalidPrices}})).status,400);
    }
    assert.equal((await write('PUT','/products/range-cake',cake)).status,200);
    const rangeLine={productId:'range-cake',variantId:'pink',quantity:2};
    const rangeOnly=await (await quoteCart([rangeLine])).json();
    assert.deepEqual([rangeOnly.estimatedMin,rangeOnly.estimatedMax,rangeOnly.total],[16000,28000,null]);
    assert.equal((await quoteCart([{...rangeLine,variantId:'blue'}])).status,409);
    assert.equal((await quoteCart([{...rangeLine,quantity:4}])).status,409);
    const rangeItems=[...items,kitLine,rangeLine];
    const expected=await (await quoteCart(rangeItems)).json();
    assert.deepEqual([expected.estimatedMin,expected.estimatedMax,expected.total],[25000,37000,null]);
    const rangeBody={...body,items:rangeItems,expected,language:'ar',submission:randomUUID()};
    assert.equal((await call('/checkout/orders',{method:'POST',body:{...rangeBody,expected:{...expected,estimatedMin:1}}})).status,409);
    const placed=await call('/checkout/orders',{method:'POST',body:rangeBody});
    assert.equal(placed.status,201);
    const rangeReceipt=await placed.json();
    const rangeMessage=new URL(rangeReceipt.whatsappUrl).searchParams.get('text');
    assert.match(rangeMessage,/رقم الطلب: SP-/);
    assert.doesNotMatch(rangeMessage,/₪|وردي|Range Cake Box|Example street/);
    assert.deepEqual(await (await call('/checkout/orders',{method:'POST',body:rangeBody})).json(),rangeReceipt);
    const rangeOrder=(await (await call('/admin/orders',{cookie})).json()).find(order=>order.submission===rangeBody.submission);
    const orderPath='/orders/'+rangeOrder.id;
    const stock=async ()=>(await (await call('/admin/products',{cookie})).json()).find(item=>item.slug==='range-cake').catalog_skus[0].stock;
    assert.equal(await stock(),3);
    assert.equal((await write('PATCH',orderPath,{status:'Confirmed'})).status,409);
    const agreedPrices=rangeOrder.snapshot.lines.map(line=>line.minPrice == null ? null : 11000);
    assert.equal((await call('/admin'+orderPath+'/delivery',{method:'PATCH',body:{prices:agreedPrices}})).status,401);
    assert.equal((await write('PATCH',orderPath+'/delivery',{prices:agreedPrices,details:'Confirmed via WhatsApp',fee:1800})).status,200);
    const finalized=(await (await call('/admin/orders',{cookie})).json()).find(order=>order.id===rangeOrder.id);
    assert.deepEqual([finalized.snapshot.estimatedMin,finalized.snapshot.estimatedMax,finalized.snapshot.total],[25000,37000,32800]);
    assert.equal(finalized.snapshot.lines.find(line=>line.productId==='range-cake').agreedUnitPrice,11000);
    assert.deepEqual(await (await call('/checkout/orders/'+rangeBody.submission)).json(),rangeReceipt);
    assert.equal((await write('PATCH',orderPath,{status:'Confirmed'})).status,200);
    assert.equal(await stock(),1);
    assert.equal((await write('PATCH',orderPath+'/delivery',{prices:agreedPrices})).status,409);
    assert.equal((await write('PATCH',orderPath,{status:'Cancelled'})).status,200);
    assert.equal(await stock(),3);
    const home=defaultHomepage();
    home.hero.title.en='Isolated homepage test';
    home.reviews=[{name:'Fixture A',text:{en:'Test fixture',ar:''},approved:false,visible:true,imageApproved:false,rating:4,image:'',related:''}];
    assert.equal((await call('/admin/homepage')).status,401);
    assert.equal((await call('/admin/homepage',{method:'PUT',body:{home,publish:true}})).status,401);
    assert.equal((await write('PUT','/homepage',{home,publish:false})).status,200);
    assert.equal((await (await call('/content')).json()).home,undefined);
    assert.equal((await (await call('/admin/homepage',{cookie})).json()).draft.hero.title.en,'Isolated homepage test');
    assert.equal((await write('PUT','/homepage',{home:{...home,hero:{...home.hero,primary:{...home.hero.primary,href:'javascript:alert(1)'}}},publish:true})).status,400);
    assert.equal((await write('PUT','/homepage',{home,publish:true})).status,200);
    const winter={...seasonalDefaults,enabled:true,intensity:'low',speed:'slow'};
    assert.deepEqual(await (await call('/seasonal-effects')).json(),{enabled:false});
    assert.equal((await call('/admin/seasonal-effects')).status,401);
    assert.equal((await write('PUT','/seasonal-effects',{...winter,startDate:'2026-02-30'})).status,400);
    assert.equal((await write('PUT','/seasonal-effects',winter)).status,200);
    assert.deepEqual(await (await call('/seasonal-effects')).json(),winter);
    assert.equal((await write('PUT','/content/website/seasonal-effects',{published:true,name:'Fixture'})).status,400);
    assert.deepEqual((await (await call('/content')).json()).home.reviews,[]);
    home.hero.title.en='Second revision';
    home.reviews[0].approved=true;
    assert.equal((await write('PUT','/homepage',{home,publish:false})).status,200);
    assert.equal((await (await call('/content')).json()).home.hero.title.en,'Isolated homepage test');
    assert.equal((await write('PUT','/homepage',{home,publish:true})).status,200);
    await stop();
    await start();
    const published=(await (await call('/content')).json()).home;
    assert.deepEqual(await (await call('/admin/seasonal-effects',{cookie})).json(),winter);
    assert.ok(!(await (await call('/admin/content/website',{cookie})).json()).items.some(row=>row.key==='seasonal-effects'));
    assert.equal(published.hero.title.en,'Second revision');
    assert.equal(published.reviews.length,1);
    assert.equal((await write('POST','/logout',{})).status,200);
    assert.equal((await call('/admin/stats',{cookie})).status,401);
  } finally {
    if (server?.listening) await stop();
    await db.close();
  }
});

test('stock caps restored cart quantities across customizations and independently per variant',()=>{
  const products=[{slug:'kit',name:'Kit',price:'₪20',kitOptions:['Mirror','Brush'],kitPieces:1,variants:[
    {id:'pink',price:'₪20',availableStock:1},{id:'blue',price:'₪20',availableStock:3},{id:'white',price:'₪20',availableStock:0}
  ]}];
  const item=(variantId,choice,quantity)=>({productId:'kit',variantId,kitChoices:[choice],quantity});
  const restored=restoreCart(products,[
    item('pink','Mirror',4),item('pink','Brush',1),item('blue','Mirror',2),item('blue','Brush',2),item('white','Brush',1)
  ]);
  assert.deepEqual(restored.map(row=>[row.variantId,row.kitChoices[0],row.quantity]),[
    ['pink','Mirror',1],['blue','Mirror',2],['blue','Brush',1]
  ]);
});

test('pending reservations serialize competing orders, expire, and never deduct twice',async()=>{
  const database=new PGlite();
  try {
    await migrate(database);
    const db=repository(database);
    const {skus,...product}=productInput('hold-fixture',{published:true,archived:false,presentation:{name:'Hold fixture',category:'Mirrors'},
      skus:[{variant:'',base_price:2000,stock:1,low_stock:1}]});
    await db.saveProduct('hold-fixture',product,skus);
    const items=[{productId:'hold-fixture',quantity:1}];
    const expected=await db.quote(items);
    const submit=(submission=randomUUID())=>db.submitDestination({submission,items,expected,language:'en',code:'nablus',region:'west-bank',
      customer:{firstName:'',lastName:'',name:'',phone:'+970594000000',address:'Fixture address'}});
    const id=randomUUID();
    const attempts=await Promise.allSettled([submit(id),submit()]);
    const winner=attempts[0].value;
    assert.equal(winner.status,'Pending');
    assert.equal(attempts[1].reason.message,'stock_unavailable');
    assert.equal((await submit(id)).id,winner.id);
    const stock=async()=> (await db.catalog())[0].catalog_skus[0].stock;
    assert.equal(await stock(),1);
    assert.equal((await db.catalog(true))[0].catalog_skus[0].stock,0);
    await assert.rejects(db.quote(items),/stock_unavailable/);
    await db.transition(winner.id,'Cancelled',null);
    assert.equal(await stock(),1);
    const expired=await submit();
    await database.query("update public.shop_orders set reservation_expires_at=clock_timestamp()-interval '1 second' where id=$1",[expired.id]);
    await assert.rejects(db.transition(expired.id,'Confirmed',null),/reservation_expired/);
    const renewed=await submit();
    await db.transition(renewed.id,'Confirmed',null);
    await db.transition(renewed.id,'Confirmed',null);
    assert.equal(await stock(),0);
    await db.transition(renewed.id,'Cancelled',null);
    assert.equal(await stock(),1);
    await db.transition(expired.id,'Cancelled',null);
    assert.equal(await stock(),1);
    await database.query("update public.catalog_skus set stock=0 where product_slug='hold-fixture'");
    await assert.rejects(submit(),/stock_unavailable/);
  }finally{await database.close();}
});
