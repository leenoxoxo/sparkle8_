import {orderReference} from './order-reference.js';
import React, {useState} from 'react';
import {api,ils} from './commerce-api.js';
import {originalWorkshops} from './workshops.js';
import {AdminLanguage, AdminLabel, useAdminText} from './AdminLocale.jsx';
import {priceRange} from './range-pricing.js';
import {variantDescription} from './variant-options.js';
import {cloudImageProps} from './cloud-image.js';

const totalAmount = (order,t) => order.total != null ? ils(order.total) : order.estimatedMin != null ?
  priceRange(order.estimatedMin,order.estimatedMax)+' · '+t('Estimated') : '—';

export function Table({headers,rows}) {
  const t = useAdminText();
  return <div className="erp-table" tabIndex={0} role="region" aria-label={t('Scrollable table')}><table><thead><tr>{headers.map((header,i) => <th scope="col" key={i}>{t(header)}</th>)}</tr></thead>
    <tbody>{rows.map(([id,...cells]) => <tr key={id}>{cells.map((cell,i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function Inventory({data,run,initial={}}) {
  const lang=React.useContext(AdminLanguage) ? 'ar' : 'en';
  const t=useAdminText();
  const [filter,setFilter] = useState(initial.search ?? '');
  const [status,setStatus] = useState(initial.stock ?? '');
  const [mode,setMode] = useState('');
  const [history,setHistory] = useState(false);
  const active = data.products.filter(row=>!row.archived);
  const madeToOrder=active.filter(row=>row.presentation.trackStock===false);
  const items = active.filter(row => row.presentation.trackStock !== false).flatMap(row =>
    row.catalog_skus.filter(sku => sku.active).map(sku => ({row,sku,option:row.presentation.variants?.find(variant=>variant.id===sku.variant)})));
  const stockStatus = (sku,option) => option?.visible===false ? 'Hidden' : option?.enabled===false ? 'Disabled' :
    sku.stock === null ? 'Unverified' : sku.stock === 0 ? 'Sold out' : sku.stock <= sku.low_stock ? 'Low stock' : 'Available';
  const filtered = items.filter(({row,sku,option}) => (!status || stockStatus(sku,option) === status) && (!mode || Boolean(sku.variant)===(mode==='variants')) &&
    [row.slug,row.presentation.name,sku.variant,option?.sku,option?.name,option?.nameAr,variantDescription(option,lang)]
      .some(value => value?.toLowerCase().includes(filter.toLowerCase())));
  return <>
    <div className="commerce-actions">
      <strong>{items.reduce((total,{sku}) => total + (sku.stock ?? 0),0)} {t('verified units')}</strong>
      <label>{t('Inventory type')}<select value={mode} onChange={e=>setMode(e.target.value)}>
        <option value="">{t('All tracked inventory')}</option><option value="variants">{t('Variant-managed')}</option>
        <option value="single">{t('Product-managed')}</option><option value="untracked">{t('Untracked or made to order')}</option>
      </select></label>
      <label><AdminLabel>Search</AdminLabel> <input value={filter} onChange={e => setFilter(e.target.value)}/></label>
      <label><AdminLabel>Availability</AdminLabel> <select value={status} onChange={e => setStatus(e.target.value)}><option value=""><AdminLabel>All</AdminLabel></option>
        {['Available','Low stock','Sold out','Unverified','Hidden','Disabled'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <button className="button secondary" onClick={() => setHistory(!history)}>{t(history ? 'Show stock' : 'Stock movement history')}</button>
    </div>
    {history ? <Table headers={['Product','Variant','Movement','Date']} rows={data.movements.map(m =>
      [m.id,m.name,m.variant || '—',m.delta > 0 ? '+' + m.delta : m.delta,new Date(m.created_at).toLocaleString(lang)])}/> : mode==='untracked' ?
      <Table headers={['Product','Inventory type']} rows={madeToOrder.filter(row=>[row.slug,row.presentation.name,row.presentation.nameAr].some(value=>value?.toLowerCase().includes(filter.toLowerCase()))).map(row=>[
        row.slug,(lang==='ar' && row.presentation.nameAr) || row.presentation.name,t(row.presentation.madeToOrder?'Made to order':'Untracked')
      ])}/> : !filtered.length ? <p>{t('No inventory matches these filters.')}</p> :
      <Table headers={['Product','Variant','SKU','Current stock','Availability','Set counted quantity']} rows={filtered.map(({row,sku,option}) =>
        [row.slug + ':' + sku.variant,(lang==='ar' && row.presentation.nameAr) || row.presentation.name,variantDescription(option,lang) || sku.variant || '—',option?.sku || row.presentation.sku || '—',sku.stock ?? '—',t(stockStatus(sku,option)),
          <form className="commerce-actions" onSubmit={async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const count = Number(new FormData(form).get('stock'));
            const skus = row.catalog_skus.filter(item => item.active).map(item => ({...item,expectedStock:item.stock,stock:item.variant === sku.variant ? count : item.stock}));
            if (await run(() => api('/admin/products/' + row.slug,'PUT',{...row,skus}))) form.reset();
          }}><input aria-label={'Count for ' + row.presentation.name + ' ' + sku.variant} name="stock" required type="number" min="0" max="1000000" style={{width:95}}/><button className="button secondary"><AdminLabel>Save</AdminLabel></button></form>])}/>}
  </>;
}

export function Categories({data,run}) {
  const t=useAdminText();
  const [draft,setDraft]=useState(null);
  const newCategory=()=>({name:'',name_ar:'',section:'ready',parent:null,image:null,published:true,display_order:0});
  if (!draft) return <>
    <button className="button" onClick={()=>setDraft(newCategory())}><AdminLabel>Add category</AdminLabel></button>
    <Table headers={['Image','Category','Arabic name','Parent','Products','Display order','Published','Action']} rows={data.map(row=>
      [row.name,row.image?<img {...cloudImageProps(row.image,[160])} loading="lazy" alt=""/>:'—',row.name,row.name_ar,row.parent || '—',row.products,row.display_order,
        t(row.published?'Yes':'No'),<button className="button secondary" onClick={()=>setDraft({...row,from:row.name})}><AdminLabel>Edit</AdminLabel></button>])}/>
  </>;
  const change=values=>setDraft(current=>({...current,...values}));
  return <form className="commerce-panel commerce-fields" onSubmit={async event=>{
    event.preventDefault();
    if(await run(()=>api('/admin/categories','PATCH',{from:draft.from ?? null,to:draft.name,ar:draft.name_ar,
      description:draft.description,descriptionAr:draft.description_ar,parent:draft.parent,section:draft.section,image:draft.image,published:draft.published,displayOrder:draft.display_order})))setDraft(null);
  }}>
    <label><AdminLabel>Category name</AdminLabel><input required maxLength={80} value={draft.name} onChange={e=>change({name:e.target.value})}/></label>
    <label><AdminLabel>Arabic name</AdminLabel><input dir="rtl" maxLength={80} value={draft.name_ar} onChange={e=>change({name_ar:e.target.value})}/></label>
    <label>{t('Shop section')}<select disabled={draft.section_intro} value={draft.section} onChange={e=>change({section:e.target.value,parent:null})}>
      <option value="ready">{t('Ready-made Creations')}</option><option value="kits">{t('DIY Kits')}</option><option value="cakes">{t('Fake Cake Boxes')}</option></select></label>
    {draft.section === 'cakes' && <>
      <label><AdminLabel>Category description</AdminLabel><textarea maxLength={2000} value={draft.description ?? ''} onChange={e=>change({description:e.target.value})}/></label>
      <label><AdminLabel>Arabic category description</AdminLabel><textarea dir="rtl" maxLength={2000} value={draft.description_ar ?? ''} onChange={e=>change({description_ar:e.target.value})}/></label>
    </>}
    <label>{t('Parent category')}<select disabled={draft.section_intro} value={draft.parent || ''} onChange={e=>change({parent:e.target.value || null})}>
      <option value="">{t('Top-level category')}</option>{data.filter(row=>!row.parent && row.name!==draft.from && row.section===draft.section).map(row=><option key={row.name}>{row.name}</option>)}
    </select></label>
    <label>{t('Display order')}<input required type="number" min="0" max="1000000" value={draft.display_order} onChange={e=>change({display_order:Number(e.target.value)})}/></label>
    <label className="commerce-check"><input type="checkbox" checked={draft.published} onChange={e=>change({published:e.target.checked})}/><AdminLabel>Published</AdminLabel></label>
    <label>{t('Category image')}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e=>{
      const file=e.target.files[0];e.target.value='';
      if(file)run(async()=>change({image:(await api('/admin/images','POST',file)).url}));
    }}/></label>
    {draft.image && <><img className="erp-preview-image" src={draft.image} alt=""/><button type="button" className="button secondary" onClick={()=>change({image:null})}><AdminLabel>Remove</AdminLabel></button></>}
    <div className="commerce-actions"><button className="button"><AdminLabel>Save category</AdminLabel></button>
      <button type="button" className="button secondary" onClick={()=>setDraft(null)}><AdminLabel>Cancel</AdminLabel></button></div>
  </form>;
}

export const whatsappCustomer = phone => {
  const digits = String(phone ?? '').replace(/\D/g,'');
  if (digits.startsWith('00')) return 'https://wa.me/' + digits.slice(2);
  return 'https://wa.me/' + (/^0[567]\d{8}$/.test(digits) ? '970' + digits.slice(1) : digits);
};

export function OrderContact({contact}) {
  const t=useAdminText();
  if(!contact)return null;
  return <dl className="commerce-totals">
    <dt>{t('Primary mobile / WhatsApp')}</dt><dd><bdi>{contact.phone}</bdi></dd>
    {contact.alternativePhone && <><dt>{t('Alternative mobile')}</dt><dd><bdi>{contact.alternativePhone}</bdi></dd></>}
    {contact.city && <><dt>{t('City')}</dt><dd>{contact.city}</dd></>}
    {contact.address && <><dt>{t('Street and address details')}</dt><dd>{contact.address}</dd></>}
  </dl>;
}

export function Customers({data,run,onOrders}) {
  const t = useAdminText();
  return <>
    {!data.length && <p>{t('No customers match these filters.')}</p>}
    {data.map(row =>
      <details className="commerce-panel" key={row.phone}><summary>{row.contact?.name || [row.first_name,row.last_name].filter(Boolean).join(' ')} · <bdi>{row.phone}</bdi> · {row.order_count} <AdminLabel>Orders</AdminLabel></summary>
        <OrderContact contact={row.contact}/>
        <p><AdminLabel>First order</AdminLabel> {row.first_order ? new Date(row.first_order).toLocaleDateString() : '—'} · <AdminLabel>Last order</AdminLabel> {row.last_order ? new Date(row.last_order).toLocaleDateString() : '—'}</p>
        <p>{t('Confirmed purchase value')} <bdi>{ils(row.confirmed_total)}</bdi> · {t('Collected purchase value')} <bdi>{ils(row.completed_total)}</bdi></p>
        <a className="button secondary" href={whatsappCustomer(row.phone)} target="_blank" rel="noreferrer"><AdminLabel>Contact Customer via WhatsApp</AdminLabel></a>
        <form className="commerce-fields" onSubmit={event => {
          event.preventDefault();
          const notes = new FormData(event.currentTarget).get('notes');
          run(() => api('/admin/customers/' + encodeURIComponent(row.phone),'PATCH',{notes}));
        }}><label><AdminLabel>Internal notes</AdminLabel><textarea name="notes" maxLength={4000} defaultValue={row.admin_notes}/></label>
          <button className="button secondary"><AdminLabel>Save notes</AdminLabel></button></form>
        <button className="button secondary" onClick={()=>onOrders(row.phone)}>{t('View all orders')}</button>
        <Table headers={['Order','State','Payment','Total','Date']} rows={row.orders.map(o => [o.reference,orderReference(o.reference,o.referenceFormat),t(o.status),t(o.paid ? 'Paid' : 'Unpaid'),totalAmount(o,t),new Date(o.date).toLocaleDateString()])}/></details>)}</>;
}

export function Promotions({data,run}) {
  const t=useAdminText();
  const [draft,setDraft] = useState(null);
  const blank = () => ({id:crypto.randomUUID(),name:'',scope:'store',targets:[],type:'percent',amount:0,starts:'',ends:'',active:true});
  if (!draft) return <><button className="button" onClick={() => setDraft(blank())}><AdminLabel>New promotion</AdminLabel></button>
    <p>{t('The lowest eligible standard price applies.')}</p>
    <Table headers={['Promotion','Scope','Discount','Active','Action']} rows={data.items.map(p =>
      [p.id,p.name,t({store:'Entire store',products:'Selected products',category:'Categories'}[p.scope]),p.type === 'percent' ? p.amount + '%' : ils(p.amount),t(p.active ? 'Yes' : 'No'),
        <button className="button secondary" onClick={() => {
          const local = value => value ? new Date(Date.parse(value)-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
          setDraft({...p,starts:local(p.starts),ends:local(p.ends)});
        }}><AdminLabel>Edit</AdminLabel></button>])}/></>;
  const patch = values => setDraft({...draft,...values});
  const targets = draft.scope === 'products' ? data.products.map(row => [row.slug,row.presentation.name]) :
    [...new Set(data.products.map(row => row.presentation.category))].map(value => [value,value]);
  const matches = row => draft.scope === 'store' || draft.targets.includes(draft.scope === 'products' ? row.slug : row.presentation.category);
  const preview = data.products.filter(matches).flatMap(row => row.catalog_skus.filter(sku => sku.active && sku.base_price !== null).map(sku => {
    const price = draft.type === 'percent' ? Math.round(sku.base_price*(100-draft.amount)/100) : Math.max(0,sku.base_price-draft.amount);
    return [row.slug + ':' + sku.variant,row.presentation.name,sku.variant || '—',ils(sku.base_price),ils(Math.min(price,sku.sale_price ?? sku.base_price))];
  })).slice(0,20);
  return <form className="commerce-panel commerce-fields" onSubmit={async event => {
    event.preventDefault();
    const iso = value => value ? new Date(value).toISOString() : null;
    if (await run(() => api('/admin/promotions/' + draft.id,'PUT',{...draft,starts:iso(draft.starts),ends:iso(draft.ends)}))) setDraft(null);
  }}><label><AdminLabel>Name</AdminLabel> <input required value={draft.name} onChange={e => patch({name:e.target.value})}/></label>
    <label><AdminLabel>Scope</AdminLabel> <select value={draft.scope} onChange={e => patch({scope:e.target.value,targets:[]})}><option value="store"><AdminLabel>Entire store</AdminLabel></option><option value="category"><AdminLabel>Categories</AdminLabel></option><option value="products"><AdminLabel>Selected products</AdminLabel></option></select></label>
    {draft.scope !== 'store' && <label><AdminLabel>Targets</AdminLabel> <select multiple required value={draft.targets} onChange={e => patch({targets:[...e.target.selectedOptions].map(option => option.value)})}>{targets.map(([key,name]) => <option key={key} value={key}>{name}</option>)}</select></label>}
    <label><AdminLabel>Discount type</AdminLabel> <select value={draft.type} onChange={e => patch({type:e.target.value,amount:0})}><option value="percent"><AdminLabel>Percentage</AdminLabel></option><option value="amount"><AdminLabel>Fixed amount (₪)</AdminLabel></option></select></label>
    <label><AdminLabel>Discount</AdminLabel> <input type="number" min="0" step={draft.type === 'percent' ? '1' : '.01'} max={draft.type === 'percent' ? 100 : 1000000} required value={draft.type === 'percent' ? draft.amount : draft.amount/100} onChange={e => patch({amount:Math.round(Number(e.target.value)*(draft.type === 'percent' ? 1 : 100))})}/></label>
    <label><AdminLabel>Starts</AdminLabel> <input type="datetime-local" value={draft.starts} onChange={e => patch({starts:e.target.value})}/></label>
    <label><AdminLabel>Ends</AdminLabel> <input type="datetime-local" value={draft.ends} onChange={e => patch({ends:e.target.value})}/></label>
    <label className="commerce-check"><input type="checkbox" checked={draft.active} onChange={e => patch({active:e.target.checked})}/><AdminLabel>Active</AdminLabel></label>
    <Table headers={['Product','Variant','Original','Price with this promotion']} rows={preview}/>
    <div className="commerce-actions"><button className="button"><AdminLabel>Save promotion</AdminLabel></button><button type="button" className="button secondary" onClick={() => setDraft(null)}><AdminLabel>Back</AdminLabel></button></div>
  </form>;
}

export function Content({section,data,run}) {
  const t=useAdminText();
  const [draft,setDraft] = useState(null);
  const workshop = section === 'workshops';
  const existing = workshop ? originalWorkshops.filter(item => !data.items.some(row => row.key === item.slug))
    .map(item => ({key:item.slug,body:{name:item.name,description:item.description,published:true,
      location:item.location,duration:item.time,price:/^₪\d+$/.test(item.price) ? Number(item.price.slice(1))*100 : null}})) : [];
  const edit = (key,body = {}) => setDraft({key,name:'',nameAr:'',description:'',descriptionAr:'',date:'',startTime:'',location:'',duration:'',image:'',price:null,seats:0,published:false,...body});
  const patch = (name,value) => setDraft({...draft,[name]:value});
  return <><div className="commerce-actions">
    {workshop ? <button className="button" onClick={() => edit('')}><AdminLabel>New workshop</AdminLabel></button> : ['banner','announcement'].map(key => <button className="button" key={key} onClick={() => edit(key,data.items.find(row => row.key === key)?.body)}>{t(key==='banner'?'Edit banner':'Edit announcement')}</button>)}
  </div>
  {draft && <form className="commerce-panel commerce-fields" onSubmit={async event => {
    event.preventDefault();
    if (await run(() => api('/admin/content/' + section + '/' + draft.key,'PUT',draft))) setDraft(null);
  }}>
    {workshop && <label><AdminLabel>URL slug</AdminLabel> <input required pattern="[a-z0-9][a-z0-9-]*" value={draft.key} onChange={e=>patch('key',e.target.value)}/></label>}
    {['name','nameAr','description','descriptionAr'].map((name,i) => <label key={name}>{t(['Name','Arabic name','Description','Arabic description'][i])}<input required={i===0} value={draft[name]} onChange={e=>patch(name,e.target.value)}/></label>)}
    {workshop && <><label><AdminLabel>Date</AdminLabel> <input type="date" value={draft.date} onChange={e=>patch('date',e.target.value)}/></label>
      <label>{t('Start time in Nablus')}<input type="time" value={draft.startTime} onChange={e=>patch('startTime',e.target.value)}/></label>
      <label>{t('Location')}<input value={draft.location} onChange={e=>patch('location',e.target.value)}/></label>
      <label>{t('Duration')}<input value={draft.duration} onChange={e=>patch('duration',e.target.value)}/></label>
      <label><AdminLabel>Price (₪)</AdminLabel> <input type="number" min="0" step=".01" value={draft.price==null?'':draft.price/100} onChange={e=>patch('price',e.target.value===''?null:Math.round(Number(e.target.value)*100))}/></label>
      <label>{t('Workshop image')}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={event=>{
        const file=event.target.files[0];event.target.value='';
        if (file) run(async()=>patch('image',(await api('/admin/images','POST',file)).url));
      }}/></label>
      {draft.image && <img className="erp-preview-image" alt="" src={draft.image}/>}
      <label><AdminLabel>Available seats</AdminLabel> <input type="number" min="0" max="9999" value={draft.seats} onChange={e=>patch('seats',Number(e.target.value))}/></label></>}
    <label className="commerce-check"><input type="checkbox" checked={draft.published} onChange={e=>patch('published',e.target.checked)}/><AdminLabel>Published</AdminLabel></label>
    <div className="commerce-actions"><button className="button"><AdminLabel>Save</AdminLabel></button><button type="button" className="button secondary" onClick={()=>setDraft(null)}><AdminLabel>Cancel</AdminLabel></button></div>
  </form>}
  <Table headers={['Item','Published','Action']} rows={[...existing,...data.items].map(row => [row.key,row.body.name,t(row.body.published ? 'Yes' : 'No'),<button className="button secondary" onClick={() => edit(row.key,row.body)}><AdminLabel>Edit</AdminLabel></button>])}/>
  {workshop && <><h2><AdminLabel>Registrations</AdminLabel></h2><Table headers={['Workshop','Name','Phone','Date']} rows={data.registrations.map(row => [row.id,row.workshop,row.name,row.phone,new Date(row.created_at).toLocaleString()])}/></>}
  </>;
}
