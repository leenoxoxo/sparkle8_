import {orderReference} from '../src/order-reference.js';

export function orderConfirmation(order) {
  const {customer,language}=order.snapshot;
  const reference=orderReference(order.reference,customer.referenceFormat);
  const name=customer.name ?? [customer.firstName,customer.lastName].filter(Boolean).join(' ');
  const message=language==='ar'
    ? `مرحباً Sparkle 🎀\n\nالاسم: ${name}\nرقم الطلب: ${reference}\n\nبدي أكد طلبي وأعرف تكلفة التوصيل، شكرًا ♡`
    : `Hello Sparkle 🎀\n\nName: ${name}\nOrder number: ${reference}\n\nI would like to confirm my order and check the delivery fee. Thank you!`;
  return {reference,whatsappUrl:`https://wa.me/970594503571?text=${encodeURIComponent(message)}`};
}
