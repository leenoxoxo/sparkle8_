import React, {useState} from 'react';
import {Bell, Boxes, CalendarDays, ChartNoAxesCombined, ChevronLeft, ClipboardList, Gift, LayoutDashboard, LogOut, Menu, Moon, Package, Search, Settings, ShoppingBag, Sun, Truck, Users} from 'lucide-react';
import './admin-workspace.css';

export const modules = [
  ['stats','Dashboard','لوحة التحكم',LayoutDashboard],
  ['products','Products','المنتجات',Package],
  ['categories','Categories','الفئات',Boxes],
  ['inventory','Inventory','المخزون',Boxes],
  ['orders','Orders','الطلبات',ShoppingBag],
  ['customers','Customers','العملاء',Users],
  ['promotions','Discounts & Promotions','الخصومات والعروض',Gift],
  ['custom-requests','Custom Orders','الطلبات المخصصة',ClipboardList],
  ['workshops','Workshops','الورش',CalendarDays],
  ['kits','DIY Kits','أطقم الأعمال اليدوية',Gift],
  ['website','Website Content','محتوى الموقع',LayoutDashboard],
  ['reports','Sales Reports','تقارير المبيعات',ChartNoAxesCombined],
  ['settings','Delivery & WhatsApp','التوصيل وواتساب',Truck],
  ['account','Settings','الإعدادات',Settings],
];

export default function AdminWorkspace({tab,onTab,children,ar,setAr,dark,setDark,profile,onLogout,onRefresh,lowStock,busy}) {
  const [collapsed,setCollapsed] = useState(false);
  const [drawer,setDrawer] = useState(false);
  const [search,setSearch] = useState('');
  const l = (en,arabic) => ar ? arabic : en;
  const selected = modules.find(([id]) => tab === id);
  function change(id) {onTab(id);setDrawer(false);setSearch('');}
  return <div data-commerce className={'erp-shell' + (collapsed ? ' erp-collapsed' : '')} dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'}>
    {drawer && <button className="erp-scrim" aria-label={l('Close menu','إغلاق القائمة')} onClick={() => setDrawer(false)}/>}
    <aside className={'erp-sidebar' + (drawer ? ' erp-drawer-open' : '')}>
      <div className="erp-brand"><span>Sparkle</span><button type="button" onClick={() => {setCollapsed(!collapsed);setDrawer(false);}} aria-label={l('Toggle sidebar','تبديل القائمة')}><ChevronLeft size={18}/></button></div>
      <div role="navigation" aria-label={l('Admin sections','أقسام الإدارة')}>
        {modules.map(([id,en,arabic,Icon]) => <button type="button" key={id} onClick={() => change(id)}
          title={l(en,arabic)} aria-label={l(en,arabic)} aria-current={id === tab ? 'page' : undefined}>
          <Icon size={18} aria-hidden="true"/><span>{l(en,arabic)}</span>
        </button>)}
      </div>
    </aside>
    <div className="erp-body">
      <header className="erp-top">
        <button type="button" className="erp-menu" onClick={() => setDrawer(!drawer)} aria-expanded={drawer} aria-label={l('Open menu','فتح القائمة')}><Menu size={20}/></button>
        <form role="search" className="erp-search" onSubmit={event => {
          event.preventDefault();
          const text = search.trim().toLowerCase();
          const result = text && modules.find(([,en,arabic]) => en.toLowerCase().includes(text) || arabic.includes(text));
          if (result) change(result[0]);
        }}><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder={l('Find a module…','ابحثي عن قسم…')} aria-label={l('Find a module','ابحثي عن قسم')}/></form>
        <button type="button" onClick={() => change('inventory')} aria-label={l('Low-stock notifications','تنبيهات المخزون')}><Bell size={17}/>{lowStock > 0 && <span>{lowStock}</span>}</button>
        <button type="button" onClick={() => setAr(!ar)} aria-label={l('Switch to Arabic','التبديل إلى الإنجليزية')}>{ar ? 'EN' : 'ع'}</button>
        <button type="button" onClick={() => setDark(!dark)} aria-label={l('Toggle dark mode','تبديل الوضع الداكن')}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>
        {profile && <span className="erp-account" dir="ltr">{profile.email}</span>}
        <button type="button" onClick={onLogout} aria-label={l('Sign out','تسجيل الخروج')}><LogOut size={17}/></button>
      </header>
      <main className="sparkle-admin erp-content">
        <div className="erp-page-head">
          <div><div className="erp-crumb"><button onClick={() => change('stats')}>Sparkle Admin</button><span aria-hidden="true">/</span>{l(selected[1],selected[2])}</div>
          <h1>{l(selected[1],selected[2])}</h1></div>
          <button type="button" className="button secondary" disabled={busy} onClick={onRefresh}>{l('Refresh','تحديث')}</button>
        </div>
        {children}
      </main>
    </div>
  </div>;
}
