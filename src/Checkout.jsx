import {CircleCheck} from 'lucide-react';
import {promotionCopy,promotionTotal,originalPromotionSubtotal} from './quantity-promotions.jsx';
import {linePrice,priceRange,rangeExplanation} from './range-pricing.js';
import React, {useEffect, useState} from 'react';
import {api, ils} from './commerce-api.js';
import {useCart} from './Cart.jsx';
import CityPicker from './CityPicker.jsx';
import {checkoutPhone} from './whatsapp-phone.js';
import {validCheckoutName,validCheckoutAddress} from './checkout-contact.js';
import './commerce.css';
import {cloudImageProps} from './cloud-image.js';
import {variantDescription} from './variant-options.js';

const confirmationKey = 'sparkle-last-confirmation';
const attemptKey = 'sparkle-checkout-attempt';
let freshConfirmation;
const celebrationStars=[
  [-76,-35],[-83,2],[-60,42],[-36,-53],[-28,58],
  [28,58],[36,-53],[60,42],[83,2],[76,-35]
];
const errors = {
  phone_required:['Phone number is required.','رقم الهاتف مطلوب.'],
  invalid_name:['Please enter a valid name.','يرجى إدخال اسم صحيح.'],
  invalid_address:['Please enter a valid address.','يرجى إدخال عنوان صحيح.'],
  address_required:['Please enter your street and detailed address.','يرجى إدخال اسم الشارع والعنوان بالتفصيل.'],
  invalid_destination:['Please select your city.','يرجى اختيار المدينة.'],
  invalid_phone:['Please enter a valid 10-digit phone number.','يرجى إدخال رقم هاتف صحيح مكوّن من 10 أرقام.'],
  stock_unavailable:['Some items are unavailable in the requested quantity. Review your cart.','بعض القطع غير متوفرة بالكمية المطلوبة. راجعي سلتك.'],
  quote_changed:['Prices or fees changed. Review the updated total before continuing.','تغيّرت الأسعار أو الرسوم. راجعي المجموع المحدّث قبل المتابعة.'],
  invalid_alternative_phone:['Please enter a valid 10-digit additional phone number.','يرجى إدخال رقم هاتف بديل صحيح مكوّن من 10 أرقام.'],
  invalid_input:['Review your checkout information and try again.','راجعي بيانات الطلب وحاولي مرة أخرى.']
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
    if(freshConfirmation){
      setResult({confirmation:freshConfirmation,celebrate:true});
      freshConfirmation=undefined;
      return;
    }
    const token=stored(confirmationKey);
    if(!token){setResult({});return;}
    api('/checkout/orders/'+token).then(confirmation=>{if(active)setResult({confirmation});})
      .catch(()=>{if(active)setResult({});});
    return ()=>{active=false;};
  },[]);
  const {confirmation,pending,celebrate}=result;
  return <main className="commerce-page" data-commerce><section className="commerce-panel order-success" data-celebrate={celebrate}>
    {confirmation ? <><div className="order-success-mark" aria-hidden="true"><CircleCheck size={52}/>
      {celebrate&&<div className="order-success-stars">{celebrationStars.map(([x,y],index)=>
        <span key={index} style={{'--star-x':x+'px','--star-y':y+'px','--star-delay':index%3*45+'ms'}}>{index%2?'✧':'★'}</span>)}</div>}
      </div><h1>{l('Thank you for your order!','شكرًا على طلبك!')}</h1>
      <p className="order-reference"><bdi>{confirmation.reference}</bdi></p>
      <p className="order-success-message">{l('Your order has been registered and is awaiting confirmation. Contact Sparkle on WhatsApp to confirm it and check the delivery fee.',
        'تم تسجيل طلبك وهو بانتظار التأكيد. تواصلي مع سباركل عبر واتساب لتأكيده ومعرفة رسوم التوصيل.')}</p>
      <div className="commerce-actions"><a className="button" href={confirmation.whatsappUrl} target="_blank" rel="noreferrer">
        {l('Confirm order via WhatsApp','تأكيد الطلب عبر واتساب')}</a></div>
    </> : <p role="status">{pending ? l('Loading your order…','جارٍ تحميل طلبك…') :
      l('This order confirmation is unavailable in this tab.','تأكيد الطلب غير متاح في علامة التبويب هذه.')}</p>}
    <button className="button secondary" onClick={()=>navigate('/shop')}>{l('Return to Shop','العودة إلى المتجر')}</button>
  </section></main>;
}

function FieldError({name,message}){
  return message && <small className="checkout-field-error" id={name+'-error'} role="alert">{message}</small>;
}
const fieldAttributes=(name,error)=>({'aria-invalid':Boolean(error)||undefined,'aria-describedby':error?name+'-error':undefined});

function PhoneField({alternative,fields,update,l,message}) {
  const prefix=alternative?'alternativePrefix':'prefix';
  const number=alternative?'alternativePhone':'phone';
  return <div className="checkout-phone">
    <label>{l('Country code','رمز الدولة')}<select name={prefix} dir="ltr" value={fields[prefix]} onChange={update}>
      <option value="+970">+970</option><option value="+972">+972</option></select></label>
    <label><span>{alternative ? l('Alternative mobile (optional)','هاتف بديل (اختياري)') : l('Primary mobile / WhatsApp','الهاتف الأساسي / واتساب')}{!alternative&&<span aria-hidden="true"> *</span>}</span>
      <input type="tel" dir="ltr" name={number} inputMode="numeric" autoComplete={alternative?'off':'tel-national'}
        maxLength={32} required={!alternative} {...fieldAttributes(number,message)} value={fields[number]} onChange={update}/><FieldError name={number} message={message}/></label>
  </div>;
}

export default function Checkout({lang, t, navigate, catalogStatus,refreshStock}) {
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
  const [validated,setValidated]=useState(false);
  const [destinationRejected,setDestinationRejected]=useState(false);
  const [retryQuote,setRetryQuote]=useState(0);
  const form=React.useRef(null);
  const phone=checkoutPhone(fields.prefix,fields.phone);
  const alternative=checkoutPhone(fields.alternativePrefix,fields.alternativePhone);
  const fieldCodes={
    name:!validCheckoutName(fields.name)?'invalid_name':null,
    phone:!fields.phone?'phone_required':!phone?'invalid_phone':null,
    alternativePhone:fields.alternativePhone&&!alternative?'invalid_alternative_phone':null,
    city:!city?'invalid_destination':null,
    address:!fields.address.trim()?'address_required':!validCheckoutAddress(fields.address)?'invalid_address':null
  };
  const feedback=(name)=>(validated||(name==='city'&&destinationRejected))&&errors[fieldCodes[name]]?.[ar?1:0];
  const focusField=name=>requestAnimationFrame(()=>{
    const field=form.current?.elements.namedItem(name);
    if(field && !field.disabled){field.scrollIntoView({block:'center'});field.focus({preventScroll:true});}
  });
  useEffect(()=>{
    if(destinationRejected&&!destinations.loading&&!destinations.error)focusField('city');
  },[destinationRejected,destinations.loading,destinations.error]);
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
      .catch(e => {if (active) {setError(e.message);if(e.message==='stock_unavailable')refreshStock?.();}});
    return () => {active = false;};
  }, [itemsKey,retryQuote]);

  const readyQuote = quote?.itemsKey === itemsKey ? quote.data : null;
  const update = event => {
    const {name,value}=event.target;
    setFields(current=>({...current,[name]:value}));
    if (['invalid_input','invalid_name','invalid_address','phone_required','address_required','invalid_phone','invalid_alternative_phone'].includes(error)) setError('');
  };
  async function submit(event) {
    event.preventDefault();
    if (submissionLock.current || recovering) return;
    setValidated(true);
    const invalidField=Object.keys(fieldCodes).find(name=>fieldCodes[name]);
    if(invalidField){focusField(invalidField);return;}
    if(!readyQuote){if(error)setRetryQuote(value=>value+1);return;}
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
      freshConfirmation=await api('/checkout/orders','POST',{submission,items,expected:readyQuote,
        customer:{...fields,destinationCode:city.code,destinationRegion:city.region},language:lang});
      complete(submission);
    } catch (failure) {
      setError(failure.message);
      if(failure.message==='invalid_destination'){setDestinationRejected(true);setCity(null);setCityRefresh(value=>value+1);}
      else if(failure.message==='stock_unavailable'){setQuote(null);refreshStock?.();}
      else if (failure.message === 'quote_changed') {
        try {
          const data = await api('/checkout/quote','POST',{items});
          setQuote({data,itemsKey});
        } catch (refreshError) {
          setQuote(null);
          setError(refreshError.message);
          if(refreshError.message==='stock_unavailable')refreshStock?.();
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
    {cart.stockAdjusted&&<p role="status">{l('Items in your cart are no longer available.','القطع الموجودة في سلتك لم تعد متوفرة.')}</p>}
    <p>{l('Your cart is empty.','سلتك فارغة.')}</p><button className="button" onClick={() => navigate('/shop')}>{l('Shop','المتجر')}</button></main>;

  const lines = readyQuote?.lines ?? cart.items.map(item => ({...item,originalPrice:item.originalPrice ?? item.unitPrice}));
  const subtotal = readyQuote?.subtotal ?? lines.reduce((sum,line) => sum + line.originalPrice * line.quantity,0);
  const estimated = readyQuote ? readyQuote.estimatedMin : cart.estimatedMin;
  const maximum = readyQuote ? readyQuote.estimatedMax : cart.estimatedMax;
  const discount = readyQuote?.discount ?? lines.reduce((sum,line)=>sum+(line.originalPrice-line.unitPrice)*line.quantity,0);
  return <main className="commerce-page" data-commerce><h1>{l('Checkout','إتمام الطلب')}</h1>
    <form className="commerce-grid" ref={form} noValidate onSubmit={submit}>
      <fieldset className="commerce-panel commerce-fields" disabled={busy}>
        <legend>{l('Customer information','معلومات العميل')}</legend>
        <label>{l('Full name (optional)','الاسم الكامل (اختياري)')}<input name="name" autoComplete="name" maxLength={120} value={fields.name} onChange={update} {...fieldAttributes('name',feedback('name'))}/><FieldError name="name" message={feedback('name')}/></label>
        <PhoneField fields={fields} update={update} l={l} message={feedback('phone')}/>
        <PhoneField alternative fields={fields} update={update} l={l} message={feedback('alternativePhone')}/>
        <CityPicker cities={destinations.items} selected={city} lang={lang} disabled={destinations.loading||destinations.error}
          error={feedback('city')} onSelect={value=>{setCity(value);if(value){setDestinationRejected(false);if(error==='invalid_destination')setError('');}}}/>
        {destinations.loading&&<small role="status">{l('Loading cities…','جارٍ تحميل المدن…')}</small>}
        {destinations.error&&<button type="button" className="button secondary" onClick={()=>setCityRefresh(value=>value+1)}>
          {l('Retry loading cities','أعيدي تحميل المدن')}</button>}
        <label><span>{l('Street and address details','الشارع وتفاصيل العنوان')}<span aria-hidden="true"> *</span></span><textarea name="address" required autoComplete="street-address" maxLength={600} value={fields.address} onChange={update} {...fieldAttributes('address',feedback('address'))}/><FieldError name="address" message={feedback('address')}/></label>
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
        {cart.stockAdjusted&&<p role="status">{l('Stock changed. Review your updated quantities.','تغيّرت الكمية المتوفرة. راجعي الكميات المحدّثة.')}</p>}
        {!readyQuote && !error && <p role="status">{l('Updating the order total…','جارٍ تحديث إجمالي الطلب…')}</p>}
        {error && error!=='invalid_destination' && <p role="alert">{
          errors[error]?.[ar ? 1 : 0] || l('Checkout is temporarily unavailable. Please try again.','إتمام الطلب غير متاح مؤقتاً. حاولي مرة أخرى.')}</p>}
        <button className="button" disabled={busy || recovering}>{busy ? l('Saving order…','جارٍ حفظ الطلب…') : l('Place Order','إرسال الطلب')}</button>
      </section>
    </form>
  </main>;
}
