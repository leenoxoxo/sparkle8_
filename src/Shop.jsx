import {PromotionBadge} from './quantity-promotions.jsx';
import React, {useState} from 'react';
import {Search, ShoppingBag} from 'lucide-react';
import {useCart} from './Cart.jsx';
import {sortProducts} from './product-sorting.js';
import './shop.css';
import {cloudImageProps} from './cloud-image.js';

const sections = [['all','All Products','كل المنتجات'],['ready','Ready-made','المنتجات الجاهزة'],['kits','DIY Kits','أطقم الأعمال اليدوية'],['cakes','Fake Cake Boxes','علب كيك وهمية']];
const searchText = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();

export default function Shop({products,categories,status,lang,t,navigate,retry,kitGuide}) {
  const ar = lang === 'ar';
  const l = (en,arabic) => ar ? arabic : en;
  const group = new URLSearchParams(location.search).get('tab');
  const tab = sections.some(([id]) => id === group) ? group : 'all';
  const [query,setQuery] = useState('');
  const [selected,setSelected] = useState({tab:'',name:''});
  const [sort,setSort] = useState('default');
  const [notice,setNotice] = useState('');
  const category = selected.tab === tab ? selected.name : '';
  const visibleCats = categories.filter(row => row.section === tab && !row.parent);
  const cakeCategory = categories.find(row => row.section_intro);
  const cakeFilters = visibleCats.filter(row=>!row.section_intro || categories.some(child=>child.parent===row.name));
  const nested = categories.filter(row => row.parent === category);
  const current = categories.find(row => row.name === category);
  const filters = current?.parent ? categories.filter(row => row.parent === current.parent) : nested;
  const filtered = products.filter(product => {
    const assigned = categories.find(row => row.name === product.category);
    const section = assigned?.section || (product.kind === 'kit' ? 'kits' : 'ready');
    const queryValues = [product.name,product.nameAr,product.description,product.descriptionAr,product.category,
      ...((product.variants || []).flatMap(option => [option.name,option.nameAr]))];
    return (tab === 'all' || section === tab) && (!category || (tab === 'kits' && category === '@' + product.slug) ||
      product.category === category || assigned?.parent === category) &&
      queryValues.some(value => searchText(value).includes(searchText(query.trim())));
  });
  const sorted = sort === 'availability' ? [...filtered].sort((a,b) =>
    Number(Boolean(b.purchasable || b.variants?.some(option => option.purchasable))) -
    Number(Boolean(a.purchasable || a.variants?.some(option => option.purchasable)))) : sortProducts(filtered,sort);
  const select = name => setSelected({tab,name});
  function link(event,href) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();navigate(href);
  }
  const filterButton = (id,label,image) => <button type="button" key={id} aria-pressed={category === id} onClick={() => select(id)}>
    {image && <img src={image} alt="" loading="lazy"/>}{label}</button>;
  return <main className="unified-shop" data-commerce>
    <div className="shop-breadcrumb" role="navigation" aria-label={l('Breadcrumb','مسار الصفحة')}>
      <a href="/" onClick={event=>link(event,'/')}>{t('Home')}</a><span aria-hidden="true">/</span><span aria-current="page">{t('Shop')}</span>
    </div>
    <h1>{t('Shop')}</h1>
    <div className="shop-controls">
      <label className="shop-search"><Search size={19} aria-hidden="true"/><input type="search" value={query}
        onChange={event=>setQuery(event.target.value)} placeholder={l('Search…','بحث…')} aria-label={l('Search products','البحث عن المنتجات')}/></label>
      <label className="shop-sort-field">{l('Sort by','الترتيب حسب')}<select value={sort} onChange={event=>setSort(event.target.value)}>
        {[
          ['default','Featured','المميزة'],['price-asc','Price: low to high','السعر من الأقل إلى الأعلى'],
          ['price-desc','Price: high to low','السعر من الأعلى إلى الأقل'],['newest','Newest','الأحدث'],
          ['availability','Availability','التوفر']
        ].map(([value,en,arabic])=><option value={value} key={value}>{l(en,arabic)}</option>)}
      </select></label>
    </div>
    <div className="shop-tabs" role="navigation" aria-label={l('Shop sections','أقسام المتجر')}>
      {sections.map(([id,en,arabic]) => {
        const href = id === 'all' ? '/shop' : '/shop?tab=' + id;
        return <a key={id} aria-current={tab === id ? 'page' : undefined} href={href} onClick={event=>link(event,href)}>{l(en,arabic)}</a>;
      })}
    </div>
    {tab === 'cakes' && cakeCategory && <section className="shop-cake-intro" aria-labelledby="cake-intro-title">
      <h2 id="cake-intro-title">{ar ? cakeCategory.name_ar || cakeCategory.name : cakeCategory.name}</h2>
      <p>{ar ? cakeCategory.description_ar || cakeCategory.description : cakeCategory.description}</p>
    </section>}
    {tab !== 'all' && (tab !== 'cakes' || cakeFilters.length > 0) && <div className="shop-filters" aria-label={l('Filter by category','تصفية حسب الفئة')}>
      {filterButton('',l('All','الكل'))}
      {(tab === 'cakes' ? cakeFilters : visibleCats.filter(row=>tab !== 'kits' || visibleCats.length > 1 ||
        categories.some(child=>child.parent===row.name))).map(row=>filterButton(row.name,ar ? row.name_ar || row.name : row.name,row.image))}
      {tab === 'kits' && products.filter(product=>product.kind==='kit').map(product=>filterButton('@'+product.slug,t(product.name)))}
    </div>}
    {filters.length > 0 && <div className="shop-filters" aria-label={l('Subcategories','الفئات الفرعية')}>
      {current?.parent && filterButton(current.parent,l('All in category','كل منتجات الفئة'))}
      {filters.map(row=>filterButton(row.name,ar ? row.name_ar || row.name : row.name,row.image))}
    </div>}
    <div className="shop-result-count" aria-live="polite">{status === 'ready' && l(sorted.length + ' products',sorted.length + ' منتج')}</div>
    {status === 'loading' && <p role="status">{l('Loading products…','جارٍ تحميل المنتجات…')}</p>}
    {status === 'error' && <p role="alert">{l('The shop is temporarily unavailable.','المتجر غير متاح مؤقتاً.')} <button type="button" className="button secondary" onClick={retry}>{l('Try again','حاولي مجدداً')}</button></p>}
    {status === 'ready' && !sorted.length && <div className="shop-empty"><p>{l('No products match your filters.','لا توجد منتجات تطابق الفلاتر.')}</p>
      <button className="button secondary" onClick={()=>{setQuery('');select('');}}>{l('Clear filters','مسح الفلاتر')}</button></div>}
    <div className="shop-compact-grid">{sorted.map((product,index)=><ShopCard key={product.slug}
      product={product} index={index} lang={lang} t={t} link={link} onAdded={setNotice}/>)}</div>
    <p className="shop-sr" role="status">{notice}</p>
    {tab === 'kits' && kitGuide}
  </main>;
}

export function ShopCard({product,index=0,lang,t,link,onAdded,lazy=false}) {
  const cart=useCart();
  const l=(en,ar)=>lang==='ar'?ar:en;
      const href='/shop/'+product.slug;
      const options=Boolean(product.variants?.length || product.kitOptions?.length);
      const buy=cart && product.purchasable && !options;
      const priceLabel=product.kind==='kit' && product.priceMode==='quote' ? l('Custom quotation','عرض سعر مخصص') : t(product.price);
      return <article key={product.slug} className="shop-compact-card">
        <a href={href} onClick={event=>link(event,href)} aria-label={t(product.name)} className="shop-compact-image">
          {product.image ? <img {...cloudImageProps(product.image,[320,640],'(max-width: 650px) 47vw, 25vw')} alt="" loading={!lazy && index<2?'eager':'lazy'} decoding="async"/> : <span aria-hidden="true">{product.icon}</span>}
          {product.discountPercent > 0 && <span className="shop-discount"><bdi>−{product.discountPercent}%</bdi></span>}
        </a>
        <div className="shop-compact-copy">
          <span className={'shop-stock'+(product.status==='Sold Out'?' sold':'')}>{t(product.status)}</span>
          <h2><a href={href} onClick={event=>link(event,href)}>{t(product.name)}</a></h2>
          {product.kind==='kit' && <><p className="shop-kit-description">{t(product.description)}</p><small>{product.kitPieces
            ? l(product.kitPieces === 1 ? '1 piece' : product.kitPieces+' pieces',product.kitPieces === 1 ? 'قطعة واحدة' : product.kitPieces === 2 ? 'قطعتان' : product.kitPieces+' قطع')
            : l('3+ pieces','٣ قطع أو أكثر')}</small></>}
          <PromotionBadge promotion={product.quantityPromotion} lang={lang}/><div className="shop-card-prices"><strong><bdi dir={priceLabel?.includes('₪') ? 'ltr' : undefined}>{priceLabel}</bdi></strong>{product.originalPrice && <del><bdi dir="ltr">{product.originalPrice}</bdi></del>}</div>
          {buy ? <button type="button" className="button secondary" onClick={()=>{
            if(cart?.addItem(product.slug,null,1)) onAdded?.(l('Added to your cart','تمت الإضافة إلى السلة')+' · '+t(product.name));
          }}><ShoppingBag aria-hidden="true" size={15}/>{l('Add to Cart','أضيفي إلى السلة')}</button> :
            <a className="button secondary" href={href} onClick={event=>link(event,href)}>
              {product.status==='Sold Out' ? l('View Product','عرض المنتج') : options ? l('Choose Options','اختاري الخيارات') :
                product.kind==='kit' && product.priceMode==='quote' ? l('Request a Quote','اطلبي عرض سعر') : l('View Product','عرض المنتج')}</a>}
        </div>
      </article>;
}
