import React, {useEffect, useState} from 'react';
import {api, ils} from './commerce-api.js';
import {useCart} from './Cart.jsx';
import './commerce.css';

const confirmationKey = 'sparkle-last-confirmation';
const attemptKey = 'sparkle-checkout-attempt';
const formFields = [
  ['name','Full name','الاسم الكامل','name',120],
  ['phone','Phone number','رقم الهاتف','tel',30],
  ['address','Detailed delivery address','عنوان التوصيل بالتفصيل','street-address',300],
  ['notes','Additional notes (optional)','ملاحظات إضافية (اختياري)','off',500]
];
const errors = {
  invalid_phone:['Enter a valid phone number.','أدخلي رقم هاتف صالحاً.'],
  stock_unavailable:['Some items are unavailable in the requested quantity. Review your cart.','بعض القطع غير متوفرة بالكمية المطلوبة. راجعي سلتك.'],
  delivery_unavailable:['Choose a supported delivery area.','اختاري منطقة توصيل مدعومة.'],
  quote_changed:['Prices or fees changed. Review the updated total before continuing.','تغيّرت الأسعار أو الرسوم. راجعي المجموع المحدّث قبل المتابعة.'],
  invalid_input:['Check your name, phone number and delivery address.','تحققي من الاسم ورقم الهاتف وعنوان التوصيل.']
};

function stored(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function remember(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* Checkout can still complete in the current tab. */ }
}

export default function Checkout({lang, t, navigate, catalogStatus}) {
  const cart = useCart();
  const ar = lang === 'ar';
  const l = (english, arabic) => ar ? arabic : english;
  const [areas,setAreas] = useState([]);
  const [fields,setFields] = useState({name:'',phone:'',area:'',address:'',notes:''});
  const [quote,setQuote] = useState(null);
  const [busy,setBusy] = useState(false);
  const submissionLock = React.useRef(false);
  const [error,setError] = useState('');
  const [confirmation,setConfirmation] = useState(null);
  const [token,setToken] = useState(() => stored(confirmationKey));
  const itemsKey = JSON.stringify(cart.items.map(({productId,variantId,quantity}) => ({productId,variantId,quantity})));
  const items = JSON.parse(itemsKey);

  useEffect(() => {
    let active = true;
    api('/delivery').then(data => {if (active) setAreas(data);}).catch(e => {if (active) setError(e.message);});
    return () => {active = false;};
  }, []);
  useEffect(() => {
    if (!token || cart.items.length) return;
    let active = true;
    api('/checkout/orders/' + token).then(data => {if (active) setConfirmation(data);}).catch(() => {});
    return () => {active = false;};
  }, [token,cart.items.length]);
  useEffect(() => {
    setQuote(null);
    if (!fields.area || !JSON.parse(itemsKey).length) return;
    let active = true;
    setError('');
    api('/checkout/quote','POST',{items:JSON.parse(itemsKey),area:fields.area})
      .then(data => {if (active) setQuote({data,area:fields.area,itemsKey});})
      .catch(e => {if (active) setError(e.message);});
    return () => {active = false;};
  }, [fields.area,itemsKey]);

  const readyQuote = quote?.area === fields.area && quote.itemsKey === itemsKey ? quote.data : null;
  const update = event => setFields({...fields,[event.target.name]:event.target.value});
  async function submit(event) {
    event.preventDefault();
    if (submissionLock.current || !readyQuote) return;
    const phone = fields.phone.trim();
    if (!/^\+?[\d\s().-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g,''))) {
      setError('invalid_phone');
      return;
    }
    submissionLock.current = true;
    setBusy(true);
    setError('');
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    let submission = stored(attemptKey);
    if (!submission) {
      submission = crypto.randomUUID();
      remember(attemptKey, submission);
    }
    try {
      const result = await api('/checkout/orders','POST',{submission,items,expected:readyQuote,customer:fields,language:lang});
      remember(confirmationKey,submission);
      remember(attemptKey,'');
      setToken(submission);
      setConfirmation(result);
      cart.clear();
      if (popup && !popup.closed) popup.location.replace(result.whatsappUrl);
    } catch (failure) {
      popup?.close();
      setError(failure.message);
      if (failure.message === 'quote_changed') {
        try {
          const data = await api('/checkout/quote','POST',{items,area:fields.area});
          setQuote({data,area:fields.area,itemsKey});
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

  if (confirmation) return <main className="commerce-page" data-commerce><section className="commerce-panel">
    <h1>{l('Order saved','تم حفظ الطلب')}</h1><p><strong>{confirmation.reference}</strong></p>
    <p>{l('Press Send inside WhatsApp to share your order with Sparkle.','اضغطي إرسال داخل واتساب لمشاركة طلبك مع سباركل.')}</p>
    <div className="commerce-actions"><a className="button" target="_blank" rel="noreferrer" href={confirmation.whatsappUrl}>{l('Reopen WhatsApp','إعادة فتح واتساب')}</a>
      <button className="button secondary" onClick={() => navigate('/shop')}>{l('Continue shopping','متابعة التسوق')}</button></div>
  </section></main>;

  if (catalogStatus !== 'ready') return <main className="commerce-page" data-commerce><h1>{l('Checkout','إتمام الطلب')}</h1>
    <p role="status">{catalogStatus === 'loading' ? l('Loading cart…','جارٍ تحميل السلة…') : l('Checkout is temporarily unavailable.','إتمام الطلب غير متاح مؤقتاً.')}</p></main>;
  if (!items.length) return <main className="commerce-page" data-commerce><h1>{l('Checkout','إتمام الطلب')}</h1>
    <p>{l('Your cart is empty.','سلتك فارغة.')}</p><button className="button" onClick={() => navigate('/shop')}>{l('Shop','المتجر')}</button></main>;

  const lines = readyQuote?.lines ?? cart.items.map(item => ({...item,originalPrice:item.originalPrice ?? item.unitPrice}));
  const subtotal = readyQuote?.subtotal ?? lines.reduce((sum,line) => sum + line.originalPrice * line.quantity,0);
  const discount = readyQuote?.discount ?? subtotal - cart.total;
  return <main className="commerce-page" data-commerce><h1>{l('Checkout','إتمام الطلب')}</h1>
    <form className="commerce-grid" onSubmit={submit}>
      <fieldset className="commerce-panel commerce-fields" disabled={busy}>
        <legend>{l('Delivery details','بيانات التوصيل')}</legend>
        {formFields.slice(0,2).map(([name,en,arabic,autoComplete,max]) =>
          <label key={name}>{l(en,arabic)}<input name={name} required autoComplete={autoComplete}
            type={name === 'phone' ? 'tel' : 'text'} maxLength={max} value={fields[name]} onChange={update}/></label>)}
        <label>{l('City or village','المدينة أو القرية')}<select name="area" required value={fields.area} onChange={update}>
          <option value="">{l('Select your delivery area','اختاري منطقة التوصيل')}</option>
          {areas.map(area => <option key={area.code} value={area.code}>{ar ? area.nameAr : area.name}</option>)}
        </select></label>
        {formFields.slice(2).map(([name,en,arabic,autoComplete,max]) =>
          <label key={name}>{l(en,arabic)}<textarea name={name} maxLength={max} autoComplete={autoComplete}
            required={name === 'address'} value={fields[name]} onChange={update}/></label>)}
        <p><strong>{l('Cash on Delivery','الدفع عند الاستلام')}</strong></p>
      </fieldset>
      <section className="commerce-panel"><h2>{l('Order summary','ملخص الطلب')}</h2>
        {lines.map(line => {
          const variant = line.option?.name || line.variantName;
          return <article className="commerce-line" key={JSON.stringify([line.productId,line.variantId])}>
            {(line.option?.image || line.image) && <img src={line.option?.image || line.image} alt=""/>}
            <div><strong>{ar ? line.nameAr || t(line.name) : line.name}</strong>
              {variant && <div>{ar ? line.option?.nameAr || t(variant) : variant}</div>}
              <div>{line.quantity} × <bdi>{ils(line.unitPrice)}</bdi>{line.originalPrice > line.unitPrice && <> <del><bdi>{ils(line.originalPrice)}</bdi></del></>}</div></div>
            <strong><bdi>{ils(line.quantity * line.unitPrice)}</bdi></strong>
          </article>;
        })}
        <dl className="commerce-totals">
          <dt>{l('Subtotal','المجموع الفرعي')}</dt><dd><bdi>{ils(subtotal)}</bdi></dd>
          <dt>{l('Discount','الخصم')}</dt><dd><bdi>{ils(discount)}</bdi></dd>
          <dt>{l('Delivery fee','رسوم التوصيل')}</dt><dd><bdi>{readyQuote ? ils(readyQuote.deliveryFee) : '—'}</bdi></dd>
          <dt><strong>{l('Final total','الإجمالي')}</strong></dt><dd><strong><bdi>{readyQuote ? ils(readyQuote.total) : '—'}</bdi></strong></dd>
        </dl>
        {error && <p role="alert">{errors[error]?.[ar ? 1 : 0] || l('Checkout is temporarily unavailable. Please try again.','إتمام الطلب غير متاح مؤقتاً. حاولي مرة أخرى.')}</p>}
        <button className="button" disabled={!readyQuote || busy}>{busy ? l('Saving order…','جارٍ حفظ الطلب…') : l('Complete Order via WhatsApp','إتمام الطلب عبر واتساب')}</button>
      </section>
    </form>
  </main>;
}

export function CustomRequest({lang}) {
  const l = (en,ar) => lang === 'ar' ? ar : en;
  const [status,setStatus] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (status === 'busy') return;
    const form = event.currentTarget;
    setStatus('busy');
    try {
      await api('/custom-requests','POST',Object.fromEntries(new FormData(form)));
      form.reset();
      setStatus('saved');
    } catch {setStatus('error');}
  }
  return <form className="commerce-panel commerce-fields" data-commerce onSubmit={submit}>
    <h2>{l('Request a custom order','اطلبي تصميماً مخصصاً')}</h2>
    <label>{l('Full name','الاسم الكامل')}<input required name="name" autoComplete="name" maxLength={120}/></label>
    <label>{l('Phone number','رقم الهاتف')}<input required name="phone" type="tel" autoComplete="tel" maxLength={30}/></label>
    <label>{l('Tell us what you’d like','أخبرينا ماذا تريدين')}<textarea required name="description" maxLength={1500}/></label>
    <button className="button" disabled={status === 'busy'}>{l('Send request','أرسلي الطلب')}</button>
    {status === 'saved' && <p role="status">{l('Your request was saved.','تم حفظ طلبك.')}</p>}
    {status === 'error' && <p role="alert">{l('Check your information and try again.','تحققي من البيانات وحاولي مرة أخرى.')}</p>}
  </form>;
}

export function WorkshopRegistration({lang,slug}) {
  const l = (en,ar) => lang === 'ar' ? ar : en;
  const [state,setState] = useState('');
  return <form className="commerce-panel commerce-fields" data-commerce onSubmit={async event => {
    event.preventDefault();
    if (state === 'busy' || state === 'saved') return;
    setState('busy');
    try {
      await api('/workshops/' + slug + '/register','POST',Object.fromEntries(new FormData(event.currentTarget)));
      setState('saved');
    } catch {setState('error');}
  }}>
    <h2>{l('Register for this workshop','سجّلي في هذه الورشة')}</h2>
    <label>{l('Full name','الاسم الكامل')}<input required maxLength={120} name="name" autoComplete="name"/></label>
    <label>{l('Phone number','رقم الهاتف')}<input required maxLength={30} name="phone" type="tel" autoComplete="tel"/></label>
    <button className="button" disabled={state === 'busy' || state === 'saved'}>{l('Register','تسجيل')}</button>
    {state === 'saved' && <p role="status">{l('Your seat was reserved.','تم حجز مقعدك.')}</p>}
    {state === 'error' && <p role="alert">{l('Registration could not be saved. Check availability and try again.','تعذر التسجيل. تحققي من التوفر وحاولي مرة أخرى.')}</p>}
  </form>;
}
