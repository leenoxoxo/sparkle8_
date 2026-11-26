export function normalizeWhatsApp(prefix, input) {
  if (!['+970','+972'].includes(prefix) || typeof input !== 'string' || input.length > 32) return null;
  const converted = input.trim().replace(/[٠-٩۰-۹]/g, char => String(char.charCodeAt(0) % 16));
  if (!/^\+?[\d ().-]+$/.test(converted)) return null;
  let digits = converted.replace(/\D/g,'');
  if (converted.startsWith('+') || digits.startsWith('00') || /^(970|972)\d{9,10}$/.test(digits)) {
    const international = digits.replace(/^00/,'');
    if (!international.startsWith(prefix.slice(1))) return null;
    digits = international.slice(3);
  }
  digits = digits.replace(/^0/,'');
  const pattern = prefix === '+970' ? /^5[69]\d{7}$/ : /^5[0-689]\d{7}$/;
  return pattern.test(digits) ? prefix + digits : null;
}
