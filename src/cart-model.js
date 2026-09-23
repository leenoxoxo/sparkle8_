export const CART_KEY = 'sparkle-cart-v1';
export function priceCents(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  const match = String(value ?? '').trim().match(/^(?:₪\s*)?(\d+(?:\.\d{1,2})?)$/);
  return match ? Math.round(Number(match[1]) * 100) : null;
}
export const money = cents => '₪' + (cents / 100).toLocaleString('en-US', {maximumFractionDigits:2});
export const validQuantity = quantity => Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 999;
export const itemKey = (productId, variantId) => JSON.stringify([productId, variantId || null]);
export function resolveItem(catalog, raw) {
  if (!raw || !validQuantity(raw.quantity)) return null;
  const base = catalog.find(product => product.slug === raw.productId);
  if (!base) return null;
  const variant = base.variants?.find(option => option.id === raw.variantId);
  if (base.variants?.length && !variant) return null;
  if (!base.variants?.length && raw.variantId) return null;
  const product = variant ? {...base, ...variant} : base;
  const cents = priceCents(product.price);
  if (cents === null || product.status === 'Sold Out') return null;
  return {key:itemKey(base.slug,variant?.id),productId:base.slug,variantId:variant?.id || null,name:base.name,variantName:variant?.name || null,image:product.image,colors:variant?.colors,unitPrice:cents,originalPrice:priceCents(product.originalPrice),quantity:raw.quantity};
}
export function restoreCart(catalog, saved) {
  if (!Array.isArray(saved)) return [];
  const merged=new Map();
  for(const raw of saved.slice(0,500)){const item=resolveItem(catalog,raw);if(item){const old=merged.get(item.key);merged.set(item.key,{...item,quantity:Math.min(999,item.quantity+(old?.quantity||0))});}}
  return [...merged.values()];
}
export function swatchBackground(colors) {
  return colors?.length === 1 ? colors[0] : colors?.length ? `linear-gradient(135deg, ${colors.map((color,i)=>`${color} ${i*100/colors.length}%, ${color} ${(i+1)*100/colors.length}%`).join(', ')})` : undefined;
}
export function orderSummary(items,t,ar=false) {
  const total=items.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0);
  return [ar?'مرحباً سباركل! ✨\nأود طلب:':"Hi Sparkle! ✨\nI'd like to order:",...items.map((item,i)=>[`${i+1}. ${t(item.name)}`,item.variantName?`${ar?'الخيار':'Variant'}: ${t(item.variantName)}`:null,`${ar?'الكمية':'Quantity'}: ${item.quantity}`,`${ar?'سعر القطعة':'Unit price'}: ${money(item.unitPrice)}`,`${ar?'المجموع الفرعي':'Subtotal'}: ${money(item.unitPrice*item.quantity)}`].filter(Boolean).join('\n')),`${ar?'الإجمالي':'Total'}: ${money(total)}`].join('\n\n');
}
