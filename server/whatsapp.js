const ils = cents => `₪${(cents / 100).toFixed(2)}`;

export function orderConfirmation(order) {
  const {snapshot: sale} = order;
  const {customer, destination} = sale;
  const ar = sale.language === 'ar';
  const label = (english, arabic) => ar ? arabic : english;
  const reference = '#SPK-' + String(order.reference).padStart(4, '0');
  const lines = sale.lines.flatMap((line, index) => [
    `${index + 1}. ${ar ? line.nameAr || line.name : line.name}`,
    ...(line.option ? [`   ${label('Color / Variant', 'اللون / الخيار')}: ${ar ? line.option.nameAr || line.option.name : line.option.name}`] : []),
    `   ${label('Quantity', 'الكمية')}: ${line.quantity}`,
    `   ${label('Unit Price', 'سعر القطعة')}: ${ils(line.unitPrice)}`,
    ...(line.originalPrice > line.unitPrice ? [`   ${label('Original Price', 'السعر الأصلي')}: ${ils(line.originalPrice)}`] : []),
    `   ${label('Total', 'المجموع')}: ${ils(line.unitPrice * line.quantity)}`
  ]);
  const message = [
    label('🎀 New Sparkle Order', '🎀 طلب جديد من سباركل'), '',
    `${label('Order ID', 'رقم الطلب')}: ${reference}`, '',
    label('Customer Information', 'معلومات العميل'),
    `${label('Name', 'الاسم')}: ${customer.name}`,
    `${label('Phone', 'الهاتف')}: ${customer.phone}`,
    `${label('City', 'المدينة أو القرية')}: ${ar ? destination.nameAr : destination.name}`,
    `${label('Address', 'العنوان')}: ${customer.address}`, '',
    label('🛍️ Order Details', '🛍️ تفاصيل الطلب'), ...lines, '',
    `${label('Subtotal', 'المجموع الفرعي')}: ${ils(sale.subtotal)}`,
    `${label('Discount', 'الخصم')}: ${ils(sale.discount)}`,
    `${label('Delivery Fee', 'رسوم التوصيل')}: ${ils(sale.deliveryFee)}`,
    `${label('Total Amount', 'الإجمالي')}: ${ils(sale.total)}`, '',
    `${label('Payment Method: Cash on Delivery', 'طريقة الدفع: الدفع عند الاستلام')}`,
    ...(customer.notes ? ['', `${label('Additional Notes', 'ملاحظات إضافية')}: ${customer.notes}`] : []), '',
    label('Thank you for shopping with Sparkle! 💗', 'شكراً لتسوقك مع سباركل! 💗')
  ].join('\n');
  return {reference, whatsappUrl: `https://wa.me/${sale.whatsapp}?text=${encodeURIComponent(message)}`};
}
