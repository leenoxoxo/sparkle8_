import React from 'react';
import './commerce.css';

export default function PrivacyContent({lang,whatsapp}) {
  const ar=lang==='ar';
  return <section className="commerce-panel" data-commerce>
    <p>{ar?'نحفظ اسمك وأرقام الاتصال وعنوانك وتفاصيل طلبك لمعالجة الطلب وترتيب التوصيل.':'We save your name, contact numbers, delivery address, and order details to process your order and arrange delivery.'}</p>
    <p>{ar?'بعد تسجيل الطلب، يمكنك فتح رسالة واتساب تحتوي على اسمك ورقم طلبك. لا نسجلك تلقائياً في الرسائل التسويقية.':'After placing your order, you can open a WhatsApp draft containing your name and order reference. We do not automatically subscribe you to marketing.'}</p>
    <p>{ar?'للاستفسار عن بيانات طلبك، تواصلي مع سباركل عبر واتساب.':'For questions about your order data, contact Sparkle on WhatsApp.'}</p>
    <a href={whatsapp} target="_blank" rel="noreferrer">{ar?'تواصلي عبر واتساب':'Contact on WhatsApp'}</a>
  </section>;
}
