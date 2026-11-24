import { CartProvider, CartHeaderButton, CartDrawer, AddToCart } from './Cart.jsx';
import { ProductDetailPrice, ProductVariantSelector } from './ProductPresentation.jsx';
import { sortProducts } from './product-sorting.js';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, ArrowDownUp, Camera, Heart, Menu, Moon, Sparkles, Star, Sun, X } from 'lucide-react';
import './styles.css';
import {arabicTranslations} from './storefront-translations.js';
import { resolveProduct } from './product-collections.js';
import Chatbot from './Chatbot.jsx';
import WorkshopVideo from './WorkshopVideo.jsx';
import {imageCatalog, legacyProducts} from './legacy-catalog.js';
import {kits} from './kits.js';
import {originalWorkshops} from './workshops.js';
import {api} from './commerce-api.js';
import Checkout, {CustomRequest, WorkshopRegistration} from './Checkout.jsx';
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
function translateVisibleText(language) { const dictionary = language === 'ar' ? arabicTranslations : englishTranslations; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode); nodes.forEach(node => { const value = node.nodeValue; if (!value || !value.trim() || node.parentElement?.closest('[data-commerce]')) return; const translated = Object.entries(dictionary).sort(([a], [b]) => b.length - a.length).reduce((text, [source, target]) => text.split(source).join(target), value); if (translated !== value) node.nodeValue = translated; }); const heroHeading = document.querySelector('.hero h1'); if (heroHeading) heroHeading.innerHTML = language === 'ar' ? '<span>اصنعي شيئاً</span><br><em>يشبهك</em><br><span>تماماً</span>' : 'Create<br>Something<br><em>That Feels</em><br>Like You'; }
// Existing URLs are resolved through aliases when color variants share a card.

const customCarouselState = [0, 0];

const customBoxDescriptions = {
  "sunflower fake cake box.png": [
    "A cream-decorated cake-style box with a cheerful sunflower-inspired design.",
    "علبة بطابع الكيك مزينة بالكريمة بتصميم مشرق مستوحى من دوّار الشمس."
  ],
  "barbie fake cake box.png": [
    "A Barbie-inspired cake-style box with a playful pink cream-decorated finish.",
    "علبة بطابع الكيك مستوحاة من باربي، بلمسات كريمية وردية مرحة."
  ],
  "sea fake cake box.png": [
    "A sea-inspired cake-style box with cream decoration and a dreamy coastal feel.",
    "علبة بطابع الكيك مستوحاة من البحر، مزينة بالكريمة بلمسة ساحلية حالمة."
  ],
  "butterfly fake cake box.png": [
    "A butterfly-inspired cake-style box with delicate cream decoration and a whimsical finish.",
    "علبة بطابع الكيك مستوحاة من الفراشات، بزينة كريمية رقيقة ولمسة خيالية."
  ],
  "flowers fake cake box.png": [
    "A flower-inspired cake-style box with cream decoration and a soft floral feel.",
    "علبة بطابع الكيك مستوحاة من الزهور، بزينة كريمية ولمسة زهرية ناعمة."
  ],
  "mermaid fake cake box.png": [
    "A mermaid-inspired cake-style box with dreamy cream decoration and under-the-sea charm.",
    "علبة بطابع الكيك مستوحاة من حورية البحر، بزينة كريمية حالمة وسحر عالم البحار."
  ],
  "white fake cake box.png": [
    "A white cake-style box with elegant cream decoration for a soft, classic look.",
    "علبة كيك بيضاء بزينة كريمية أنيقة لإطلالة ناعمة وكلاسيكية."
  ],
  "cherry fake cake box.png": [
    "A cherry-inspired cake-style box with sweet cream decoration and a playful fruit theme.",
    "علبة بطابع الكيك مستوحاة من الكرز، بزينة كريمية لطيفة وطابع فاكهي مرح."
  ],
  "hotpink fake cake box.png": [
    "A hot pink cake-style box with bold cream decoration and a vibrant, playful look.",
    "علبة كيك بالوردي الفاقع، بزينة كريمية بارزة وإطلالة حيوية ومرحة."
  ]
};
Object.values(customBoxDescriptions).forEach(([english, arabic]) => { arabicTranslations[english] = arabic; });
const customBoxNames = {
  "sunflower fake cake box.png": [
    "Sunflower Fake Cake Box",
    "علبة كيك دوّار الشمس"
  ],
  "barbie fake cake box.png": [
    "Barbie Fake Cake Box",
    "علبة كيك باربي"
  ],
  "sea fake cake box.png": [
    "Sea Fake Cake Box",
    "علبة كيك البحر"
  ],
  "butterfly fake cake box.png": [
    "Butterfly Fake Cake Box",
    "علبة كيك الفراشات"
  ],
  "flowers fake cake box.png": [
    "Flowers Fake Cake Box",
    "علبة كيك الزهور"
  ],
  "mermaid fake cake box.png": [
    "Mermaid Fake Cake Box",
    "علبة كيك حورية البحر"
  ],
  "white fake cake box.png": [
    "White Fake Cake Box",
    "علبة الكيك البيضاء"
  ],
  "cherry fake cake box.png": [
    "Cherry Fake Cake Box",
    "علبة كيك الكرز"
  ],
  "hotpink fake cake box.png": [
    "Hot Pink Fake Cake Box",
    "علبة الكيك بالوردي الفاقع"
  ]
};
Object.values(customBoxNames).forEach(([english, arabic]) => { arabicTranslations[english] = arabic; });
const customProducts = imageCatalog.customOrders.map((image, index) => ({
  slug: 'fake-cake-box-' + String(index + 1).padStart(2, '0'),
  name: customBoxNames[decodeURIComponent(image.split('/').pop())][0],
  category: 'Cake-style Boxes', status: 'Available',
  description: customBoxDescriptions[decodeURIComponent(image.split('/').pop())][0],
  image, images: [image],
  details: legacyProducts.find(product => product.slug === 'fake-cake-box').details,
  fullDescription: 'Choose your colors and decorations',
}));
Object.assign(arabicTranslations, {'Loading shop…':'جارٍ تحميل المتجر…','Shop temporarily unavailable':'المتجر غير متاح مؤقتاً','Request a custom order':'اطلبي تصميماً مخصصاً','Checkout':'إتمام الطلب','Complete checkout with Cash on Delivery.':'أكملي الطلب مع الدفع عند الاستلام.','Send your saved order in WhatsApp so Sparkle can confirm it.':'أرسلي طلبك المحفوظ في واتساب لتؤكده سباركل.','Back to Products':'العودة إلى المنتجات', 'Product not found':'المنتج غير موجود'});

function usePath() { return window.location.pathname.replace(/\/$/, '') || '/'; }
const routeScrollPositions = new Map();
function routeEntry() {
  if (!window.history.state?.sparkleEntry) window.history.replaceState({...window.history.state, sparkleEntry: crypto.randomUUID()}, '', window.location.href);
  return { path: usePath(), key: window.history.state.sparkleEntry };
}
function navigate(path) {
  const entry = routeEntry();
  routeScrollPositions.set(entry.key, {left:window.scrollX, top:window.scrollY});
  window.history.pushState({sparkleEntry:crypto.randomUUID()}, '', path);
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
function ImageCarousel({ images, alt, href, slideLinks, initialIndex = 0, onIndexChange, autoplay = false }) {
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
    onClickCapture={e => { if (suppress.current) { e.preventDefault(); e.stopPropagation(); suppress.current = false; } }}>
    <div className="carousel-track" style={{transform:'translateX(calc(' + (-index * 100) + '% + ' + drag + 'px))', transition:drag ? 'none' : undefined}}>
      {images.map((src, i) => <div className="carousel-slide" key={src + i} aria-hidden={i !== index}><img className="art-photo" src={src} alt={alt + (multiple ? ' — ' + (i + 1) + '/' + images.length : '')} draggable="false" decoding="async"/></div>)}
    </div>
    {activeHref && <a className="carousel-product-link" href={activeHref} aria-label={alt} draggable="false" onClick={e => { e.preventDefault(); navigate(activeHref); }}/>}
    {multiple && <><button type="button" className="carousel-arrow carousel-prev" aria-label="Previous image" disabled={index === 0} onClick={() => move(index - 1)}>‹</button><button type="button" className="carousel-arrow carousel-next" aria-label="Next image" disabled={index === images.length - 1} onClick={() => move(index + 1)}>›</button><div className="carousel-dots">{images.map((_, i) => <button type="button" key={i} className={i === index ? 'active' : ''} aria-label={'Image ' + (i + 1)} aria-current={i === index ? 'true' : undefined} onClick={() => move(i)}/>)}</div><span className="carousel-status" aria-live="polite">{index + 1} / {images.length}</span></>}
  </div>;
}
function ImageArt({ product, images, wide = false, label, src, alt, imageHref, slideLinks, initialIndex, onIndexChange, autoplay = false }) { const resolvedSrc = src || (label === 'A little world of cream & sparkle' ? imageCatalog.home[0] : label === 'Sparkle studio' || label === 'Sparkle cream decorating in progress' ? imageCatalog.about.story : label === 'Soft cream texture' ? imageCatalog.about.material : label === 'Custom Sparkle creation' ? imageCatalog.customOrders[0] : undefined); const photos = (images?.length ? images : product?.images?.length ? product.images : [resolvedSrc || product?.image]).filter(Boolean); return <div className={`image-art ${product?.tone || 'pink'} ${wide ? 'wide' : ''} ${photos.length ? 'has-image' : ''}`}>{photos.length > 0 && <ImageCarousel key={photos.join('|')} images={photos} alt={alt || label || product?.name || 'Sparkle creation'} href={imageHref} slideLinks={slideLinks} initialIndex={initialIndex} onIndexChange={onIndexChange} autoplay={autoplay}/>}<span className="art-star">✦</span><span className="img-shape img-sparkle shape-one">✦</span><span className="img-shape img-heart shape-two">♡</span><span className="img-shape img-sparkle shape-three">✧</span>{!photos.length && <span className="art-icon">{product?.icon || '🎀'}</span>}{!product && !slideLinks && <span className="art-label">{label || 'Sparkle creation'}</span>}</div>; }
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

function Header({ lang, setLang, dark, setDark }) { const [open, setOpen] = useState(false); const [showLanguageHint, setShowLanguageHint] = useState(true); const [showMenuHint, setShowMenuHint] = useState(true); const path = usePath(); const { t } = useT(); const links = [['Home','/'],['About Us','/about'],['Workshops','/workshops'],['DIY Kits','/diy-kits'],['Shop','/shop'],['Custom Orders','/custom-orders'],['How to Order','/how-to-order']]; useEffect(() => { setOpen(false); }, [path]); return <header className="header"><div className="nav-wrap"><button className="brand" onClick={() => navigate('/')}><Sparkles className="brand-mark" size={24} strokeWidth={2} aria-hidden="true"/><span>Sparkle</span></button><nav className={open ? 'open' : ''}>{links.map(([label, href]) => <a className={(path === href || (href !== '/' && path.startsWith(href))) ? 'active' : ''} key={href} href={href} onClick={e => {e.preventDefault(); navigate(href);}}>{t(label)}</a>)}</nav><div className="nav-tools"><CartHeaderButton lang={lang}/><button className="mood-toggle" onClick={() => setDark(!dark)} aria-label={dark ? t('Switch to light mood') : t('Switch to dark mood')} title={dark ? t('Light mood') : t('Dark mood')}>{dark ? <Sun size={16}/> : <Moon size={16}/>}</button><div className="language-hint-wrap"><button className="lang-mini" aria-label={lang === 'en' ? 'عرض الموقع بالعربية' : 'View site in English'} onClick={() => { setLang(lang === 'en' ? 'ar' : 'en'); setShowLanguageHint(false); }}>{lang === 'en' ? 'ع' : 'EN'}</button>{showLanguageHint && lang === 'en' && <div className="language-hint" lang="ar" dir="rtl"><button className="language-hint-message" onClick={() => { setLang('ar'); setShowLanguageHint(false); }}>يمكنك تصفّح الموقع بالعربية — اضغط هنا</button><button className="language-hint-close" aria-label="إغلاق الرسالة" onClick={() => setShowLanguageHint(false)}>×</button></div>}</div><div className="menu-hint-wrap"><button className="menu-toggle" onClick={() => { setOpen(!open); setShowMenuHint(false); }} aria-expanded={open} aria-label={t('Toggle menu')}>{open ? <X/> : <Menu/>}</button>{showMenuHint && !open && <div className={'language-hint menu-hint' + (showLanguageHint && lang === 'en' ? ' menu-hint-stacked' : '')} lang="ar" dir="rtl"><button className="language-hint-message" onClick={() => { setOpen(true); setShowMenuHint(false); }}>يمكنك تصفح المنتجات من هنا</button><button className="language-hint-close" aria-label="إغلاق تلميح القائمة" onClick={() => setShowMenuHint(false)}>×</button></div>}</div></div></div></header>; }
function Footer({ lang, setLang }) { const { t } = useT(); const links=[['Home','/'],['About Us','/about'],['Workshops','/workshops'],['DIY Kits','/diy-kits'],['Shop','/shop'],['Custom Orders','/custom-orders'],['How to Order','/how-to-order'],['Contact','/contact']]; return <footer><div className="footer-top"><div><button className="brand footer-brand" onClick={() => navigate('/')}><Sparkles className="brand-mark" size={24} strokeWidth={2} aria-hidden="true"/><span>Sparkle</span></button><p>{t('Japanese Cream, creativity, and a little sparkle. ✨')}</p><p className="muted">{t("Sparkle — Palestine's first store specializing in Japanese Cream products ✦")}</p></div><div><h4>{t('Explore')}</h4>{links.map(([n,h]) => <a href={h} key={h} onClick={e => {e.preventDefault();navigate(h)}}>{t(n)}</a>)}</div><div><h4>{t('Follow')}</h4><a href={instagram} target="_blank" rel="noreferrer"><Camera size={15}/> Instagram</a><h4 className="pref">{t('Preferences')}</h4><div className="language"><button className={lang === 'ar' ? 'selected' : ''} onClick={() => setLang('ar')}>ar</button><button className={lang === 'en' ? 'selected' : ''} onClick={() => setLang('en')}>en</button></div></div></div><div className="footer-bottom">© 2026 Sparkle. {t('All rights reserved.')}<span>{t('Made with cream & creativity')}</span></div></footer>; }
function SectionHead({ eyebrow, title, text, align = '' }) { const { t } = useT(); return <div className={`section-head ${align}`}><span className="eyebrow">{t(eyebrow)}</span><h2><FancyTitle title={title}/></h2>{text && <p>{t(text)}</p>}</div>; }
function ProductPrice({ product, detail = false }) {
  const { t } = useT();
  if (!product.discountPercent) return <strong className={detail ? 'detail-price' : undefined}>{t(product.price)}</strong>;
  return <div className={detail ? 'sale-price sale-price-detail' : 'sale-price'}>
    <span className="sale-badge">{t('50% off')}</span>
    <span className="sale-amounts"><del aria-label={t('Original price')}>{product.originalPrice}</del><strong aria-label={t('Sale price')}>{t(product.price)}</strong></span>
  </div>;
}
function ProductCard({ product }) { const { t } = useT(); const productHref = product.slug === 'fake-cake-box' ? '/custom-orders' : `/shop/${product.slug}`; return <article className="product-card"><ImageArt product={product} src={product.image} imageHref={productHref} alt={`${t(product.name)} ${t('handmade Japanese Cream creation')}`}/><div className="product-copy"><div className="product-meta"><span className={product.status === 'Sold Out' ? 'sold' : 'available'}>{t(product.status)}</span><span>{t(product.category)}</span></div><h3><a href={productHref} onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(productHref); }}>{t(product.name)}</a></h3><p>{t(product.description)}</p><div className="card-foot"><ProductPrice product={product}/><Button href={productHref} disabled={product.status === 'Sold Out'} secondary>{t(product.status === 'Sold Out' ? 'Sold Out' : 'View Details')}</Button></div></div></article>; }
function KitCard({ kit, href }) { const { t } = useT(); const Tag = href ? 'a' : 'article'; return <Tag href={href} onClick={href ? event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(href); } : undefined} className={`kit-card ${kit.featured ? 'featured' : ''}`}>{kit.featured && <span className="popular">{t('Most loved')}</span>}<span className="kit-icon">✦</span><h3>{t(kit.name)}</h3><strong className="price">{t(kit.price)}</strong><p>{t(kit.description)}</p><ul>{kit.includes.map(x => <li key={x}>{t(x)}</li>)}</ul>{href ? <span className="button">{t('Order Your DIY Kit')}<ArrowUpRight size={16}/></span> : <Button href={instagram}>{t('Order Your DIY Kit')}</Button>}</Tag>; }
function WorkshopCard({ workshop }) { const { t } = useT(); return <a className="workshop-card" href={`/workshops/${workshop.slug}`} onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(`/workshops/${workshop.slug}`); }}><div className="workshop-art">{workshop.image ? <img src={workshop.image} alt={`${t(workshop.name)} ${t('workshop')}`}/> : <span>{workshop.icon}</span>}<span className="img-shape img-sparkle shape-one">✦</span><span className="img-shape img-heart shape-two">♡</span><span className="img-shape img-sparkle shape-three">✧</span><small>{t(workshop.status)}</small></div><div><div className="product-meta"><span className={workshop.status === 'Fully booked' ? 'sold' : 'available'}>{t(workshop.status)}</span></div><h3>{t(workshop.name)}</h3><p>{t(workshop.description)}</p><div className="details"><span>◷ {t(workshop.time)}</span><span>⌖ {t(workshop.location)}</span><strong>{t(workshop.price)}</strong></div><span className="button secondary">{t('View Details')}<ArrowUpRight size={16}/></span></div></a>; }
function ImageGallery({ images, prefix }) { return <div className="image-gallery">{images.map((src, index) => <ImageArt key={src} src={src} alt={`${prefix} image ${index + 1}`} label={`${prefix} ${String(index + 1).padStart(2, '0')}`}/>)}</div>; }

function SectionDivider() { return <div className="section-divider" aria-hidden="true">{Array.from({length:9}, (_, index) => <Star key={index}/>)}</div>; }
function useLiveKits() {
  const {products,status} = React.useContext(CatalogContext);
  return status === 'ready' ? products.filter(item => item.kind === 'kit').map(product => {
    const kit = kits.find(item => item.slug === product.slug);
    return {...product,includes:kit?.includes || product.details || [],featured:product.featured || kit?.featured};
  }) : kits;
}
function Home() { const {products,workshops} = React.useContext(CatalogContext); const liveKits = useLiveKits(); return <><main><section className="hero"><div className="hero-copy"><span className="eyebrow">Handmade in Nablus, Palestine</span><h1>Create<br/>Something<br/><em>That Feels</em><br/>Like You</h1><p>Discover personalized fake cake products and creative workshops designed to add sparkle to your everyday life.</p><div className="actions"><Button href="/shop" onClick={e => {e?.preventDefault();navigate('/shop')}}>Explore Sparkle</Button><Button href={instagram} secondary>Order on Instagram</Button></div><div className="hero-note"><Heart size={16} fill="currentColor"/> Handmade in Palestine, one piece at a time</div></div><div className="hero-visual"><ImageArt wide label="A little world of cream & sparkle"/><div className="floating-note note-one">made with love ♡</div><div className="floating-note note-two">✦ cute details</div></div></section><SectionDivider/><section className="about-preview band"><div className="about-art"><ImageArt images={[imageCatalog.about.story, '/ABOUT%20US%20IMGS/about.jpeg']} autoplay product={{tone:'peach',icon:'🎀'}} label="Sparkle studio"/></div><div><SectionHead eyebrow="A little about us" title="A Little About Sparkle 🎀" text="Sparkle is a Palestinian creative brand built around Japanese Cream, creativity, and making ordinary things feel a little more special."/><Button href="/about">Learn More</Button></div></section><SectionDivider/><section className="section blush-section"><SectionHead eyebrow="Creative experiences" title="Make. Create. Sparkle. 🧁" text="Our workshops are a fun creative experience where you get to make your own Japanese Cream creation from start to finish."/><div className="workshop-grid">{workshops.map(w => <WorkshopCard workshop={w} key={w.slug}/>)}</div><div className="center"><Button href="/workshops" secondary>Explore Workshops</Button></div></section><SectionDivider/><section className="section"><SectionHead eyebrow="Ready-made creations" title="Made with a Little Sparkle ✨" text="Discover our ready-made Japanese Cream creations and cute pieces, made with love and attention to every little detail."/><div className="product-grid featured-products">{products.filter(product => product.featured).slice(0,3).map(p => <ProductCard product={p} key={p.slug}/>)}</div><div className="center"><Button href="/shop">Explore Products</Button></div></section><SectionDivider/><section className="section kits-section"><SectionHead eyebrow="Make something yours" title="Create It Yourself 🎀" text="Bring the Sparkle experience home with our DIY Japanese Cream Kits. Choose your piece, decorate it your way, and create something that's completely yours."/><div className="kit-grid">{liveKits.map(k => <KitCard kit={k} key={k.slug} href="/diy-kits"/>)}</div><div className="center"><Button href="/diy-kits" secondary>Explore DIY Kits</Button></div></section><SectionDivider/><section className="custom-band"><div><SectionHead eyebrow="Made for you" title="Made Your Way 💗" text="Have something special in mind? Tell us what you're imagining and we'll help turn your idea into a Sparkle creation made just for you."/><Button href="/custom-orders">Explore Custom Orders</Button></div><div className="custom-collage"><ImageArt product={{tone:'rose',icon:'🎁'}} label="Custom Sparkle creation"/><ImageArt product={{tone:'cream',icon:'🎀'}} label="Custom Sparkle gift box"/></div></section><SectionDivider/><section className="section order-section"><SectionHead eyebrow="A simple little process" title="How to Order 💌"/><div className="steps">{['Explore our products or workshops.','Choose what you love.','Complete checkout with Cash on Delivery.','Send your saved order in WhatsApp so Sparkle can confirm it.'].map((s,i) => <div className="step" key={s}><span>0{i+1}</span><p>{s}</p></div>)}</div><div className="center"><Button href="/how-to-order" secondary>How to Order</Button></div></section><SectionDivider/><section className="instagram-band"><Sparkles/><SectionHead eyebrow="Come say hello" title="Let's Stay Sparkly ✨" text="Follow us on Instagram for our latest creations, workshops, DIY ideas, and behind-the-scenes moments."/><Button href={instagram}>Follow us on Instagram</Button></section></main></>; }

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
function PageShell({ title, intro, children, eyebrow='Sparkle journal', hideHeading=false }) { const { t } = useT(); const gallery = title.startsWith('Made with a Little Sparkle') ? <div className="center"><Button href={instagram}>{t('See more on Instagram')}</Button></div> : title.startsWith('Workshops') ? <section className="shop-gallery"><SectionHead eyebrow="Workshop moments" title="Inside the Sparkle experience"/><WorkshopMomentsGallery/></section> : null; return <main className="inner-page"><div className="page-intro"><span className="eyebrow"><a href="/" onClick={e => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate('/'); }}>{t('Home')}</a> / {t(title)}</span>{!hideHeading && <h1 className={title === '4 years of experience.' ? 'experience-title' : ''}>{title === '4 years of experience.' ? <>{t('4 years of ')}<em>{t('experience.')}</em></> : <FancyTitle title={t(title)}/>}</h1>}{intro && <p>{t(intro)}</p>}</div>{children}{gallery}</main>; }
function About() { return <PageShell title="4 years of experience." intro="Sparkle started with one simple idea: everyday little things deserve to feel special too."><section className="story-grid"><ImageArt wide product={{tone:'peach',icon:'🧁'}} label="Sparkle cream decorating in progress"/><div><SectionHead eyebrow="Our story" title="A tiny studio with a big soft spot for details" text={'Sparkle is a Palestinian creative brand born from a love of cute details and handmade things.\n\nWe fell for Japanese Cream — the soft, frosting-like decoration that turns a plain piece into something dreamy — and wanted to bring that whole world closer to home.\n\nToday Sparkle is a little studio of ready-made creations, DIY Kits, workshops, and custom pieces made one at a time.'}/></div></section><section className="special-section"><SectionHead eyebrow="The Sparkle feeling" title="What Makes Sparkle Special"/><div className="feature-grid">{['Everything is decorated by hand, piece by piece.','Japanese Cream and fake cake are our whole world, not a side detail.','You can buy it ready, make it yourself, or create it with us in a workshop.','Every custom order is built around your own idea, colors, and style.'].map((x,i)=><div className="feature" key={x}><span>0{i+1}</span><p>{x}</p></div>)}</div></section><section className="cream-explain"><div><SectionHead eyebrow="The material" title="Japanese Cream" text="Japanese Cream is a soft decorative cream that's piped like cake frosting, then finished with pearls, bows, hearts, cherries, and tiny charms. Once it sets, it keeps that soft dreamy look for good."/></div><ImageArt product={{tone:'cream',icon:'🍒'}} label="Soft cream texture"/></section></PageShell>; }
function ShopSort({ value, onChange }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({});
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const options = [['default', 'Featured / Default'], ['price-asc', 'Price: Low to High'], ['price-desc', 'Price: High to Low'], ['newest', 'Newest to Oldest'], ['oldest', 'Oldest to Newest']];
  useLayoutEffect(() => {
    if (!open) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(220, window.innerWidth - 24);
    const height = menu.current.offsetHeight;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - height - 8),
      width
    });
    menu.current.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close);
    };
  }, [open]);
  return <div className="shop-sort" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="shop-sort-icon" aria-label={t('Sort by:') + ' ' + t(options.find(([key]) => key === value)[1])} title={t('Sort by:')} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'shop-sort-menu' : undefined} onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
      <ArrowDownUp size={17} aria-hidden="true"/>
    </button>
    {open && <div ref={menu} id="shop-sort-menu" className="shop-sort-menu" role="menu" aria-label={t('Sort by:')} style={position} onKeyDown={event => {
      const buttons = [...menu.current.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current.focus({ preventScroll: true }); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus({ preventScroll: true });
      }
    }}>
      {options.map(([key, label]) => <button type="button" role="menuitemradio" aria-checked={value === key} tabIndex={value === key ? 0 : -1} key={key} onClick={() => { onChange(key); setOpen(false); trigger.current.focus({ preventScroll: true }); }}><span>{t(label)}</span><span aria-hidden="true">{value === key ? '✓' : ''}</span></button>)}
    </div>}
  </div>;
}
function Shop() {
  const {products,status} = React.useContext(CatalogContext);
  const { t } = useT();
  const [filter, setFilter] = useState('All creations');
  const [sortBy, setSortBy] = useState('default');
  const shop = products.filter(product => product.kind !== 'kit');
  const cats = ['All creations', ...new Set(shop.map(p => p.category))];
  const filtered = filter === 'All creations' ? shop : shop.filter(p => p.category === filter);
  const shown = sortProducts(filtered, sortBy);
  if (status !== 'ready') return <PageShell title={status === 'loading' ? 'Loading shop…' : 'Shop temporarily unavailable'}/>;
  return <PageShell title="Made with a Little Sparkle ✨">
    <div className="shop-toolbar"><div className="filters">{cats.map(c => <button className={filter === c ? 'selected' : ''} onClick={() => setFilter(c)} key={c}>{t(c)}</button>)}</div>
    <ShopSort value={sortBy} onChange={setSortBy}/></div>
    <div className="product-grid">{shown.map(p => <ProductCard product={p} key={p.slug}/>)}</div>
  </PageShell>;
}
Object.assign(arabicTranslations, {
  'Inside the box': 'داخل العلبة',
  'A closer look at the compartments and mirror.': 'نظرة أقرب على الأقسام الداخلية والمرآة.',
  'Pink box interior': 'العلبة الوردية من الداخل',
  'White box interior': 'العلبة البيضاء من الداخل'
});
function CakeBoxInterior() {
  const { t } = useT();
  return <section className="cake-box-interior"><SectionHead title="Inside the box" text="A closer look at the compartments and mirror."/><div className="cake-box-interior-photos">{[
    ['fake cake box from inside-pink.png', 'Pink box interior'],
    ['fake cake box from inside-white.png', 'White box interior']
  ].map(([file, label]) => <figure key={file}><img src={'/CUSTOM%20ORDERS%20IMGS/' + encodeURIComponent(file)} alt={t(label)} loading="lazy" decoding="async"/><figcaption>{t(label)}</figcaption></figure>)}</div></section>;
}
function ProductDetail({ product: baseProduct, backTo }) {
  const {products,status} = React.useContext(CatalogContext);
  const { t, lang } = useT();
  const storageKey = 'sparkle-variant:' + (baseProduct?.slug || '') + ':' + (baseProduct?.defaultVariant || '');
  const [variantId, setVariantId] = useState(() => { try { return sessionStorage.getItem(storageKey) || baseProduct?.defaultVariant; } catch { return baseProduct?.defaultVariant; } });
  const selectedVariant = baseProduct?.variants?.find(variant => variant.id === variantId) || baseProduct?.variants?.find(variant => variant.id === baseProduct.defaultVariant);
  const product = baseProduct && selectedVariant ? {...baseProduct, ...selectedVariant, name:baseProduct.name, slug:baseProduct.slug} : baseProduct;
  const selectVariant = id => { setVariantId(id); try { sessionStorage.setItem(storageKey,id); } catch {} };
 if (!product && !backTo && status !== 'ready') return <PageShell title={status === 'loading' ? 'Loading shop…' : 'Shop temporarily unavailable'}/>;
 if (!product) return <PageShell title="Product not found"><Button href={backTo || "/shop"}>Back to Products</Button></PageShell>; const productTypeDetail = product.category === 'Phone Cases' ? 'We have all types of phone cases.' : 'This piece is 20cm.'; const details = product.details?.length ? product.details : ['You can pick colors and shapes.', productTypeDetail, 'Please order 3 days before you need it.', 'Delivered ready-made, not as a DIY box.']; return <PageShell title={product.name} hideHeading>
  <div className="detail-grid product-detail-grid">
    <div className="product-image-column"><ImageArt wide product={product} src={product.image} alt={t(product.name) + ' ' + t('handmade Japanese Cream creation')} label={t(product.name)}/></div>
    <div className="detail-copy product-information">
      {product.collection && <p className="product-collection">{lang === 'ar' ? t('Collection') + ' ' + t(product.collection) : product.collection + ' Collection'}</p>}
      <h1>{t(product.name)}</h1>
      <div className="product-description"><p>{t(product.description)}</p>{product.fullDescription && <p>{t(product.fullDescription)}</p>}</div>
      <span className={'product-availability ' + (product.status === 'Sold Out' ? 'sold' : 'available')}>{t(product.status)}</span>
      <ProductDetailPrice product={product} t={t} lang={lang}/>
      {baseProduct.variants && <ProductVariantSelector variants={baseProduct.variants} selected={selectedVariant} onSelect={selectVariant} t={t}/>}
      <div className="product-purchase"><AddToCart product={baseProduct} variant={selectedVariant} lang={lang}/>{!(selectedVariant?.purchasable ?? baseProduct.purchasable) && product.status !== 'Sold Out' && <Button href="/custom-orders">{t('Request a custom order')}</Button>}</div>
      <div className="detail-list">{details.map(detail => <span key={detail}>✦ {t(detail)}</span>)}</div>
    </div>
  </div>
  {(product.slug === 'fake-cake-box' || product.category === 'Cake-style Boxes') && <CakeBoxInterior/>}
  {backTo && <div className="center"><Button href={backTo} secondary>{t('Back to Products')}</Button></div>}
  <section className="section related"><SectionHead title="You might also love"/><div className="product-grid">{products.filter(p=>p.slug!==product.slug && p.kind===product.kind).slice(0,3).map(p=><ProductCard product={p} key={p.slug}/>)}</div></section>
</PageShell>; }
Object.assign(arabicTranslations, {'A little DIY welcome': 'ترحيب صغير بعالم اصنعيها بنفسك'});
function Kits() { const { lang, t } = useT(); const {products,status} = React.useContext(CatalogContext); const liveKits = useLiveKits(); return <PageShell title="DIY Kits 🎀" intro="Bring the Sparkle experience home and make something completely yours."><section className="diy-welcome-video" aria-label={t('A little DIY welcome')}><span className="eyebrow">{t('A little DIY welcome')}</span><WorkshopVideo title={t('A little DIY welcome')} arabic={lang === 'ar'} video={{preview:'/videos/diy-welcome-preview.mp4', full:'/videos/diy-welcome.mp4', poster:'/videos/diy-welcome.jpg'}}/></section><div className="kit-grid page-kits">{liveKits.map(k=><KitCard kit={k} key={k.slug} href={status === 'ready' ? '/shop/' + k.slug : '/custom-orders'}/>)}</div><div className="diy-preview"><div className="diy-kit-image"><ImageArt wide images={['/DIY%20FIXED1.PNG', '/DIY%20FIXED2.PNG']} autoplay alt="Sparkle DIY kit materials" label="DIY kit"/></div><div className="diy-preview-copy"><span className="eyebrow">Kit preview</span><h2>How it will be</h2><p>A sweet look at the pieces, colors, and decorations waiting inside your DIY kit.</p></div></div><section className="info-band"><SectionHead eyebrow="Your creative kit" title="Pipes, pearls, bows, and a little room to play" text="Choose a piece, pick your colors, and decorate at your own pace. Each kit includes the tools and details you need to make a sweet little creation."/><Button href={instagram}>Order Your DIY Kit</Button></section></PageShell>; }
function Workshops() { const {workshops} = React.useContext(CatalogContext); return <PageShell title="Workshops 🧁" intro="Make your own Japanese Cream creation from start to finish in a friendly, hands-on Sparkle session."><div className="workshop-list">{workshops.map(w=><WorkshopCard workshop={w} key={w.slug}/>)}</div></PageShell>; }
const workshopVideos = { 'japanese-cream-mirror': 'mirror2', 'japanese-cream-phone-case': 'phone1', 'brush-workshop': 'brush1' };
function WorkshopDetail({ workshop }) { const { lang, t } = useT(); const videoName = workshop && workshopVideos[workshop.slug]; if (!workshop) return <PageShell title="Product not found"><Button href="/workshops">Workshops</Button></PageShell>; const duration = workshop.time === 'About 2.5 hours' ? 'Duration: Approximately two and a half hours' : workshop.time === 'Message us' ? 'Duration: Message us' : 'Duration: Approximately two hours'; const location = workshop.location === 'Your place' ? 'Location: Your place' : 'Location: Nablus, Palestine'; const details = [[ '✥', location ], [ '◷', duration ], [ '✦', 'Materials and tools are included' ], [ '♡', 'Limited seats' ], [ '!', 'Advance booking is required' ], [ '+', 'Product choices depend on the workshop announcement' ], [ '•', 'Dates, venue, and final price must be confirmed through the latest announcement' ]]; return <PageShell title={workshop.name} intro={workshop.description}><div className="detail-grid workshop-detail-grid"><ImageArt wide product={{tone:'lilac',icon:workshop.icon}} src={workshop.image} alt={`${t(workshop.name)} ${t("workshop")}`} label={t(workshop.name)}/><div className="detail-copy"><span className={workshop.status==='Fully booked'?'sold':'available'}>{t(workshop.status)}</span><span className="eyebrow">{t("Workshop details")}</span><h2>{t(workshop.name)}</h2><strong className="detail-price">{t(workshop.price)}</strong><p>{t(workshop.description)}</p><div className="workshop-detail-panel">{details.map(([icon, text]) => <div className="workshop-detail-item" key={text}><span>{icon}</span><p>{t(text)}</p></div>)}</div>{videoName && <WorkshopVideo key={videoName} title={t(workshop.name)} arabic={lang === 'ar'} video={{preview:'/videos/' + videoName + '-preview.mp4', full:'/videos/' + videoName + '.mp4', poster:'/videos/' + videoName + '.jpg'}}/>}<div className={videoName ? "workshop-video-reserve" : undefined}><Button href={instagram} disabled={workshop.status==='Fully booked'}>{t(workshop.status==='Fully booked'?'Fully booked':'Reserve on Instagram')}</Button></div></div></div>{workshop.gallery && <section className="workshop-photo-section"><SectionHead eyebrow="More workshop photos" title="A closer look at the workshop style"/><ImageGallery images={workshop.gallery} prefix={workshop.name}/></section>}</PageShell>; }
function CustomProductCarousel({ items, panelIndex }) {
  const { t } = useT();
  const [active, setActive] = useState(() => Math.min(customCarouselState[panelIndex], items.length - 1));
  const product = items[active];
  const href = '/products/' + product.slug;
  return <figure className="fake-cake-photo">
    <ImageArt images={items.map(item => item.image)} slideLinks={items.map(item => '/products/' + item.slug)} initialIndex={active} onIndexChange={index => { customCarouselState[panelIndex] = index; setActive(index); }} product={{tone:panelIndex ? 'lilac' : 'rose'}} alt={t('Fake Cake Box') + ' ' + (panelIndex + 1)} label={t('Fake Cake Box') + ' ' + String(panelIndex + 1).padStart(2, '0')}/>
    <a className="product-copy" style={{display:'block'}} href={href} onClick={e => { e.preventDefault(); navigate(href); }}>
      <div className="product-meta"><span className="available">{t(product.status)}</span><span>{t(product.category)}</span></div>
      <h3>{t(product.name)}</h3><p>{t(product.description)}</p>
    </a>
  </figure>;
}
function CustomOrders() { const { t } = useT(); const boxes = [customProducts.slice(0, 7).filter(product => !product.image.endsWith('flowers%20fake%20cake%20box.png')), customProducts.slice(7)];  return <PageShell title="Fake Cake Boxes" intro="A little collection of dreamy boxes, made just for you."><section className="fake-cake-album"><div className="fake-cake-album-head"><span className="eyebrow">{t('Cake-style Boxes')}</span><h2>{t('Fake Cake Box')}</h2><p>{t('A cream-decorated heart-shaped box designed to look like a tiny dreamy cake.')}</p></div><div className="fake-cake-photo-grid">{boxes.map((items, index) => <CustomProductCarousel items={items} panelIndex={index} key={index}/>)}</div></section><section className="custom-box-cta"><h2>{t('Want a custom box?')}</h2><p>{t("Message us on Instagram and tell us what you'd like.")}</p><Button href={instagram}>{t('Message us on Instagram')}</Button></section></PageShell>; }
function HowToOrder() { return <PageShell title="How to Order 💌" intro="A simple four-step way to bring a little Sparkle home."><div className="big-steps">{[['Explore','Explore products, workshops, and DIY kits.'],['Choose','Choose the item or experience you want.'],['Checkout','Complete checkout with Cash on Delivery.'],['Confirm','Send your saved order in WhatsApp so Sparkle can confirm it.']].map(([h,p],i)=><div className="big-step" key={h}><span>0{i+1}</span><h2>{h}</h2><p>{p}</p></div>)}</div><div className="center"><Button href={instagram}>Message us on Instagram</Button></div></PageShell>; }
function Contact() { return <PageShell title="Contact ✦" intro="We'd love to hear from you."><div className="contact-card"><Camera/><h2>Let's make something sparkly</h2><p>For orders, workshops, custom pieces, and sweet questions, send us a message on Instagram.</p><Button href={instagram}>Message Sparkle</Button></div></PageShell>; }
function App() { const [route,setRoute]=useState(routeEntry); const path=route.path; const [products,setProducts]=useState([]); const [content,setContent]=useState({workshops:[],website:[]}); const [status,setStatus]=useState('loading'); const [lang,setLang]=useState(() => localStorage.getItem('sparkle-language') || 'en'); const [dark,setDark]=useState(() => localStorage.getItem('sparkle-mood') === 'dark'); useEffect(() => {
  let active = true;
  let requested = 0;
  function load() {
    const generation = ++requested;
    api('/content').then(value=>{if(active && generation === requested) setContent(value);}).catch(()=>{});
    api('/catalog').then(data => {
      if (active && generation === requested) {setProducts(data);setStatus('ready');}
    }).catch(() => {if (active && generation === requested) setStatus(current => current === 'ready' ? current : 'error');});
  }
  load();
  window.addEventListener('focus',load);
  return () => {active = false;window.removeEventListener('focus',load);};
},[]); useEffect(()=>{const h=()=>setRoute(routeEntry());window.addEventListener('popstate',h);return()=>window.removeEventListener('popstate',h)},[]); useEffect(()=>{document.documentElement.dir=lang==='ar'?'rtl':'ltr'; document.documentElement.lang=lang; document.documentElement.classList.toggle('dark-mood',dark); localStorage.setItem('sparkle-mood',dark?'dark':'light'); localStorage.setItem('sparkle-language',lang); requestAnimationFrame(()=>translateVisibleText(lang));},[lang,path,dark]); const workshops = React.useMemo(() => {
  const entries = new Map(originalWorkshops.map(workshop => [workshop.slug,workshop]));
  for (const {key,body} of content.workshops) {
    if (!body.published) {entries.delete(key);continue;}
    entries.set(key,{location:'Nablus — Palestine',icon:'🎀',...entries.get(key),...body,slug:key,
      managed:true,time:body.date || entries.get(key)?.time || 'Message us',price:'₪' + (body.price/100).toFixed(2),status:body.seats ? 'Upcoming' : 'Fully booked'});
  }
  return [...entries.values()];
},[content.workshops]); const localized = React.useMemo(() => Object.fromEntries([...products,...workshops].flatMap(p => [[p.name,p.nameAr],[p.description,p.descriptionAr],[p.category,p.categoryAr],[p.collection,p.collectionAr],...(p.variants ?? []).map(v => [v.name,v.nameAr])]).filter(([,value]) => value)),[products,workshops]); const value={lang,t:(text)=> lang === 'ar' ? localized[text] || translate(text,lang) : text}; if (path === '/admin') return <React.Suspense fallback={<p>Loading…</p>}><Admin/></React.Suspense>; let view=path==='/'?<Home/>:path==='/checkout'?<Checkout lang={lang} t={value.t} navigate={navigate} catalogStatus={status}/>:path==='/about'?<About/>:path==='/shop'?<Shop/>:path==='/diy-kits'?<Kits/>:path==='/workshops'?<Workshops/>:path==='/custom-orders'?<CustomOrders/>:path==='/how-to-order'?<HowToOrder/>:path==='/contact'?<Contact/>:path.startsWith('/products/')?<ProductDetail key={path} product={customProducts.find(p=>p.slug===path.split('/').pop())} backTo="/custom-orders"/>:path.startsWith('/shop/')?<ProductDetail key={path + ':' + status} product={resolveProduct(products, path.split('/').pop())} backTo={products.some(item => item.kind === 'kit' && path === '/shop/' + item.slug) ? '/diy-kits' : undefined}/>:path.startsWith('/workshops/')?<WorkshopDetail workshop={workshops.find(w=>w.slug===path.split('/').pop())}/>:<Home/>; return <TranslationContext.Provider value={value}><CatalogContext.Provider value={{products,status,workshops}}><CartProvider catalog={status === 'ready' ? products : null}><RouteScrollRestoration entryKey={route.key}/><Header lang={lang} setLang={setLang} dark={dark} setDark={setDark}/>{path === '/' && content.website.filter(row => row.body.published).map(({key,body}) => <section data-commerce key={key} className="section blush-section"><h2>{lang === 'ar' ? body.nameAr || body.name : body.name}</h2><p>{lang === 'ar' ? body.descriptionAr || body.description : body.description}</p></section>)}{view}{path.startsWith('/workshops/') && workshops.some(item => item.managed && item.slug === path.split('/').pop() && item.seats > 0) && <div className="commerce-page"><WorkshopRegistration lang={lang} slug={path.split('/').pop()}/></div>}{path === '/custom-orders' && <div className="commerce-page"><CustomRequest lang={lang}/></div>}<Footer lang={lang} setLang={setLang}/><Chatbot lang={lang} t={value.t} products={products} workshops={workshops} kits={kits} instagram={instagram} navigate={navigate}/><CartDrawer lang={lang} t={value.t} navigate={navigate}/></CartProvider></CatalogContext.Provider></TranslationContext.Provider>; }

createRoot(document.getElementById('root')).render(<App/>);
