export function orderReference(reference,format) {
  return format==='SP' ? 'SP-'+String(reference).padStart(6,'0') : '#SPK-'+String(reference).padStart(4,'0');
}
