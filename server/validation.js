import {HttpError} from './errors.js';
import {checkoutPhone} from '../src/whatsapp-phone.js';
import {validCheckoutName,validCheckoutAddress} from '../src/checkout-contact.js';

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
    const choices = item.kitChoices ?? [];
    if (!Array.isArray(choices) || choices.length > 8) invalid('invalid_cart');
    return {productId: item.productId, variantId: item.variantId || '', quantity: integer(item.quantity, 999),
      kitChoices: choices.map(choice => text(choice,80)).sort()};
  });
}

export function customer(value) {
  const name = value?.name ?? '';
  if (!validCheckoutName(name)) invalid('invalid_name');
  const city = text(value?.city,120);
  if (typeof value?.address !== 'string' || !value.address.trim()) invalid('address_required');
  if (!validCheckoutAddress(value.address)) invalid('invalid_address');
  const address = value.address.trim();
  if (value.phone == null || value.phone === '') invalid('phone_required');
  const phone = checkoutPhone(value.prefix,value.phone);
  if (!phone) invalid('invalid_phone');
  const alternative = value.alternativePhone ?? '';
  const alternativePhone = alternative === '' ? null : checkoutPhone(value.alternativePrefix,alternative);
  if (alternative !== '' && !alternativePhone) invalid('invalid_alternative_phone');
  const [firstName,...lastNames] = name.trim().split(/\s+/u);
  return {firstName,lastName:lastNames.join(' '),name:name.trim(),phone,alternativePhone,city,address,referenceFormat:'SP'};
}
