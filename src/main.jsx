import {PromotionBadge} from './quantity-promotions.jsx';
import { CartProvider, CartHeaderButton, CartDrawer, AddToCart } from './Cart.jsx';
import { ProductDetailPrice, ProductVariantSelector, ProductOptionSelector } from './ProductPresentation.jsx';
import Shop from './Shop.jsx';
import KitPiecePicker from './KitPiecePicker.jsx';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Camera, Menu, Moon, Sparkles, Sun, X } from 'lucide-react';
import './styles.css';
import {arabicTranslations} from './storefront-translations.js';
import { resolveProduct } from './product-route.js';
import ChatLauncher from './ChatLauncher.jsx';
import SeasonalStorefront from './SeasonalStorefront.jsx';
import StorefrontLoading,{SparkleWordmark} from './StorefrontLoading.jsx';
import {imageCatalog} from './image-catalog.js';
import {CART_KEY} from './cart-model.js';
import {storefrontWorkshops} from './workshops.js';
import Homepage,{OrderSteps,businessWhatsApp} from './Homepage.jsx';
import {defaultHomepage,localText} from './homepage-model.js';
import {api} from './commerce-api.js';

import {cloudImageProps} from './cloud-image.js';
import {cakeBoxDesigns} from './cake-box-designs.js';
import {cakeShop,rangeExplanation} from './range-pricing.js';
const PrivacyContent = React.lazy(() => import('./PrivacyContent.jsx'));
const Checkout = React.lazy(() => import('./Checkout.jsx'));
const OrderSuccess = React.lazy(() => import('./Checkout.jsx').then(module=>({default:module.OrderSuccess})));
const Admin = React.lazy(() => import('./Admin.jsx'));

const instagram = 'https://www.instagram.com/sparkle8_/?__pwa=1';
const CatalogContext = React.createContext({products: [], status: 'loading'});
const TranslationContext = React.createContext({ lang: 'en', t: (value) => value });
function useT() { return React.useContext(TranslationContext); }
function translate(value, lang) { return lang === 'ar' ? (arabicTranslations[value] || value) : value; }
Object.assign(arabicTranslations, {
  'Bring the Sparkle experience home with our DIY Japanese Cream Kits. Choose your piece, decorate it your way, and create something that\'s completely yours.': 'خذي تجربة سباركل إلى منزلك مع أطقم الكريمة اليابانية. اختاري قطعتك وزينيها بطريقتك واصنعي شيئاً لك تماماً.',
  'Have something special in mind? Tell us what you\'re imagining and we\'ll help turn your idea into a Sparkle creation made just for you.': 'هل لديك فكرة مميزة؟ أخبرينا بما تتخيلين وسنساعدك في تحويلها إلى إبداع من سباركل صُنع خصيصاً لك.',
  'A simple four-step way to bring a little Sparkle home.': 'أربع خطوات بسيطة لتحضري القليل من سباركل إلى منزلك.'
});
const englishTranslations = Object.fromEntries(Object.entries(arabicTranslations).map(([english, arabic]) => [arabic, english]));
function translateVisibleText(language) { const dictionary = language === 'ar' ? arabicTranslations : englishTranslations; const entries=Object.entries(dictionary).sort(([a],[b])=>b.length-a.length); const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode); nodes.forEach(node => { const value = node.nodeValue; if (!value || !value.trim() || node.parentElement?.closest('[data-commerce]')) return; const translated = entries.reduce((text,[source,target])=>text.includes(source)?text.split(source).join(target):text,value); if (translated !== value) node.nodeValue = translated; }); const heroHeading = document.querySelector('.hero h1'); if (heroHeading) heroHeading.innerHTML = language === 'ar' ? '<span>اصنعي شيئاً</span><br><em>يشبهك</em><br><span>تماماً</span>' : 'Create<br>Something<br><em>That Feels</em><br>Like You'; }
// Existing URLs are resolved through aliases when color variants share a card.

Object.assign(arabicTranslations, {'Loading shop…':'جارٍ تحميل المتجر…','Shop temporarily unavailable':'المتجر غير متاح مؤقتاً','Request a custom order':'اطلبي تصميماً مخصصاً','Checkout':'إتمام الطلب','Complete checkout with Cash on Delivery.':'أكملي الطلب مع الدفع عند الاستلام.','Send your saved order in WhatsApp so Sparkle can confirm it.':'أرسلي طلبك المحفوظ في واتساب لتؤكده سباركل.','Back to Products':'العودة إلى المنتجات', 'Product not found':'المنتج غير موجود'});

function storefrontPath(href) {
  const path = new URL(href,location.origin).pathname.replace(/\/$/,'');
  if (path === '/diy-kits') return '/shop?tab=kits';
  if (path === '/custom-orders') return cakeShop;
  if (/^\/products\/fake-cake-box-\d{2}$/.test(path)) return '/shop/fake-cake-box';
  return href;
}
const initialPath = location.pathname + location.search + location.hash;
const canonicalPath = storefrontPath(initialPath);
if (initialPath !== canonicalPath) history.replaceState(history.state,'',canonicalPath);

function usePath() { return window.location.pathname.replace(/\/$/, '') || '/'; }
const routeScrollPositions = new Map();
function routeEntry() {
  if (!window.history.state?.sparkleEntry) window.history.replaceState({...window.history.state, sparkleEntry: crypto.randomUUID()}, '', window.location.href);
  return { path: usePath(), key: window.history.state.sparkleEntry };
}
function navigate(path,{replace=false}={}) {
  const entry = routeEntry();
  routeScrollPositions.set(entry.key, {left:window.scrollX, top:window.scrollY});
  window.history[replace?'replaceState':'pushState']({sparkleEntry:crypto.randomUUID()}, '', storefrontPath(path));
  window.dispatchEvent(new PopStateEvent('popstate'));
}
function RouteScrollRestoration({ entryKey }) {
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useLayoutEffect(() => {
    const position = routeScrollPositions.get(entryKey) || {top:0, left:0};
    window.scrollTo({...position, behavior:'instant'});
    const remember = () => routeScrollPositions.set(entryKey, {top:window.scrollY, left:window.scrollX});
    window.addEventListener('scroll', remember, {passive:true});
    return () => window.removeEventListener('scroll', remember);
  }, [entryKey]);
  return null;
}
function ImageCarousel({ images, alt, href, slideLinks, initialIndex = 0, onIndexChange, autoplay = false, optimized = false }) {
  const {lang}=useT();
  const l=(en,ar)=>lang==='ar'?ar:en;
  const viewer=useRef(null);
  const [fullImage,setFullImage]=useState(null);
  useLayoutEffect(()=>{
    if(fullImage && !viewer.current.open) viewer.current.showModal();
  },[fullImage]);
  const [index, setIndex] = useState(() => Math.min(initialIndex, images.length - 1));
  const activeHref = slideLinks?.[index] || href;
  const [drag, setDrag] = useState(0);
  const gesture = useRef(null);
  const suppress = useRef(false);
  const multiple = images.length > 1;
  const [interaction, setInteraction] = useState(0);
  useEffect(() => {
    if (!autoplay || !multiple) return;
    const timer = window.setInterval(() => {
      if (!gesture.current && !document.hidden) { const next = (index + 1) % images.length; setIndex(next); onIndexChange?.(next); }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [autoplay, multiple, images.length, index, interaction]);
  const move = next => { setInteraction(value => value + 1); setDrag(0); const selected = Math.max(0, Math.min(images.length - 1, next)); setIndex(selected); onIndexChange?.(selected); };
  const finish = (e, cancel = false) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const horizontal = Math.abs(dx) > Math.abs(e.clientY - g.y);
    suppress.current = suppress.current || Math.abs(dx) > 8 || Math.abs(e.clientY - g.y) > 8;
    if (!cancel && horizontal && Math.abs(dx) > Math.min(60, g.width * .15)) move(index + (dx < 0 ? 1 : -1));
    gesture.current = null; setDrag(0);
  };
  return <div className={autoplay ? "image-carousel image-carousel-autoplay" : "image-carousel"} role="region" aria-roledescription="carousel" aria-label={alt} tabIndex={multiple ? 0 : undefined}
    onKeyDown={e => { if (['ArrowRight', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); move(index + (e.key === 'ArrowRight' ? 1 : -1)); } }}
    onPointerDown={e => { suppress.current = false; if (multiple && e.button === 0 && !e.target.closest('button')) gesture.current = { id:e.pointerId, x:e.clientX, y:e.clientY, width:e.currentTarget.clientWidth }; }}
    onPointerMove={e => { const g = gesture.current; if (!g || g.id !== e.pointerId) return; const dx = e.clientX - g.x; if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - g.y)) { suppress.current = true; e.currentTarget.setPointerCapture(e.pointerId); setDrag((index === 0 && dx > 0) || (index === images.length - 1 && dx < 0) ? dx * .2 : dx); } }}
    onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)} onLostPointerCapture={event => { if (event.target === event.currentTarget) { gesture.current = null; setDrag(0); } }}
    onClickCapture={e => { if (suppress.current && !e.target.closest('button')) { e.preventDefault(); e.stopPropagation(); suppress.current = false; } }}>
    <div className="carousel-track" style={{transform:'translateX(calc(' + (-index * 100) + '% + ' + drag + 'px))', transition:drag ? 'none' : undefined}}>
      {images.map((src, i) => <div className="carousel-slide" key={src + i} aria-hidden={i !== index}>{(Math.abs(i-index)<=1) && <img className="art-photo" {...cloudImageProps(src,[320,640,960],'(max-width: 720px) 94vw, 48vw')} alt={alt + (multiple ? ' — ' + (i + 1) + '/' + images.length : '')} draggable="false" loading={optimized && i===index ? 'eager' : 'lazy'} decoding="async"/>}</div>)}
    </div>
    {optimized && !activeHref && <>
      <button type="button" className="carousel-original" onClick={()=>setFullImage(images[index])}
        aria-label={l('View full-size image','عرض الصورة بالحجم الكامل')}>↗</button>
      <dialog ref={viewer} className="product-image-viewer" aria-label={alt} onClose={()=>setFullImage(null)}
        onClick={event=>{if(event.target===event.currentTarget)viewer.current.close();}}>
        {fullImage && <><button type="button" className="product-viewer-close" autoFocus
          onClick={()=>viewer.current.close()} aria-label={l('Close image','إغلاق الصورة')}><X aria-hidden="true"/></button>
          <img src={fullImage} alt={alt}/></>}
      </dialog>
    </>}
    {activeHref && <a className="carousel-product-link" href={activeHref} aria-label={alt} draggable="false" onClick={e => { e.preventDefault(); navigate(activeHref); }}/>}
    {multiple && <><button type="button" className="carousel-arrow carousel-prev" aria-label={l('Previous image','الصورة السابقة')} disabled={index === 0} onClick={() => move(index - 1)}>‹</button><button type="button" className="carousel-arrow carousel-next" aria-label={l('Next image','الصورة التالية')} disabled={index === images.length - 1} onClick={() => move(index + 1)}>›</button><div className="carousel-dots">{images.map((_, i) => <button type="button" key={i} className={i === index ? 'active' : ''} aria-label={l('Image ','الصورة ') + (i + 1)} aria-current={i === index ? 'true' : undefined} onClick={() => move(i)}/>)}</div></>}
    {(optimized || multiple) && <span className={optimized?'product-image-counter':'carousel-status'} aria-live="polite">{index + 1} / {images.length}</span>}
  </div>;
}
function ImageArt({ product, images, wide = false, label, src, alt, imageHref, slideLinks, initialIndex, onIndexChange, autoplay = false, optimized = false }) { const resolvedSrc = src || (label === 'A little world of cream & sparkle' ? imageCatalog.home[0] : label === 'Sparkle studio' || label === 'Sparkle cream decorating in progress' ? imageCatalog.about.story : label === 'Soft cream texture' ? imageCatalog.about.material : label === 'Custom Sparkle creation' ? imageCatalog.customOrders[0] : undefined); const photos = (images?.length ? images : product?.images?.length ? product.images : [resolvedSrc || product?.image]).filter(Boolean); return <div className={`image-art ${product?.tone || 'pink'} ${wide ? 'wide' : ''} ${photos.length ? 'has-image' : ''}`}>{photos.length > 0 && <ImageCarousel key={photos.join('|')} images={photos} alt={alt || label || product?.name || 'Sparkle creation'} href={imageHref} slideLinks={slideLinks} initialIndex={initialIndex} onIndexChange={onIndexChange} autoplay={autoplay} optimized={optimized}/>}<span className="art-star">✦</span><span className="img-shape img-sparkle shape-one">✦</span><span className="img-shape img-heart shape-two">♡</span><span className="img-shape img-sparkle shape-three">✧</span>{!photos.length && <span className="art-icon">{product?.icon || '🎀'}</span>}{!product && !slideLinks && <span className="art-label">{label || 'Sparkle creation'}</span>}</div>; }
function Button({ children, onClick, href, secondary = false, disabled = false }) {
  const isInternal = href && href.startsWith('/');
  const handleClick = (e) => {
    if (disabled) return;
    if (isInternal) {
      e.preventDefault();
      navigate(href);
    } else if (onClick) {
      onClick(e);
    }
  };
  return (
    <a
      className={`button ${secondary ? 'secondary' : ''} ${disabled ? 'disabled' : ''}`}
      aria-disabled={disabled}
      href={disabled ? undefined : href}
      target={!disabled && !isInternal && href?.startsWith('http') ? '_blank' : undefined}
      rel={!disabled && !isInternal && href?.startsWith('http') ? 'noreferrer' : undefined}
      onClick={handleClick}
    >
      {children}<ArrowUpRight size={16}/>
    </a>
  );
}
function cleanTitle(title) { return title.replace('A Little About Sparkle 🎀', '4 years of experience.').replace('Create It Yourself 🎀', 'Create It Yourself').replace('Made with a Little Sparkle ✨', 'Made with a Little Sparkle').replace('Made Your Way 💗', 'Made Your Way').replace('How to Order 💌', 'How to Order'); }
function FancyTitle({ title }) { const { lang, t } = useT(); const clean = cleanTitle(title); if (clean === 'Fake Cake Boxes' || clean === 'علب كيك وهمية') return lang === 'ar' ? <>علب <em>كيك</em> وهمية</> : <>Fake <em>Cake</em> Boxes</>; const accents = { '4 years of experience.': ['4 years of ', 'experience.'], 'Create It Yourself': ['Create It ', 'Yourself'], 'Made with a Little Sparkle': ['Made with a Little ', 'Sparkle'], 'Made Your Way': ['Made Your ', 'Way'], 'How to Order': ['How to ', 'Order'], "Let's Stay Sparkly ✨": ["Let's Stay ", 'Sparkly ✨'] }; const arabicAccents = { 'Create It Yourself': ['اصنعيها ', 'بنفسك'], 'Made with a Little Sparkle': ['صُنع بلمعة ', 'صغيرة'], 'Made Your Way': ['مصنوع ', 'بطريقتك'], 'How to Order': ['طريقة ', 'الطلب'] }; const parts = (lang === 'ar' ? arabicAccents : accents)[clean]; return parts ? <>{parts[0]}<em>{parts[1]}</em></> : t(title); }

function Header({ lang, setLang, dark, setDark, children }) { const [open, setOpen] = useState(false); const [showLanguageHint, setShowLanguageHint] = useState(true); const path = usePath(); const hintsAllowed = path !== '/' && !path.startsWith('/shop') && path !== '/checkout'; const { t } = useT(); const links = [['Home','/'],['Shop','/shop'],['Workshops','/workshops'],['About Us','/about'],['FAQs & Contact','/contact']]; useEffect(() => { setOpen(false); }, [path]); return <header className="header"><div className="nav-wrap"><button className="brand" onClick={() => navigate('/')}><SparkleWordmark/></button><nav className={open ? 'open' : ''}>{links.map(([label, href]) => <a className={(path === href || (href !== '/' && path.startsWith(href))) ? 'active' : ''} key={href} href={href} onClick={e => {e.preventDefault(); navigate(href);}}>{t(label)}</a>)}</nav><div className="nav-tools"><CartHeaderButton lang={lang}/>{children}<button className="mood-toggle" onClick={() => setDark(!dark)} aria-label={dark ? t('Switch to light mood') : t('Switch to dark mood')} title={dark ? t('Light mood') : t('Dark mood')}>{dark ? <Sun size={16}/> : <Moon size={16}/>}</button><div className="language-hint-wrap"><button className="lang-mini" aria-label={lang === 'en' ? 'عرض الموقع بالعربية' : 'View site in English'} onClick={() => { setLang(lang === 'en' ? 'ar' : 'en'); setShowLanguageHint(false); }}>{lang === 'en' ? 'ع' : 'EN'}</button>{hintsAllowed && showLanguageHint && lang === 'en' && <div className="language-hint" lang="ar" dir="rtl"><button className="language-hint-message" onClick={() => { setLang('ar'); setShowLanguageHint(false); }}>يمكنك تصفّح الموقع بالعربية — اضغط هنا</button><button className="language-hint-close" aria-label="إغلاق الرسالة" onClick={() => setShowLanguageHint(false)}>×</button></div>}</div><div className="menu-hint-wrap"><button className="menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t('Toggle menu')}>{open ? <X/> : <Menu/>}</button></div></div></div></header>; }
function Footer({lang,setLang}) {
  const {t}=useT();
  const l=(en,ar)=>lang==='ar'?ar:en;
  const route=(href,label)=><a key={href} href={href} onClick={event=>{
    if(event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
    event.preventDefault();navigate(href);
  }}>{label}</a>;
  return <footer className="sparkle-footer" data-commerce><div className="home-footer-inner">
    <div><button className="brand footer-brand" onClick={()=>navigate('/')}><Sparkles className="brand-mark" size={24} aria-hidden="true"/>Sparkle</button>
      <p>{l('Handmade Japanese Cream creations and creative experiences in Nablus.','إبداعات يدوية بالكريمة اليابانية وتجارب إبداعية في نابلس.')}</p></div>
    <div><strong>{l('Explore','استكشفي')}</strong>{[['/shop','Shop'],['/workshops','Workshops'],[cakeShop,'Fake Cake Boxes'],['/about','About Us']].map(([href,name])=>route(href,t(name)))}</div>
    <div><strong>{l('Help','المساعدة')}</strong>{route('/contact',l('FAQs','الأسئلة الشائعة'))}
      {route('/how-to-order',l('Delivery & Payment','التوصيل والدفع'))}{route('/privacy',l('Privacy Policy','سياسة الخصوصية'))}</div>
    <div><strong>{l('Contact','تواصلي معنا')}</strong><a href={instagram} target="_blank" rel="noreferrer">Instagram</a>
      <a href={businessWhatsApp} target="_blank" rel="noreferrer">{l('WhatsApp','واتساب')}</a>
      <div className="language"><button className={lang==='ar'?'selected':''} onClick={()=>setLang('ar')}>ع</button><button className={lang==='en'?'selected':''} onClick={()=>setLang('en')}>EN</button></div>
    </div>
  </div><div className="home-footer-bottom">© 2026 Sparkle · {t('All rights reserved.')}</div></footer>;
}

function SectionHead({ eyebrow, title, text, align = '' }) { const { t } = useT(); return <div className={`section-head ${align}`}><span className="eyebrow">{t(eyebrow)}</span><h2><FancyTitle title={title}/></h2>{text && <p>{t(text)}</p>}</div>; }
function ProductPrice({ product, detail = false }) {
  const { t } = useT();
  if (!product.discountPercent) return <strong className={detail ? 'detail-price' : undefined}><bdi>{t(product.price)}</bdi></strong>;
  return <div className={detail ? 'sale-price sale-price-detail' : 'sale-price'}>
    <span className="sale-badge">{t('50% off')}</span>
    <span className="sale-amounts"><del aria-label={t('Original price')}>{product.originalPrice}</del><strong aria-label={t('Sale price')}>{t(product.price)}</strong></span>
  </div>;
}
function ProductCard({ product }) { const { t } = useT(); const productHref = `/shop/${product.slug}`; return <article className="product-card"><ImageArt product={product} src={product.image} imageHref={productHref} alt={`${t(product.name)} ${t('handmade Japanese Cream creation')}`}/><div className="product-copy"><div className="product-meta"><span className={product.status === 'Sold Out' ? 'sold' : 'available'}>{t(product.status)}</span><span>{t(product.category)}</span></div><h3><a href={productHref} onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(productHref); }}>{t(product.name)}</a></h3><p>{t(product.description)}</p><div className="card-foot"><ProductPrice product={product}/><Button href={productHref} disabled={product.status === 'Sold Out'} secondary>{t(product.status === 'Sold Out' ? 'Sold Out' : 'View Details')}</Button></div></div></article>; }
function WorkshopCard({ workshop }) { const { t } = useT(); return <a className="workshop-card" href={`/workshops/${workshop.slug}`} onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(`/workshops/${workshop.slug}`); }}><div className="workshop-art">{workshop.image ? <img {...cloudImageProps(workshop.image,[320,640],'(max-width: 720px) 94vw, 250px')} loading="lazy" decoding="async" alt={`${t(workshop.name)} ${t('workshop')}`}/> : <span>{workshop.icon}</span>}<span className="img-shape img-sparkle shape-one">✦</span><span className="img-shape img-heart shape-two">♡</span><span className="img-shape img-sparkle shape-three">✧</span><small>{t(workshop.status)}</small></div><div><div className="product-meta"><span className={workshop.status === 'Fully booked' ? 'sold' : 'available'}>{t(workshop.status)}</span></div><h3>{t(workshop.name)}</h3><p>{t(workshop.description)}</p><div className="details"><span>◷ {t(workshop.time)}</span><span>⌖ {t(workshop.location)}</span><strong>{t(workshop.price)}</strong></div><span className="button secondary">{t('View Details')}<ArrowUpRight size={16}/></span></div></a>; }
function ImageGallery({ images, prefix }) { return <div className="image-gallery">{images.map((src, index) => <ImageArt key={src} src={src} alt={`${prefix} image ${index + 1}`} label={`${prefix} ${String(index + 1).padStart(2, '0')}`}/>)}</div>; }

function WorkshopMomentsGallery() {
  const { t } = useT();
  const images = imageCatalog.workshops.unassigned;
  const [active, setActive] = useState(0);
  const [ratios, setRatios] = useState({});
  useEffect(() => {
    let mounted = true;
    const loaders = images.map(src => {
      const image = new Image();
      image.onload = () => { if (mounted && image.naturalHeight) setRatios(previous => ({...previous, [src]: image.naturalWidth / image.naturalHeight})); };
      image.src = src;
      return image;
    });
    return () => { mounted = false; loaders.forEach(image => { image.onload = null; }); };
  }, [images]);
  return <div className="workshop-moments-wide" style={{'--moment-ratio': ratios[images[active]] || 'auto'}}>
    <ImageArt images={images} alt={t('Workshop collection')} onIndexChange={setActive} autoplay/>
  </div>;
}
function PageShell({ title, intro, children, eyebrow='Sparkle journal', hideHeading=false, className='' }) { const { t } = useT(); const gallery = title.startsWith('Made with a Little Sparkle') ? <div className="center"><Button href={instagram}>{t('See more on Instagram')}</Button></div> : title.startsWith('Workshops') ? <section className="shop-gallery"><SectionHead eyebrow="Workshop moments" title="Inside the Sparkle experience"/><WorkshopMomentsGallery/></section> : null; return <main className={('inner-page '+className).trim()}><div className="page-intro"><span className="eyebrow"><a href="/" onClick={e => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate('/'); }}>{t('Home')}</a> / {t(title)}</span>{!hideHeading && <h1 className={title === '4 years of experience.' ? 'experience-title' : ''}>{title === '4 years of experience.' ? <>{t('4 years of ')}<em>{t('experience.')}</em></> : <FancyTitle title={t(title)}/>}</h1>}{intro && <p>{t(intro)}</p>}</div>{children}{gallery}</main>; }
function About({experience}) { const {lang}=useT(); return <PageShell title={localText(experience ?? defaultHomepage().experience,lang) || (lang==='ar'?'عن سباركل':'About Sparkle')} intro="Sparkle started with one simple idea: everyday little things deserve to feel special too."><section className="story-grid"><ImageArt wide product={{tone:'peach',icon:'🧁'}} label="Sparkle cream decorating in progress"/><div><SectionHead eyebrow="Our story" title="A tiny studio with a big soft spot for details" text={'Sparkle is a Palestinian creative brand born from a love of cute details and handmade things.\n\nWe fell for Japanese Cream — the soft, frosting-like decoration that turns a plain piece into something dreamy — and wanted to bring that whole world closer to home.\n\nToday Sparkle is a little studio of ready-made creations, DIY Kits, workshops, and custom pieces made one at a time.'}/></div></section><section className="special-section"><SectionHead eyebrow="The Sparkle feeling" title="What Makes Sparkle Special"/><div className="feature-grid">{['Everything is decorated by hand, piece by piece.','Japanese Cream and fake cake are our whole world, not a side detail.','You can buy it ready, make it yourself, or create it with us in a workshop.','Every custom order is built around your own idea, colors, and style.'].map((x,i)=><div className="feature" key={x}><span>0{i+1}</span><p>{x}</p></div>)}</div></section><section className="cream-explain"><div><SectionHead eyebrow="The material" title="Japanese Cream" text="Japanese Cream is a soft decorative cream that's piped like cake frosting, then finished with pearls, bows, hearts, cherries, and tiny charms. Once it sets, it keeps that soft dreamy look for good."/></div><ImageArt product={{tone:'cream',icon:'🍒'}} label="Soft cream texture"/></section></PageShell>; }
Object.assign(arabicTranslations, {
  'Inside the box': 'داخل العلبة',
  'A closer look at the compartments and mirror.': 'نظرة أقرب على الأقسام الداخلية والمرآة.',
  'Pink box interior': 'العلبة الوردية من الداخل',
  'White box interior': 'العلبة البيضاء من الداخل'
});
function CakeBoxInterior() {
  const { t } = useT();
  return <section className="cake-box-interior"><SectionHead title="Inside the box" text="A closer look at the compartments and mirror."/><div className="cake-box-interior-photos">{[
    ['d8f39d5958836b3e6f7d2fc8253395abb88dd74fe70faf8c67a4cc285ab900cb', 'Pink box interior'],
    ['14514982b8bb81664899538de5f1c9de8e182929b88ee3b4585af9eda50364d2', 'White box interior']
  ].map(([key, label]) => <figure key={key}><img {...cloudImageProps('https://res.cloudinary.com/rwwyaibu/image/upload/sparkle/products/' + key + '.png',[320,640,960],'(max-width: 720px) 94vw, 48vw')} alt={t(label)} loading="lazy" decoding="async"/><figcaption>{t(label)}</figcaption></figure>)}</div></section>;
}
function ProductDisclosure({label,children}) {
  return <details className="product-disclosure">
    <summary><span>{label}</span><span className="product-disclosure-indicator" aria-hidden="true"/></summary>
    {children}
  </details>;
}
function ProductDetail({ product: baseProduct, backTo }) {
  const {products,status} = React.useContext(CatalogContext);
  const { t, lang } = useT();
  const l=(en,ar)=>lang==='ar'?ar:en;
  const options=useRef(null);
  const storageKey = 'sparkle-variant:' + (baseProduct?.slug || '') + ':' + (baseProduct?.defaultVariant || '');
  const [kitChoices,setKitChoices] = useState([]);
  const [photo,setPhoto] = useState(0);
  const [selections,setSelections] = useState({});
  const [variantId, setVariantId] = useState(() => { try { return sessionStorage.getItem(storageKey) || baseProduct?.defaultVariant; } catch { return baseProduct?.defaultVariant; } });
  const variants = baseProduct?.variants ?? [];
  const groups = baseProduct?.optionGroups ?? [];
  const selectedVariant = groups.length
    ? variants.find(option=>groups.every(group=>selections[group.id] && option.selections[group.id]===selections[group.id]))
    : variants.find(variant=>variant.id===variantId) || variants.find(variant=>variant.id===baseProduct?.defaultVariant);
  const product = selectedVariant ? {...baseProduct,...selectedVariant,name:baseProduct.name,slug:baseProduct.slug,
    image:selectedVariant.image || baseProduct.image,images:selectedVariant.images?.length ? selectedVariant.images :
      selectedVariant.image ? [selectedVariant.image] : baseProduct.images} : baseProduct;
  function focusMissingOption(){
    const input=options.current.querySelector('[data-option-missing] :is(button:enabled,select:enabled)');
    (input || options.current).focus();
  }
  function selectOption(id,value) {
    setPhoto(0);
    setSelections(current=>{
      if(id===null) return {};
      const next={...current};
      if(value) next[id]=value;
      else delete next[id];
      return next;
    });
  }
  const photoUrl = product?.images?.[photo];
  const design = product?.slug === 'fake-cake-box' && photoUrl
    ? cakeBoxDesigns.find(([hash,file])=>photoUrl.includes(hash) || photoUrl.endsWith('/'+encodeURIComponent(file))) : null;
  const selectVariant = id => { setPhoto(0); setVariantId(id); try { sessionStorage.setItem(storageKey,id); } catch {} };
 if (!product && !backTo && status !== 'ready') return <PageShell title={status === 'loading' ? 'Loading shop…' : 'Shop temporarily unavailable'}/>;
 if (!product) return <PageShell title="Product not found"><Button href={backTo || "/shop"}>Back to Products</Button></PageShell>;
  const details=product.details ?? [];
  const related=products.filter(p=>p.slug!==product.slug && p.kind===product.kind).slice(0,3);
  const availability=groups.length && !selectedVariant && baseProduct.purchasable
    ? l('Select options to check availability','اختاري الخيارات للتحقق من التوفر')
    : product.status==='Available to order' && !product.purchasable
      ? l('Availability on inquiry','التوفر عند الاستفسار') : t(product.status);
  return <PageShell title={product.name} hideHeading className="product-page">
  <div className="detail-grid product-detail-grid">
    <div className="product-image-column"><ImageArt wide optimized product={product} src={product.image} alt={t(product.name) + ' ' + t('handmade Japanese Cream creation')} label={t(product.name)} onIndexChange={setPhoto}/></div>
    <div className="detail-copy product-information" data-commerce>
      <ProductDetailPrice product={product} t={t} lang={lang}/>
      <h1>{t(product.name)}</h1>
      <PromotionBadge promotion={product.quantityPromotion} lang={lang} details/>
      {product.priceMode === 'range' && <p data-commerce>{(lang === 'ar' ? product.pricingExplanationAr : product.pricingExplanation) || rangeExplanation[lang]}</p>}
      <div className="product-selections" ref={options} tabIndex={-1}>
      {variants.length>0 && (groups.length ? <ProductOptionSelector groups={groups} variants={variants} selections={selections} onChange={selectOption} lang={lang}/> : <ProductVariantSelector variants={variants} selected={selectedVariant} onSelect={selectVariant} t={t} lang={lang}/>)}
      {product.kind==='kit' && product.kitOptions?.length>0 && <div className="kit-options" data-commerce>
        <strong>{lang==='ar'?'اختاري القطع للتزيين':'Choose your pieces to decorate'}</strong>
        {Array.from({length:product.kitPieces || 1},(_,index)=><KitPiecePicker key={index}
          label={l('Piece','القطعة')+' '+(index+1)} placeholder={l('Select a piece','اختاري قطعة')}
          choices={product.kitOptions} value={kitChoices[index]} translate={t} onChange={choice=>{
            const values=Array.from({length:product.kitPieces || 1},(_,i)=>kitChoices[i] || '');
            values[index]=choice;setKitChoices(values);
          }}/>)}
      </div>}
      </div>
      <span aria-live="polite" className={'product-availability ' + (product.purchasable ? 'available' : 'sold')}>{availability}</span>
      <div className="product-purchase">
        <AddToCart product={baseProduct} variant={selectedVariant} lang={lang} kitChoices={kitChoices}
          whatsapp={businessWhatsApp} onMissingOptions={focusMissingOption}/>
      </div>
      <ProductDisclosure label={l('Description','الوصف')}><div className="product-description">
        <p>{t(product.description)}</p>{product.fullDescription && <p>{t(product.fullDescription)}</p>}
      </div></ProductDisclosure>
      <ProductDisclosure label={l('Details and ordering','التفاصيل وطريقة الطلب')}>
      {product.collection && <p className="product-collection">{l(t(product.collection)+' Collection','المجموعة: '+t(product.collection))}</p>}
      <div className="detail-list">{details.map(detail => <span key={detail}>✦ {t(detail)}</span>)}</div>
      {product.kind==='kit' && <div className="detail-list">
        {!!product.kitPalette?.length && <span>{lang==='ar'?'ألوان الكريمة اليابانية المتاحة':'Available Japanese Cream colors'} · {product.kitPalette.map(t).join(' · ')}</span>}
        {!!product.kitDecorations?.length && <span>{lang==='ar'?'خيارات الزينة':'Decoration options'} · {product.kitDecorations.map(t).join(' · ')}</span>}
      </div>}
      <a href="/how-to-order" onClick={event=>{event.preventDefault();navigate('/how-to-order');}}>{l('How to order','طريقة الطلب')}</a>
      </ProductDisclosure>
    </div>
  </div>
  {design && <div className="shop-design-caption" data-commerce><strong>{design[2][lang === 'ar' ? 1 : 0]}</strong><p>{design[3][lang === 'ar' ? 1 : 0]}</p></div>}
  {(product.slug === 'fake-cake-box' || product.category === 'Cake-style Boxes') && <CakeBoxInterior/>}
  {backTo && <div className="center"><Button href={backTo} secondary>{t('Back to Products')}</Button></div>}
  {related.length>0 && <section className="section related"><SectionHead title="You might also love"/><div className="product-grid">{related.map(p=><ProductCard product={p} key={p.slug}/>)}</div></section>}
</PageShell>; }
Object.assign(arabicTranslations, {'Tell us what you would like to create.':'أخبرينا ماذا تودين أن نصنع.','Privacy Policy':'سياسة الخصوصية','Coming Soon':'قريباً','Past workshop':'ورشة سابقة','FAQs & Contact':'الأسئلة الشائعة والتواصل','Mirror':'مرآة','Phone case':'غطاء هاتف','Brush':'فرشاة','A little DIY welcome': 'ترحيب صغير بعالم اصنعيها بنفسك'});
function KitGuide() {
  const {lang,t}=useT();
  return <details className="shop-kit-guide"><summary>{lang==='ar'?'شاهدي ما بداخل الأطقم':'See what’s inside the kits'}</summary>
    <div className="diy-welcome-photo"><ImageArt wide src="/DIY%20welcome.jpg" label={t('A little DIY welcome')}/></div>
    <ImageArt wide images={['/DIY%20FIXED1.PNG','/DIY%20FIXED2.PNG']} autoplay label={t('DIY Kit')}/>
  </details>;
}

function Workshops() { const {workshops} = React.useContext(CatalogContext); return <PageShell title="Workshops 🧁" intro="Make your own Japanese Cream creation from start to finish in a friendly, hands-on Sparkle session."><div className="workshop-list">{workshops.map(w=><WorkshopCard workshop={w} key={w.slug}/>)}</div></PageShell>; }
function WorkshopDetail({ workshop }) { const { t } = useT(); if (!workshop) return <PageShell title="Product not found"><Button href="/workshops">Workshops</Button></PageShell>; const duration = workshop.time === 'About 2.5 hours' ? 'Duration: Approximately two and a half hours' : workshop.time === 'Message us' ? 'Duration: Message us' : 'Duration: Approximately two hours'; const location = workshop.location === 'Your place' ? 'Location: Your place' : 'Location: Nablus, Palestine'; const details = [[ '✥', location ], [ '◷', duration ], [ '✦', 'Materials and tools are included' ], [ '♡', 'Limited seats' ], [ '!', 'Advance booking is required' ], [ '+', 'Product choices depend on the workshop announcement' ], [ '•', 'Dates, venue, and final price must be confirmed through the latest announcement' ]]; return <PageShell title={workshop.name} intro={workshop.description}><div className="detail-grid workshop-detail-grid"><ImageArt wide product={{tone:'lilac',icon:workshop.icon}} src={workshop.image} alt={`${t(workshop.name)} ${t("workshop")}`} label={t(workshop.name)}/><div className="detail-copy"><span className={workshop.status==='Fully booked'?'sold':'available'}>{t(workshop.status)}</span><span className="eyebrow">{t("Workshop details")}</span><h2>{t(workshop.name)}</h2><strong className="detail-price">{t(workshop.price)}</strong><p>{t(workshop.description)}</p><div className="workshop-detail-panel">{details.map(([icon, text]) => <div className="workshop-detail-item" key={text}><span>{icon}</span><p>{t(text)}</p></div>)}</div><div><Button href={instagram} disabled={workshop.status==='Fully booked'}>{t(workshop.status==='Fully booked'?'Fully booked':'Reserve on Instagram')}</Button></div></div></div>{workshop.gallery && <section className="workshop-photo-section"><SectionHead eyebrow="More workshop photos" title="A closer look at the workshop style"/><ImageGallery images={workshop.gallery} prefix={workshop.name}/></section>}</PageShell>; }
function HowToOrder() {
  const {lang}=useT();
  return <PageShell title="How to Order"><OrderSteps lang={lang}/><div className="center"><Button href="/shop">{lang==='ar'?'تسوّقي الآن':'Shop Now'}</Button></div></PageShell>;
}
function Privacy() {
  const {lang}=useT();
  return <PageShell title="Privacy Policy"><PrivacyContent lang={lang} whatsapp={businessWhatsApp}/></PageShell>;
}
function Contact() { const {lang}=useT(); return <PageShell title="FAQs & Contact" intro="We'd love to hear from you."><div className="contact-card"><Camera/><h2>Let's make something sparkly</h2><p>{lang==='ar'?'راسلينا عبر واتساب للاستفسار عن طلبك. تابعينا على إنستغرام للمزيد عن الورش وإبداعات سباركل.':'Contact us on WhatsApp about your order. Find workshop and studio updates on Instagram.'}</p><Button href={businessWhatsApp}>{lang==='ar'?'راسلي سباركل عبر واتساب':'Message Sparkle on WhatsApp'}</Button><div><a href="/how-to-order" onClick={event=>{event.preventDefault();navigate('/how-to-order');}}>{lang==='ar'?'كيف أطلب؟':'How do I place an order?'}</a></div></div></PageShell>; }
function App() { const [route,setRoute]=useState(routeEntry); const path=route.path; const adminPage=path==='/admin'; const [products,setProducts]=useState([]); const [categories,setCategories]=useState([]); const [catalogAttempt,retryCatalog]=useState(0); const [content,setContent]=useState({workshops:[],website:[]}); const [status,setStatus]=useState('loading'); const [lang,setLang]=useState(() => localStorage.getItem('sparkle-language') || 'en'); const [dark,setDark]=useState(() => localStorage.getItem('sparkle-mood') === 'dark'); const [helpRequested,setHelpRequested]=useState(false);
const catalogTime=useRef(0),contentTime=useRef(0),lastAttempt=useRef(catalogAttempt);
let savedCart=false;
try {savedCart=Boolean(JSON.parse(localStorage.getItem(CART_KEY) || '[]').length);} catch {}
const needCatalog=!adminPage && (helpRequested || savedCart || path==='/' || path==='/checkout' || path.startsWith('/shop'));
const initialRoute=useRef(route.key);
const [initialLoading,setInitialLoading]=useState(true);
const needContent=!adminPage && (helpRequested || path==='/' || path==='/about' || path.startsWith('/workshops'));
useEffect(()=>{
  let active=true,busy=false;
  let initial=initialLoading && initialRoute.current===route.key;
  let initialController,initialDeadline;
  const force=lastAttempt.current!==catalogAttempt;
  lastAttempt.current=catalogAttempt;
  const load=(retry=false)=>{
    if(busy || document.hidden)return;
    const updates=[];
    if(initial){
      initialController=new AbortController();
      initialDeadline=setTimeout(()=>initialController.abort(),20000);
    }
    const signal=initialController?.signal;
    if(needContent && Date.now()-contentTime.current>=15000) updates.push(api('/content','GET',undefined,{signal}).then(value=>{
      if(active){setContent(value);contentTime.current=Date.now();}
    }).catch(()=>{}));
    if(needCatalog && (retry || Date.now()-catalogTime.current>=15000)) updates.push(api('/catalog?withCategories=1','GET',undefined,{signal}).then(value=>{
      if(active){setProducts(value.products);setCategories(value.categories);setStatus('ready');catalogTime.current=Date.now();}
    }).catch(()=>{if(active)setStatus(current=>current==='ready'?current:'error');}));
    if(updates.length){
      busy=true;
      Promise.all(updates).finally(()=>{
        busy=false;
        if(initial){
          initial=false;
          clearTimeout(initialDeadline);
          initialController=undefined;
          if(active)setInitialLoading(false);
        }
      });
    }else if(initial){
      initial=false;
      clearTimeout(initialDeadline);
      initialController=undefined;
      setInitialLoading(false);
    }
  };
  load(force);
  const refresh=()=>load();
  if(needCatalog || needContent)window.addEventListener('focus',refresh);
  if(initial)document.addEventListener('visibilitychange',refresh);
  return ()=>{
    active=false;
    clearTimeout(initialDeadline);
    initialController?.abort();
    window.removeEventListener('focus',refresh);
    document.removeEventListener('visibilitychange',refresh);
  };
},[needCatalog,needContent,catalogAttempt]);
useEffect(()=>{if(route.key!==initialRoute.current)setInitialLoading(false);},[route.key]); useEffect(()=>{const h=()=>setRoute(routeEntry());window.addEventListener('popstate',h);return()=>window.removeEventListener('popstate',h)},[]); useEffect(()=>{document.documentElement.dir=lang==='ar'?'rtl':'ltr'; document.documentElement.lang=lang; const description=document.querySelector('meta[name=description]'); if(description) description.content=lang==='ar'?'سباركل — إبداعات يدوية بالكريمة اليابانية وأطقم للتزيين وورش إبداعية في نابلس، فلسطين.':'Sparkle — Handmade Japanese Cream creations, DIY kits, and creative workshops in Nablus, Palestine.'; document.documentElement.classList.toggle('dark-mood',dark); localStorage.setItem('sparkle-mood',dark?'dark':'light'); localStorage.setItem('sparkle-language',lang); requestAnimationFrame(()=>translateVisibleText(lang));},[lang,path,dark]); const workshops = React.useMemo(() => storefrontWorkshops(content.workshops),[content.workshops]); const localized = React.useMemo(() => Object.fromEntries([...products,...workshops].flatMap(p => [[p.name,p.nameAr],[p.description,p.descriptionAr],[p.category,p.categoryAr],[p.collection,p.collectionAr],...(p.variants ?? []).map(v => [v.name,v.nameAr])]).filter(([,value]) => value)),[products,workshops]); const value={lang,t:(text)=> lang === 'ar' ? localized[text] || translate(text,lang) : text}; if (path === '/admin') return <React.Suspense fallback={<p>Loading…</p>}><Admin/></React.Suspense>; const homeView=<Homepage home={content.home} products={products} workshops={workshops} legacyBanners={content.website} lang={lang} t={value.t} navigate={navigate}/>; let view=path==='/'?homeView:path==='/checkout'?<Checkout lang={lang} t={value.t} navigate={navigate} catalogStatus={status} refreshStock={()=>retryCatalog(value=>value+1)}/>:path==='/order-success'?<OrderSuccess lang={lang} navigate={navigate}/>:path==='/about'?<About experience={content.home?.experience}/>:path==='/shop'?<Shop products={products} categories={categories} status={status} lang={lang} t={value.t} navigate={navigate} retry={()=>{setStatus('loading');retryCatalog(value=>value+1);}} kitGuide={<KitGuide/>}/>:path==='/workshops'?<Workshops/>:path==='/how-to-order'?<HowToOrder/>:path==='/contact'?<Contact/>:path==='/privacy'?<Privacy/>:path.startsWith('/shop/')?<ProductDetail key={path + ':' + status} product={resolveProduct(products, path.split('/').pop())} backTo={products.some(item => item.kind === 'kit' && path === '/shop/' + item.slug) ? '/shop?tab=kits' : categories.some(category=>category.section==='cakes' && category.name===resolveProduct(products,path.split('/').pop())?.category) ? cakeShop : undefined}/>:path.startsWith('/workshops/')?<WorkshopDetail workshop={workshops.find(w=>w.slug===path.split('/').pop())}/>:homeView; return <TranslationContext.Provider value={value}><CatalogContext.Provider value={{products,status,workshops}}><CartProvider catalog={status === 'ready' ? products : null}><RouteScrollRestoration entryKey={route.key}/><SeasonalStorefront animate={!['/checkout','/order-success'].includes(path)}/><StorefrontLoading loading={initialLoading&&initialRoute.current===route.key&&(needCatalog||needContent)} lang={lang}/><Header lang={lang} setLang={setLang} dark={dark} setDark={setDark}>{!['/checkout','/order-success'].includes(path) && <ChatLauncher lang={lang} t={value.t} products={products} workshops={workshops} instagram={instagram} navigate={navigate} onOpen={()=>setHelpRequested(true)}/>}</Header><React.Suspense fallback={<main className="commerce-page" role="status">{lang==='ar'?'جارٍ التحميل…':'Loading…'}</main>}>{view}</React.Suspense><Footer lang={lang} setLang={setLang}/><CartDrawer lang={lang} t={value.t} navigate={navigate}/></CartProvider></CatalogContext.Provider></TranslationContext.Provider>; }

createRoot(document.getElementById('root')).render(<App/>);
