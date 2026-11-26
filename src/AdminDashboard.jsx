import {orderReference} from './order-reference.js';
import React,{useState} from 'react';
import {ils} from './commerce-api.js';
import {AdminLanguage,useAdminText} from './AdminLocale.jsx';
import {Table} from './AdminModules.jsx';
import {priceRange} from './range-pricing.js';

const presets=[['today','Today','اليوم'],['yesterday','Yesterday','أمس'],['week','Last 7 days','آخر ٧ أيام'],
  ['month','This month','هذا الشهر'],['lastmonth','Last month','الشهر الماضي'],['year','This year','هذه السنة'],
  ['all','All time','كل الوقت'],['custom','Custom range','فترة مخصصة']];
const dateKey=date=>date.toISOString().slice(0,10);
function dates(preset) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hebron',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [year,month,day]=today.split('-').map(Number);
  const date=(y,m,d)=>dateKey(new Date(Date.UTC(y,m-1,d)));
  if(preset==='today')return {from:today,to:today};
  if(preset==='yesterday'){const yesterday=date(year,month,day-1);return {from:yesterday,to:yesterday};}
  if(preset==='week')return {from:date(year,month,day-6),to:today};
  if(preset==='month')return {from:date(year,month,1),to:today};
  if(preset==='lastmonth')return {from:date(year,month-1,1),to:date(year,month,0)};
  if(preset==='year')return {from:date(year,1,1),to:today};
  return {from:'',to:''};
}
export function DateFilters({range,setRange}) {
  const ar=React.useContext(AdminLanguage), l=(en,arabic)=>ar?arabic:en;
  const [preset,setPreset]=useState(()=>range.from || range.to?'custom':'all');
  const [draft,setDraft]=useState(range);
  return <form className="erp-filters" onSubmit={event=>{event.preventDefault();setRange(draft);}}>
    <label>{l('Date period','الفترة')}<select value={preset} onChange={event=>{
      const value=event.target.value;setPreset(value);
      if(value!=='custom'){const next=dates(value);setRange(next);setDraft(next);}
    }}>{presets.map(([id,en,arabic])=><option key={id} value={id}>{l(en,arabic)}</option>)}</select></label>
    {preset==='custom' && <>
      <label>{l('From','من')}<input type="date" max={draft.to || undefined} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
      <label>{l('To','إلى')}<input type="date" min={draft.from || undefined} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
      <button className="button secondary">{l('Apply dates','تطبيق التواريخ')}</button>
    </>}
  </form>;
}
const displayTotal = row=>row.total==null ? row.estimatedMin==null?'—':priceRange(row.estimatedMin,row.estimatedMax) : ils(row.total);
const amount = value=>value==null?'—':ils(value);

function SalesChart({days}) {
  const ar=React.useContext(AdminLanguage), l=(en,arabic)=>ar?arabic:en;
  const recent=days.slice(-14);
  const max=Math.max(1,...recent.map(row=>Math.max(row.sales,row.revenue)));
  return <section className="erp-dashboard-panel">
    <h2>{l('Sales and collections','المبيعات والتحصيل')}</h2>
    {recent.length===0 ? <p>{l('No orders in this period. Sales and collections will appear here.','لا توجد طلبات في هذه الفترة. ستظهر المبيعات والتحصيل هنا.')}</p> :
      <div className="erp-chart"><small>{l('Last 14 days with order activity · confirmed sales / collected COD','آخر ١٤ يوماً لها طلبات · المبيعات المؤكدة / الدفع المحصّل')}</small>
      {recent.map(row=><div className="erp-chart-row" key={row.day}><time>{row.day}</time><div className="erp-bars">
        <meter aria-label={l('Confirmed sales','المبيعات المؤكدة')} min={0} max={max} value={row.sales}/>
        <meter className="erp-bar-cash" aria-label={l('Collected revenue','الإيرادات المحصّلة')} min={0} max={max} value={row.revenue}/>
      </div><bdi>{ils(row.sales)} / {ils(row.revenue)}</bdi></div>)}</div>}
  </section>;
}
export function Dashboard({data,onTab}) {
  const ar=React.useContext(AdminLanguage),t=useAdminText(),l=(en,arabic)=>ar?arabic:en;
  const {stock,margin,statuses}=data;
  const metrics=[
    ['Total orders','إجمالي الطلبات',data.orders,'orders'],
    ['Pending orders','الطلبات المعلّقة',statuses.Pending ?? 0,'orders',{status:'Pending'}],
    ['Confirmed sales','المبيعات المؤكدة',ils(data.sales),'reports'],
    ['Collected revenue','الإيرادات المحصّلة',ils(data.revenue),'orders',{paid:'true'}],
    ['Outstanding COD','الدفع عند الاستلام غير المحصّل',ils(data.outstanding),'orders',{paid:'false',group:'confirmed'}],
    ['Delivered orders','الطلبات المسلّمة',statuses.Delivered ?? 0,'orders',{status:'Delivered'}],
    ['Cancelled orders','الطلبات الملغاة',statuses.Cancelled ?? 0,'orders',{status:'Cancelled'}],
    ['Total customers','إجمالي العملاء',data.customers,'customers'],
    ['Published products','المنتجات المنشورة',stock.published,'products',{publication:'Published'}],
    ['Low-stock products','منتجات منخفضة المخزون',stock.low,'inventory',{stock:'Low stock'}],
    ['Out-of-stock products','منتجات نفدت من المخزون',stock.sold_out,'inventory',{stock:'Sold out'}],
    ['Gross profit','الربح الإجمالي',amount(margin.gross),'reports']
  ];
  return <div className="erp-dashboard">
    <div className="erp-quick-actions">{[
      ['Create product','إنشاء منتج','products',{create:true}],['Manage orders','إدارة الطلبات','orders'],
      ['Create promotion','إنشاء عرض','quantity-promotions',{create:true}],['Update inventory','تحديث المخزون','inventory']
    ].map(([en,arabic,id,filter])=><button className="button secondary" key={id} onClick={()=>onTab(id,filter)}>{l(en,arabic)}</button>)}</div>
    <dl className="erp-kpis">{metrics.map(([en,arabic,value,id,filter])=><div key={en}>
      <dt><button type="button" onClick={()=>onTab(id,filter)}>{l(en,arabic)}</button></dt><dd><bdi>{value}</bdi></dd>
    </div>)}</dl>
    <p className="erp-muted">{l('The date filter applies to orders and sales. Customer and inventory counts show current totals.','ينطبق فلتر التاريخ على الطلبات والمبيعات. تعرض أعداد العملاء والمخزون الإجماليات الحالية.')}</p>
    {margin.gross==null && margin.lines>0 && <p className="erp-muted">{l('Gross profit unavailable. Costs recorded for','الربح الإجمالي غير متاح. التكاليف مسجّلة لـ')} {margin.costed}/{margin.lines} {l('confirmed item lines.','من بنود الطلبات المؤكدة.')}</p>}
    <div className="erp-dashboard-pair"><SalesChart days={data.days}/>
      <section className="erp-dashboard-panel"><h2>{l('Order status','حالات الطلبات')}</h2>
        {data.orders ? <ul className="erp-simple-list">{Object.entries(statuses).map(([status,count])=><li key={status}>
          <button type="button" onClick={()=>onTab('orders',{status})}>{t(status)}</button><meter min={0} max={data.orders} value={count} aria-label={t(status)}/><bdi>{count}</bdi>
        </li>)}</ul>:<p>{l('No orders in this period.','لا توجد طلبات في هذه الفترة.')}</p>}
      </section></div>
    <div className="erp-dashboard-pair">
      <section className="erp-dashboard-panel"><h2>{l('Best-selling products','المنتجات الأكثر مبيعاً')}</h2>
        {data.best.length ? <ul className="erp-simple-list">{data.best.map(row=><li key={row.key}>{(ar && row.name_ar) || row.name} <bdi>{row.units}</bdi></li>)}</ul>:<p>{l('Confirmed product sales will appear here.','ستظهر هنا مبيعات المنتجات المؤكدة.')}</p>}
      </section>
      <section className="erp-dashboard-panel"><h2>{l('Stock alerts','تنبيهات المخزون')}</h2>
        {data.alerts.length ? <ul className="erp-simple-list">{data.alerts.map(row=><li key={row.slug}>
          <button onClick={()=>onTab('inventory',{search:row.slug})}>{(ar && row.name_ar) || row.name}</button><bdi>{row.units}</bdi></li>)}</ul> :
          <p>{l('No verified stock is below its threshold.','لا توجد كميات مؤكدة دون حد التنبيه.')}</p>}
        <p>{l('Verified units','الوحدات المؤكدة')} <bdi>{stock.units}</bdi> · {l('Tracked without a count','منتجات متتبّعة بلا جرد')} <bdi>{stock.unverified}</bdi> · {l('Untracked or made to order','دون تتبّع أو حسب الطلب')} <bdi>{stock.untracked}</bdi></p>
      </section>
    </div>
    <section className="erp-dashboard-panel"><h2>{l('Recent orders','أحدث الطلبات')}</h2>
      {data.recent.length ? <Table headers={['Order','Status','Total','Action']} rows={data.recent.map(row=>{
        const reference=orderReference(row.reference,row.referenceFormat);
        return [row.reference,reference,t(row.status),displayTotal(row),<button className="button secondary" onClick={()=>onTab('orders',{search:reference})}>{l('Open','فتح')}</button>];
      })}/>:<p>{l('New orders will appear here after checkout.','ستظهر الطلبات الجديدة هنا بعد إتمام الطلب.')}</p>}
    </section>
  </div>;
}
export function BackOfficeReports({data}) {
  const ar=React.useContext(AdminLanguage),l=(en,arabic)=>ar?arabic:en;
  const [dimension,setDimension]=useState('day');
  const rows=dimension==='day'?data.days:data.breakdown.filter(row=>row.dimension===dimension);
  const labels=dimension==='day' ? ['Date','Orders','Confirmed','Cancelled','Confirmed sales','Collected revenue','Outstanding COD']
    : ['Name','Units sold','Merchandise sales','Standard discounts','Quantity promotion discount','Gross profit'];
  const records=rows.map(row=>dimension==='day' ? [row.day,row.orders,row.confirmed,row.cancelled,row.sales/100,row.revenue/100,row.outstanding/100]
    : [(ar && row.name_ar) || row.name,row.units,row.sales/100,row.standard_discount/100,row.quantity_discount/100,row.gross==null?'':row.gross/100]);
  function csv(){
    const cell=value=>{
      const raw=String(value ?? '');
      const safe=typeof value==='string' && /^[=+@\-\t\r\n]/.test(raw)? "'"+raw:raw;
      return '"'+safe.replaceAll('"','""')+'"';
    };
    const content=[labels,...records].map(row=>row.map(cell).join(',')).join('\r\n');
    const href=URL.createObjectURL(new Blob(['\uFEFF',content],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=href;link.download='sparkle-sales-'+dimension+'.csv';link.click();
    setTimeout(()=>URL.revokeObjectURL(href),1000);
  }
  return <div className="erp-dashboard">
    <SalesChart days={data.days}/>
    <section className="erp-dashboard-panel"><h2>{l('Discounts and profit','الخصومات والأرباح')}</h2>
      <p>{l('Standard discounts','الخصومات العادية')} <bdi>{ils(data.margin.standard_discount)}</bdi> · {l('Quantity promotions','عروض الكمية')} <bdi>{ils(data.margin.quantity_discount)}</bdi></p>
      <p>{data.margin.promoted_orders} {l('orders with a quantity offer','طلبات بعرض كمية')} · {data.margin.discounted_units} {l('units discounted','وحدات مخفّضة')}</p>
      <p>{l('Gross profit','الربح الإجمالي')} <bdi>{amount(data.margin.gross)}</bdi> · {l('Item lines with recorded cost','البنود ذات التكلفة المسجّلة')} {data.margin.costed}/{data.margin.lines}</p>
      <p>{l('Gross profit uses confirmed merchandise sales before delivery and operating expenses. Order-level direct costs are shown in Orders.','يُحسب الربح الإجمالي من مبيعات المنتجات المؤكدة قبل مصاريف التوصيل والتشغيل. تظهر التكاليف المباشرة للطلب في قسم الطلبات.')}</p>
    </section>
    <section className="erp-dashboard-panel"><div className="commerce-actions">
      <label>{l('Group sales by','تجميع المبيعات حسب')}<select value={dimension} onChange={e=>setDimension(e.target.value)}>
        {[[ 'day','Date','التاريخ'],['product','Product','المنتج'],['category','Category','الفئة'],['variant','Variant','المتغير']].map(([id,en,arabic])=>
          <option key={id} value={id}>{l(en,arabic)}</option>)}</select></label>
      <button className="button secondary" onClick={csv} disabled={!rows.length}>{l('Export CSV','تصدير CSV')}</button>
    </div>{records.length ? <Table headers={labels} rows={records.map((row,index)=>[index,...row.map((value,i)=>
      i>= (dimension==='day'?4:2) ? value===''?'—':ils(value*100) : value)])}/>:
        <p>{l('No sales to report in this period.','لا توجد مبيعات للتقرير في هذه الفترة.')}</p>}
    <p>{dimension==='day' ? l('Order totals include recorded delivery fees.','تتضمن إجماليات الطلبات رسوم التوصيل المسجّلة.') :
      l('Merchandise totals exclude delivery fees.','لا تتضمن إجماليات المنتجات رسوم التوصيل.')}</p>
    {dimension==='category' && <p>{l('Older orders without a category snapshot use the current product category.','الطلبات القديمة التي لا تحفظ الفئة تستخدم فئة المنتج الحالية.')}</p>}
    </section>
  </div>;
}
