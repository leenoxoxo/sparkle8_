import React,{useEffect,useRef,useState} from 'react';
import {Bell,Boxes,CalendarDays,ChartNoAxesCombined,ChevronDown,ClipboardList,Gift,LayoutDashboard,LogOut,Menu,Moon,Package,Search,Settings,ShoppingBag,Sun,Truck,Users} from 'lucide-react';
import './admin-workspace.css';

export const modules=[
  ['stats','Dashboard','لوحة التحكم',LayoutDashboard],
  ['products','Products','المنتجات',Package],
  ['categories','Categories and Subcategories','الفئات والفئات الفرعية',Boxes],
  ['inventory','Inventory','المخزون',Boxes],
  ['kits','DIY Kits','أطقم الأعمال اليدوية',Gift],
  ['orders','Orders','الطلبات',ShoppingBag],
  ['customers','Customers','العملاء',Users],
  ['promotions','Standard Discounts','الخصومات العادية',Gift],
  ['quantity-promotions','Quantity Promotions','عروض الكمية',Gift],
  ['reports','Sales Reports','تقارير المبيعات',ChartNoAxesCombined],
  ['homepage','Homepage Management','إدارة الصفحة الرئيسية',LayoutDashboard],
  ['seasonal-effects','Seasonal Effects','التأثيرات الموسمية',CalendarDays],
  ['website','Website Content','محتوى الموقع',LayoutDashboard],
  ['reviews','Customer Reviews','آراء العملاء',Users],
  ['workshops','Workshops','الورش',CalendarDays],
  ['settings','Delivery and WhatsApp','التوصيل وواتساب',Truck],
  ['delivery-destinations','Delivery Areas','مناطق التوصيل',Truck],
  ['account','Settings','الإعدادات',Settings],
  ['custom-requests','Legacy Custom Orders Archive','أرشيف الطلبات المخصصة',ClipboardList]
];
const groups=[
  ['catalog','Catalog Management','إدارة الكتالوج',Boxes,['products','categories','inventory','kits']],
  ['sales','Sales Management','إدارة المبيعات',ShoppingBag,['orders','customers','discounts','reports']],
  ['web','Website Management','إدارة الموقع',LayoutDashboard,['homepage','seasonal-effects','website','reviews','workshops']],
  ['system','System Management','إدارة النظام',Settings,['delivery-destinations','settings','account','custom-requests']]
];
const discounts=['promotions','quantity-promotions'];
const readGroups=()=>{try{return JSON.parse(localStorage.getItem('sparkle-admin-nav')) || {catalog:true};}catch{return {catalog:true};}};

export default function AdminWorkspace({tab,onTab,children,ar,setAr,dark,setDark,profile,onLogout,onRefresh,lowStock,busy}) {
  const [collapsed,setCollapsed]=useState(()=>localStorage.getItem('sparkle-admin-sidebar-collapsed')==='true');
  const [open,setOpen]=useState(readGroups);
  const [drawer,setDrawer]=useState(false);
  const [search,setSearch]=useState('');
  const menu=useRef(null), sidebar=useRef(null);
  const l=(en,arabic)=>ar?arabic:en;
  const selected=modules.find(row=>row[0]===tab);
  const parent=groups.find(row=>row[4].includes(tab) || (row[0]==='sales' && discounts.includes(tab)))?.[0];
  const close=()=>{setDrawer(false);menu.current?.focus();};
  useEffect(()=>{localStorage.setItem('sparkle-admin-sidebar-collapsed',String(collapsed));},[collapsed]);
  useEffect(()=>{localStorage.setItem('sparkle-admin-nav',JSON.stringify(open));},[open]);
  useEffect(()=>{if(parent)setOpen(current=>({...current,[parent]:true,...(discounts.includes(tab) && {discounts:true})}));},[parent,tab]);
  useEffect(()=>{
    if(!drawer)return;
    (sidebar.current?.querySelector('[aria-current="page"]') ?? sidebar.current?.querySelector('button'))?.focus();
    const keydown=event=>{
      if(event.key==='Escape')close();
      if(event.key!=='Tab')return;
      const buttons=[...(sidebar.current?.querySelectorAll('button') ?? [])].filter(button=>button.getClientRects().length);
      if(event.shiftKey && document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1)?.focus();}
      else if(!event.shiftKey && document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0]?.focus();}
    };
    window.addEventListener('keydown',keydown);
    return ()=>window.removeEventListener('keydown',keydown);
  },[drawer]);
  function change(id,filters){onTab(id,filters);if(drawer)close();setSearch('');}
  const button=id=>{
    const [,en,arabic,Icon]=modules.find(row=>row[0]===id);
    return <button key={id} type="button" title={l(en,arabic)} aria-label={l(en,arabic)}
      aria-current={tab===id?'page':undefined} onClick={()=>change(id)}><Icon size={17}/><span>{l(en,arabic)}</span></button>;
  };
  function toggle(id){
    if(collapsed && !drawer){setCollapsed(false);setOpen(current=>({...current,[id]:true}));}
    else setOpen(current=>({...current,[id]:!current[id]}));
  }
  return <div data-commerce className={'erp-shell'+(collapsed?' erp-collapsed':'')} dir={ar?'rtl':'ltr'} lang={ar?'ar':'en'}>
    {drawer && <button className="erp-scrim" aria-label={l('Close menu','إغلاق القائمة')} onClick={close}/>}
    <aside ref={sidebar} id="admin-navigation" className={'erp-sidebar'+(drawer?' erp-drawer-open':'')}>
      <div className="erp-brand"><span>Sparkle</span><button type="button" aria-label={l('Toggle sidebar','تبديل القائمة')}
        onClick={()=>drawer?close():setCollapsed(!collapsed)}><Menu size={18}/></button></div>
      <nav aria-label={l('Admin sections','أقسام الإدارة')}>
        {button('stats')}
        {groups.map(([id,en,arabic,Icon,entries])=><section key={id} className="erp-nav-group">
          <button type="button" className="erp-group-title" title={l(en,arabic)} aria-label={l(en,arabic)}
            aria-expanded={Boolean(open[id])} aria-controls={'nav-'+id} onClick={()=>toggle(id)}>
            <Icon size={17}/><span>{l(en,arabic)}</span><ChevronDown className="erp-group-caret" size={14}/>
          </button>
          <div id={'nav-'+id} className="erp-group-items" hidden={!open[id]}>
            {entries.map(entry=>entry==='discounts'?<section className="erp-nav-nested" key={entry}>
              <button type="button" aria-expanded={Boolean(open.discounts)} aria-controls="nav-discounts" onClick={()=>toggle('discounts')}>
                <Gift size={17}/><span>{l('Discounts and Promotions','الخصومات والعروض')}</span>
              </button>
              <div id="nav-discounts" className="erp-group-items" hidden={!open.discounts}>{discounts.map(button)}</div>
            </section>:button(entry))}
          </div>
        </section>)}
      </nav>
    </aside>
    <div className="erp-body">
      <header className="erp-top">
        <button ref={menu} type="button" className="erp-menu" onClick={()=>drawer?close():setDrawer(true)}
          aria-expanded={drawer} aria-controls="admin-navigation" aria-label={l('Open menu','فتح القائمة')}><Menu size={20}/></button>
        <form role="search" className="erp-search" onSubmit={event=>{
          event.preventDefault();
          const text=search.trim().toLowerCase();
          const result=text && modules.find(([,en,arabic])=>en.toLowerCase().includes(text)||arabic.includes(text));
          if(result)change(result[0]);
        }}><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)}
          placeholder={l('Find a module…','ابحثي عن قسم…')} aria-label={l('Find a module','ابحثي عن قسم')}/></form>
        <button type="button" onClick={()=>change('inventory',{stock:'Low stock'})} aria-label={l('Low-stock notifications','تنبيهات المخزون')}><Bell size={17}/>{lowStock>0 && <span>{lowStock}</span>}</button>
        <button type="button" onClick={()=>setAr(!ar)} aria-label={l('Switch to Arabic','التبديل إلى الإنجليزية')}>{ar?'EN':'ع'}</button>
        <button type="button" onClick={()=>setDark(!dark)} aria-label={l('Toggle dark mode','تبديل الوضع الداكن')}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button>
        {profile && <span className="erp-account" dir="ltr">{profile.email}</span>}
        <button type="button" onClick={onLogout} aria-label={l('Sign out','تسجيل الخروج')}><LogOut size={17}/></button>
      </header>
      <main className="sparkle-admin erp-content">
        <div className="erp-page-head"><div><div className="erp-crumb"><button onClick={()=>change('stats')}>Sparkle Admin</button>
          <span aria-hidden="true">/</span>{l(selected[1],selected[2])}</div><h1>{l(selected[1],selected[2])}</h1></div>
          <button type="button" className="button secondary" disabled={busy} onClick={onRefresh}>{l('Refresh','تحديث')}</button>
        </div>{children}
      </main>
    </div>
  </div>;
}
