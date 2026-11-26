import React,{useState} from 'react';
import {api,ils} from './commerce-api.js';
import {AdminLanguage} from './AdminLocale.jsx';
import {PromotionBadge} from './quantity-promotions.jsx';

const blank = () => ({id:crypto.randomUUID(),product_slug:'',mode:'fixed',amount:null,
  title:'',title_ar:'',description:'',description_ar:'',starts_at:null,ends_at:null,enabled:false,archived:false,stack:false});
const dateInput = value => value ? new Date(Date.parse(value)-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16) : '';

export default function AdminQuantityPromotions({data,run,create,product}) {
  const ar=React.useContext(AdminLanguage);
  const l=(en,arabic)=>ar?arabic:en;
  const [draft,setDraft]=useState(()=>create?{...blank(),product_slug:product ?? ''}:null);
  const patch=change=>setDraft(before=>({...before,...change}));
  const save=(promotion)=>run(()=>api('/admin/quantity-promotions/'+promotion.id,'PUT',promotion));
  const productName=slug=>{
    const row=data.products.find(item=>item.slug===slug);
    return (ar && row?.nameAr) || row?.name || slug;
  };
  if(!draft) return <div className="admin-list">
    <div className="commerce-actions"><button className="button" onClick={()=>setDraft(blank())}>{l('New quantity promotion','عرض كمية جديد')}</button></div>
    {data.items.map(row=><article key={row.id} className="commerce-panel">
      <h2>{productName(row.product_slug)}</h2>
      <PromotionBadge promotion={{...row,titleAr:row.title_ar}} lang={ar?'ar':'en'}/>
      <p>{row.archived?l('Archived','مؤرشف'):row.storefront_active?l('Active on storefront','نشط في المتجر'):
        !row.enabled?l('Disabled','معطّل'):row.ends_at && Date.parse(row.ends_at)<=Date.now()?l('Expired','منتهي'):
          row.starts_at && Date.parse(row.starts_at)>Date.now()?l('Scheduled','مجدول'):l('Enabled · product unavailable','مفعّل · المنتج غير متاح')}</p>
      {!row.archived && <div className="commerce-actions">
        <button className="button secondary" onClick={()=>setDraft(row)}>{l('Edit promotion','تعديل العرض')}</button>
        <button className="button secondary" onClick={()=>save({...row,enabled:!row.enabled})}>{row.enabled?l('Disable','تعطيل'):l('Enable','تفعيل')}</button>
        <button className="button secondary" onClick={()=>{if(window.confirm(l('Archive this promotion?','أرشفة هذا العرض؟'))) save({...row,archived:true});}}>{l('Archive','أرشفة')}</button>
      </div>}
    </article>)}
  </div>;
  const unit=data.products.find(product=>product.slug===draft.product_slug)?.price;
  const hasPreview=unit!=null && Number.isInteger(draft.amount) && draft.amount>=0 && draft.amount<=(draft.mode==='percent'?100:100000000);
  const saving=hasPreview ? draft.mode==='fixed' ? Math.max(0,unit-draft.amount) : Math.floor((unit*draft.amount+50)/100) : 0;
  const saved=data.items.some(item=>item.id===draft.id);
  return <form className="commerce-panel commerce-fields" onSubmit={async event=>{
    event.preventDefault();
    if(await save(draft))setDraft(null);
  }}>
    <h2>{l('Quantity promotion editor','محرر عرض الكمية')}</h2>
    <div className="admin-form-grid">
      <label>{l('Eligible product','المنتج المؤهل')}<select required disabled={saved} value={draft.product_slug} onChange={e=>patch({product_slug:e.target.value})}>
        <option value="">{l('Select a product','اختاري منتجاً')}</option>
        {saved && !data.products.some(row=>row.slug===draft.product_slug) && <option value={draft.product_slug}>{draft.product_slug}</option>}
        {data.products.filter(row=>!row.archived || row.slug===draft.product_slug).map(row=><option key={row.slug} value={row.slug}>{productName(row.slug)}</option>)}
      </select></label>
      <label>{l('Offer type','نوع العرض')}<select value={draft.mode} onChange={e=>patch({mode:e.target.value,amount:null})}>
        <option value="fixed">{l('Fixed second-unit price','سعر ثابت للقطعة الثانية')}</option>
        <option value="percent">{l('Percentage off second unit','خصم نسبي للقطعة الثانية')}</option>
      </select></label>
      <label>{draft.mode==='fixed'?l('Second-unit price (₪)','سعر القطعة الثانية (₪)'):l('Discount (%)','الخصم (%)')}
        <input required type="number" min="0" max={draft.mode==='fixed'?1000000:100} step={draft.mode==='fixed'?'.01':'1'} value={draft.amount==null?'':draft.amount/(draft.mode==='fixed'?100:1)}
          onChange={e=>patch({amount:e.target.value===''?null:Math.round(Number(e.target.value)*(draft.mode==='fixed'?100:1))})}/></label>
      {['starts_at','ends_at'].map((field,i)=><label key={field}>{i?l('End date (optional)','وقت الانتهاء (اختياري)'):l('Start date (optional)','وقت البدء (اختياري)')}
        <input type="datetime-local" value={dateInput(draft[field])} onChange={e=>patch({[field]:e.target.value?new Date(e.target.value).toISOString():null})}/></label>)}
      {['title','title_ar','description','description_ar'].map((field,i)=><label key={field}>{[
        l('English title','العنوان بالإنجليزية'),l('Arabic title','العنوان بالعربية'),
        l('English description','الوصف بالإنجليزية'),l('Arabic description','الوصف بالعربية')][i]}
        {i<2 ? <input maxLength={100} dir={i===1?'rtl':'ltr'} value={draft[field]} onChange={e=>patch({[field]:e.target.value})}/> :
          <textarea maxLength={400} dir={i===3?'rtl':'ltr'} value={draft[field]} onChange={e=>patch({[field]:e.target.value})}/>}</label>)}
    </div>
    <label className="commerce-check"><input type="checkbox" checked={draft.stack} onChange={e=>patch({stack:e.target.checked})}/>{l('Stack with existing discounts','السماح بالجمع مع الخصومات الحالية')}</label>
    <p>{l('With stacking enabled, the offer uses each unit’s current sale price. Otherwise, only full-price units qualify. Units are sorted by price and paired from lowest to highest. The cheaper unit in each pair receives the offer.',
      'عند السماح بالجمع، يستخدم العرض السعر بعد الخصم. وإلا فتتأهل القطع بالسعر الكامل فقط. تُرتّب القطع من الأرخص إلى الأغلى ويُطبّق العرض على القطعة الأرخص في كل زوج.')}</p>
    <label className="commerce-check"><input type="checkbox" checked={draft.enabled} onChange={e=>patch({enabled:e.target.checked})}/>{l('Enable promotion','تفعيل العرض')}</label>
    {hasPreview && <section aria-label={l('Offer preview','معاينة العرض')}>
      <PromotionBadge promotion={{...draft,titleAr:draft.title_ar,descriptionAr:draft.description_ar}} lang={ar?'ar':'en'} details/>
      <p>{l('Examples at the product’s regular unit price','أمثلة حسب السعر العادي للقطعة')} <bdi>{ils(unit)}</bdi></p>
      <dl className="quantity-examples">{[1,2,3,4,5,6].map(n=><div key={n}><dt>{n} {l(n===1?'unit':'units','قطعة')}</dt><dd><bdi>{ils(n*unit-Math.floor(n/2)*saving)}</bdi></dd></div>)}</dl>
    </section>}
    <div className="commerce-actions"><button className="button">{l('Save promotion','حفظ العرض')}</button>
      <button type="button" className="button secondary" onClick={()=>setDraft(null)}>{l('Cancel','إلغاء')}</button></div>
  </form>;
}
