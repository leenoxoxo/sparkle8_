import {CircleCheck} from 'lucide-react';
import {promotionCopy,promotionTotal,originalPromotionSubtotal} from './quantity-promotions.jsx';
import {linePrice,priceRange,rangeExplanation} from './range-pricing.js';
import React, {useEffect, useState} from 'react';
import {api, ils} from './commerce-api.js';
import {useCart} from './Cart.jsx';
import {normalizeWhatsApp} from './whatsapp-phone.js';
import './commerce.css';
import {cloudImageProps} from './cloud-image.js';
import {variantDescription} from './variant-options.js';

const confirmationKey = 'sparkle-last-confirmation';
const attemptKey = 'sparkle-checkout-attempt';
const errors = {
  invalid_phone:['Enter a valid phone number.','أدخلي رقم هاتف صالحاً.'],
  stock_unavailable:['Some items are unavailable in the requested quantity. Review your cart.','بعض القطع غير متوفرة بالكمية المطلوبة. راجعي سلتك.'],
  quote_changed:['Prices or fees changed. Review the updated total before continuing.','تغيّرت الأسعار أو الرسوم. راجعي المجموع المحدّث قبل المتابعة.'],
  invalid_alternative_phone:['Enter a valid alternative mobile number.','أدخلي رقم هاتف بديل صالحاً.'],
  invalid_input:['Enter your name, city and street address.','أدخلي الاسم والمدينة وتفاصيل العنوان.']
};

function stored(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function remember(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* Checkout can still complete in the current tab. */ }
}

export function OrderSuccess({lang,navigate}) {
  const l=(en,ar)=>lang==='ar'?ar:en;
  const [result,setResult]=useState({pending:true});
  useEffect(()=>{
    let active=true;
    const token=stored(confirmationKey);
    if(!token){setResult({});return;}
    api('/checkout/orders/'+token).then(confirmation=>{if(active)setResult({confirmation});})
      .catch(()=>{if(active)setResult({});});
    return ()=>{active=false;};
  },[]);
  const {confirmation,pending}=result;
  return <main className="commerce-page" data-commerce><section className="commerce-panel order-success">
    {confirmation ? <><CircleCheck size={52} aria-hidden="true"/><h1>{l('Thank you for your order!','شكرًا على طلبك!')}</h1>
      <p className="order-reference"><bdi>{confirmation.reference}</bdi></p>
      <p>{l('Your order has been registered and is awaiting confirmation. Contact Sparkle on WhatsApp to confirm it and check the delivery fee.',
        'تم تسجيل طلبك وهو بانتظار التأكيد. تواصلي مع سباركل عبر واتساب لتأكيده ومعرفة رسوم التوصيل.')}</p>
      <div className="commerce-actions"><a className="button" href={confirmation.whatsappUrl} target="_blank" rel="noreferrer">
        {l('Confirm order via WhatsApp','تأكيد الطلب عبر واتساب')}</a></div>
    </> : <p role="status">{pending ? l('Loading your order…','جارٍ تحميل طلبك…') :
      l('This order confirmation is unavailable in this tab.','تأكيد الطلب غير متاح في علامة التبويب هذه.')}</p>}
    <button className="button secondary" onClick={()=>navigate('/shop')}>{l('Return to Shop','العودة إلى المتجر')}</button>
  </section></main>;
}

function PhoneField({alternative,fields,update,l}) {
  const prefix=alternative?'alternativePrefix':'prefix';
  const number=alternative?'alternativePhone':'phone';
  return <div className="checkout-phone">
    <label>{l('Country code','رمز الدولة')}<select name={prefix} dir="ltr" value={fields[prefix]} onChange={update}>
      <option value="+970">+970</option><option value="+972">+972</option></select></label>
    <label>{alternative ? l('Alternative mobile (optional)','هاتف بديل (اختياري)') : l('Primary mobile / WhatsApp','الهاتف الأساسي / واتساب')}
      <input type="tel" dir="ltr" name={number} inputMode="tel" autoComplete={alternative?'off':'tel-national'}
        maxLength={32} required={!alternative} value={fields[number]} onChange={update}/></label>
  </div>;
}

export default function Checkout({lang, t, navigate, catalogStatus}) {
  const cart = useCart();
  const ar = lang === 'ar';
  const l = (english, arabic) => ar ? arabic : english;
  const [fields,setFields] = useState({name:'',prefix:'+970',phone:'',alternativePrefix:'+970',alternativePhone:'',address:''});
  const [city,setCity]=useState(null);
  const [destinations,setDestinations]=useState({items:[],loading:true});
  const [cityRefresh,setCityRefresh]=useState(0);
  useEffect(()=>{
    let active=true;
    setDestinations({items:[],loading:true});
    api('/delivery-destinations').then(items=>{if(active)setDestinations({items,loading:false});})
      .catch(()=>{if(active)setDestinations({items:[],loading:false,error:true});});
    return ()=>{active=false;};
  },[cityRefresh]);
  const [quote,setQuote] = useState(null);
  const [busy,setBusy] = useState(false);
  const submissionLock = React.useRef(false);
  const attempt = React.useRef(stored(attemptKey));
  const [error,setError] = useState('');
  const [recovering,setRecovering] = useState(()=>Boolean(attempt.current));
  const itemsKey = JSON.stringify(cart.items.map(({productId,variantId,quantity,kitChoices}) => ({productId,variantId,quantity,kitChoices})));
  const items = JSON.parse(itemsKey);

  function complete(submission) {
    remember(confirmationKey,submission);
    remember(attemptKey,'');
    attempt.current=null;
    cart.clear();
    navigate('/order-success',{replace:true});
  }
  useEffect(()=>{
    if(!attempt.current)return;
    let active=true;
    const token=attempt.current;
    api('/checkout/orders/'+token).then(()=>{if(active)complete(token);})
      .catch(()=>{if(active)setRecovering(false);});
    return ()=>{active=false;};
  },[]);
  useEffect(() => {
    setQuote(null);
    if (!JSON.parse(itemsKey).length) return;
    let active = true;
    setError('');
    api('/checkout/quote','POST',{items:JSON.parse(itemsKey)})
      .then(data => {if (active) setQuote({data,itemsKey});})
      .catch(e => {if (active) setError(e.message);});
    return () => {active = false;};
  }, [itemsKey]);

  const readyQuote = quote?.itemsKey === itemsKey ? quote.data : null;
  const update = event => {
    const {name,value}=event.target;
    setFields(current=>({...current,[name]:value}));
    if (['invalid_input','invalid_phone','invalid_alternative_phone'].includes(error)) setError('');
  };
  async function submit(event) {
    event.preventDefault();
    if (submissionLock.current || recovering || !readyQuote) return;
    const phone = normalizeWhatsApp(fields.prefix,fields.phone);
    if (![fields.name,fields.address].every(value=>value.trim())) {setError('invalid_input');return;}
    if(!city){setError('invalid_destination');return;}
    if (!phone) {
      setError('invalid_phone');
      return;
    }
    const alternativePhone=fields.alternativePhone.trim() ? normalizeWhatsApp(fields.alternativePrefix,fields.alternativePhone) : '';
    if (fields.alternativePhone.trim() && !alternativePhone) {setError('invalid_alternative_phone');return;}
    submissionLock.current = true;
    setBusy(true);
    setError('');
    let submission = attempt.current;
    if (!submission) {
      submission = crypto.randomUUID();
      attempt.current = submission;
      remember(attemptKey, submission);
    }
    try {
      await api('/checkout/orders','POST',{submission,items,expected:readyQuote,
        customer:{...fields,phone,alternativePhone,destinationCode:city.code,destinationRegion:city.region},language:lang});
      complete(submission);
    } catch (failure) {
      setError(failure.message);
      if(failure.message==='invalid_destination'){setCity(null);setCityRefresh(value=>value+1);}
      else if (failure.message === 'quote_changed') {
        try {
          const data = await api('/checkout/quote','POST',{items});
          setQuote({data,itemsKey});
        } catch (refreshError) {
          setQuote(null);
          setError(refreshError.message);
        }
      } else if (failure.status === 409) setQuote(null);
    } finally {
      submissionLock.current = false;
      setBusy(false);
    }
  }

  if (catalogStatus !== 'ready') return <main className="commerce-page" data-commerce><h1>{l('Checkout','إتمام الطلب')}</h1>
    <p role="status">{catalogStatus === 'loading' ? l('Loading cart…','جارٍ تحميل السلة…') : l('Checkout is temporarily unavailable.','إتمام الطلب غير متاح مؤقتاً.')}</p></main>;
  if (!items.length) return <main className="commerce-page" data-commerce><h1>{l('Checkout','إتمام الطلب')}</h1>
    <p>{l('Your cart is empty.','سلتك فارغة.')}</p><button className="button" onClick={() => navigate('/shop')}>{l('Shop','المتجر')}</button></main>;

  const lines = readyQuote?.lines ?? cart.items.map(item => ({...item,originalPrice:item.originalPrice ?? item.unitPrice}));
  const subtotal = readyQuote?.subtotal ?? lines.reduce((sum,line) => sum + line.originalPrice * line.quantity,0);
  const estimated = readyQuote ? readyQuote.estimatedMin : cart.estimatedMin;
  const maximum = readyQuote ? readyQuote.estimatedMax : cart.estimatedMax;
  const discount = readyQuote?.discount ?? lines.reduce((sum,line)=>sum+(line.originalPrice-line.unitPrice)*line.quantity,0);
  return <main className="commerce-page" data-commerce><h1>{l('Checkout','إتمام الطلب')}</h1>
    <form className="commerce-grid" onSubmit={submit}>
      <fieldset className="commerce-panel commerce-fields" disabled={busy}>
        <legend>{l('Customer information','معلومات العميل')}</legend>
        <label>{l('Full name','الاسم الكامل')}<input name="name" required autoComplete="name" maxLength={120} value={fields.name} onChange={update}/></label>
        <PhoneField fields={fields} update={update} l={l}/>
        <PhoneField alternative fields={fields} update={update} l={l}/>
        <CityPicker cities={destinations.items} selected={city} lang={lang} disabled={destinations.loading||destinations.error}
          error={error==='invalid_destination'} onSelect={value=>{setCity(value);if(error==='invalid_destination')setError('');}}/>
        {destinations.loading&&<small role="status">{l('Loading cities…','جارٍ تحميل المدن…')}</small>}
        {destinations.error&&<button type="button" className="button secondary" onClick={()=>setCityRefresh(value=>value+1)}>
          {l('Retry loading cities','أعيدي تحميل المدن')}</button>}
        <label>{l('Street and address details','الشارع وتفاصيل العنوان')}<textarea name="address" required autoComplete="street-address" maxLength={600} value={fields.address} onChange={update}/></label>
        <p>{l('We save these details to process your order, arrange delivery, and contact you about it.','نحفظ هذه البيانات لمعالجة طلبك وترتيب التوصيل والتواصل معك بشأنه.')}</p>
        <p><strong>{l('Cash on Delivery','الدفع عند الاستلام')}</strong></p>
      </fieldset>
      <section className="commerce-panel"><h2>{l('Order summary','ملخص الطلب')}</h2>
        {lines.map(line => {
          const variant = line.option?.name || line.variantName;
          return <article className={line.minPrice == null ? 'commerce-line' : 'commerce-line commerce-line-range'} key={JSON.stringify([line.productId,line.variantId,line.kitChoices])}>
            {(line.option?.image || line.image) && <img {...cloudImageProps(line.option?.image || line.image,[160])} alt="" loading="lazy"/>}
            <div><strong>{ar ? line.nameAr || t(line.name) : line.name}</strong>
              {variant && <div>{line.option?.choices?.length ? variantDescription(line.option,lang) : ar ? line.option?.nameAr || t(variant) : variant}</div>}
              {line.kitChoices?.length > 0 && <div>{line.kitChoices.map(t).join(' · ')}</div>}
              <div>{line.quantity} × <bdi dir="ltr">{linePrice(line,1,ils)}</bdi>{line.originalPrice > line.unitPrice && <> <del><bdi dir="ltr">{ils(line.originalPrice)}</bdi></del></>}</div>
              {line.quantityPromotion && <small className="quantity-preview">{promotionCopy(line.quantityPromotion,lang)} · {line.promotionalQuantity} × <bdi>{ils(line.promotionalUnitPrice)}</bdi></small>}</div>
            <strong><bdi dir="ltr">{line.lineTotal == null ? linePrice(line,line.quantity,ils) : ils(line.lineTotal)}</bdi></strong>
          </article>;
        })}
        <dl className="commerce-totals">
          <dt>{l('Original subtotal','المجموع قبل الخصم')}</dt><dd><bdi>{readyQuote ? originalPromotionSubtotal(readyQuote) : estimated==null ? ils(subtotal) : '—'}</bdi></dd>
          <dt>{l('Standard discounts','الخصومات العادية')}</dt><dd><bdi>{ils(discount-(readyQuote?.quantityDiscount ?? 0))}</bdi></dd>
          <dt>{l('Quantity promotion discounts','خصومات عروض الكمية')}</dt><dd><bdi>{ils(readyQuote?.quantityDiscount ?? 0)}</bdi></dd>
          <dt>{l('Total savings','إجمالي التوفير')}</dt><dd><bdi>{ils(discount)}</bdi></dd>
          <dt><strong>{estimated == null ? l('Total excluding delivery','الإجمالي دون التوصيل') : l('Estimated total excluding delivery','الإجمالي التقديري دون التوصيل')}</strong></dt>
          <dd><strong><bdi dir="ltr">{readyQuote ? promotionTotal(readyQuote) : estimated==null ? '—' : priceRange(estimated,maximum)}</bdi></strong></dd>
        </dl>
        <p>{l('Delivery fees are not included. They will be confirmed through WhatsApp.','رسوم التوصيل غير مشمولة وسيتم تأكيدها عبر واتساب.')}</p>
        {estimated != null && <p>{rangeExplanation[lang]}</p>}
        {error && <p role="alert">{error==='invalid_destination'?l('Select an available city from the list.','اختاري مدينة متاحة من القائمة.'):
          errors[error]?.[ar ? 1 : 0] || l('Checkout is temporarily unavailable. Please try again.','إتمام الطلب غير متاح مؤقتاً. حاولي مرة أخرى.')}</p>}
        <button className="button" disabled={!readyQuote || busy || recovering}>{busy ? l('Saving order…','جارٍ حفظ الطلب…') : l('Place Order','إرسال الطلب')}</button>
      </section>
    </form>
  </main>;
}
import CityPicker from './CityPicker.jsx';
