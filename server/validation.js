import {HttpError} from './errors.js';

export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,119}$/.test(value);

export function invalid(code = 'invalid_input') {
  throw new HttpError(400, code);
}

export function text(value, max, min = 1) {
  if (typeof value !== 'string') invalid();
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) invalid();
  return trimmed;
}

export function integer(value, max) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) invalid();
  return value;
}

export function cart(items) {
  if (!Array.isArray(items) || !items.length || items.length > 40) invalid('invalid_cart');
  return items.map(item => {
    if (!slug(item?.productId) || (item.variantId && !slug(item.variantId)) || !item.quantity) invalid('invalid_cart');
    return {productId: item.productId, variantId: item.variantId || '', quantity: integer(item.quantity, 999)};
  });
}

export function customer(value) {
  const phone = text(value?.phone, 30);
  if (!/^\+?[\d\s().-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, ''))) invalid('invalid_phone');
  if (!slug(value.area)) invalid('delivery_unavailable');
  return {name: text(value.name, 120), phone, area: value.area,
    address: text(value.address, 300), notes: text(value.notes ?? '', 500, 0)};
}
