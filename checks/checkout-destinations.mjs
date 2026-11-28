import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium,devices} from 'playwright';
import {createApp} from '../server/app.js';

const product={slug:'preview-item',name:'Preview Item',price:'₪35',status:'Available',purchasable:true};
const cities=[
  {code:'nablus',region:'west-bank',name:'Nablus',name_ar:'نابلس'},
  {code:'haifa',region:'inside-1948',name:'Haifa',name_ar:'حيفا'},
  {code:'east-jerusalem',region:'east-jerusalem',name:'East Jerusalem',name_ar:'القدس الشرقية'},
  {code:'west-jerusalem',region:'west-jerusalem',name:'West Jerusalem',name_ar:'القدس الغربية'},
];
const item={productId:product.slug,quantity:1};
const quote={lines:[{...item,name:product.name,originalPrice:3500,unitPrice:3500,lineTotal:3500}],
  total:3500,subtotal:3500,discount:0,estimatedMin:null,deliveryFee:null};
const saved={reference:'SP-000001',whatsappUrl:'https://wa.me/970594503571?text=Fixture'};

test('search and select a delivery destination on desktop and mobile without a live database',async t=>{
  const server=createApp({env:{},pool:null}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL?{channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL}:{});
  t.after(()=>browser.close());
  const origin='http://127.0.0.1:'+server.address().port;
  for(const [lang,device] of [['en',{viewport:{width:1440,height:900}}],['ar',devices['Pixel 7']]]){
    await t.test(lang,async()=>{
      const context=await browser.newContext(device);
      try{
        await context.addInitScript(({lang,item})=>{
          localStorage.setItem('sparkle-language',lang);
          localStorage.setItem('sparkle-mood',lang==='ar'?'dark':'light');
          if(location.pathname==='/checkout')localStorage.setItem('sparkle-cart-v1',JSON.stringify([item]));
        },{lang,item});
        let releaseCatalog,failCatalog=false;
        const catalogLoaded=new Promise(resolve=>{releaseCatalog=resolve;});
        await context.route('**/api/catalog?withCategories=1',async route=>{
          await catalogLoaded;
          return failCatalog ? route.fulfill({status:503,json:{error:'service_unavailable'}}) :
            route.fulfill({json:{products:[product],categories:[]}});
        });
        await context.route('**/api/delivery-destinations',route=>route.fulfill({json:cities}));
        await context.route('**/api/checkout/quote',route=>route.fulfill({json:quote}));
        await context.route('**/api/seasonal-effects',route=>route.fulfill({json:{enabled:lang==='ar'}}));
        let submitted, failSave=true, whatsAppOpened=false;
        await context.route('https://wa.me/**',route=>{whatsAppOpened=true;return route.abort();});
        await context.route('**/api/checkout/orders',route=>{
          if(failSave){failSave=false;return route.fulfill({status:503,json:{error:'service_unavailable'}});}
          submitted=route.request().postDataJSON();
          return route.fulfill({status:201,json:saved});
        });
        await context.route('**/api/checkout/orders/*',route=>route.fulfill({json:saved}));
        const page=await context.newPage();
        await page.goto(origin+'/checkout');
        const loader=page.locator('.storefront-loading');
        await page.getByRole('status').filter({hasText:lang==='ar'?'جارٍ تحميل سباركل':'Loading Sparkle'}).waitFor();
        assert.equal(await loader.locator('.brand').innerHTML(),await page.locator('.header .brand').innerHTML());
        if(lang==='ar'){
          await page.locator('.winter-theme-active').waitFor({state:'attached'});
          assert.match(await loader.evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/);
          await page.emulateMedia({reducedMotion:'reduce'});
          assert.equal(await loader.locator('.brand').evaluate(el=>getComputedStyle(el).animationName),'none');
          await page.emulateMedia({reducedMotion:'no-preference'});
        }
        releaseCatalog();
        await loader.waitFor({state:'hidden'});
        if(lang==='ar')await page.locator('.winter-theme-active').waitFor({state:'attached'});
        assert.equal(await page.locator('.winter-layer--site').count(),0);
        const picker=page.getByRole('combobox',{name:lang==='en'?'City':'المدينة',exact:true});
        const place=page.locator('button').filter({hasText:lang==='en'?'Place Order':'إرسال الطلب'});
        const phone=page.locator('[name=phone]'),address=page.locator('[name=address]'),alternative=page.locator('[name=alternativePhone]');
        await place.click();
        await page.waitForFunction(()=>document.activeElement?.name==='phone');
        assert.equal(await phone.getAttribute('aria-invalid'),'true');
        assert.equal(await address.getAttribute('aria-invalid'),'true');
        assert.equal(await picker.getAttribute('aria-invalid'),'true');
        for(const invalid of ['059400012','05940001234','0594-000123','059400012a']){
          await phone.fill(invalid);
          assert.equal(await phone.getAttribute('aria-invalid'),'true');
        }
        await phone.fill(lang==='ar'?'٠٥٩٤٠٠٠١٢٣':'0594000123');
        assert.equal(await phone.getAttribute('aria-invalid'),null);
        await alternative.fill('bad');
        assert.equal(await alternative.getAttribute('aria-invalid'),'true');
        await alternative.fill('');
        assert.equal(await alternative.getAttribute('aria-invalid'),null);
        await address.fill('Fixture address, building 1');
        await picker.fill('invented city');
        await place.click();
        assert.equal(submitted,undefined);
        await page.getByRole('alert').waitFor();
        await picker.fill(lang==='en'?'نَابلس':'NABLUS');
        const city=page.getByRole('option',{name:lang==='en'?'Nablus':'نابلس',exact:true});
        if(lang==='ar')await city.tap();
        else{await picker.press('ArrowDown');await picker.press('Enter');}
        assert.equal(await picker.inputValue(),lang==='en'?'Nablus':'نابلس');
        assert.equal(await page.locator('html').getAttribute('dir'),lang==='en'?'ltr':'rtl');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await place.click();
        await page.locator('.commerce-grid section [role="alert"]').waitFor();
        assert.equal(await page.locator('.order-success-stars').count(),0);
        assert.ok(page.url().endsWith('/checkout'));
        await place.click();
        await page.waitForURL('**/order-success');
        await page.locator('.order-success[data-celebrate="true"]').waitFor();
        assert.equal(await page.locator('.order-success-stars span').count(),10);
        assert.equal(await page.locator('.order-success-mark > svg').evaluate(el=>getComputedStyle(el).animationName),'order-check-in');
        assert.equal(await page.locator('.order-success-stars').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
        assert.equal(await page.locator('.order-success a').getAttribute('href'),saved.whatsappUrl);
        assert.equal(whatsAppOpened,false);
        await loader.waitFor({state:'hidden'});
        await page.emulateMedia({reducedMotion:'reduce'});
        assert.equal(await page.locator('.order-success-mark > svg').evaluate(el=>getComputedStyle(el).animationName),'none');
        await page.reload();
        await page.locator('.order-reference').waitFor();
        assert.equal(await page.locator('.order-success-stars').count(),0);
        assert.equal(await page.locator('.order-reference').innerText(),saved.reference);
        assert.equal(submitted.customer.name,'');
        assert.equal(submitted.customer.destinationCode,'nablus');
        assert.equal(submitted.customer.destinationRegion,'west-bank');
        assert.equal(submitted.customer.address,'Fixture address, building 1');
        assert.equal(submitted.expected.deliveryFee,null);
        failCatalog=true;
        await page.goto(origin+'/checkout');
        await page.getByText(lang==='ar'?'إتمام الطلب غير متاح مؤقتاً.':'Checkout is temporarily unavailable.').waitFor();
        assert.equal(await loader.isVisible(),false);
      }finally{await context.close();}
    });
  }
});
