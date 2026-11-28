export const validCheckoutName=value=>typeof value==='string' &&
  value.trim().length>0 && value.trim().length<=120 && !/[\p{Cc}\u2028\u2029]/u.test(value.trim());

export const validCheckoutAddress=value=>typeof value==='string' &&
  value.trim().length>0 && value.trim().length<=600 && !/[^\P{Cc}\r\n\t]/u.test(value.trim());
