import React, {useEffect, useState} from 'react';
import {api, ils} from './commerce-api.js';
import './commerce.css';
import AdminWorkspace from './AdminWorkspace.jsx';
import {AdminLanguage, AdminLabel, useAdminText} from './AdminLocale.jsx';
import {Table,Inventory,Categories,Customers,Reports,Promotions,Content,whatsappCustomer} from './AdminModules.jsx';

const transitions = {Pending:['Confirmed','Cancelled'],Confirmed:['Preparing','Cancelled'],Preparing:['Shipped','Cancelled'],Shipped:['Delivered'],Delivered:['Paid'],Cancelled:[]};
const freshSku = variant => ({variant,base_price:null,sale_price:null,stock:null,expectedStock:null,low_stock:2});
const freshProduct = () => ({slug:'',published:false,archived:false,presentation:{name:'',category:'',images:[],variants:[],aliases:[],priceMode:'exact'},skus:[freshSku('')]});
const freshArea = {code:'',name:'',name_ar:'',region:null,fee:null,active:true,selectable:true};
const messages = {
  invalid_credentials:'The session is invalid or has expired. Please sign in again.',
  invalid_input:'Check the fields and try again.',
  stock_unavailable:'There is insufficient stock to confirm this order.',
  inventory_changed:'Stock changed while you were editing. Reload the product before saving.',
  invalid_transition:'This status change is unavailable. Refresh the order.',
  invalid_image:'Upload a PNG, JPEG, WebP or AVIF image.',
  store_unconfigured:'Connect the Neon database to enable administrator access.',
  images_unconfigured:'Connect Cloudinary before uploading images.',
  image_upload_failed:'The image could not be saved to Cloudinary.',
  archive_required:'Archive this product before deleting it.',
  product_has_history:'This product has order or stock history and can only be archived.',
  duplicate_slug:'That URL slug is already in use. Choose a different one.',
  service_unavailable:'The server is currently unavailable.'
};

function Field({label,value,onChange,type='text',...props}) {
  const t = useAdminText();
  return <label>{t(label)}<input {...props} type={type} value={value ?? ''} onChange={event => onChange(event.target.value)}/></label>;
}
function Amount({value,onChange,...props}) {
  return <Field {...props} type="number" min="0" step="0.01" value={value == null ? '' : value / 100}
    onChange={value => onChange(value === '' ? null : Math.round(Number(value)*100))}/>;
}

export default function Admin() {
  const [tab,setTab] = useState('stats');
  const [loaded,setLoaded] = useState(null);
  const [profile,setProfile] = useState(undefined);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const [busy,setBusy] = useState(false);
  const [offset,setOffset] = useState(0);
  const [range,setRange] = useState({from:'',to:''});
  const [ar,setAr] = useState(() => localStorage.getItem('sparkle-admin-language') === 'ar');
  const [dark,setDark] = useState(() => localStorage.getItem('sparkle-admin-dark') === 'true');
  const [lowStock,setLowStock] = useState(0);
  const modulePaths = {stats:'stats',kits:'products',account:'me',workshops:'content/workshops',website:'content/website'};
  const query = tab === 'reports' ? new URLSearchParams(Object.entries(range).filter(([,value]) => value)).toString() :
    ['orders','custom-requests'].includes(tab) ? 'offset=' + offset : '';
  const endpoint = '/admin/' + (modulePaths[tab] || tab) + (query ? '?' + query : '');
  const viewKey = tab + '|' + endpoint;
  const selected = React.useRef(viewKey);
  const mutation = React.useRef(false);
  selected.current = viewKey;
  const data = loaded?.key === viewKey ? loaded.value : null;
  const l = (en,arabic) => ar ? arabic : en;

  function fail(e) {
    if (e.status === 401) {setProfile(null);setLoaded(null);}
    setError(messages[e.message] || l('The operation could not be completed. Try again.','تعذرت العملية. حاولي مرة أخرى.'));
  }
  useEffect(() => {
    let active = true;
    api('/admin/me').then(user => {if (active) setProfile(user);})
      .catch(e => {if (active) {setProfile(null);if (e.status !== 401) fail(e);}});
    return () => {active = false;};
  }, []);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    const receive = value => {
      if (active && selected.current === viewKey) setLoaded({key:viewKey,value});
    };
    fetchModule().then(receive).catch(e => {if (active) fail(e);});
    const timer = ['orders','custom-requests'].includes(tab) ? setInterval(() => {
      if (!mutation.current) fetchModule().then(receive).catch(e => {if (active && e.status === 401) fail(e);});
    },15000) : null;
    return () => {active = false;if (timer) clearInterval(timer);};
  }, [endpoint,profile,tab,viewKey]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark-mood',dark);
    localStorage.setItem('sparkle-admin-dark',String(dark));
    localStorage.setItem('sparkle-admin-language',ar ? 'ar' : 'en');
    return () => document.documentElement.classList.toggle('dark-mood',localStorage.getItem('sparkle-mood') === 'dark');
  }, [dark,ar]);
  async function fetchModule() {
    if (tab !== 'stats') return api(endpoint);
    const [stats,report] = await Promise.all([api(endpoint),api('/admin/reports')]);
    setLowStock(stats.lowStock.length);
    return {...stats,report};
  }
  async function run(action,notice = l('Changes saved.','تم حفظ التغييرات.')) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await action();
      const value = await fetchModule();
      if (selected.current === viewKey) {
        setLoaded({key:viewKey,value});
        setSuccess(notice);
      }
      return true;
    } catch (e) {fail(e);return false;}
    finally {mutation.current = false;setBusy(false);}
  }
  async function login(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);setError('');
    try {await api('/admin/login','POST',payload);setProfile(await api('/admin/me'));}
    catch(e) {fail(e);}
    finally {setBusy(false);}
  }
  async function logout() {
    try {
      await api('/admin/logout','POST');
      setProfile(null);setLoaded(null);setError('');setSuccess('');
    } catch(e) {fail(e);}
  }
  const notices = <>{error && <p className="commerce-panel" role="alert">{error}</p>}
    {success && <p className="commerce-panel" role="status">{success}</p>}</>;
  if (!profile) return <main className="commerce-page sparkle-admin" data-commerce dir={ar ? 'rtl' : 'ltr'}>
    <h1>Sparkle Admin</h1>{notices}
    {profile === undefined ? <p role="status">Checking session…</p> :
      <form className="commerce-panel commerce-fields admin-login" onSubmit={login}>
        <h2>{l('Sign in','تسجيل الدخول')}</h2><label>{l('Email','البريد الإلكتروني')}<input required type="email" name="email" autoComplete="username"/></label>
        <label>{l('Password','كلمة المرور')}<input required type="password" name="password" autoComplete="current-password"/></label>
        <button className="button" disabled={busy}>{l('Sign in','تسجيل الدخول')}</button>
      </form>}
  </main>;
  return <AdminLanguage.Provider value={ar}><AdminWorkspace tab={tab} onTab={value => {setTab(value);setOffset(0);setError('');setSuccess('');}}
    ar={ar} setAr={setAr} dark={dark} setDark={setDark} profile={profile} onLogout={logout}
    onRefresh={() => run(async () => {},l('Refreshed.','تم التحديث.'))} lowStock={lowStock} busy={busy}>
    {notices}
    {!data ? !error && <p role="status">{l('Loading…','جارٍ التحميل…')}</p> : <fieldset key={tab} className="admin-section" disabled={busy}>
      {tab === 'stats' && <><Overview data={data}/><Reports data={data.report}/></>}
      {['products','kits'].includes(tab) && <Products data={data.filter(row => (row.presentation.kind === 'kit') === (tab === 'kits'))} run={run} kind={tab === 'kits' ? 'kit' : 'shop'}/>}
      {tab === 'categories' && <Categories data={data} run={run}/>}
      {tab === 'inventory' && <Inventory data={data} run={run}/>}
      {tab === 'orders' && <Orders data={data} run={run}/>}
      {tab === 'customers' && <Customers data={data}/>}
      {tab === 'promotions' && <Promotions data={data} run={run}/>}
      {tab === 'custom-requests' && <Requests data={data} run={run}/>}
      {['workshops','website'].includes(tab) && <Content section={tab} data={data} run={run}/>}
      {tab === 'reports' && <Reports data={data} {...range} setRange={setRange}/>}
      {tab === 'settings' && <Settings data={data} run={run}/>}
      {tab === 'account' && <section className="commerce-panel commerce-fields"><h2>{l('Account preferences','تفضيلات الحساب')}</h2><p>{data.email}</p>
        <label>{l('Language','اللغة')} <select value={ar ? 'ar' : 'en'} onChange={event => setAr(event.target.value === 'ar')}><option value="en">English</option><option value="ar">العربية</option></select></label>
        <label className="commerce-check"><input type="checkbox" checked={dark} onChange={event => setDark(event.target.checked)}/>{l('Dark mode','الوضع الداكن')}</label>
      </section>}
      {['orders','custom-requests'].includes(tab) && <div className="commerce-actions">
        <button className="button secondary" disabled={!offset} onClick={() => setOffset(offset - 50)}>{l('Previous','السابق')}</button>
        <button className="button secondary" disabled={data.length < 50} onClick={() => setOffset(offset + 50)}>{l('Next','التالي')}</button>
      </div>}
    </fieldset>}
  </AdminWorkspace></AdminLanguage.Provider>;
}

function Overview({data}) {
  return <><dl className="admin-metrics">{[['Orders',data.orders],['Pending',data.pending],['Confirmed sales',ils(data.sales)],
    ['Collected revenue',ils(data.revenue)],['Units in stock',data.stock]].map(([label,value]) =>
    <div className="commerce-panel" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <section className="commerce-panel"><h2><AdminLabel>Low stock</AdminLabel></h2>
      {data.lowStock.length ? <ul>{data.lowStock.map(item => <li key={item.slug + ':' + item.variant}>{item.name}{item.variant && ' · ' + item.variant} · {item.stock} remaining</li>)}</ul> : <p>No items below their stock threshold.</p>}
    </section></>;
}

function Products({data,run,kind}) {
  const t = useAdminText();
  const [draft,setDraft] = useState(null);
  const [existing,setExisting] = useState(false);
  const [query,setQuery] = useState('');
  const [mode,setMode] = useState('table');
  const [category,setCategory] = useState('');
  const [state,setState] = useState('');
  const [stockFilter,setStockFilter] = useState('');
  const [minPrice,setMinPrice] = useState('');
  const [sort,setSort] = useState('name');
  const [page,setPage] = useState(0);
  const [selection,setSelection] = useState([]);
  const [formTab,setFormTab] = useState('general');
  const [formError,setFormError] = useState('');
  const formChanged = React.useRef(false);
  const skuOf = row => row.catalog_skus.find(sku => sku.active && sku.variant === (row.presentation.defaultVariant ?? '')) ||
    row.catalog_skus.find(sku => sku.active);
  const publication = row => row.archived ? 'Archived' : row.published ? 'Published' : row.presentation.draft ? 'Draft' : 'Hidden';
  function edit(row,duplicate=false) {
    formChanged.current = false;
    setFormError('');
    setFormTab('general');
    setExisting(Boolean(row) && !duplicate);
    setDraft(row ? {...row,...(duplicate ? {slug:'',published:false,archived:false} : {}),
      presentation:{...row.presentation,...(duplicate ? {name:row.presentation.name + ' (copy)',aliases:[],sku:'',draft:true,featured:false} : {})},
      skus:row.catalog_skus.filter(sku => sku.active).map(sku => ({...sku,...(duplicate ? {stock:null,expectedStock:null} : {expectedStock:sku.stock})}))} :
      {...freshProduct(),presentation:{...freshProduct().presentation,kind,draft:true}});
  }
  const publicationAction = (row,published) => api('/admin/products/' + row.slug,'PUT',{...row,published,archived:false,
    presentation:{...row.presentation,draft:false},skus:row.catalog_skus.filter(sku => sku.active).map(sku => ({...sku,expectedStock:sku.stock}))});
  if (!draft) {
    const hits = data.filter(row => {
      const p = row.presentation;
      const sku = skuOf(row);
      return [p.name,p.nameAr,p.sku,row.slug,...(p.variants || []).map(option => option.sku)]
        .some(value => value?.toLowerCase().includes(query.trim().toLowerCase())) &&
        (!category || category === p.category) && (!state || state === publication(row)) &&
        (!stockFilter || (stockFilter === 'available' ? sku?.stock > 0 : stockFilter === 'sold' ? sku?.stock === 0 : sku?.stock == null)) &&
        (!minPrice || (sku?.sale_price ?? sku?.base_price ?? -1) >= Number(minPrice)*100);
    }).sort((a,b) => sort === 'price' ? (skuOf(a)?.sale_price ?? skuOf(a)?.base_price ?? Infinity) - (skuOf(b)?.sale_price ?? skuOf(b)?.base_price ?? Infinity) :
      sort === 'stock' ? (skuOf(b)?.stock ?? -1) - (skuOf(a)?.stock ?? -1) : a.presentation.name.localeCompare(b.presentation.name));
    const shown = hits.slice(page*12,page*12+12);
    const change = setter => value => {setter(value);setPage(0);};
    const actions = row => <div className="commerce-actions">
      <button className="button secondary" onClick={() => edit(row)}><AdminLabel>Edit</AdminLabel></button>
      <button className="button secondary" onClick={() => edit(row,true)}><AdminLabel>Duplicate</AdminLabel></button>
      <button className="button secondary" onClick={() => run(() => publicationAction(row,!row.published))}>{row.published ? 'Hide' : 'Publish'}</button>
      {!row.archived && <button className="button secondary" onClick={() => {
        if (window.confirm('Archive this product and remove it from the storefront?')) run(() => api('/admin/products/' + row.slug,'DELETE'));
      }}><AdminLabel>Archive</AdminLabel></button>}
      {row.archived && <button className="button secondary" onClick={() => {
        if (window.confirm('Permanently delete this unused product?')) run(() => api('/admin/products/' + row.slug + '?permanent=true','DELETE'));
      }}><AdminLabel>Delete</AdminLabel></button>}
    </div>;
    const check = row => <input type="checkbox" aria-label={'Select ' + row.presentation.name} checked={selection.includes(row.slug)}
      onChange={event => setSelection(event.target.checked ? [...selection,row.slug] : selection.filter(id => id !== row.slug))}/>;
    function bulk(action) {
      const rows = data.filter(row => selection.includes(row.slug));
      if (action === 'archive' && !window.confirm('Archive ' + rows.length + ' selected products?')) return;
      run(async () => {
        for (const row of rows) {
          if (action === 'archive') await api('/admin/products/' + row.slug,'DELETE');
          else await publicationAction(row,action === 'publish');
        }
        setSelection([]);
      });
    }
    return <>
      <div className="commerce-actions"><button className="button" onClick={() => edit(null)}><AdminLabel>New Product</AdminLabel></button>
        <button className="button secondary" onClick={() => setMode(mode === 'table' ? 'grid' : 'table')}>{mode === 'table' ? 'Grid view' : 'List view'}</button></div>
      <div className="commerce-actions">
        <Field label="Search by name or SKU" value={query} onChange={change(setQuery)}/>
        <label><AdminLabel>Category</AdminLabel> <select value={category} onChange={e=>change(setCategory)(e.target.value)}><option value=""><AdminLabel>All</AdminLabel></option>{[...new Set(data.map(row=>row.presentation.category))].map(value=><option key={value}>{value}</option>)}</select></label>
        <label><AdminLabel>Publication</AdminLabel> <select value={state} onChange={e=>change(setState)(e.target.value)}><option value=""><AdminLabel>All</AdminLabel></option>{['Draft','Published','Hidden','Archived'].map(value=><option key={value}>{value}</option>)}</select></label>
        <label><AdminLabel>Availability</AdminLabel> <select value={stockFilter} onChange={e=>change(setStockFilter)(e.target.value)}><option value=""><AdminLabel>All</AdminLabel></option><option value="available"><AdminLabel>Available</AdminLabel></option><option value="sold"><AdminLabel>Sold out</AdminLabel></option><option value="unknown"><AdminLabel>Unverified</AdminLabel></option></select></label>
        <Field label="Minimum price (₪)" type="number" min="0" value={minPrice} onChange={change(setMinPrice)}/>
        <label><AdminLabel>Sort</AdminLabel> <select value={sort} onChange={e=>change(setSort)(e.target.value)}><option value="name"><AdminLabel>Name</AdminLabel></option><option value="price"><AdminLabel>Price</AdminLabel></option><option value="stock"><AdminLabel>Stock</AdminLabel></option></select></label>
      </div>
      {!!selection.length && <div className="commerce-actions"><span>{selection.length} selected</span>
        {['publish','hide','archive'].map(action => <button className="button secondary" key={action} onClick={() => bulk(action)}>{action}</button>)}
        <button className="button secondary" onClick={() => setSelection([])}><AdminLabel>Clear selection</AdminLabel></button></div>}
      {mode === 'table' ? <Table headers={['Select','Image','Name','SKU','Category','Original','Discount','Selling price','Stock','Availability','Publication','Actions']}
        rows={shown.map(row => {
          const p=row.presentation, sku=skuOf(row), price=sku?.sale_price ?? sku?.base_price;
          return [row.slug,check(row),p.image ? <img src={p.image} alt=""/> : '—',p.name,p.sku || row.slug,p.category,
            sku?.base_price == null ? '—' : ils(sku.base_price),price == null ? '—' : ils(sku.base_price-price),price == null ? p.displayPrice || 'Quote' : ils(price),
            sku?.stock ?? '—',sku?.stock === 0 ? 'Sold out' : sku?.stock == null ? 'Unverified' : sku.stock <= sku.low_stock ? 'Low stock' : 'Available',publication(row),actions(row)];
        })}/> : <div className="erp-product-grid">{shown.map(row => <article className="commerce-panel" key={row.slug}>
          {check(row)}{row.presentation.image && <img src={row.presentation.image} alt=""/>}
          <h3>{row.presentation.name}</h3><p>{publication(row)} · {row.presentation.category}</p>{actions(row)}</article>)}</div>}
      <div className="commerce-actions"><button className="button secondary" disabled={!page} onClick={()=>setPage(page-1)}><AdminLabel>Previous</AdminLabel></button>
        <span>{hits.length} products</span><button className="button secondary" disabled={(page+1)*12>=hits.length} onClick={()=>setPage(page+1)}><AdminLabel>Next</AdminLabel></button></div>
    </>;
  }
  const p = draft.presentation;
  const variants = p.variants ?? [];
  const patch = changes => {formChanged.current = true;setDraft(previous => ({...previous,presentation:{...previous.presentation,...changes}}));};
  const skuPatch = (index,change) => setDraft(previous => ({...previous,skus:previous.skus.map((sku,i) => i === index ? {...sku,...change} : sku)}));
  const variantPatch = (index,change) => patch({variants:variants.map((option,i) => i === index ? {...option,...change} : option)});
  function switchVariants(next, index) {
    setDraft(previous => ({...previous,
      presentation:{...previous.presentation,variants:next,
        aliases:(previous.presentation.aliases ?? []).filter(alias => next.some(option => option.id === alias.variant))},
      skus:next.length
        ? previous.skus.filter((sku,i) => sku.variant && i !== index).concat(next.filter(option => !previous.skus.some(sku => sku.variant === option.id)).map(option => freshSku(option.id)))
        : [previous.catalog_skus?.find(sku => sku.variant === '') ? {...freshSku(''),expectedStock:previous.catalog_skus.find(sku => sku.variant === '').stock} : freshSku('')]}));
  }
  async function upload(files, index, replacement) {
    await run(async () => {
      const urls = [];
      for (const file of files) urls.push((await api('/admin/images','POST',file)).url);
      const previous = (index == null ? p.images : variants[index].images) || [];
      const images = replacement == null ? [...previous,...urls] : previous.map((image,i) => i === replacement ? urls[0] : image);
      if (index == null) patch({images});
      else variantPatch(index,{images});
    });
  }
  async function save(event) {
    event.preventDefault();
    setFormError('');
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(draft.slug) || !p.name.trim() || !p.category.trim()) {
      setFormError(t('Enter a valid URL slug, product name, and category.'));setFormTab('general');return;
    }
    if (variants.some(option => !option.name.trim())) {
      setFormError(t('Enter a name for every variant.'));setFormTab('variants');return;
    }
    const mode = event.nativeEvent.submitter?.value;
    const payload = mode === 'publish' ? {...draft,published:true,archived:false,presentation:{...p,draft:false}} :
      mode === 'draft' ? {...draft,published:false,archived:false,presentation:{...p,draft:true}} : draft;
    if (await run(() => api('/admin/products/' + draft.slug,'PUT',{...payload,createOnly:!existing}))) setDraft(null);
  }
  return <form className="commerce-panel commerce-fields" noValidate onChange={() => {formChanged.current = true;}} onSubmit={save}>
    <h2>{t(existing ? 'Edit product' : 'New product')}</h2>
    {formError && <p role="alert">{formError}</p>}
    <div className="commerce-actions" aria-label="Product editor sections">{[['general','General information'],['images','Product images'],['pricing','Pricing'],['inventory','Inventory'],['variants','Variants'],['preview','Website preview']].map(([id,label]) =>
      <button key={id} type="button" className={formTab === id ? 'button' : 'button secondary'} aria-pressed={formTab === id} onClick={()=>setFormTab(id)}>{t(label)}</button>)}</div>
    <div hidden={formTab !== 'general'}>
    <div className="admin-form-grid">
      <Field label="URL slug" required pattern="[a-z0-9][a-z0-9-]*" disabled={existing} value={draft.slug} onChange={slug => setDraft({...draft,slug})}/>
      <Field label="Name" required value={p.name} onChange={name => patch({name})}/>
      <Field label="Arabic name" dir="rtl" value={p.nameAr} onChange={nameAr => patch({nameAr})}/>
      <Field label="Category" required value={p.category} onChange={category => patch({category})}/>
      <Field label="SKU or internal reference" value={p.sku} onChange={sku => patch({sku})}/>
      <Field label="Arabic category" dir="rtl" value={p.categoryAr} onChange={categoryAr => patch({categoryAr})}/>
      <Field label="Collection" value={p.collection} onChange={collection => patch({collection})}/>
      <Field label="Arabic collection" dir="rtl" value={p.collectionAr} onChange={collectionAr => patch({collectionAr})}/>
      <label><AdminLabel>Price type</AdminLabel><select value={p.priceMode} onChange={event => patch({priceMode:event.target.value})}>
        <option value="exact"><AdminLabel>Fixed price</AdminLabel></option><option value="starting"><AdminLabel>Starting price</AdminLabel></option><option value="quote"><AdminLabel>Quote only</AdminLabel></option>
      </select></label>
      {p.priceMode !== 'exact' && <Field label="Display price" value={p.displayPrice} onChange={displayPrice => patch({displayPrice})}/>}
    </div>
    <label><AdminLabel>Description</AdminLabel><textarea value={p.description || ''} onChange={event => patch({description:event.target.value})}/></label>
    <label><AdminLabel>Arabic description</AdminLabel><textarea dir="rtl" value={p.descriptionAr || ''} onChange={event => patch({descriptionAr:event.target.value})}/></label>
    <label className="commerce-check"><input type="checkbox" checked={draft.published} onChange={event => setDraft({...draft,published:event.target.checked,archived:false})}/><AdminLabel>Published</AdminLabel></label>
    <label className="commerce-check"><input type="checkbox" checked={Boolean(p.featured)} onChange={event => patch({featured:event.target.checked})}/><AdminLabel>Featured on home</AdminLabel></label>
    </div>
    <div hidden={formTab !== 'images'}><Gallery images={p.images || []} label="Product gallery" onChange={images => patch({images})} upload={(files,replacement) => upload(files,null,replacement)}/></div>
    <div hidden={!['pricing','inventory','variants'].includes(formTab)}>
    {formTab === 'pricing' && <Amount label="Optional product cost (₪)" value={p.cost} onChange={cost => patch({cost})}/>}
    {formTab === 'pricing' && ['saleStarts','saleEnds'].map((key,index) => {
      const value = p[key] ? new Date(Date.parse(p[key])-new Date(p[key]).getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
      return <Field key={key} label={index ? 'Discount ends' : 'Discount starts'} type="datetime-local" value={value}
        onChange={next => patch({[key]:next ? new Date(next).toISOString() : null})}/>;
    })}
    {formTab === 'inventory' && <>
      <label className="commerce-check"><input type="checkbox" checked={p.trackStock !== false} onChange={e=>patch({trackStock:e.target.checked})}/><AdminLabel>Track stock</AdminLabel></label>
      <label className="commerce-check"><input type="checkbox" checked={Boolean(p.madeToOrder)} onChange={e=>patch({madeToOrder:e.target.checked})}/><AdminLabel>Made to order</AdminLabel></label>
    </>}
    {draft.skus.map((sku,index) => {
      const optionIndex = variants.findIndex(option => option.id === sku.variant);
      const option = variants[optionIndex];
      return <section key={sku.variant} className="admin-sku commerce-fields">
        {option && <div hidden={formTab !== 'variants'}><div className="admin-form-grid">
          <Field label="Variant name" required value={option.name} onChange={name => variantPatch(optionIndex,{name})}/>
          <Field label="Variant SKU" value={option.sku} onChange={sku => variantPatch(optionIndex,{sku})}/>
          <Field label="Arabic variant name" dir="rtl" value={option.nameAr} onChange={nameAr => variantPatch(optionIndex,{nameAr})}/>
          <Field label="Swatch colors (comma-separated hex values)" value={(option.colors || []).join(',')} onChange={colors => variantPatch(optionIndex,{colors:colors ? colors.split(',') : []})}/>
        </div><Gallery images={option.images || []} label="Variant gallery" onChange={images => variantPatch(optionIndex,{images})} upload={(files,replacement) => upload(files,optionIndex,replacement)}/>
          <button type="button" className="button secondary" onClick={() => switchVariants(variants.filter((_,i) => i !== optionIndex), index)}><AdminLabel>Remove variant</AdminLabel></button></div>}
        {option && formTab !== 'variants' && <h3>{option.name || 'New variant'}</h3>}
        <div className="admin-form-grid" hidden={formTab !== 'pricing'}>
          <Amount label="Original price (₪)" value={sku.base_price} onChange={base_price => skuPatch(index,{base_price,sale_price:null})}/>
          <Amount label="Sale price (₪)" value={sku.sale_price} onChange={sale_price => skuPatch(index,{sale_price,discountPercent:null})}/>
          <Amount label="Fixed discount (₪)" value={sku.sale_price == null || sku.discountPercent != null ? null : sku.base_price - sku.sale_price}
            disabled={sku.base_price == null} onChange={amount => skuPatch(index,{sale_price:amount == null ? null : Math.max(0,sku.base_price-amount),discountPercent:null})}/>
          <Field label="Discount (%)" type="number" min="0" max="100" value={sku.discountPercent}
            onChange={value => skuPatch(index,{discountPercent:value === '' ? null : Number(value)})}/>
        </div>
        <div className="admin-form-grid" hidden={formTab !== 'inventory'}>
          <Field label="Stock (blank means unverified)" type="number" min="0" value={sku.stock} onChange={value => skuPatch(index,{stock:value === '' ? null : Number(value)})}/>
          <Field label="Low stock threshold" required type="number" min="0" value={sku.low_stock} onChange={value => skuPatch(index,{low_stock:Number(value)})}/>
        </div>
        {formTab === 'pricing' && sku.base_price != null && <p>Sale preview {(sku.discountPercent == null && sku.sale_price == null) ? ils(sku.base_price) :
          ils(sku.discountPercent == null ? sku.sale_price : Math.round(sku.base_price * (100 - sku.discountPercent)/100))}</p>}
      </section>;
    })}
    {formTab === 'variants' && <button type="button" className="button secondary" onClick={() => switchVariants([...variants,{id:'variant-' + crypto.randomUUID(),name:'',images:[],colors:[]}])}><AdminLabel>Add variant</AdminLabel></button>}
    </div>
    {formTab === 'preview' && <article className="commerce-panel">
      {p.images?.[0] && <img className="erp-preview-image" src={p.images[0]} alt=""/>}<h3>{p.name}</h3><p>{p.description}</p>
      <p>{draft.skus[0]?.base_price != null ? ils(draft.skus[0].sale_price ?? (draft.skus[0].discountPercent == null ?
        draft.skus[0].base_price : Math.round(draft.skus[0].base_price*(100-draft.skus[0].discountPercent)/100))) : p.displayPrice || 'Price on request'}</p>
    </article>}
    <div className="commerce-actions">
      <button className="button"><AdminLabel>Save product</AdminLabel></button>
      <button className="button secondary" value="draft"><AdminLabel>Save as draft</AdminLabel></button>
      <button className="button secondary" value="publish"><AdminLabel>Save and publish</AdminLabel></button>
      <button type="button" className="button secondary" onClick={() => {if (!formChanged.current || window.confirm('Discard unsaved product changes?')) setDraft(null);}}><AdminLabel>Back</AdminLabel></button>
      {existing && !draft.archived && <button type="button" className="button secondary" onClick={async () => {
        if (window.confirm('Archive this product? It will be removed from the storefront.')) {
          if (await run(() => api('/admin/products/' + draft.slug,'DELETE'))) setDraft(null);
        }
      }}>Archive product</button>}
    </div>
  </form>;
}

function Gallery({images,label,onChange,upload}) {
  const t = useAdminText();
  function cover(index) {
    onChange([images[index],...images.filter((_,i) => i !== index)]);
  }
  function move(index,delta) {
    const next = [...images];
    [next[index],next[index+delta]] = [next[index+delta],next[index]];
    onChange(next);
  }
  return <div className="erp-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => {
    event.preventDefault();
    const files = [...event.dataTransfer.files];
    if (files.length) upload(files);
  }}><label>{t(label)}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple onChange={event => {
    const files = [...event.target.files];
    event.target.value = '';
    if (files.length) upload(files);
  }}/></label><small><AdminLabel>Drop image files here or choose them above.</AdminLabel></small><ul className="admin-gallery">{images.map((image,index) =>
    <li key={image}><img src={image} alt={index === 0 ? 'Cover image' : 'Product image ' + (index+1)}/>
      <button type="button" disabled={!index} onClick={() => cover(index)}><AdminLabel>Set cover</AdminLabel></button>
      <button type="button" disabled={!index} onClick={() => move(index,-1)}><AdminLabel>Earlier</AdminLabel></button>
      <button type="button" disabled={index === images.length - 1} onClick={() => move(index,1)}><AdminLabel>Later</AdminLabel></button>
      <label><AdminLabel>Replace image</AdminLabel> <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={event => {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) upload([file],index);
      }}/></label>
      <button type="button" onClick={() => onChange(images.filter((_,i) => i !== index))}><AdminLabel>Remove</AdminLabel></button>
    </li>)}</ul></div>;
}

function Orders({data,run}) {
  const [view,setView] = useState('table');
  const [open,setOpen] = useState(null);
  if (!data.length) return <p><AdminLabel>No orders on this page.</AdminLabel></p>;
  const selected = data.find(order => order.id === open);
  const action = order => <button className="button secondary" onClick={() => setOpen(order.id)}><AdminLabel>Open</AdminLabel></button>;
  return <div className="admin-list">
    <div className="commerce-actions"><button className="button secondary" onClick={() => setView(view === 'table' ? 'kanban' : 'table')}>{view === 'table' ? 'Kanban view' : 'Table view'}</button></div>
    {view === 'table' ? <Table headers={['Order','Customer','City','Date','Total','Status','Payment','Action']} rows={data.map(order => [
      order.id,'#SPK-' + String(order.reference).padStart(4,'0'),order.snapshot.customer.name,order.snapshot.destination.name,
      new Date(order.created_at).toLocaleDateString(),ils(order.snapshot.total),order.status,order.paid ? 'Paid' : 'Unpaid',action(order)])}/> :
      <div className="erp-lanes">{Object.keys(transitions).map(status => <section className="commerce-panel" key={status}><h3>{status}</h3>
        {data.filter(order => order.status === status).map(order => <article className="commerce-panel" key={order.id}>
          <strong>#SPK-{String(order.reference).padStart(4,'0')}</strong><p>{order.snapshot.customer.name} · {ils(order.snapshot.total)}</p>{action(order)}</article>)}</section>)}</div>}
    {[selected].filter(Boolean).map(order => {
    const sale = order.snapshot;
    const customer = sale.customer;
    return <details open key={order.id} className="commerce-panel">
      <summary><strong>{'#SPK-' + String(order.reference).padStart(4,'0')}</strong> · {customer.name} · {order.status} · {order.paid ? 'Paid' : 'Unpaid'} · {ils(sale.total)}</summary>
      <p>{customer.phone} · {sale.destination.name} · {customer.address}</p>
      <a className="button secondary" href={whatsappCustomer(customer.phone)} target="_blank" rel="noreferrer"><AdminLabel>Contact on WhatsApp</AdminLabel></a>
      {customer.notes && <p>{customer.notes}</p>}
      <ul>{sale.lines.map(line => <li key={line.productId + ':' + line.variantId}>{line.quantity} × {line.name}{line.option && ' · ' + line.option.name} · {ils(line.unitPrice * line.quantity)}</li>)}</ul>
      <p>Subtotal {ils(sale.subtotal)} · Discount {ils(sale.discount)} · Delivery {ils(sale.deliveryFee)} · Cash on Delivery</p>
      <ul>{[...(order.order_events ?? [])].sort((a,b) => a.created_at.localeCompare(b.created_at)).map(event =>
        <li key={event.event + event.created_at}>{event.event} · {new Date(event.created_at).toLocaleString()}</li>)}</ul>
      <div className="commerce-actions">{(transitions[order.status] || []).filter(status => status !== 'Paid' || !order.paid).map(status =>
        <button className="button secondary" key={status} onClick={() =>
          run(() => api('/admin/orders/' + order.id,'PATCH',{status}))}>{status === 'Paid' ? 'Mark paid' : status}</button>)}</div>
    </details>;
  })}</div>;
}

function Requests({data,run}) {
  if (!data.length) return <p><AdminLabel>No custom requests on this page.</AdminLabel></p>;
  return <div className="admin-list">{data.map(row => <form key={row.id} className="commerce-panel commerce-fields" onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    run(() => api('/admin/custom-requests/' + row.id,'PATCH',{status:fields.get('status'),quote:fields.get('quote') === '' ? null : Math.round(Number(fields.get('quote'))*100)}));
  }}><h3>{row.details.name}</h3><p>{row.details.phone}</p><p>{row.details.description}</p>
    <label><AdminLabel>Status</AdminLabel><select name="status" defaultValue={row.status}>
      {['Pending','Quoted','Confirmed','Preparing','Shipped','Delivered','Cancelled'].map(status => <option key={status}>{status}</option>)}
    </select></label>
    <label><AdminLabel>Quote (₪)</AdminLabel><input name="quote" type="number" min="0" step="0.01" defaultValue={row.quote == null ? '' : row.quote/100}/></label>
    <button className="button secondary"><AdminLabel>Save request</AdminLabel></button></form>)}</div>;
}

function Settings({data,run}) {
  const [area,setArea] = useState(freshArea);
  const [editing,setEditing] = useState(false);
  return <div className="admin-list">
    <form className="commerce-panel commerce-fields" onSubmit={event => {
      event.preventDefault();
      const whatsapp = new FormData(event.currentTarget).get('whatsapp');
      run(() => api('/admin/settings/whatsapp','PUT',{whatsapp}));
    }}><h2>WhatsApp</h2><label><AdminLabel>Business phone number</AdminLabel><input required type="tel" name="whatsapp" defaultValue={'+' + data.whatsapp}/></label>
      <button className="button"><AdminLabel>Save number</AdminLabel></button></form>
    <form className="commerce-panel commerce-fields" onSubmit={async event => {
      event.preventDefault();
      if (await run(() => api('/admin/delivery/' + area.code,'PUT',area))) {setArea(freshArea);setEditing(false);}
    }}><h2><AdminLabel>Delivery fees</AdminLabel></h2>
      <ul className="admin-list">{data.areas.map(entry => <li className="commerce-actions" key={entry.code}>
        <span>{entry.name} · {entry.fee == null ? 'Regional fee' : ils(entry.fee)}{entry.selectable ? '' : ' · Region only'}{entry.active ? '' : ' · Inactive'}</span>
        <button type="button" onClick={() => {setArea(entry);setEditing(true);}}><AdminLabel>Edit</AdminLabel></button></li>)}</ul>
      <div className="admin-form-grid">
        {[[ 'code','Area code'],['name','English name'],['name_ar','Arabic name']].map(([key,label]) =>
          <Field key={key} label={label} required disabled={key === 'code' && editing} value={area[key]} onChange={value => setArea({...area,[key]:value})}/>)}
        <label><AdminLabel>Parent region</AdminLabel><select value={area.region || ''} onChange={event => setArea({...area,region:event.target.value || null})}>
          <option value=""><AdminLabel>No parent region</AdminLabel></option>
          {data.areas.filter(entry => !entry.region && entry.code !== area.code).map(entry => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
        </select></label>
        <Amount label="Fee (₪, blank to inherit)" value={area.fee} onChange={fee => setArea({...area,fee})}/>
      </div>
      <label className="commerce-check"><input type="checkbox" checked={area.active} onChange={event => setArea({...area,active:event.target.checked})}/><AdminLabel>Active</AdminLabel></label>
      <label className="commerce-check"><input type="checkbox" checked={area.selectable} onChange={event => setArea({...area,selectable:event.target.checked})}/>Show as a city or village at checkout</label>
      <div className="commerce-actions"><button className="button"><AdminLabel>Save delivery area</AdminLabel></button>
        {editing && <button type="button" className="button secondary" onClick={() => {setArea(freshArea);setEditing(false);}}><AdminLabel>Add a different area</AdminLabel></button>}</div>
    </form>
  </div>;
}
