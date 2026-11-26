import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium, devices} from 'playwright';
import {createApp} from '../server/app.js';

const photos=['/DIY%20FIXED1.PNG','/DIY%20FIXED2.PNG'];
const product={
  slug:'mobile-fixture', name:'Mobile fixture', nameAr:'منتج تجريبي',
  category:'Fixtures', kind:'ready-made', price:'₪35', purchasable:true, status:'Available',
  description:'Test description body.', descriptionAr:'وصف تجريبي.',
  details:['Test ordering instructions.'], image:photos[0], images:photos,
  optionGroups:[
    {id:'color',name:'Color',nameAr:'اللون',kind:'color',values:[{id:'pink',name:'Pink',nameAr:'وردي',color:'#e96f8d'}]},
    {id:'model',name:'Model',nameAr:'الموديل',kind:'select',values:[{id:'sample',name:'Sample',nameAr:'تجريبي'}]},
  ],
  defaultVariant:'pink-sample',
  variants:[{id:'pink-sample',name:'Pink Sample',price:'₪35',purchasable:true,status:'Available',
    selections:{color:'pink',model:'sample'},image:photos[0],images:photos}],
};

async function assertDisclosureToggles(page,disclosure){
  const header=disclosure.locator('summary');
  await header.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
  const bounds=await header.boundingBox();
  assert.ok(bounds);
  const tap={x:Math.round(bounds.width*.65),y:Math.round(bounds.height/2)};
  assert.ok(await header.evaluate((element,point)=>{
    const rect=element.getBoundingClientRect();
    const bar=document.querySelector('.product-purchase-bar').getBoundingClientRect();
    return rect.bottom<=bar.top && element.contains(document.elementFromPoint(rect.left+point.x,rect.top+point.y));
  },tap),'The full header must be reachable above the fixed purchase bar');
  await header.tap({position:tap});
  await page.waitForFunction(element=>element.parentElement.open,await header.elementHandle());
  await header.tap({position:tap});
  await page.waitForFunction(element=>!element.parentElement.open,await header.elementHandle());
}

test('mobile touch can expand and collapse both product disclosures and use the purchase controls',async t=>{
  const server=createApp({env:{},pool:null,db:{}}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL
    ? {channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL} : {});
  t.after(()=>browser.close());
  const origin='http://127.0.0.1:'+server.address().port;
  for(const width of [320,375,390,414,430]){
    for(const [lang,dark] of [['en',false],['ar',true]]){
      await t.test(width+'px '+lang,async()=>{
        const context=await browser.newContext({...devices['Pixel 7'],viewport:{width,height:844},deviceScaleFactor:1});
        try{
          await context.addInitScript(({lang,dark})=>{
            localStorage.setItem('sparkle-language',lang);
            localStorage.setItem('sparkle-mood',dark?'dark':'light');
          },{lang,dark});
          await context.route('**/api/catalog?withCategories=1',route=>route.fulfill({json:{products:[product],categories:[]}}));
          let reachedWhatsApp=false;
          await context.route('https://wa.me/**',route=>{
            reachedWhatsApp=new URL(route.request().url()).pathname==='/970594503571';
            return route.fulfill({body:'Local test'});
          });
          const page=await context.newPage();
          page.setDefaultTimeout(9000);
          await page.goto(origin+'/shop/mobile-fixture');
          const disclosures=page.locator('.product-disclosure');
          await disclosures.last().waitFor();
          assert.equal(await page.locator('html').getAttribute('dir'),lang==='ar'?'rtl':'ltr');
          assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('dark-mood')),dark);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
          assert.ok(await page.locator('.product-purchase-bar').evaluate(element=>{
            const rect=element.getBoundingClientRect();
            return !element.contains(document.elementFromPoint(rect.left+4,rect.top+4));
          }),'The purchase bar background must not capture taps');
          await assertDisclosureToggles(page,disclosures.first());
          await assertDisclosureToggles(page,disclosures.last());
          await page.getByRole('button',{name:lang==='ar'?'اختاري الخيارات':'Choose Options',exact:true}).tap();
          const color=page.locator('.product-variants .color-swatch');
          assert.equal(await color.evaluate(element=>element===document.activeElement),true);
          await color.tap();
          await page.locator('.product-option-groups select').selectOption('sample');
          await page.getByRole('button',{name:lang==='ar'?'زيادة الكمية':'Increase quantity'}).tap();
          await page.getByRole('button',{name:lang==='ar'?'أضيفي إلى السلة':'Add to Cart',exact:true}).tap();
          await page.locator('.cart-count').filter({hasText:'2'}).waitFor();
          const [popup]=await Promise.all([page.waitForEvent('popup'),page.locator('.product-purchase-contact').tap()]);
          await popup.waitForLoadState();
          assert.ok(reachedWhatsApp);
          await popup.close();
          await page.bringToFront();
          const gallery=page.locator('.product-image-column .image-carousel');
          await gallery.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
          const rect=await gallery.boundingBox();
          const cdp=await context.newCDPSession(page);
          // Start on the photograph away from the arrow buttons at its vertical midpoint.
          const point=offset=>({x:rect.x+rect.width*offset,y:rect.y+rect.height*.34});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(.8)]});
          for(let i=1;i<=5;i++){
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(.8-i*.12)]});
          }
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.locator('.product-image-counter').filter({hasText:'2 / 2'}).waitFor();
          await cdp.detach();
        }finally{await context.close();}
      });
    }
  }
});
