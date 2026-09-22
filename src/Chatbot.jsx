import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import './chatbot.css';

export function answerQuestion(question, { products, workshops, kits, t, arabic }) {
  const q = question.toLowerCase().replace(/[أإآ]/g, 'ا');
  const say = (en, ar) => arabic ? ar : en;
  const reply = (text, href = null) => ({ text, href });
  if (/refund|return|cancel|payment|pay\b|shipping|delivery|deliver|توصيل|شحن|ارجاع|استرجاع|الغاء|دفع/.test(q)) return reply(say('Please message Sparkle on Instagram to confirm delivery areas, fees, payment options, or cancellation and return terms for your order.', 'راسلي سباركل على إنستغرام لتأكيد مناطق ورسوم التوصيل وطرق الدفع وشروط الإلغاء والاسترجاع لطلبك.'));
  if (/date|when|schedule|next|موعد|متى|تاريخ/.test(q) && /workshop|ورش/.test(q)) return reply(say('Workshop dates and available seats must be confirmed through the latest Instagram announcement. You can browse the workshop types here.', 'يجب تأكيد مواعيد الورش والمقاعد المتاحة من خلال أحدث إعلان على إنستغرام. يمكنك استعراض أنواع الورش هنا.'), '/workshops');
  const item = [...products, ...workshops, ...kits].find(p => q.includes(p.name.toLowerCase()) || q.includes(t(p.name).toLowerCase().replace(/[أإآ]/g, 'ا')));
  if (item) return reply([t(item.name), t(item.description), item.price ? t(item.price) : say('Message us for pricing.', 'راسلينا لمعرفة السعر.'), item.time ? t(item.time) : '', item.status ? t(item.status) : '', ...(item.includes || []).map(t)].filter(Boolean).join('\n'), item.slug ? (workshops.includes(item) ? '/workshops/' : '/shop/') + item.slug : '/diy-kits');
  if (/workshop|class|session|ورش|دوره|دورة|حجز/.test(q)) return reply(workshops.map(w => [t(w.name), t(w.price), t(w.time), t(w.status)].join(' · ')).join('\n\n') + '\n\n' + say('Materials and tools are included. Confirm dates and reserve through Instagram.', 'المواد والأدوات مشمولة. أكدي المواعيد واحجزي عبر إنستغرام.'), '/workshops');
  if (/diy|kit|طقم|اطقم|اصنعي|بنفس/.test(q)) return reply(kits.map(k => t(k.name) + ': ' + t(k.price) + '\n' + t(k.description)).join('\n\n'), '/diy-kits');
  if (/custom|box|boxes|cake|مخصص|علب|كيك/.test(q)) return reply(say('Our fake cake boxes can be customized with your colors and decorations. The shop lists boxes from ₪60; final pricing depends on the details. Order at least one week before you need it and confirm your design on Instagram.', 'يمكن تخصيص علب الكيك الوهمي بالألوان والزينة التي تختارينها. يبدأ السعر المدرج في المتجر من 60 شيكل ويتغير حسب التفاصيل. اطلبي قبل أسبوع على الأقل وأكدي التصميم عبر إنستغرام.'), '/custom-orders');
  if (/price|cost|how much|سعر|اسعار|بكم|كم/.test(q)) return reply(products.map(p => t(p.name) + ': ' + t(p.price || 'Message us')).join('\n'), '/shop');
  if (/where|location|address|اين|وين|موقع|عنوان/.test(q)) return reply(say('Sparkle is based in Nablus, Palestine. Message us on Instagram to confirm the exact workshop venue or collection arrangements.', 'سباركل في نابلس، فلسطين. راسلينا على إنستغرام لتأكيد مكان الورشة أو ترتيبات الاستلام.'));
  if (/order|buy|purchase|contact|instagram|طلب|اشتري|شراء|تواصل|انست/.test(q)) return reply(say('Choose a product, kit, or workshop, then message Sparkle on Instagram. We will confirm the details, availability, and final price with you.', 'اختاري منتجاً أو طقماً أو ورشة، ثم راسلي سباركل على إنستغرام لتأكيد التفاصيل والتوفر والسعر النهائي.'), '/how-to-order');
  if (/product|shop|available|منتج|متجر|متوفر/.test(q)) return reply(say('Explore our handmade phone cases, mirrors, brushes, and fake cake boxes. Send the product name to ask about its listed details.', 'استكشفي أغطية الهواتف والمرايا والفُرش وعلب الكيك الوهمي المصنوعة يدوياً. أرسلي اسم المنتج للسؤال عن تفاصيله.'), '/shop');
  if (/^(hi|hello|hey|مرحبا|اهلا|سلام)[! .؟?]*$/.test(q)) return reply(say('Hello! Ask me about products, workshop prices, DIY kits, custom boxes, or how to order.', 'مرحباً! اسأليني عن المنتجات وأسعار الورش وأطقم اصنعيها بنفسك والعلب المخصصة وطريقة الطلب.'));
  return reply(say('I could not find an answer in the shop information. Try a product name or ask about workshops, prices, DIY kits, or ordering. For other questions, Sparkle can help on Instagram.', 'لم أجد إجابة في معلومات المتجر. جرّبي اسم منتج أو اسألي عن الورش والأسعار والأطقم وطريقة الطلب. للأسئلة الأخرى، تواصلي مع سباركل على إنستغرام.'));
}

export default function Chatbot({ lang, t, products, workshops, kits, instagram, navigate }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null), triggerRef = useRef(null), logRef = useRef(null);
  const arabic = lang === 'ar';
  const say = (en, ar) => arabic ? ar : en;
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, open]);
  const send = text => {
    const question = text.trim().slice(0, 500); if (!question) return;
    const answer = answerQuestion(question, { products, workshops, kits, t, arabic });
    setMessages(previous => [...previous, { text:question, user:true }, answer]); setInput('');
  };
  return <aside className="sparkle-chat" dir={arabic ? 'rtl' : 'ltr'}>
    {open && <section className="chat-panel" id="sparkle-chat-panel" role="dialog" aria-label={say('Sparkle help', 'مساعدة سباركل')} onKeyDown={event => { if (event.key === 'Escape') close(); }}>
      <div className="chat-heading"><Sparkles size={20}/><div><strong>{say('Ask Sparkle', 'اسألي سباركل')}</strong><small>{say('Shop information assistant', 'مساعد معلومات المتجر')}</small></div><button type="button" onClick={close} aria-label={say('Close chat', 'إغلاق المحادثة')}><X size={20}/></button></div>
      <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions">
        <p className="chat-message">{say('Hi! I can help with products, workshops, DIY kits, and orders using information from this site.', 'مرحباً! أساعدك بمعلومات هذا الموقع عن المنتجات والورش والأطقم والطلبات.')}</p>
        {messages.map((message, i) => <div key={i} className={'chat-message' + (message.user ? ' chat-user' : '')}><span>{message.text}</span>{message.href && <a href={message.href} onClick={event => { event.preventDefault(); navigate(message.href); close(); }}>{say('View details', 'عرض التفاصيل')} ↗</a>}</div>)}
      </div>
      <div className="chat-suggestions">{[say('Workshops', 'الورش'),say('Prices', 'الأسعار'),say('How to order', 'طريقة الطلب')].map(text => <button key={text} type="button" onClick={() => send(text)}>{text}</button>)}</div>
      <form className="chat-form" onSubmit={event => { event.preventDefault(); send(input); }}><input ref={inputRef} value={input} onChange={event => setInput(event.target.value)} maxLength={500} placeholder={say('Ask a question…', 'اكتبي سؤالك…')} aria-label={say('Your question', 'سؤالك')}/><button type="submit" disabled={!input.trim()} aria-label={say('Send question', 'إرسال السؤال')}><Send size={18}/></button></form>
      <a className="chat-contact" href={instagram} target="_blank" rel="noreferrer">{say('Need more help? Message us on Instagram', 'لمزيد من المساعدة، راسلينا على إنستغرام')} ↗</a>
    </section>}
    <button className="chat-launcher" ref={triggerRef} type="button" aria-expanded={open} aria-controls="sparkle-chat-panel" onClick={() => open ? close() : setOpen(true)}><Sparkles size={24} strokeWidth={2} aria-hidden="true"/><span>{say('Ask Sparkle', 'اسألي سباركل')}</span></button>
  </aside>;
}