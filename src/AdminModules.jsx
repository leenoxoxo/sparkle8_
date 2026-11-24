import React, {useState} from 'react';
import {api,ils} from './commerce-api.js';
import {originalWorkshops} from './workshops.js';
import {AdminLabel, useAdminText} from './AdminLocale.jsx';

export function Table({headers,rows}) {
  const t = useAdminText();
  return <div className="erp-table"><table><thead><tr>{headers.map((header,i) => <th scope="col" key={i}>{t(header)}</th>)}</tr></thead>
    <tbody>{rows.map(([id,...cells]) => <tr key={id}>{cells.map((cell,i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function Inventory({data,run}) {
  const [filter,setFilter] = useState('');
  const [status,setStatus] = useState('');
  const [history,setHistory] = useState(false);
  const items = data.products.filter(row => !row.archived && row.presentation.trackStock !== false).flatMap(row => row.catalog_skus.filter(sku => sku.active).map(sku => ({row,sku})));
  const stockStatus = sku => sku.stock === null ? 'Unverified' : sku.stock === 0 ? 'Sold out' : sku.stock <= sku.low_stock ? 'Low stock' : 'Available';
  const filtered = items.filter(({row,sku}) => (!status || stockStatus(sku) === status) &&
    [row.slug,row.presentation.name,sku.variant].some(value => value.toLowerCase().includes(filter.toLowerCase())));
  return <>
    <div className="commerce-actions">
      <strong>{items.reduce((total,{sku}) => total + (sku.stock ?? 0),0)} verified units</strong>
      <label><AdminLabel>Search</AdminLabel> <input value={filter} onChange={e => setFilter(e.target.value)}/></label>
      <label><AdminLabel>Availability</AdminLabel> <select value={status} onChange={e => setStatus(e.target.value)}><option value=""><AdminLabel>All</AdminLabel></option>
        {['Available','Low stock','Sold out','Unverified'].map(value => <option key={value}>{value}</option>)}</select></label>
      <button className="button secondary" onClick={() => setHistory(!history)}>{history ? 'Show stock' : 'Stock movement history'}</button>
    </div>
    {history ? <Table headers={['Product','Variant','Movement','Date']} rows={data.movements.map(m =>
      [m.id,m.name,m.variant || '—',m.delta > 0 ? '+' + m.delta : m.delta,new Date(m.created_at).toLocaleString()])}/> :
      <Table headers={['Product','Variant','Current stock','Availability','Set counted quantity']} rows={filtered.map(({row,sku}) =>
        [row.slug + ':' + sku.variant,row.presentation.name,sku.variant || '—',sku.stock ?? '—',stockStatus(sku),
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
  function form(from,ar) {
    return <form className="commerce-actions" onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const input = new FormData(form);
      if (await run(() => api('/admin/categories','PATCH',{from,to:input.get('name'),ar:input.get('ar')})) && !from) form.reset();
    }}><input aria-label={from ? 'New name for ' + from : 'Category name'} name="name" required maxLength={80} defaultValue={from ?? ''}/>
      <input aria-label="Arabic category name" name="ar" maxLength={80} defaultValue={ar} dir="rtl"/>
      <button className="button secondary">{from ? 'Save category' : 'Add category'}</button></form>;
  }
  return <>{form(null,'')}<Table headers={['Category','Arabic name','Products','Edit category']} rows={data.map(row =>
    [row.name,row.name,row.name_ar,row.products,form(row.name,row.name_ar)])}/></>;
}

export const whatsappCustomer = phone => {
  const digits = String(phone ?? '').replace(/\D/g,'');
  if (digits.startsWith('00')) return 'https://wa.me/' + digits.slice(2);
  return 'https://wa.me/' + (/^0[567]\d{8}$/.test(digits) ? '970' + digits.slice(1) : digits);
};

export function Customers({data}) {
  const [query,setQuery] = useState('');
  return <><label><AdminLabel>Find customer</AdminLabel> <input value={query} onChange={e => setQuery(e.target.value)}/></label>
    {data.filter(({customer}) => [customer.name,customer.phone].some(value => value.toLowerCase().includes(query.toLowerCase()))).map(({phone_key,customer,orders}) =>
      <details className="commerce-panel" key={phone_key}><summary>{customer.name} · {customer.phone} · {orders.length} orders</summary>
        <p>{customer.address}</p><a className="button secondary" href={whatsappCustomer(customer.phone)} target="_blank" rel="noreferrer"><AdminLabel>Contact on WhatsApp</AdminLabel></a>
        <Table headers={['Order','State','Payment','Total','Date']} rows={orders.map(o => [o.reference,'#SPK-' + String(o.reference).padStart(4,'0'),o.status,o.paid ? 'Paid' : 'Unpaid',ils(o.total),new Date(o.date).toLocaleDateString()])}/></details>)}</>;
}

export function Reports({data,from,to,setRange}) {
  const max = Math.max(1,...data.days.map(row => row.sales));
  function exportCsv() {
    const csv = ['Date,Orders,Confirmed sales (ILS),Collected revenue (ILS)',...data.days.map(row => [row.day,row.orders,(row.sales/100).toFixed(2),(row.revenue/100).toFixed(2)].join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'sparkle-sales.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  function preset(days) {
    const end = new Date();
    const start = new Date(+end - (days-1)*86400000);
    const date = value => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hebron',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
    setRange({from:date(start),to:date(end)});
  }
  return <>
    {setRange && <div className="commerce-actions">
      {[['Today',1],['Last 7 days',7],['Last 30 days',30]].map(([label,days]) => <button className="button secondary" key={label} onClick={() => preset(days)}>{label}</button>)}
      <label><AdminLabel>From</AdminLabel> <input type="date" value={from} onChange={e=>setRange({from:e.target.value,to})}/></label>
      <label><AdminLabel>To</AdminLabel> <input type="date" value={to} onChange={e=>setRange({from,to:e.target.value})}/></label>
      <button className="button secondary" onClick={exportCsv}><AdminLabel>Export CSV</AdminLabel></button></div>}
    <dl className="admin-metrics">{[['Products',data.products],['Published',data.published],['Confirmed sales',ils(data.sales)],['Collected revenue',ils(data.revenue)],['Outstanding COD',ils(data.outstanding)],
      ...['Pending','Confirmed','Delivered','Cancelled'].map(status => [status,data.statuses[status] ?? 0])].map(([name,value]) => <div className="commerce-panel" key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    {data.margin != null && <p className="commerce-panel">Collected merchandise margin {ils(data.margin)} across {data.costedLines} lines with known costs.</p>}
    <section className="commerce-panel"><h2><AdminLabel>Confirmed sales by order date</AdminLabel></h2>
      {data.days.length ? <div className="erp-chart">{data.days.map(row => <label key={row.day}>{row.day} · {ils(row.sales)}<meter min={0} max={max} value={row.sales}/></label>)}</div> : <p><AdminLabel>No orders in this period.</AdminLabel></p>}</section>
    <div className="commerce-grid"><section className="commerce-panel"><h2><AdminLabel>Best sellers</AdminLabel></h2><ul>{data.best.map(row => <li key={row.name}>{row.name} · {row.units}</li>)}</ul></section>
      <section className="commerce-panel"><h2><AdminLabel>Recent orders</AdminLabel></h2><ul>{data.recent.map(row => <li key={row.reference}>#SPK-{String(row.reference).padStart(4,'0')} · {row.status} · {ils(row.total)}</li>)}</ul></section></div>
  </>;
}

export function Promotions({data,run}) {
  const [draft,setDraft] = useState(null);
  const blank = () => ({id:crypto.randomUUID(),name:'',scope:'store',targets:[],type:'percent',amount:0,starts:'',ends:'',active:true});
  if (!draft) return <><button className="button" onClick={() => setDraft(blank())}><AdminLabel>New promotion</AdminLabel></button>
    <p>The lowest eligible price wins. Discounts are never added together.</p>
    <Table headers={['Promotion','Scope','Discount','Active','Action']} rows={data.items.map(p =>
      [p.id,p.name,p.scope,p.type === 'percent' ? p.amount + '%' : ils(p.amount),p.active ? 'Yes' : 'No',
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
  const [draft,setDraft] = useState(null);
  const workshop = section === 'workshops';
  const existing = workshop ? originalWorkshops.filter(item => !data.items.some(row => row.key === item.slug))
    .map(item => ({key:item.slug,body:{name:item.name,description:item.description,published:true,
      price:/^₪\d+$/.test(item.price) ? Number(item.price.slice(1))*100 : 0}})) : [];
  const edit = (key,body = {}) => setDraft({key,name:'',nameAr:'',description:'',descriptionAr:'',date:'',price:0,seats:0,published:false,...body});
  const patch = (name,value) => setDraft({...draft,[name]:value});
  return <><div className="commerce-actions">
    {workshop ? <button className="button" onClick={() => edit('')}><AdminLabel>New workshop</AdminLabel></button> : ['banner','announcement'].map(key => <button className="button" key={key} onClick={() => edit(key,data.items.find(row => row.key === key)?.body)}>Edit {key}</button>)}
  </div>
  {draft && <form className="commerce-panel commerce-fields" onSubmit={async event => {
    event.preventDefault();
    if (await run(() => api('/admin/content/' + section + '/' + draft.key,'PUT',draft))) setDraft(null);
  }}>
    {workshop && <label><AdminLabel>URL slug</AdminLabel> <input required pattern="[a-z0-9][a-z0-9-]*" value={draft.key} onChange={e=>patch('key',e.target.value)}/></label>}
    {['name','nameAr','description','descriptionAr'].map((name,i) => <label key={name}>{['Name','Arabic name','Description','Arabic description'][i]}<input required={i===0} value={draft[name]} onChange={e=>patch(name,e.target.value)}/></label>)}
    {workshop && <><label><AdminLabel>Date</AdminLabel> <input type="date" value={draft.date} onChange={e=>patch('date',e.target.value)}/></label>
      <label><AdminLabel>Price (₪)</AdminLabel> <input type="number" min="0" step=".01" value={draft.price/100} onChange={e=>patch('price',Math.round(Number(e.target.value)*100))}/></label>
      <label><AdminLabel>Available seats</AdminLabel> <input type="number" min="0" max="9999" value={draft.seats} onChange={e=>patch('seats',Number(e.target.value))}/></label></>}
    <label className="commerce-check"><input type="checkbox" checked={draft.published} onChange={e=>patch('published',e.target.checked)}/><AdminLabel>Published</AdminLabel></label>
    <div className="commerce-actions"><button className="button"><AdminLabel>Save</AdminLabel></button><button type="button" className="button secondary" onClick={()=>setDraft(null)}><AdminLabel>Cancel</AdminLabel></button></div>
  </form>}
  <Table headers={['Item','Published','Action']} rows={[...existing,...data.items].map(row => [row.key,row.body.name,row.body.published ? 'Yes' : 'No',<button className="button secondary" onClick={() => edit(row.key,row.body)}><AdminLabel>Edit</AdminLabel></button>])}/>
  {workshop && <><h2><AdminLabel>Registrations</AdminLabel></h2><Table headers={['Workshop','Name','Phone','Date']} rows={data.registrations.map(row => [row.id,row.workshop,row.name,row.phone,new Date(row.created_at).toLocaleString()])}/></>}
  </>;
}
