import {usePricePreview,promotionTotal,originalPromotionSubtotal} from './quantity-promotions.jsx';
import React, {createContext,useContext,useState,useEffect,useRef} from 'react';
import {MessageCircle, ShoppingBag, X} from 'lucide-react';
import {CART_KEY,itemKey,cartPrices,priceCents,money,validQuantity,resolveItem,restoreCart,swatchBackground,stockLimit,remainingStock} from './cart-model.js';
import {linePrice,rangeExplanation} from './range-pricing.js';
import './cart.css';
import {cloudImageProps} from './cloud-image.js';
import {variantDescription} from './variant-options.js';
const CartContext=createContext(null);
const words={ 'Your cart':'سلتك','Close cart':'إغلاق السلة','Open cart':'فتح السلة','Add to Cart':'أضيفي إلى السلة','Quantity':'الكمية','Decrease quantity':'تقليل الكمية','Increase quantity':'زيادة الكمية','Price available on request':'السعر عند الطلب','Added to your cart ✨':'تمت الإضافة إلى سلتك ✨','Remove':'إزالة','Your cart is empty ✨':'سلتك فارغة ✨','Add something you love.':'أضيفي شيئاً تحبينه.','Continue Shopping':'متابعة التسوق','Subtotal':'المجموع الفرعي','Total':'الإجمالي','Your order':'طلبك','Copy Order Details':'نسخ تفاصيل الطلب','Order via Instagram':'اطلبي عبر إنستغرام','Order details copied! Paste them into your Instagram message 💗':'تم نسخ تفاصيل الطلب! الصقيها في رسالتك على إنستغرام 💗','Copy unavailable. Select and copy the order details below.':'تعذر النسخ التلقائي. حددي تفاصيل الطلب أدناه وانسخيها.','Cart could not be saved on this device. Keep this page open.':'تعذر حفظ السلة على هذا الجهاز. أبقي الصفحة مفتوحة.','Item total':'مجموع القطعة','Items':'قطع','Choose a color before adding to cart.':'اختاري اللون قبل الإضافة إلى السلة.'};
export const cartText=(text,lang)=>lang==='ar'?(words[text]||text):text;
export const useCart=()=>useContext(CartContext);
export function CartProvider({catalog,children}) {
  const [saved,setItems]=useState(()=>{try{return JSON.parse(localStorage.getItem(CART_KEY)||'[]');}catch{return [];}});
  const items = React.useMemo(() => catalog ? restoreCart(catalog,saved) : [],[catalog,saved]);
  const latest=useRef(saved);
  const replace=next=>{latest.current=next;setItems(next);};
  const [stockAdjusted,setStockAdjusted]=useState(false);
  const needsAdjustment=Boolean(catalog && Array.isArray(saved) &&
    saved.reduce((total,row)=>total+(validQuantity(row?.quantity)?row.quantity:0),0)>items.reduce((total,row)=>total+row.quantity,0));
  useEffect(()=>{
    if(needsAdjustment && latest.current===saved){
      setStockAdjusted(true);
      replace(items);
    }
  },[needsAdjustment,saved,items]);
  const [open,setOpen]=useState(false),[saveError,setSaveError]=useState(false);
  useEffect(()=>{try{localStorage.setItem(CART_KEY,JSON.stringify(saved));setSaveError(false);}catch{setSaveError(true);}},[saved]);
  useEffect(()=>{const listener=e=>{if(e.key===CART_KEY){try{replace(JSON.parse(e.newValue||'[]'));}catch{}}};window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener);},[]);
  const current=()=>restoreCart(catalog ?? [],latest.current);
  const addItem=(productId,variantId,quantity,kitChoices)=>{
    const item=resolveItem(catalog ?? [],{productId,variantId,quantity,kitChoices});
    if(!item)return false;
    const previous=current();
    if(quantity>remainingStock(previous,productId,variantId,item.limit))return false;
    const old=previous.find(row=>row.key===item.key);
    replace(old?previous.map(row=>row.key===item.key?{...row,quantity:row.quantity+quantity}:row):[...previous,item]);
    setStockAdjusted(false);
    return true;
  };
  const updateQuantity=(key,quantity)=>{
    if(!validQuantity(quantity))return;
    const previous=current(), item=previous.find(row=>row.key===key);
    if(item&&quantity<=remainingStock(previous,item.productId,item.variantId,item.limit,key)){
      replace(previous.map(row=>row.key===key?{...row,quantity}:row));
    }
  };
  return <CartContext.Provider value={{items,open,setOpen,saveError,stockAdjusted,addItem,updateQuantity,
    removeItem:key=>replace(current().filter(item=>item.key!==key)),clear:()=>{replace([]);setStockAdjusted(false);},
    count:items.reduce((sum,item)=>sum+item.quantity,0),...cartPrices(items)}}>{children}</CartContext.Provider>;
}
function Quantity({value,onChange,lang,max=999}){const ct=text=>cartText(text,lang);return <div className="cart-quantity" role="group" aria-label={ct('Quantity')}><button type="button" aria-label={ct('Decrease quantity')} disabled={value<=1} onClick={()=>onChange(value-1)}>−</button><output aria-live="polite">{value}</output><button type="button" aria-label={ct('Increase quantity')} disabled={value>=max} onClick={()=>onChange(value+1)}>+</button></div>;}
export function CartHeaderButton({lang}){const cart=useCart();return <button className="cart-header-button" aria-label={`${cartText('Open cart',lang)} (${cart.count})`} onClick={()=>cart.setOpen(true)}><ShoppingBag size={19}/>{cart.count>0&&<span className="cart-count">{cart.count}</span>}</button>;}
export function AddToCart({product,variant,lang,kitChoices=[],whatsapp,onMissingOptions}) {
  const {addItem,items}=useCart();const [quantity,setQuantity]=useState(1),[feedback,setFeedback]=useState(false);const ct=text=>cartText(text,lang);
  const l=(en,ar)=>lang==='ar'?ar:en;
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(false),3500);return()=>clearTimeout(timer);},[feedback]);
  const missingPrice=product.priceMode !== 'range' && priceCents(variant?.price??product.price)===null;
  const missingOptions=Boolean((product.variants?.length&&!variant) ||
    (product.kitOptions?.length && kitChoices.filter(Boolean).length !== (product.kitPieces || 1)));
  const limit=stockLimit(variant??product);
  const remaining=remainingStock(items,product.slug,variant?.id,limit);
  const selectedQuantity=Math.min(quantity,Math.max(1,remaining));
  const soldOut=(variant?.status??product.status)==='Sold Out'||limit===0;
  const unavailable=(variant?.purchasable ?? product.purchasable)===false;
  const needsOptions=missingOptions && !soldOut && !unavailable && !missingPrice;
  const canAdd=!missingOptions && !soldOut && !unavailable && !missingPrice;
  const quoteOnly=product.kind==='kit' && product.priceMode==='quote';
  const previewItems=product.quantityPromotion ? [...items.filter(item=>item.productId===product.slug),
    {productId:product.slug,variantId:variant?.id,quantity:selectedQuantity,kitChoices}] : [];
  const {quote}=usePricePreview(previewItems,Boolean(product.quantityPromotion && canAdd && remaining>0));
  return <div className="cart-add-area product-order-controls">
    {!missingPrice && !quoteOnly && <Quantity value={selectedQuantity} onChange={setQuantity} lang={lang} max={remaining}/>}
    {canAdd && (remaining===0 || (limit<999 && selectedQuantity===remaining)) && <small role="status">{remaining===0 ? l("You have reached the available stock limit.","لقد وصلت إلى الحد الأقصى للكمية المتوفرة.") : remaining===1 ? l("Only 1 item left in stock.","متبقي قطعة واحدة فقط.") : l(`Only ${remaining} more items available.`,`متبقي ${remaining} قطع متوفرة.`)}</small>}
    {quote?.quantityDiscount>0 && <small className="quantity-preview">{l('Promotional subtotal','السعر بعد العرض')} <bdi dir="ltr">{promotionTotal(quote)}</bdi></small>}
    <div className="product-purchase-bar">
      <span className="product-purchase-feedback" role="status">{feedback?ct('Added to your cart ✨'):''}</span>
      {quoteOnly ? <a className="button" href={whatsapp} target="_blank" rel="noreferrer">{l('Request a Quote','اطلبي عرض سعر')}</a> :
        <button type="button" className="button" disabled={(!canAdd&&!needsOptions)||(canAdd&&remaining===0)} onClick={()=>{
          if(needsOptions){onMissingOptions();return;}
          if(canAdd && addItem(product.slug,variant?.id,selectedQuantity,kitChoices))setFeedback(true);
        }}>{canAdd?ct('Add to Cart'):soldOut?l('Sold Out','نفدت الكمية'):needsOptions?l('Choose Options','اختاري الخيارات'):l('Unavailable for checkout','غير متاح للشراء')}</button>}
      <a className="button secondary product-purchase-contact" href={whatsapp} target="_blank" rel="noreferrer"
        aria-label={l('Ask on WhatsApp','اسألي عبر واتساب')} title={l('Ask on WhatsApp','اسألي عبر واتساب')}><MessageCircle size={22} aria-hidden="true"/></a>
    </div>
  </div>;
}
export function CartDrawer({lang,t,navigate}) {
  const cart=useCart(),dialog=useRef(null);const ct=text=>cartText(text,lang);
  const l=(en,ar)=>lang==='ar'?ar:en;
  const preview=usePricePreview(cart.items,cart.open);
  const quote=preview.quote;
  const quotedLines=new Map((quote?.lines ?? []).map(line=>[itemKey(line.productId,line.variantId,line.kitChoices),line]));
  const savings=cart.items.reduce((sum,item)=>sum+Math.max(0,(item.originalPrice ?? item.unitPrice)-item.unitPrice)*item.quantity,0);
  useEffect(()=>{if(!cart.open)return;const previous=document.activeElement;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current.showModal();return()=>{dialog.current?.close();document.body.style.overflow=oldOverflow;previous?.focus();};},[cart.open]);
  return <dialog ref={dialog} className="cart-dialog" aria-labelledby="cart-title" dir={lang==='ar'?'rtl':'ltr'} onCancel={()=>cart.setOpen(false)} onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const controls=[...dialog.current.querySelectorAll('button:not(:disabled), a[href], textarea, input, select, [tabindex="0"]')].filter(element=>element.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  }} onClick={event=>{if(event.target===dialog.current)cart.setOpen(false);}}><section className="cart-drawer"><div className="cart-heading"><h2 id="cart-title">{ct('Your cart')} <small>({cart.count})</small></h2><button className="cart-close" aria-label={ct('Close cart')} onClick={()=>cart.setOpen(false)}><X/></button></div>{cart.saveError&&<p role="status">{ct('Cart could not be saved on this device. Keep this page open.')}</p>}
  {cart.stockAdjusted&&<p role="status">{l('Stock changed. Review the updated quantities in your cart.','تغيّرت الكمية المتوفرة. راجعي الكميات المحدّثة في سلتك.')}</p>}
  {!cart.items.length?<div className="cart-empty"><p>{ct('Your cart is empty ✨')}</p><p>{ct('Add something you love.')}</p><button className="button" onClick={()=>{cart.setOpen(false);navigate('/shop');}}>{ct('Continue Shopping')}</button></div>:<><div className="cart-items">{cart.items.map(item=><article className="cart-item" key={item.key}>{item.image ? <img {...cloudImageProps(item.image,[160])} alt="" loading="lazy"/> : <span aria-hidden="true">✦</span>}<div className="cart-item-copy"><h3>{t(item.name)}</h3>{item.variantName&&<p className="cart-variant">{item.colors&&<span aria-hidden="true" style={{background:swatchBackground(item.colors)}}/>}{item.option?.choices?.length ? variantDescription(item.option,lang) : t(item.variantName)}</p>}{item.kitChoices?.length>0 && <p className="cart-variant">{item.kitChoices.map(t).join(' · ')}</p>}<p className="cart-unit-price"><b><bdi dir="ltr">{linePrice(item,1,money)}</bdi></b>{item.originalPrice>item.unitPrice&&<del>{money(item.originalPrice)}</del>}</p><Quantity value={item.quantity} max={remainingStock(cart.items,item.productId,item.variantId,item.limit,item.key)} onChange={quantity=>cart.updateQuantity(item.key,quantity)} lang={lang}/><p className="cart-item-total">{ct('Item total')}: <b><bdi dir="ltr">{quotedLines.get(item.key)?.lineTotal == null ? linePrice(item,item.quantity,money) : money(quotedLines.get(item.key).lineTotal)}</bdi></b></p><button className="cart-text-button" aria-label={`${ct('Remove')} ${t(item.name)} ${t(item.variantName||'')}`} onClick={()=>cart.removeItem(item.key)}>{ct('Remove')}</button></div></article>)}</div>
  <div className="cart-summary">
    {quote?.quantityDiscount>0 && <>
      <p><span>{l('Original subtotal','المجموع قبل الخصم')}</span><bdi>{originalPromotionSubtotal(quote)}</bdi></p>
      <p><span>{l('Quantity promotion discount','خصم عرض الكمية')}</span><bdi>−{money(quote.quantityDiscount)}</bdi></p>
    </>}
    {(quote?.discount ?? savings)>0 && <p><span>{l('Total savings','إجمالي التوفير')}</span><strong>{money(quote?.discount ?? savings)}</strong></p>}
    <p className="cart-total"><strong>{quote?.quantityDiscount>0 ? l('Promotional subtotal','المجموع بعد العرض') : cart.estimatedMin == null ? l('Product subtotal','إجمالي المنتجات') : l('Estimated product subtotal','إجمالي المنتجات التقديري')}</strong><strong><bdi dir={quote ? "ltr" : undefined}>{quote ? promotionTotal(quote) : preview.error ? '—' : l('Calculating…','جارٍ الحساب…')}</bdi></strong></p>
    {quote?.quantityDiscount>0 && <p><span>{l('Estimated order total','إجمالي الطلب التقديري')}</span><bdi>{promotionTotal(quote)}</bdi></p>}
    <p><span>{l('Delivery fee','رسوم التوصيل')}</span><span>{l('To be confirmed','تُحدد لاحقاً')}</span></p>
    {cart.estimatedMin != null && <p>{rangeExplanation[lang]}</p>}
    <p>{l('Cash on Delivery','الدفع عند الاستلام')}</p>
    <button className="button" onClick={()=>{cart.setOpen(false);navigate('/checkout');}}>{l('Proceed to Checkout','متابعة إتمام الطلب')}</button>
    <button className="cart-text-button" onClick={()=>cart.setOpen(false)}>{ct('Continue Shopping')}</button></div></>}
  </section></dialog>;
}
