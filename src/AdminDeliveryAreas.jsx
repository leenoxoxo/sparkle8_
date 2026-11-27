import React,{useState} from 'react';
import {api} from './commerce-api.js';
import {deliveryRegions,matchesDestination} from './delivery-destinations.js';

export default function AdminDeliveryAreas({rows,run,ar}){
  const l=(en,arabic)=>ar?arabic:en;
  const [query,setQuery]=useState(''),[region,setRegion]=useState(''),[status,setStatus]=useState('');
  const [draft,setDraft]=useState(null);
  const options=deliveryRegions.map(([code,en,arabic])=><option key={code} value={code}>{l(en,arabic)}</option>);
  const filtered=rows.filter(row=>(!region||row.region===region)&&(!status||row.active===(status==='active'))&&matchesDestination(row,query));
  function update(event){
    const {name,type,value,checked}=event.target;
    setDraft(item=>({...item,[name]:type==='checkbox'?checked:value}));
  }
  return <>
    <div className="commerce-actions">
      <button type="button" className="button" onClick={()=>setDraft({code:'',region:region||'west-bank',name:'',nameAr:'',active:true,displayOrder:0,new:true})}>
        {l('Add destination','إضافة وجهة')}
      </button>
    </div>
    {draft&&<form className="commerce-panel admin-form-grid" onSubmit={async event=>{
      event.preventDefault();
      const {code,name,nameAr,region,active,displayOrder}=draft;
      if(draft.new&&rows.some(row=>row.code===code)){event.currentTarget.elements.code.setCustomValidity(l('This code already exists.','هذا الرمز مستخدم بالفعل.'));event.currentTarget.reportValidity();return;}
      if(await run(()=>api('/admin/delivery-destinations/'+encodeURIComponent(code),'PUT',{name,nameAr,region,active,
        displayOrder:Number(displayOrder),createOnly:Boolean(draft.new)})))setDraft(null);
    }}>
      <label>{l('Destination code','رمز الوجهة')}<input name="code" value={draft.code} readOnly={!draft.new} required maxLength={120}
        pattern={'[a-z0-9][a-z0-9\\-]{0,119}'} onChange={event=>{event.target.setCustomValidity('');update(event);}}/></label>
      <label>{l('English name','الاسم بالإنجليزية')}<input name="name" value={draft.name} required maxLength={120} onChange={update}/></label>
      <label>{l('Arabic name','الاسم بالعربية')}<input name="nameAr" dir="rtl" value={draft.nameAr} required maxLength={120} onChange={update}/></label>
      <label>{l('Region','المنطقة')}<select name="region" value={draft.region} onChange={update}>{options}</select></label>
      <label>{l('Display order','ترتيب العرض')}<input name="displayOrder" type="number" min="0" max="1000000" required value={draft.displayOrder} onChange={update}/></label>
      <label className="commerce-check"><input name="active" type="checkbox" checked={draft.active} onChange={update}/>{l('Available in checkout','متاحة عند إتمام الطلب')}</label>
      <div className="commerce-actions">
        <button className="button">{l('Save destination','حفظ الوجهة')}</button>
        <button type="button" className="button secondary" onClick={()=>setDraft(null)}>{l('Cancel','إلغاء')}</button>
      </div>
    </form>}
    <div className="commerce-panel erp-filters">
      <label>{l('Search destinations','البحث في الوجهات')}<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <label>{l('Region','المنطقة')}<select value={region} onChange={event=>setRegion(event.target.value)}><option value="">{l('All regions','كل المناطق')}</option>{options}</select></label>
      <label>{l('Status','الحالة')}<select value={status} onChange={event=>setStatus(event.target.value)}>
        <option value="">{l('All statuses','كل الحالات')}</option><option value="active">{l('Active','نشطة')}</option><option value="disabled">{l('Disabled','معطّلة')}</option>
      </select></label>
    </div>
    <p role="status">{filtered.length} {l('destinations','وجهة')}</p>
    <div className="erp-table" tabIndex={0}><table><thead><tr>{[l('English name','الاسم بالإنجليزية'),l('Arabic name','الاسم بالعربية'),l('Region','المنطقة'),l('Order','الترتيب'),l('Status','الحالة'),l('Action','الإجراء')].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{filtered.map(row=><tr key={row.code}><td>{row.name}</td><td lang="ar">{row.name_ar}</td>
        <td>{deliveryRegions.find(([code])=>code===row.region)?.[ar?2:1]}</td><td>{row.display_order}</td>
        <td>{row.active?l('Active','نشطة'):l('Disabled','معطّلة')}</td>
        <td><button type="button" className="button secondary" onClick={()=>setDraft({...row,nameAr:row.name_ar,displayOrder:row.display_order})}>{l('Edit','تعديل')}</button></td>
      </tr>)}</tbody></table></div>
  </>;
}
