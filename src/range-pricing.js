export const rangeExplanation = {
  en:'The final price depends on your design and customization details and will be confirmed via WhatsApp.',
  ar:'يتم تحديد السعر النهائي حسب تفاصيل التصميم المطلوب والاتفاق عليه عبر الواتساب.'
};

const currency = cents => '₪'+(cents/100).toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});
export const priceRange = (min,max,format=currency) => format(min)+'–'+format(max);

export const linePrice = (line,quantity=1,fixedFormat=currency,rangeFormat=currency) => line.minPrice == null ?
  fixedFormat(line.unitPrice*quantity) : priceRange(line.minPrice*quantity,line.maxPrice*quantity,rangeFormat);

export const cakeShop = '/shop?tab=cakes';
