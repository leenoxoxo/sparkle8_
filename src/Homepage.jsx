import {cakeShop} from './range-pricing.js';
import React,{useState} from 'react';
import {ClipboardList,MessageCircle,ShoppingBag,Sparkles,Star} from 'lucide-react';
import {imageCatalog} from './image-catalog.js';
import {defaultHomepage,homepageWorkshops,localText,workshopSchedule} from './homepage-model.js';
import {priceCents,money} from './cart-model.js';
import {ShopCard} from './Shop.jsx';
import {cloudImageProps} from './cloud-image.js';
import './homepage.css';

const fallback=defaultHomepage();
export const businessWhatsApp='https://wa.me/970594503571';

function Picture({src,alt,eager=false,width=640}) {
  const widths=eager ? [320,640,960,1280] : width>=640 ? [320,640,960] : [320,640];
  const sizes=eager ? '(max-width: 850px) 90vw, 52vw' : width<640 ? '(max-width: 850px) 48vw, 25vw' : '(max-width: 850px) 90vw, 42vw';
  return src ? <img {...cloudImageProps(src,widths,sizes)} alt={alt} loading={eager?'eager':'lazy'} decoding={eager?'auto':'async'}
    fetchPriority={eager?'high':undefined}/> : null;
}

function localLink(event,href,navigate,preview) {
  if (preview) {event.preventDefault();return;}
  if (!href.startsWith('/') || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(href);
}

export function OrderSteps({lang,description}) {
  const l=(en,ar)=>lang==='ar'?ar:en;
  const steps=[
    [ShoppingBag,'Choose','اختاري','Browse products and add your favorites to the cart.','تصفّحي المنتجات وأضيفي ما تحبين إلى السلة.'],
    [ClipboardList,'Place Your Order','أرسلي طلبك','Enter your name, mobile number, city, and address, then place your order.','أدخلي اسمك ورقم هاتفك ومدينتك وعنوانك ثم أرسلي الطلب.'],
    [MessageCircle,'Confirm on WhatsApp','أكّدي عبر واتساب','Use your order reference to confirm your order and check delivery fees on WhatsApp.','استخدمي رقم طلبك لتأكيده والاستفسار عن رسوم التوصيل عبر واتساب.']
  ];
  return <div className="home-order-steps" data-commerce><ol>{steps.map(([Icon,en,ar,text,textAr])=><li key={en}>
    <span className="home-step-symbol" aria-hidden="true"><Icon size={20}/></span><h3>{l(en,ar)}</h3><p>{l(text,textAr)}</p>
  </li>)}</ol><p>{description || l('Sparkle will confirm delivery details through WhatsApp. Payment is Cash on Delivery.',
    'تؤكّد سباركل تفاصيل التوصيل معك عبر واتساب. الدفع عند الاستلام.')}</p></div>;
}

export default function Homepage({home=fallback,products=[],workshops=[],legacyBanners=[],lang,t,navigate,preview=false}) {
  const l=(en,ar)=>lang==='ar'?ar:en;
  const field=value=>localText(value,lang);
  const link=(event,href)=>localLink(event,href,navigate,preview);
  const [photo,setPhoto]=useState(0);
  const [notice,setNotice]=useState('');
  const {hero,sections}=home;
  const heading=field(hero.title);
  const defaultTitle=heading===field(fallback.hero.title);
  const featured=(home.featuredProducts===null ? products.filter(item=>item.featured) :
    home.featuredProducts.flatMap(slug=>products.filter(item=>item.slug===slug))).slice(0,4);
  const kitPrices=products.filter(item=>item.kind==='kit').map(item=>priceCents(item.price)).filter(value=>value!==null);
  const classes=homepageWorkshops(workshops,home.featuredWorkshops);
  const reviews=home.reviews.filter(review=>review.approved && review.visible);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hebron',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const banners=home.banners.filter(item=>item.active && (!item.starts || item.starts<=today) && (!item.ends || item.ends>=today));
  const cta=(href,label,secondary=false)=><a className={'button'+(secondary?' secondary':'')} href={href} onClick={event=>link(event,href)}>{label}</a>;
  const sectionTitle=id=><div className="home-heading"><h2 id={'home-'+id}>{field(sections[id].title)}</h2>
    {field(sections[id].description) && <p>{field(sections[id].description)}</p>}</div>;
  const imagePromo=(id,href,label,extra)=><div className={'home-promo home-promo-'+id}>
    <div className="home-promo-image"><Picture src={sections[id].image || fallback.sections[id].image} alt={field(sections[id].title)}/></div>
    <div>{sectionTitle(id)}{extra}{cta(href,label)}</div>
  </div>;
  const explore=[
    ['/shop','Shop','المتجر','Ready-made creations & DIY Kits.','إبداعات جاهزة وأطقم للتزيين.',imageCatalog.shop.named['strawberry-cream-phone-case'],l('Hand-decorated Sparkle phone case','غطاء هاتف مزين يدوياً')],
    ['/workshops','Workshops','الورش','Creative experiences and unforgettable memories.','تجارب إبداعية وذكريات لا تُنسى.',imageCatalog.workshops.named['brush-workshop'],l('Sparkle brush decorating workshop','ورشة سباركل لتزيين الفُرش')],
    [cakeShop,'Fake Cake Boxes','علب كيك وهمية','Personalized creations made just for you.','إبداعات شخصية صُنعت خصيصاً لكِ.',imageCatalog.customOrders[1],l('Custom cream-decorated Sparkle box','علبة سباركل بتزيين مخصص')]
  ];
  const renderers={
    explore:()=> <>{sectionTitle('explore')}<div className="home-explore-grid">{explore.map(([href,en,ar,desc,descAr,image,alt])=><a className="home-explore-card" href={href} key={href} onClick={event=>link(event,href)}>
      <div className="home-explore-image"><Picture src={image} alt={alt} width={420}/></div><div><h3>{l(en,ar)}</h3><p>{l(desc,descAr)}</p></div>
    </a>)}</div>{banners.map((banner,index)=><article className="home-promo home-banner" key={index}>
      {banner.image && <div className="home-promo-image"><Picture src={banner.image} alt={field(banner.title)}/></div>}
      <div><h3>{field(banner.title)}</h3><p>{field(banner.description)}</p>{banner.button && cta(banner.button.href,field(banner.button.label),true)}</div>
    </article>)}{legacyBanners.filter(row=>row.body.published && row.body.name).map(({key,body})=><article className="home-promo home-banner" key={key}>
      <div><h3>{l(body.name,body.nameAr || body.name)}</h3><p>{l(body.description,body.descriptionAr || body.description)}</p></div>
    </article>)}</>,
    featured:()=> <>{sectionTitle('featured')}<div className="shop-compact-grid home-products">{featured.map(product=><ShopCard
      key={product.slug} product={product} lang={lang} t={t} link={link} onAdded={setNotice} lazy/>)}</div>
      <div className="home-section-action">{cta('/shop',l('View All Products','عرض كل المنتجات'),true)}</div><p className="shop-sr" role="status">{notice}</p></>,
    kits:()=>imagePromo('kits','/shop?tab=kits',l('Shop DIY Kits','تسوّقي أطقم التزيين'),kitPrices.length>0 &&
      <p className="home-price">{l('Starting from','تبدأ من')} <bdi>{money(Math.min(...kitPrices))}</bdi></p>),
    workshops:()=> <>{sectionTitle('workshops')}<div className="home-workshops">{classes.map(workshop=>{
      const scheduled=workshopSchedule(workshop)==='upcoming';
      const bookable=scheduled && workshop.managed && workshop.seats>0;
      return <article className="home-workshop-card" key={workshop.slug}>
        <div className="home-workshop-image"><Picture src={workshop.image} alt={t(workshop.name)}/></div>
        <div><span className="home-status">{scheduled ? l('Upcoming','قريباً') : l('Date to be announced','سيُعلن الموعد لاحقاً')}</span>
          <h3>{t(workshop.name)}</h3><ul>
            {scheduled && <li><time dateTime={workshop.date}>{new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(workshop.date+'T00:00:00Z'))} {workshop.startTime && <bdi>{workshop.startTime}</bdi>}</time></li>}
            {workshop.location && <li>{t(workshop.location)}</li>}
            {(workshop.duration || (!workshop.managed && workshop.time)) && <li>{t(workshop.duration || workshop.time)}</li>}
            {scheduled && Number.isInteger(workshop.seats) && <li>{l(workshop.seats+' seats available','المقاعد المتاحة: '+workshop.seats)}</li>}
          </ul>{workshop.price && <p className="home-workshop-price"><bdi>{t(workshop.price)}</bdi></p>}
          {cta('/workshops/'+workshop.slug,bookable ? l('Book Now','احجزي الآن') : l('View Details','عرض التفاصيل'),true)}</div>
      </article>;
    })}</div>{!classes.length && <p>{l('Workshop dates will be announced here.','ستُعلن مواعيد الورش هنا.')}</p>}
      <div className="home-section-action">{cta('/workshops',l('Explore All Workshops','استكشفي كل الورش'),true)}</div></>,
    custom:()=>imagePromo('custom',cakeShop,l('Explore Fake Cake Boxes','استكشفي علب الكيك الوهمية')),
    about:()=>imagePromo('about','/about',l('Discover Our Story','اكتشفي قصتنا'),<p className="home-price">{field(home.experience)}</p>),
    reviews:()=> <>{sectionTitle('reviews')}<div className="home-review-grid">{reviews.map((review,i)=><article key={i} className="home-review">
      {review.image && review.imageApproved && <div className="home-review-image"><Picture src={review.image} alt={l('Photo shared by','صورة من')+' '+review.name} width={320}/></div>}
      <div className="home-stars" aria-label={l(review.rating+' out of 5 stars',review.rating+' من ٥ نجوم')} role="img">
        {Array.from({length:5},(_,index)=><Star key={index} size={15} fill={index<review.rating?'currentColor':'none'} aria-hidden="true"/>)}</div>
      <blockquote>{field(review.text)}</blockquote><strong>{review.name}</strong>
      {review.related && <p><a href={review.related} onClick={event=>link(event,review.related)}>{l('View related item','عرض المنتج أو الورشة')}</a></p>}
    </article>)}</div></>,
    order:()=> <><div className="home-heading"><h2 id="home-order">{field(sections.order.title)}</h2>{field(sections.order.description) && <p>{field(sections.order.description)}</p>}</div><OrderSteps lang={lang}/></>
  };
  return <main className="sparkle-home" data-commerce>
    <section className="home-hero" data-home-section="hero" aria-labelledby="home-title">
      <div className="home-hero-copy">
        <p className="eyebrow">{l('Handmade in Nablus, Palestine','صُنع يدوياً في نابلس، فلسطين')}</p>
        <h1 id="home-title">{defaultTitle ? (lang==='ar' ? <>اصنعي شيئاً <em>يشبهك</em> تماماً.</> : <>Create Something <em>That Feels</em> Like You.</>) : heading}</h1>
        <p>{field(hero.description)}</p>
        <div className="home-hero-actions">{cta(hero.primary.href,field(hero.primary.label))}{cta(hero.secondary.href,field(hero.secondary.label),true)}</div>
      </div>
      <div className="home-hero-image">
        <Picture src={hero.images[photo%hero.images.length]} alt={l('Handmade Sparkle creations in the Nablus studio','إبداعات سباركل اليدوية في استوديو نابلس')} eager width={1000}/>
        <Sparkles className="home-sparkles" size={28} aria-hidden="true"/><span className="home-heart" aria-hidden="true">♡</span>
        {hero.images.length>1 && <div className="home-image-nav">{hero.images.map((_,i)=><button key={i} type="button" aria-pressed={i===photo}
          aria-label={l('Show image ','عرض الصورة ')+(i+1)} onClick={()=>setPhoto(i)}/>)}</div>}
      </div>
    </section>
    {home.order.filter(id=>sections[id].visible && (id!=='reviews' || reviews.length)).map(id=>
      <section key={id} data-home-section={id} className={'home-section home-section-'+id} aria-labelledby={'home-'+id}>{renderers[id]()}</section>)}
  </main>;
}
