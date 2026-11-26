import React,{useState} from 'react';
import {api,ils} from './commerce-api.js';
import {AdminLanguage,useAdminText} from './AdminLocale.jsx';
import {variantDescription} from './variant-options.js';

const orderStates=['Pending','Confirmed','Preparing','Shipped','Delivered','Cancelled'];
const nullableAmount=value=>value===''?null:Math.round(Number(value)*100);

export function OrderFilters({filters,apply}) {
  const ar=React.useContext(AdminLanguage),t=useAdminText(),l=(en,arabic)=>ar?arabic:en;
  const [draft,setDraft]=useState(filters);
  const field=(key,change)=>setDraft(current=>({...current,[key]:change}));
  return <form className="erp-filters" onSubmit={event=>{event.preventDefault();apply(draft);}}>
    <label>{l('Search orders','البحث في الطلبات')}<input type="search" maxLength={100} value={draft.search ?? ''} placeholder={l('Reference, name, phone or city','رقم الطلب، الاسم، الهاتف أو المدينة')} onChange={event=>field('search',event.target.value)}/></label>
    <label>{l('Order status','حالة الطلب')}<select value={draft.status || draft.group || ''} onChange={event=>{
      const value=event.target.value;
      setDraft(current=>({...current,status:orderStates.includes(value)?value:'',group:orderStates.includes(value)?'':value}));
    }}><option value="">{l('All orders','كل الطلبات')}</option>
      <option value="confirmed">{l('Confirmed sales only','المبيعات المؤكدة فقط')}</option>
      {orderStates.map(status=><option value={status} key={status}>{t(status)}</option>)}</select></label>
    <label>{l('Payment status','حالة الدفع')}<select value={draft.paid ?? ''} onChange={event=>field('paid',event.target.value)}>
      <option value="">{l('All payments','كل المدفوعات')}</option><option value="true">{t('Paid')}</option><option value="false">{t('Unpaid')}</option></select></label>
    <label>{l('From','من')}<input type="date" value={draft.from ?? ''} max={draft.to || undefined} onChange={event=>field('from',event.target.value)}/></label>
    <label>{l('To','إلى')}<input type="date" value={draft.to ?? ''} min={draft.from || undefined} onChange={event=>field('to',event.target.value)}/></label>
    <label>{l('Sort','الترتيب')}<select value={draft.sort ?? 'recent'} onChange={event=>field('sort',event.target.value)}>
      <option value="recent">{l('Newest first','الأحدث أولاً')}</option><option value="oldest">{l('Oldest first','الأقدم أولاً')}</option>
      <option value="highest">{l('Highest total','أعلى إجمالي')}</option></select></label>
    <button className="button secondary">{l('Apply filters','تطبيق الفلاتر')}</button>
    <button type="button" className="button secondary" onClick={()=>{setDraft({});apply({});}}>{l('Clear','مسح')}</button>
  </form>;
}
export function CustomerFilters({filters,apply}){
  const ar=React.useContext(AdminLanguage),l=(en,arabic)=>ar?arabic:en;
  const [draft,setDraft]=useState(filters);
  return <form className="erp-filters" onSubmit={event=>{event.preventDefault();apply(draft);}}>
    <label>{l('Search customers','البحث عن العملاء')}<input type="search" value={draft.search ?? ''} maxLength={100}
      onChange={event=>setDraft({...draft,search:event.target.value})}/></label>
    <label>{l('Customer activity','نشاط العميل')}<select value={draft.filter ?? ''} onChange={event=>setDraft({...draft,filter:event.target.value})}>
      <option value="">{l('All customers','كل العملاء')}</option><option value="returning">{l('Returning customers','العملاء المتكررون')}</option>
      <option value="collected">{l('Collected purchases','مشتريات محصّلة')}</option><option value="outstanding">{l('Outstanding COD','دفع عند الاستلام غير محصّل')}</option>
    </select></label>
    <button className="button secondary">{l('Apply filters','تطبيق الفلاتر')}</button>
  </form>;
}
export function OrderPrivate({order,run}){
  const ar=React.useContext(AdminLanguage),l=(en,arabic)=>ar?arabic:en;
  const sale=order.snapshot;
  const actual=order.actual_unit_costs ?? {};
  const totalCost=sale.lines.reduce((sum,line,i)=>{
    const cost=actual[i+1] ?? line.cost;
    return sum==null || cost==null ? null : sum+cost*line.quantity;
  },0);
  const canCalculate=!['Pending','Cancelled'].includes(order.status) && sale.total!=null && totalCost!=null;
  const gross=canCalculate?sale.total-(sale.deliveryFee ?? 0)-totalCost:null;
  const afterDirect=canCalculate && order.delivery_expense!=null?sale.total-totalCost-order.delivery_expense:null;
  const orderPath='/admin/orders/'+order.id;
  return <section className="erp-dashboard-panel">
    <h3>{l('Private notes and costs','ملاحظات وتكاليف خاصة')}</h3>
    <form className="commerce-fields" onSubmit={event=>{
      event.preventDefault();
      const notes=new FormData(event.currentTarget).get('notes');
      run(()=>api(orderPath+'/notes','PATCH',{notes}));
    }}>
      <label>{l('Internal notes','ملاحظات داخلية')}<textarea maxLength={4000} name="notes" defaultValue={order.admin_notes}/></label>
      <button className="button secondary">{l('Save notes','حفظ الملاحظات')}</button>
    </form>
    <form className="commerce-fields" onSubmit={event=>{
      event.preventDefault();
      const fields=new FormData(event.currentTarget);
      const costs=Object.fromEntries(sale.lines.flatMap((_,index)=>{
        const value=nullableAmount(fields.get('cost-'+index));
        return value==null?[]:[[index+1,value]];
      }));
      run(()=>api(orderPath+'/direct-costs','PATCH',{delivery:nullableAmount(fields.get('expense')),costs}));
    }}>
      <div className="admin-form-grid">{sale.lines.map((line,index)=><label key={index}>{(ar && line.nameAr) || line.name}
        {line.option && ' · '+variantDescription(line.option,ar?'ar':'en')} · {l('Actual unit cost (₪)','التكلفة الفعلية للقطعة (₪)')}
        <input name={'cost-'+index} type="number" min="0" max="1000000" step=".01" defaultValue={actual[index+1]==null?'':actual[index+1]/100}/>
        <small>{l('Cost at order time','التكلفة عند الطلب')} <bdi>{line.cost==null?'—':ils(line.cost)}</bdi></small>
      </label>)}
        <label>{l('Actual delivery expense (₪)','مصروف التوصيل الفعلي (₪)')}<input name="expense" type="number" min="0" max="1000000"
          step=".01" defaultValue={order.delivery_expense==null?'':order.delivery_expense/100}/></label>
      </div>
      <p>{l('Gross profit','الربح الإجمالي')} <bdi>{gross==null?'—':ils(gross)}</bdi> · {l('Profit after recorded direct expenses','الربح بعد المصاريف المباشرة المسجّلة')} <bdi>{afterDirect==null?'—':ils(afterDirect)}</bdi></p>
      <p>{l('Missing costs leave profit incomplete. This calculation excludes operating expenses.','لا تكتمل الأرباح عند غياب التكاليف. الحساب لا يشمل مصاريف التشغيل.')}</p>
      <button className="button secondary">{l('Save direct costs','حفظ التكاليف المباشرة')}</button>
    </form>
  </section>;
}

export function BulkProductEditor({count,categories,onSave}){
  const ar=React.useContext(AdminLanguage),l=(en,arabic)=>ar?arabic:en;
  const [fields,setFields]=useState({price:'',stock:'',category:'',published:''});
  const change=key=>event=>setFields(current=>({...current,[key]:event.target.value}));
  return <details className="erp-dashboard-panel">
    <summary>{l('Bulk edit selected products','تعديل المنتجات المحددة دفعة واحدة')} ({count})</summary>
    <form className="erp-filters" onSubmit={event=>{
      event.preventDefault();
      if(!window.confirm(l('Apply these changes to every selected product? A price or count applies to its active variants.','تطبيق التعديلات على جميع المنتجات المحددة؟ يُطبّق السعر أو المخزون على متغيراتها النشطة.')))return;
      const updates={};
      if(fields.price!=='')updates.price=nullableAmount(fields.price);
      if(fields.stock!=='')updates.stock=Number(fields.stock);
      if(fields.category)updates.category=fields.category;
      if(fields.published)updates.published=fields.published==='yes';
      if(Object.keys(updates).length)onSave(updates);
    }}>
      <label>{l('Regular price (₪)','السعر العادي (₪)')}<input type="number" min="0" max="1000000" step=".01" value={fields.price} onChange={change('price')}/></label>
      <label>{l('Count per active SKU','الكمية لكل رمز نشط')}<input type="number" min="0" max="1000000" step="1" value={fields.stock} onChange={change('stock')}/></label>
      <label>{l('Category','الفئة')}<select value={fields.category} onChange={change('category')}><option value="">{l('Keep current','إبقاء الحالي')}</option>
        {categories.map(row=><option key={row.name} value={row.name}>{(ar && row.name_ar) || row.name}</option>)}</select></label>
      <label>{l('Visibility','الظهور')}<select value={fields.published} onChange={change('published')}><option value="">{l('Keep current','إبقاء الحالي')}</option>
        <option value="yes">{l('Publish','نشر')}</option><option value="no">{l('Hide','إخفاء')}</option></select></label>
      <button className="button secondary">{l('Apply bulk changes','تطبيق التعديلات الجماعية')}</button>
    </form>
  </details>;
}

export function DeliverySettings({data,run}){
  const ar=React.useContext(AdminLanguage),l=(en,arabic)=>ar?arabic:en;
  const [area,setArea]=useState(null);
  return <div className="erp-dashboard">
    <section className="erp-dashboard-panel">
      <h2>{l('Checkout WhatsApp','واتساب إتمام الطلب')}</h2>
      <a href="https://wa.me/970594503571" dir="ltr" target="_blank" rel="noreferrer">+970 594 503 571</a>
      <p>{l('Agree on delivery through WhatsApp and record the fee on the order.','اتفقي على التوصيل عبر واتساب وسجّلي الرسوم في الطلب.')}</p>
    </section>
    <section className="erp-dashboard-panel">
      <h2>{l('Delivery areas','مناطق التوصيل')}</h2>
      {!data.areas.length && <p>{l('No delivery areas are saved. Delivery can still be arranged on each order.','لا توجد مناطق توصيل محفوظة. يمكن ترتيب التوصيل لكل طلب.')}</p>}
      <ul className="erp-simple-list">{data.areas.map(row=><li key={row.code}>
        <button onClick={()=>setArea({...row,existing:true})}>{ar?row.name_ar:row.name}</button>
        <bdi>{row.fee==null?'—':ils(row.fee)}</bdi>
      </li>)}</ul>
      <button className="button secondary" onClick={()=>setArea({code:'',name:'',name_ar:'',fee:null,region:null,active:true,selectable:true})}>{l('Add delivery area','إضافة منطقة توصيل')}</button>
      {area && <form className="commerce-fields" onSubmit={async event=>{
        event.preventDefault();
        if(await run(()=>api('/admin/delivery/'+encodeURIComponent(area.code),'PUT',area)))setArea(null);
      }}>
        <div className="admin-form-grid">
          <label>{l('Area code','رمز المنطقة')}<input value={area.code} pattern="[a-z0-9][a-z0-9-]*" required readOnly={area.existing} onChange={e=>setArea({...area,code:e.target.value})}/></label>
          <label>{l('English name','الاسم بالإنجليزية')}<input value={area.name} required maxLength={120} onChange={e=>setArea({...area,name:e.target.value})}/></label>
          <label>{l('Arabic name','الاسم بالعربية')}<input value={area.name_ar} required maxLength={120} dir="rtl" onChange={e=>setArea({...area,name_ar:e.target.value})}/></label>
          <label>{l('Delivery fee (₪)','رسوم التوصيل (₪)')}<input type="number" min="0" max="10000" step=".01" value={area.fee==null?'':area.fee/100} onChange={e=>setArea({...area,fee:nullableAmount(e.target.value)})}/></label>
          <label>{l('Parent region','المنطقة الرئيسية')}<select value={area.region ?? ''} onChange={e=>setArea({...area,region:e.target.value || null})}>
            <option value="">{l('No parent region','بدون منطقة رئيسية')}</option>
            {data.areas.filter(row=>!row.region && row.code!==area.code).map(row=><option key={row.code} value={row.code}>{ar?row.name_ar:row.name}</option>)}
          </select></label>
          <label className="commerce-check"><input type="checkbox" checked={area.active} onChange={e=>setArea({...area,active:e.target.checked})}/>{l('Active','نشطة')}</label>
          <label className="commerce-check"><input type="checkbox" checked={area.selectable} onChange={e=>setArea({...area,selectable:e.target.checked})}/>{l('Selectable','قابلة للاختيار')}</label>
        </div>
        <div className="commerce-actions"><button className="button">{l('Save delivery area','حفظ منطقة التوصيل')}</button>
          <button type="button" className="button secondary" onClick={()=>setArea(null)}>{l('Cancel','إلغاء')}</button></div>
      </form>}
    </section>
  </div>;
}
