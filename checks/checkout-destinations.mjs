import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium,devices} from 'playwright';
import {createApp} from '../server/app.js';

const product={slug:'preview-item',name:'Preview Item',price:'₪35',status:'Available',purchasable:true};
const cities=[
  {code:'nablus',region:'west-bank',name:'Nablus',name_ar:'نابلس'},
  {code:'haifa',region:'inside-1948',name:'Haifa',name_ar:'حيفا'},
  {code:'silwan',region:'east-jerusalem',name:'Silwan',name_ar:'سلوان'},
  {code:'rehavia',region:'west-jerusalem',name:'Rehavia',name_ar:'رحافيا'},
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
          if(location.pathname==='/checkout')localStorage.setItem('sparkle-cart-v1',JSON.stringify([item]));
        },{lang,item});
        await context.route('**/api/catalog?withCategories=1',route=>route.fulfill({json:{products:[product],categories:[]}}));
        await context.route('**/api/delivery-destinations',route=>route.fulfill({json:cities}));
        await context.route('**/api/checkout/quote',route=>route.fulfill({json:quote}));
        let submitted;
        await context.route('**/api/checkout/orders',route=>{
          submitted=route.request().postDataJSON();
          return route.fulfill({status:201,json:saved});
        });
        await context.route('**/api/checkout/orders/*',route=>route.fulfill({json:saved}));
        const page=await context.newPage();
        await page.goto(origin+'/checkout');
        const picker=page.getByRole('combobox',{name:lang==='en'?'City':'المدينة',exact:true});
        await page.locator('[name=name]').fill('Fixture Buyer');
        await page.locator('[name=phone]').fill('0594000123');
        await page.locator('[name=address]').fill('Fixture address, building 1');
        const place=page.locator('button').filter({hasText:lang==='en'?'Place Order':'إرسال الطلب'});
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
        await page.waitForURL('**/order-success');
        assert.equal(submitted.customer.destinationCode,'nablus');
        assert.equal(submitted.customer.destinationRegion,'west-bank');
        assert.equal(submitted.customer.address,'Fixture address, building 1');
        assert.equal(submitted.expected.deliveryFee,null);
      }finally{await context.close();}
    });
  }
});
