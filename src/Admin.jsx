import {orderReference} from './order-reference.js';
import {linePrice,priceRange,rangeExplanation} from './range-pricing.js';
import React, {useEffect, useState} from 'react';
import {api, ils} from './commerce-api.js';
import './commerce.css';
import AdminWorkspace from './AdminWorkspace.jsx';
import {BackOfficeReports,Dashboard,DateFilters} from './AdminDashboard.jsx';
import {BulkProductEditor,CustomerFilters,DeliverySettings,OrderFilters,OrderPrivate} from './AdminOrderTools.jsx';
import AdminHomepage from './AdminHomepage.jsx';
import AdminQuantityPromotions from './AdminQuantityPromotions.jsx';
import {promotionCopy} from './quantity-offer.js';
import {HexColor,OptionGroups,VariantBulk} from './AdminVariantOptions.jsx';
import {selectionKey,variantChoices,variantCombinations,variantDescription} from './variant-options.js';
import {cloudImageProps} from './cloud-image.js';
import {AdminLanguage, AdminLabel, useAdminText, adminText} from './AdminLocale.jsx';
import {Table,Inventory,Categories,Customers,Promotions,Content,OrderContact,whatsappCustomer} from './AdminModules.jsx';

const transitions = {Pending:['Confirmed','Cancelled'],Confirmed:['Preparing','Cancelled'],Preparing:['Shipped','Cancelled'],Shipped:['Delivered'],Delivered:['Paid'],Cancelled:[]};
const freshSku = variant => ({variant,base_price:null,sale_price:null,stock:null,expectedStock:null,low_stock:2});
const freshProduct = () => ({slug:'',published:false,archived:false,presentation:{name:'',category:'',images:[],variants:[],aliases:[],priceMode:'exact'},skus:[freshSku('')]});
const messages = {
  bulk_ineligible:'Bulk prices require fixed-price products and bulk stock requires stock-managed products.',
  promotion_conflict:'This product already has an enabled quantity promotion in that period.',
  promotion_ineligible:'Quantity promotions require an eligible fixed-price product.',
  promotion_locked:'Archived promotions cannot be changed.',
  invalid_credentials:'The session is invalid or has expired. Please sign in again.',
  invalid_input:'Check the fields and try again.',
  stock_unavailable:'There is insufficient stock to confirm this order.',
  inventory_changed:'Stock changed while you were editing. Reload the product before saving.',
  unresolved_prices:'Enter the agreed unit price for every price-range item before confirming.',
  invalid_transition:'This status change is unavailable. Refresh the order.',
  invalid_image:'Upload a PNG, JPEG, WebP or AVIF image.',
  store_unconfigured:'Connect the Neon database to enable administrator access.',
  images_unconfigured:'Connect Cloudinary before uploading images.',
  image_upload_failed:'The image could not be saved to Cloudinary.',
  archive_required:'Archive this product before deleting it.',
  product_has_history:'This product has order or stock history and can only be archived.',
  duplicate_slug:'That URL slug is already in use. Choose a different one.',
  delivery_locked:'Delivery is locked for paid or cancelled orders.',
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
  const [filters,setFilters] = useState({});
  const [entry,setEntry] = useState(0);
  const [reportRange,setReportRange] = useState({from:'',to:''});
  const [range,setRange] = useState({from:'',to:''});
  const [ar,setAr] = useState(() => localStorage.getItem('sparkle-admin-language') === 'ar');
  const [dark,setDark] = useState(() => localStorage.getItem('sparkle-admin-dark') === 'true');
  const [lowStock,setLowStock] = useState(0);
  const modulePaths={stats:'reports',kits:'products',account:'me',workshops:'content/workshops',website:'content/website',reviews:'homepage'};
  const paged=['orders','customers','custom-requests'].includes(tab);
  const queryData=tab==='stats'?{...range,summary:true}:tab==='reports'?reportRange:paged?{...filters,offset}:{};
  const query=new URLSearchParams(Object.entries(queryData).filter(([,value])=>value!=='' && value!=null)).toString();
  const endpoint = '/admin/' + (modulePaths[tab] || tab) + (query ? '?' + query : '');
  const viewKey = tab + '|' + endpoint;
  const selected = React.useRef(viewKey);
  const mutation = React.useRef(false);
  selected.current = viewKey;
  const data = loaded?.key === viewKey ? loaded.value : null;
  const l = (en,arabic) => ar ? arabic : en;

  function fail(e) {
    if (e.status === 401) {setProfile(null);setLoaded(null);}
    setError(adminText(messages[e.message],ar) || l('The operation could not be completed. Try again.','تعذرت العملية. حاولي مرة أخرى.'));
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
      if (!mutation.current && !document.hidden) fetchModule().then(receive).catch(e => {if (active && e.status === 401) fail(e);});
    },30000) : null;
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
    const report=await api(endpoint);
    setLowStock(report.stock.low);
    return report;
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
  function navigateAdmin(value,filter={}) {
    const orderDate=tab==='stats' && value==='orders' ? range : {};
    if(tab==='stats' && value==='reports')setReportRange(range);
    setTab(value);setFilters({...orderDate,...filter});
    setEntry(number=>number+1);setOffset(0);setError('');setSuccess('');
  }
  function applyFilters(value){setFilters(value);setOffset(0);setError('');}
  const notices = <>{error && <p className="commerce-panel" role="alert">{error}</p>}
    {success && <p className="commerce-panel" role="status">{success}</p>}</>;
  if (!profile) return <main className="commerce-page sparkle-admin" data-commerce dir={ar ? 'rtl' : 'ltr'}>
    <h1>Sparkle Admin</h1>{notices}
    {profile === undefined ? <p role="status">{l('Checking session…','جارٍ التحقق من الجلسة…')}</p> :
      <form className="commerce-panel commerce-fields admin-login" onSubmit={login}>
        <h2>{l('Sign in','تسجيل الدخول')}</h2><label>{l('Email','البريد الإلكتروني')}<input required type="email" name="email" autoComplete="username"/></label>
        <label>{l('Password','كلمة المرور')}<input required type="password" name="password" autoComplete="current-password"/></label>
        <button className="button" disabled={busy}>{l('Sign in','تسجيل الدخول')}</button>
      </form>}
  </main>;
  return <AdminLanguage.Provider value={ar}><AdminWorkspace tab={tab} onTab={navigateAdmin}
    ar={ar} setAr={setAr} dark={dark} setDark={setDark} profile={profile} onLogout={logout}
    onRefresh={() => run(async () => {},l('Refreshed.','تم التحديث.'))} lowStock={lowStock} busy={busy}>
    {notices}
    {tab==='stats' && <DateFilters key="dashboard-dates" range={range} setRange={setRange}/>}
    {tab==='reports' && <DateFilters key="report-dates" range={reportRange} setRange={setReportRange}/>}
    {tab==='orders' && <OrderFilters key={entry} filters={filters} apply={applyFilters}/>}
    {tab==='customers' && <CustomerFilters key={entry} filters={filters} apply={applyFilters}/>}
    {!data ? !error && <p role="status">{l('Loading…','جارٍ التحميل…')}</p> : <fieldset key={tab+entry} className="admin-section" disabled={busy}>
      {tab === 'stats' && <Dashboard data={data} onTab={navigateAdmin}/>}
      {['products','kits'].includes(tab) && <Products data={data.filter(row => (row.presentation.kind === 'kit') === (tab === 'kits'))}
        run={run} initial={filters} kind={tab === 'kits' ? 'kit' : 'shop'}
        onPromotion={product=>navigateAdmin('quantity-promotions',{create:true,product})}/>}
      {tab === 'categories' && <Categories data={data} run={run}/>}
      {tab === 'inventory' && <Inventory data={data} run={run} initial={filters}/>}
      {tab === 'orders' && <Orders data={data} run={run}/>}
      {tab === 'customers' && <Customers data={data} run={run} onOrders={phone=>navigateAdmin('orders',{search:phone})}/>}
      {tab === 'promotions' && <Promotions data={data} run={run}/>}
      {tab === 'quantity-promotions' && <AdminQuantityPromotions data={data} run={run} create={filters.create} product={filters.product}/>}
      {tab === 'custom-requests' && <Requests data={data} run={run}/>}
      {['workshops','website'].includes(tab) && <Content section={tab} data={data} run={run}/>}
      {['homepage','reviews'].includes(tab) && <AdminHomepage data={data} run={run} initialSection={tab==='reviews'?'reviews':'hero'}/>}
      {tab === 'reports' && <BackOfficeReports data={data}/>}
      {tab === 'settings' && <DeliverySettings data={data} run={run}/>}
      {tab === 'account' && <section className="commerce-panel commerce-fields"><h2>{l('Account preferences','تفضيلات الحساب')}</h2><p>{data.email}</p>
        <label>{l('Language','اللغة')} <select value={ar ? 'ar' : 'en'} onChange={event => setAr(event.target.value === 'ar')}><option value="en">English</option><option value="ar">العربية</option></select></label>
        <label className="commerce-check"><input type="checkbox" checked={dark} onChange={event => setDark(event.target.checked)}/>{l('Dark mode','الوضع الداكن')}</label>
      </section>}
      {paged && <div className="commerce-actions">
        <button className="button secondary" disabled={!offset} onClick={() => setOffset(offset - 50)}>{l('Previous','السابق')}</button>
        <button className="button secondary" disabled={data.length < 50} onClick={() => setOffset(offset + 50)}>{l('Next','التالي')}</button>
      </div>}
    </fieldset>}
  </AdminWorkspace></AdminLanguage.Provider>;
}

function Products({data,run,kind,initial,onPromotion}) {
  const t = useAdminText();
  const lang = React.useContext(AdminLanguage) ? 'ar' : 'en';
  const [categories,setCategories] = useState([]);
  useEffect(() => {
    let active=true;
    api('/admin/categories').then(rows=>{if(active)setCategories(rows);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  const [draft,setDraft] = useState(null);
  const [existing,setExisting] = useState(false);
  const [query,setQuery] = useState('');
  const [mode,setMode] = useState('table');
  const [category,setCategory] = useState('');
  const [state,setState] = useState(initial.publication ?? '');
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
    const addedOrder=Math.max(0,...data.map(item=>item.presentation.addedOrder || 0))+1;
    setDraft(row ? {...row,...(duplicate ? {slug:'',published:false,archived:false} : {}),
      presentation:{...row.presentation,...(duplicate ? {name:row.presentation.name + ' (copy)',aliases:[],sku:'',draft:true,featured:false,addedOrder} : {})},
      skus:row.catalog_skus.filter(sku => sku.active).map(sku => ({...sku,...(duplicate ? {stock:null,expectedStock:null} : {expectedStock:sku.stock})}))} :
      {...freshProduct(),presentation:{...freshProduct().presentation,kind,draft:true,addedOrder,defaultOrder:addedOrder}});
  }
  useEffect(()=>{if(initial.create)edit(null);},[]);
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
      {kind==='shop' && !row.archived && (row.presentation.priceMode ?? 'exact')==='exact' &&
        <button className="button secondary" onClick={()=>onPromotion(row.slug)}>{t('Quantity promotion')}</button>}
      <button className="button secondary" onClick={() => run(() => publicationAction(row,!row.published))}>{row.published ? 'Hide' : 'Publish'}</button>
      {!row.archived && <button className="button secondary" onClick={() => {
        if (window.confirm(t('Archive this product and remove it from the storefront?'))) run(() => api('/admin/products/' + row.slug,'DELETE'));
      }}><AdminLabel>Archive</AdminLabel></button>}
      {row.archived && <button className="button secondary" onClick={() => {
        if (window.confirm(t('Permanently delete this unused product?'))) run(() => api('/admin/products/' + row.slug + '?permanent=true','DELETE'));
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
      {!!selection.length && <BulkProductEditor count={selection.length} categories={categories}
        onSave={changes=>run(async()=>{await api('/admin/products/bulk','PATCH',{...changes,targets:selection});setSelection([]);})}/>}
      {!!selection.length && <div className="commerce-actions"><span>{selection.length} {t('selected')}</span>
        {['publish','hide','archive'].map(action => <button className="button secondary" key={action} onClick={() => bulk(action)}>{action}</button>)}
        <button className="button secondary" onClick={() => setSelection([])}><AdminLabel>Clear selection</AdminLabel></button></div>}
      {mode === 'table' ? <Table headers={['Select','Image','Name','SKU','Category','Original','Discount','Selling price','Stock','Availability','Publication','Actions']}
        rows={shown.map(row => {
          const p=row.presentation, sku=skuOf(row), price=sku?.sale_price ?? sku?.base_price;
          return [row.slug,check(row),p.image ? <img {...cloudImageProps(p.image,[160])} alt="" loading="lazy"/> : '—',p.name,p.sku || row.slug,p.category,
            sku?.base_price == null ? '—' : ils(sku.base_price),price == null ? '—' : ils(sku.base_price-price),p.priceMode === 'range' ? priceRange(p.minPrice,p.maxPrice) : price == null ? p.displayPrice || 'Quote' : ils(price),
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
  const groups = p.optionGroups ?? [];
  const patch = changes => {formChanged.current = true;setDraft(previous => ({...previous,presentation:{...previous.presentation,...changes}}));};
  const skuPatch = (index,change) => setDraft(previous => ({...previous,skus:previous.skus.map((sku,i) => i === index ? {...sku,...change} : sku)}));
  const variantPatch = (index,change) => patch({variants:variants.map((option,i) => i === index ? {...option,...change} : option)});
  function switchVariants(next) {
    formChanged.current = true;
    setDraft(previous => {
      const original = previous.skus.find(sku=>!sku.variant) ?? previous.catalog_skus?.find(sku=>!sku.variant);
      return {...previous,
        presentation:{...previous.presentation,variants:next,
          defaultPrice:previous.presentation.defaultPrice ?? original?.base_price ?? null,
          aliases:(previous.presentation.aliases ?? []).filter(alias => next.some(option => option.id === alias.variant))},
        skus:next.length
          ? next.map(option=>previous.skus.find(sku=>sku.variant===option.id) ?? freshSku(option.id))
          : [original ? {...original,expectedStock:original.expectedStock ?? original.stock} : freshSku('')]};
    });
  }
  function generateVariants() {
    const combinations = variantCombinations(groups);
    const keys = new Set(variants.map(variant=>selectionKey(groups,variant.selections)));
    const missing = combinations?.filter(selection=>!keys.has(selectionKey(groups,selection)));
    if (!missing || variants.length+missing.length>40) {
      setFormError(t('A product can have up to 40 variants.'));return;
    }
    if (!combinations.length || groups.some(group=>!group.name.trim() || group.values.some(value=>!value.name.trim()))) {
      setFormError(t('Name every option and value before generating combinations.'));return;
    }
    setFormError('');
    switchVariants([...variants,...missing.map((selections,index)=>({
      id:'variant-'+crypto.randomUUID(),selections,name:'',images:[],colors:[],
      displayOrder:Math.max(0,...variants.map(variant=>variant.displayOrder ?? 0))+index+1
    }))]);
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
    if (!groups.length && variants.some(option => !option.name.trim())) {
      setFormError(t('Enter a name for every variant.'));setFormTab('variants');return;
    }
    if (groups.length && (!variants.length || new Set(variants.map(option=>selectionKey(groups,option.selections))).size!==variants.length ||
      groups.some(group=>!group.name.trim() || !group.values.length || group.values.some(value=>!value.name.trim() ||
        (value.color && !/^#[0-9a-f]{6}$/i.test(value.color))) ||
        variants.some(option=>!group.values.some(value=>value.id===option.selections?.[group.id]))))) {
      setFormError(t('Enter valid option values and assign a unique combination to every variant.'));setFormTab('variants');return;
    }
    if (p.priceMode === 'range' && (!Number.isSafeInteger(p.minPrice) || !Number.isSafeInteger(p.maxPrice) ||
      p.minPrice < 0 || p.maxPrice < p.minPrice || p.maxPrice > 100000000)) {
      setFormError(t('Enter a valid minimum and maximum price.'));setFormTab('pricing');return;
    }
    const mode = event.nativeEvent.submitter?.value;
    const payload = mode === 'publish' ? {...draft,published:true,archived:false,presentation:{...p,draft:false}} :
      mode === 'draft' ? {...draft,published:false,archived:false,presentation:{...p,draft:true}} : draft;
    const presentation={...payload.presentation,details:payload.presentation.details?.map(value=>value.trim()).filter(Boolean),
      kitOptions:payload.presentation.kitOptions?.map(value=>value.trim()).filter(Boolean),
      kitPalette:payload.presentation.kitPalette?.map(value=>value.trim()).filter(Boolean),
      kitDecorations:payload.presentation.kitDecorations?.map(value=>value.trim()).filter(Boolean)};
    if (await run(() => api('/admin/products/' + draft.slug,'PUT',{...payload,presentation,createOnly:!existing,
      skus:p.priceMode === 'range' ? payload.skus.map(sku=>({...sku,base_price:null,sale_price:null,discountPercent:null})) : payload.skus}))) setDraft(null);
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
      <Field label="Category" required list="sparkle-product-categories" value={p.category} onChange={category => patch({category})}/>
      <datalist id="sparkle-product-categories">{categories.map(row=><option key={row.name} value={row.name}/>)}</datalist>
      <Field label="SKU or internal reference" value={p.sku} onChange={sku => patch({sku})}/>
      <Field label="Arabic category" dir="rtl" value={p.categoryAr} onChange={categoryAr => patch({categoryAr})}/>
      <Field label="Collection" value={p.collection} onChange={collection => patch({collection})}/>
      <Field label="Arabic collection" dir="rtl" value={p.collectionAr} onChange={collectionAr => patch({collectionAr})}/>
    </div>
    <label><AdminLabel>Description</AdminLabel><textarea value={p.description || ''} onChange={event => patch({description:event.target.value})}/></label>
    <label><AdminLabel>Arabic description</AdminLabel><textarea dir="rtl" value={p.descriptionAr || ''} onChange={event => patch({descriptionAr:event.target.value})}/></label>
    {p.kind === 'kit' && <>
      <label>{t('Kit contents, colors and decorations')}<textarea value={(p.details || []).join('\n')} onChange={event=>patch({details:event.target.value.split('\n')})}/></label>
      <Field label="Pieces per kit" type="number" min="1" max="8" value={p.kitPieces} onChange={value=>patch({kitPieces:value ? Number(value) : null})}/>
      <label>{t('Pieces customers can choose (one per line)')}<textarea value={(p.kitOptions || []).join('\n')} onChange={event=>patch({kitOptions:event.target.value.split('\n')})}/></label>
      <label>{t('Available Japanese Cream colors (one per line)')}<textarea value={(p.kitPalette || []).join('\n')} onChange={event=>patch({kitPalette:event.target.value.split('\n')})}/></label>
      <label>{t('Decoration options (one per line)')}<textarea value={(p.kitDecorations || []).join('\n')} onChange={event=>patch({kitDecorations:event.target.value.split('\n')})}/></label>
    </>}
    <label className="commerce-check"><input type="checkbox" checked={draft.published} onChange={event => setDraft({...draft,published:event.target.checked,archived:false})}/><AdminLabel>Published</AdminLabel></label>
    <label className="commerce-check"><input type="checkbox" checked={Boolean(p.featured)} onChange={event => patch({featured:event.target.checked})}/><AdminLabel>Featured on home</AdminLabel></label>
    </div>
    <div hidden={formTab !== 'images'}><Gallery images={p.images || []} label="Product gallery" onChange={images => patch({images})} upload={(files,replacement) => upload(files,null,replacement)}/></div>
    <div hidden={!['pricing','inventory','variants'].includes(formTab)}>
    {formTab === 'pricing' && <>
      <label><AdminLabel>Price type</AdminLabel><select value={p.priceMode} onChange={event => patch({priceMode:event.target.value})}>
        <option value="exact">{t('Fixed price')}</option><option value="range">{t('Price Range')}</option>
        {['starting','quote'].includes(p.priceMode) && <option value={p.priceMode}>{t(p.priceMode === 'starting' ? 'Starting price' : 'Quote only')}</option>}
      </select></label>
      {['starting','quote'].includes(p.priceMode) && <Field label="Display price" value={p.displayPrice} onChange={displayPrice => patch({displayPrice})}/>}
      {p.priceMode==='exact' && variants.length>0 && <Amount label="Default variant price (₪)" value={p.defaultPrice} onChange={defaultPrice=>patch({defaultPrice})}/>}
    </>}
    {formTab === 'pricing' && p.priceMode === 'range' && <>
      <Amount label="Minimum price (₪)" value={p.minPrice} onChange={minPrice=>patch({minPrice})}/>
      <Amount label="Maximum price (₪)" value={p.maxPrice} onChange={maxPrice=>patch({maxPrice})}/>
      <Field label="Pricing explanation" maxLength={1000} value={p.pricingExplanation ?? rangeExplanation.en} onChange={pricingExplanation=>patch({pricingExplanation})}/>
      <Field label="Arabic pricing explanation" maxLength={1000} dir="rtl" value={p.pricingExplanationAr ?? rangeExplanation.ar} onChange={pricingExplanationAr=>patch({pricingExplanationAr})}/>
    </>}
    {formTab === 'pricing' && <Amount label="Product unit cost (₪)" value={p.cost} onChange={cost => patch({cost})}/>}
    {formTab === 'pricing' && p.priceMode === 'exact' && ['saleStarts','saleEnds'].map((key,index) => {
      const value = p[key] ? new Date(Date.parse(p[key])-new Date(p[key]).getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
      return <Field key={key} label={index ? 'Discount ends' : 'Discount starts'} type="datetime-local" value={value}
        onChange={next => patch({[key]:next ? new Date(next).toISOString() : null})}/>;
    })}
    {formTab === 'inventory' && <>
      <label className="commerce-check"><input type="checkbox" checked={p.trackStock !== false} onChange={e=>patch({trackStock:e.target.checked})}/><AdminLabel>Track stock</AdminLabel></label>
      <label className="commerce-check"><input type="checkbox" checked={Boolean(p.madeToOrder)} onChange={e=>patch({madeToOrder:e.target.checked})}/><AdminLabel>Made to order</AdminLabel></label>
    </>}
    {formTab === 'variants' && <>
      <OptionGroups groups={groups} variants={variants} onChange={optionGroups=>patch({optionGroups})} onGenerate={generateVariants}/>
      {variants.length>0 && <VariantBulk
        onPrice={p.priceMode==='exact' ? base_price=>setDraft(previous=>({...previous,
          skus:previous.skus.map(sku=>({...sku,base_price,sale_price:sku.sale_price<=base_price ? sku.sale_price : null}))})) : null}
        onStock={stock=>setDraft(previous=>({...previous,skus:previous.skus.map(sku=>({...sku,stock}))}))}/>}
    </>}
    {draft.skus.map((sku,index) => {
      const optionIndex = variants.findIndex(option => option.id === sku.variant);
      const option = variants[optionIndex];
      const optionName = option && variantDescription(groups.length ? {...option,choices:variantChoices(groups,option.selections)} : option,lang);
      return <section key={sku.variant} className="admin-sku commerce-fields">
        {option && <h3>{optionName || t('New variant')}</h3>}
        {option && <div hidden={formTab !== 'variants'}><div className="admin-form-grid">
          {!groups.length && <>
            <Field label="Variant name" required value={option.name} onChange={name => variantPatch(optionIndex,{name})}/>
            <Field label="Arabic variant name" dir="rtl" value={option.nameAr} onChange={nameAr => variantPatch(optionIndex,{nameAr})}/>
            <HexColor label={t('Primary swatch color')} value={option.colors?.[0]} onChange={color=>variantPatch(optionIndex,{colors:[color,...(option.colors ?? []).slice(1)]})}/>
            <Field label="Swatch colors (comma-separated hex values)" value={(option.colors || []).join(',')} onChange={colors => variantPatch(optionIndex,{colors:colors ? colors.split(',') : []})}/>
          </>}
          {groups.map(group=><label key={group.id}>{(lang==='ar' && group.nameAr) || group.name}<select value={option.selections?.[group.id] ?? ''} onChange={event=>{
            const selections={...option.selections};
            if (event.target.value) selections[group.id]=event.target.value;
            else delete selections[group.id];
            variantPatch(optionIndex,{selections});
          }}>
              <option value="">{t('Select option value')}</option>{group.values.map(value=><option key={value.id} value={value.id}>{(lang==='ar' && value.nameAr) || value.name}</option>)}
          </select></label>)}
          <Field label="Variant SKU" value={option.sku} onChange={sku => variantPatch(optionIndex,{sku})}/>
          <Field label="Variant display order" type="number" min="0" max="1000000" value={option.displayOrder ?? 0} onChange={value=>variantPatch(optionIndex,{displayOrder:Number(value)})}/>
          <label className="commerce-check"><input type="checkbox" checked={option.enabled !== false} onChange={event=>variantPatch(optionIndex,{enabled:event.target.checked})}/>{t('Enable variant')}</label>
          <label className="commerce-check"><input type="checkbox" checked={option.visible !== false} onChange={event=>variantPatch(optionIndex,{visible:event.target.checked})}/>{t('Show variant in Shop')}</label>
        </div><Gallery images={option.images || []} label="Variant gallery" onChange={images => variantPatch(optionIndex,{images})} upload={(files,replacement) => upload(files,optionIndex,replacement)}/>
          {!!p.images?.length && <button type="button" className="button secondary" onClick={()=>variantPatch(optionIndex,{images:[...new Set([...(option.images ?? []),...p.images])].slice(0,30)})}>
            <AdminLabel>Reuse product gallery</AdminLabel>
          </button>}
          <button type="button" className="button secondary" onClick={() => switchVariants(variants.filter((_,i) => i !== optionIndex))}><AdminLabel>Remove variant</AdminLabel></button></div>}
        <div className="admin-form-grid" hidden={(!['variants','pricing'].includes(formTab)) || p.priceMode !== 'exact' || (!option && formTab==='variants')}>
          <Amount label={sku.variant ? 'Price override (₪)' : 'Original price (₪)'} value={sku.base_price} onChange={base_price => skuPatch(index,{base_price,sale_price:null,discountPercent:null})}/>
          <Amount label="Sale price (₪)" value={sku.sale_price} onChange={sale_price => skuPatch(index,{sale_price,discountPercent:null})}/>
          <Amount label="Fixed discount (₪)" value={sku.sale_price == null || sku.discountPercent != null ? null : sku.base_price - sku.sale_price}
            disabled={sku.base_price == null} onChange={amount => skuPatch(index,{sale_price:amount == null ? null : Math.max(0,sku.base_price-amount),discountPercent:null})}/>
          <Field label="Discount (%)" type="number" min="0" max="100" value={sku.discountPercent}
            onChange={value => skuPatch(index,{discountPercent:value === '' ? null : Number(value)})}/>
        </div>
        {option && ['pricing','variants'].includes(formTab) && <Amount label="Variant unit cost override (₪)" value={sku.unit_cost}
          onChange={unit_cost=>skuPatch(index,{unit_cost})}/>}
        <div className="admin-form-grid" hidden={formTab !== 'inventory' && (formTab!=='variants' || !option)}>
          <Field label="Stock (blank means unverified)" type="number" min="0" value={sku.stock} onChange={value => skuPatch(index,{stock:value === '' ? null : Number(value)})}/>
          <Field label="Low stock threshold" required type="number" min="0" value={sku.low_stock} onChange={value => skuPatch(index,{low_stock:Number(value)})}/>
        </div>
        {formTab === 'pricing' && p.priceMode === 'exact' && sku.base_price != null && <p>Sale preview {(sku.discountPercent == null && sku.sale_price == null) ? ils(sku.base_price) :
          ils(sku.discountPercent == null ? sku.sale_price : Math.round(sku.base_price * (100 - sku.discountPercent)/100))}</p>}
      </section>;
    })}
    {formTab === 'variants' && <button type="button" className="button secondary" disabled={variants.length>=40} onClick={() => switchVariants([...variants,{id:'variant-' + crypto.randomUUID(),name:'',images:[],colors:[]}])}><AdminLabel>Add variant</AdminLabel></button>}
    </div>
    {formTab === 'preview' && <article className="commerce-panel">
      {p.images?.[0] && <img className="erp-preview-image" src={p.images[0]} alt=""/>}<h3>{p.name}</h3><p>{p.description}</p>
      <p>{p.priceMode === 'range' ? (p.minPrice == null || p.maxPrice == null ? '—' : priceRange(p.minPrice,p.maxPrice)) : draft.skus[0]?.base_price != null ? ils(draft.skus[0].sale_price ?? (draft.skus[0].discountPercent == null ?
        draft.skus[0].base_price : Math.round(draft.skus[0].base_price*(100-draft.skus[0].discountPercent)/100))) : p.displayPrice || 'Price on request'}</p>
    </article>}
    <div className="commerce-actions">
      <button className="button"><AdminLabel>Save product</AdminLabel></button>
      <button className="button secondary" value="draft"><AdminLabel>Save as draft</AdminLabel></button>
      <button className="button secondary" value="publish"><AdminLabel>Save and publish</AdminLabel></button>
      <button type="button" className="button secondary" onClick={() => {if (!formChanged.current || window.confirm(t('Discard unsaved product changes?'))) setDraft(null);}}><AdminLabel>Back</AdminLabel></button>
      {existing && !draft.archived && <button type="button" className="button secondary" onClick={async () => {
        if (window.confirm(t('Archive this product and remove it from the storefront?'))) {
          if (await run(() => api('/admin/products/' + draft.slug,'DELETE'))) setDraft(null);
        }
      }}>{t('Archive product')}</button>}
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
    <li key={image}><img {...cloudImageProps(image,[320])} loading="lazy" alt={index === 0 ? 'Cover image' : 'Product image ' + (index+1)}/>
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

function orderTotal(sale,t) {
  return sale.total == null ? priceRange(sale.estimatedMin,sale.estimatedMax) + ' · ' + t('Estimated') : ils(sale.total);
}

function Orders({data,run}) {
  const t = useAdminText();
  const lang = React.useContext(AdminLanguage) ? 'ar' : 'en';
  const [view,setView] = useState('table');
  const [open,setOpen] = useState(null);
  const selected = data.find(order => order.id === open);
  const orderDetail = React.useRef(null);
  React.useLayoutEffect(() => {
    const panel = orderDetail.current;
    if (!panel) return;
    const header = panel.closest('.erp-body')?.querySelector('.erp-top');
    panel.style.scrollMarginBlockStart = `${(header?.offsetHeight ?? 0) + 12}px`;
    panel.querySelector('summary').focus({preventScroll:true});
    panel.scrollIntoView({block:'start'});
  },[selected?.id]);
  if (!data.length) return <p><AdminLabel>No orders on this page.</AdminLabel></p>;
  const action = order => <button className="button secondary" onClick={() => setOpen(order.id)}><AdminLabel>Open</AdminLabel></button>;
  return <div className="admin-list">
    <div className="commerce-actions"><button className="button secondary" onClick={() => setView(view === 'table' ? 'kanban' : 'table')}>{t(view === 'table' ? 'Kanban view' : 'Table view')}</button></div>
    {view === 'table' ? <Table headers={['Order','Customer','WhatsApp Number','City','Date','Total','Status','Payment','Action']} rows={data.map(order => [
      order.id,orderReference(order.reference,order.snapshot.customer.referenceFormat),order.snapshot.customer.name,order.customer_phone || order.snapshot.customer.phone,order.snapshot.customer.city || order.snapshot.destination?.name || '—',
      new Date(order.created_at).toLocaleDateString(),orderTotal(order.snapshot,t),t(order.status),t(order.paid ? 'Paid' : 'Unpaid'),action(order)])}/> :
      <div className="erp-lanes">{Object.keys(transitions).map(status => <section className="commerce-panel" key={status}><h3>{t(status)}</h3>
        {data.filter(order => order.status === status).map(order => <article className="commerce-panel" key={order.id}>
          <strong>{orderReference(order.reference,order.snapshot.customer.referenceFormat)}</strong><p>{order.snapshot.customer.name} · {orderTotal(order.snapshot,t)}</p>{action(order)}</article>)}</section>)}</div>}
    {[selected].filter(Boolean).map(order => {
    const sale = order.snapshot;
    const customer = sale.customer;
    const editPrices = order.status === 'Pending' && sale.estimatedMin != null;
    const unresolved = sale.lines.some(line=>line.minPrice != null && line.agreedUnitPrice == null);
    return <details ref={orderDetail} open key={order.id} className="commerce-panel">
      <summary><strong>{orderReference(order.reference,customer.referenceFormat)}</strong> · {customer.name} · {t(order.status)} · {t(order.paid ? 'Paid' : 'Unpaid')} · {orderTotal(sale,t)}</summary>
      <p>{new Date(order.created_at).toLocaleString(lang)}</p>
      <OrderContact contact={{...customer,phone:order.customer_phone || customer.phone,city:customer.city || sale.destination?.name}}/>
      <a className="button secondary" href={whatsappCustomer(order.customer_phone || customer.phone)} target="_blank" rel="noreferrer"><AdminLabel>Contact Customer via WhatsApp</AdminLabel></a>
      {customer.notes && <p>{customer.notes}</p>}
      <ul>{sale.lines.map(line => <li className="admin-order-line" key={JSON.stringify([line.productId,line.variantId,line.kitChoices])}>{line.option?.image || line.image ? <img {...cloudImageProps(line.option?.image || line.image,[160])} alt="" loading="lazy"/> : <span/>}<div>{line.quantity} × {(lang==='ar' && line.nameAr) || line.name}{line.option && ' · ' + variantDescription(line.option,lang)}
        {!!line.kitChoices?.length && ' · ' + line.kitChoices.map(t).join(' · ')} · {line.lineTotal == null ? linePrice(line,line.quantity,ils) : ils(line.lineTotal)}
        {line.quantityPromotion && <> · {promotionCopy(line.quantityPromotion,lang)} · −{ils(line.quantityDiscount)}</>}
        {line.agreedUnitPrice != null && <> · {t('Agreed unit price')} {ils(line.agreedUnitPrice)}</>}</div></li>)}</ul>
      {sale.estimatedMin != null && <p>{t('Original estimated product subtotal')} <bdi>{priceRange(sale.estimatedMin,sale.estimatedMax)}</bdi></p>}
      {sale.estimatedMin != null && sale.total != null && <p><strong>{t(sale.deliveryFee == null ? 'Agreed product subtotal' : 'Agreed total including delivery')}</strong> <bdi>{ils(sale.total)}</bdi></p>}
      <p>{sale.estimatedMin == null && <>{t('Subtotal')} {ils(sale.subtotal)} · </>}{t('Standard discounts')} {ils(sale.discount-(sale.quantityDiscount ?? 0))} · {t('Quantity promotion discount')} {ils(sale.quantityDiscount ?? 0)} · {t('Delivery')} {sale.deliveryFee == null ? t('To be confirmed') : ils(sale.deliveryFee)} · {t('Cash on Delivery')}</p>
      <p>{t('Product subtotal excluding delivery')} <bdi>{sale.total==null ?
        sale.estimatedMin==null ? '—' : priceRange(sale.estimatedMin,sale.estimatedMax) :
        ils(sale.total-(sale.deliveryFee ?? 0))}</bdi></p>
      <p>{t('Final order total')} <bdi>{sale.total!=null && sale.deliveryFee!=null ? ils(sale.total) : t('To be confirmed')}</bdi></p>
      {!order.paid && order.status !== 'Cancelled' ? <form className="commerce-fields" onSubmit={event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const fee = fields.get('fee');
        const prices = editPrices ? sale.lines.map((line,index)=>{
          const value = fields.get('price-'+index);
          return line.minPrice == null || value === '' ? null : Math.round(Number(value)*100);
        }) : undefined;
        run(() => api('/admin/orders/' + order.id + '/delivery','PATCH',{details:fields.get('details'),fee:fee === '' ? null : Math.round(Number(fee)*100),prices}));
      }}>
        {editPrices && sale.lines.map((line,index)=>line.minPrice == null ? null :
          <label key={index}>{t('Agreed unit price')} · {line.name}{line.option && ' · ' + line.option.name}
            <input name={'price-'+index} type="number" min="0" max="1000000" step=".01"
              defaultValue={line.agreedUnitPrice == null ? '' : line.agreedUnitPrice/100}/>
          </label>)}
        <label><AdminLabel>Delivery information</AdminLabel><textarea name="details" maxLength={1200} defaultValue={order.delivery_details ?? ''}/></label>
        <label><AdminLabel>Delivery fee (₪)</AdminLabel><input name="fee" type="number" min="0" max="10000" step=".01" defaultValue={sale.deliveryFee == null ? '' : sale.deliveryFee/100}/></label>
        <button className="button secondary">{t(editPrices ? 'Save prices and delivery' : 'Save delivery')}</button>
      </form> : order.delivery_details && <p>{order.delivery_details}</p>}
      <OrderPrivate order={order} run={run}/>
      <ul>{[...(order.order_events ?? [])].sort((a,b) => a.created_at.localeCompare(b.created_at)).map(event =>
        <li key={event.event + event.created_at}>{t(event.event)} · {new Date(event.created_at).toLocaleString()}</li>)}</ul>
      {order.status === 'Pending' && unresolved && <p>{t(messages.unresolved_prices)}</p>}
      <div className="commerce-actions">{(transitions[order.status] || []).filter(status => status !== 'Paid' || !order.paid).map(status =>
        <button className="button secondary" key={status} disabled={status === 'Confirmed' && unresolved} onClick={() =>
          (status!=='Cancelled' || window.confirm(t('Cancel this order?'))) && run(() => api('/admin/orders/' + order.id,'PATCH',{status}))}>{t(status === 'Paid' ? 'Mark paid' : status)}</button>)}</div>
    </details>;
  })}</div>;
}

function Requests({data,run}) {
  const t=useAdminText();
  if (!data.length) return <p><AdminLabel>No custom requests on this page.</AdminLabel></p>;
  return <div className="admin-list">{data.map(row => <form key={row.id} className="commerce-panel commerce-fields" onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    run(() => api('/admin/custom-requests/' + row.id,'PATCH',{status:fields.get('status'),quote:fields.get('quote') === '' ? null : Math.round(Number(fields.get('quote'))*100)}));
  }}><h3>{row.details.name}</h3><p>{row.details.phone}</p><p>{row.details.description}</p>
    <label><AdminLabel>Status</AdminLabel><select name="status" defaultValue={row.status}>
      {['Pending','Quoted','Confirmed','Preparing','Shipped','Delivered','Cancelled'].map(status => <option key={status} value={status}>{t(status)}</option>)}
    </select></label>
    <label><AdminLabel>Quote (₪)</AdminLabel><input name="quote" type="number" min="0" step="0.01" defaultValue={row.quote == null ? '' : row.quote/100}/></label>
    <button className="button secondary"><AdminLabel>Save request</AdminLabel></button></form>)}</div>;
}
