import React, {createContext,useContext,useState,useEffect,useRef} from 'react';
import {ShoppingBag, X} from 'lucide-react';
import {CART_KEY,priceCents,money,validQuantity,resolveItem,restoreCart,swatchBackground,orderSummary} from './cart-model.js';
import './cart.css';
const CartContext=createContext(null);
const words={ 'Your cart':'سلتك','Close cart':'إغلاق السلة','Open cart':'فتح السلة','Add to Cart':'أضيفي إلى السلة','Quantity':'الكمية','Decrease quantity':'تقليل الكمية','Increase quantity':'زيادة الكمية','Price available on request':'السعر عند الطلب','Added to your cart ✨':'تمت الإضافة إلى سلتك ✨','Remove':'إزالة','Your cart is empty ✨':'سلتك فارغة ✨','Add something you love.':'أضيفي شيئاً تحبينه.','Continue Shopping':'متابعة التسوق','Subtotal':'المجموع الفرعي','Total':'الإجمالي','Your order':'طلبك','Copy Order Details':'نسخ تفاصيل الطلب','Order via Instagram':'اطلبي عبر إنستغرام','Order details copied! Paste them into your Instagram message 💗':'تم نسخ تفاصيل الطلب! الصقيها في رسالتك على إنستغرام 💗','Copy unavailable. Select and copy the order details below.':'تعذر النسخ التلقائي. حددي تفاصيل الطلب أدناه وانسخيها.','Cart could not be saved on this device. Keep this page open.':'تعذر حفظ السلة على هذا الجهاز. أبقي الصفحة مفتوحة.','Item total':'مجموع القطعة','Items':'قطع','Choose a color before adding to cart.':'اختاري اللون قبل الإضافة إلى السلة.'};
export const cartText=(text,lang)=>lang==='ar'?(words[text]||text):text;
export const useCart=()=>useContext(CartContext);
export function CartProvider({catalog,children}) {
  const [items,setItems]=useState(()=>{try{return restoreCart(catalog,JSON.parse(localStorage.getItem(CART_KEY)||'[]'));}catch{return [];}});
  const [open,setOpen]=useState(false),[saveError,setSaveError]=useState(false);
  useEffect(()=>{try{localStorage.setItem(CART_KEY,JSON.stringify(items));setSaveError(false);}catch{setSaveError(true);}},[items]);
  useEffect(()=>{const listener=e=>{if(e.key===CART_KEY){try{setItems(restoreCart(catalog,JSON.parse(e.newValue||'[]')));}catch{}}};window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener);},[catalog]);
  const addItem=(productId,variantId,quantity)=>{const item=resolveItem(catalog,{productId,variantId,quantity});if(!item)return false;setItems(previous=>{const old=previous.find(p=>p.key===item.key);return old?previous.map(p=>p.key===item.key?{...item,quantity:Math.min(999,old.quantity+quantity)}:p):[...previous,item];});return true;};
  const updateQuantity=(key,quantity)=>{if(validQuantity(quantity))setItems(previous=>previous.map(item=>item.key===key?{...item,quantity}:item));};
  return <CartContext.Provider value={{items,open,setOpen,saveError,addItem,updateQuantity,removeItem:key=>setItems(previous=>previous.filter(item=>item.key!==key)),count:items.reduce((sum,item)=>sum+item.quantity,0),total:items.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0)}}>{children}</CartContext.Provider>;
}
function Quantity({value,onChange,lang}){const ct=text=>cartText(text,lang);return <div className="cart-quantity" role="group" aria-label={ct('Quantity')}><button type="button" aria-label={ct('Decrease quantity')} disabled={value<=1} onClick={()=>onChange(value-1)}>−</button><output aria-live="polite">{value}</output><button type="button" aria-label={ct('Increase quantity')} disabled={value>=999} onClick={()=>onChange(value+1)}>+</button></div>;}
export function CartHeaderButton({lang}){const cart=useCart();return <button className="cart-header-button" aria-label={`${cartText('Open cart',lang)} (${cart.count})`} onClick={()=>cart.setOpen(true)}><ShoppingBag size={19}/>{cart.count>0&&<span className="cart-count">{cart.count}</span>}</button>;}
export function AddToCart({product,variant,lang}) {
  const {addItem}=useCart();const [quantity,setQuantity]=useState(1),[feedback,setFeedback]=useState(false);const ct=text=>cartText(text,lang);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(false),3500);return()=>clearTimeout(timer);},[feedback]);
  const missing=priceCents(variant?.price??product.price)===null;
  const disabled=missing || (variant?.status??product.status)==='Sold Out' || Boolean(product.variants?.length&&!variant);
  return <div className="cart-add-area">{!missing&&<Quantity value={quantity} onChange={setQuantity} lang={lang}/>}<button type="button" className="button" disabled={disabled} onClick={()=>{if(addItem(product.slug,variant?.id,quantity))setFeedback(true);}}>{ct('Add to Cart')}</button>{missing&&<small>{ct('Price available on request')}</small>}<span className="cart-feedback" role="status">{feedback?ct('Added to your cart ✨'):''}</span></div>;
}
export function CartDrawer({lang,t,instagram,navigate}) {
  const cart=useCart(),dialog=useRef(null),summaryRef=useRef(null);const [notice,setNotice]=useState('');const ct=text=>cartText(text,lang);
  useEffect(()=>{if(!cart.open)return;const previous=document.activeElement;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current.showModal();return()=>{dialog.current?.close();document.body.style.overflow=oldOverflow;previous?.focus();};},[cart.open]);
  useEffect(()=>setNotice(''),[cart.items,lang]);
  const summary=orderSummary(cart.items,t,lang==='ar');
  const copy=async()=>{try{await navigator.clipboard.writeText(summary);setNotice('Order details copied! Paste them into your Instagram message 💗');return true;}catch{setNotice('Copy unavailable. Select and copy the order details below.');summaryRef.current?.focus();summaryRef.current?.select();return false;}};
  return <dialog ref={dialog} className="cart-dialog" aria-labelledby="cart-title" dir={lang==='ar'?'rtl':'ltr'} onCancel={()=>cart.setOpen(false)} onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const controls=[...dialog.current.querySelectorAll('button:not(:disabled), a[href], textarea, input, select, [tabindex="0"]')].filter(element=>element.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  }} onClick={event=>{if(event.target===dialog.current)cart.setOpen(false);}}><section className="cart-drawer"><div className="cart-heading"><h2 id="cart-title">{ct('Your cart')} <small>({cart.count})</small></h2><button className="cart-close" aria-label={ct('Close cart')} onClick={()=>cart.setOpen(false)}><X/></button></div>{cart.saveError&&<p role="status">{ct('Cart could not be saved on this device. Keep this page open.')}</p>}
  {!cart.items.length?<div className="cart-empty"><p>{ct('Your cart is empty ✨')}</p><p>{ct('Add something you love.')}</p><button className="button" onClick={()=>{cart.setOpen(false);navigate('/shop');}}>{ct('Continue Shopping')}</button></div>:<><div className="cart-items">{cart.items.map(item=><article className="cart-item" key={item.key}><img src={item.image} alt={t(item.name)}/><div className="cart-item-copy"><h3>{t(item.name)}</h3>{item.variantName&&<p className="cart-variant">{item.colors&&<span aria-hidden="true" style={{background:swatchBackground(item.colors)}}/>}{t(item.variantName)}</p>}<p className="cart-unit-price"><b>{money(item.unitPrice)}</b>{item.originalPrice>item.unitPrice&&<del>{money(item.originalPrice)}</del>}</p><Quantity value={item.quantity} onChange={quantity=>cart.updateQuantity(item.key,quantity)} lang={lang}/><p className="cart-item-total">{ct('Item total')}: <b>{money(item.unitPrice*item.quantity)}</b></p><button className="cart-text-button" aria-label={`${ct('Remove')} ${t(item.name)} ${t(item.variantName||'')}`} onClick={()=>cart.removeItem(item.key)}>{ct('Remove')}</button></div></article>)}</div>
  <div className="cart-summary"><p><span>{ct('Subtotal')}</span><span>{money(cart.total)}</span></p><p className="cart-total"><strong>{ct('Total')}</strong><strong>{money(cart.total)}</strong></p><label htmlFor="cart-order-summary">{ct('Your order')}</label><textarea ref={summaryRef} id="cart-order-summary" value={summary} readOnly rows={5}/><button className="button secondary" onClick={copy}>{ct('Copy Order Details')}</button><a className="button" href={instagram} target="_blank" rel="noopener noreferrer" onClick={copy}>{ct('Order via Instagram')}</a><p className="cart-copy-notice" role="status">{ct(notice)}</p><button className="cart-text-button" onClick={()=>cart.setOpen(false)}>{ct('Continue Shopping')}</button></div></>}
  </section></dialog>;
}
