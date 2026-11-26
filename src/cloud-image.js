import localImages from './optimized-images.json';

function cloudImage(url,width) {
  return typeof url === 'string' && /^https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\/(?:v\d+\/)?sparkle\/products\//.test(url)
    ? url.replace('/image/upload/','/image/upload/f_auto,q_auto,c_limit,w_'+width+'/')
    : url;
}

export function cloudImageProps(url,widths,sizes) {
  let variants;
  if(typeof url==='string' && url.startsWith('/')) {
    try {variants=localImages[decodeURIComponent(url)];} catch {}
  }
  if (variants) {
    const available=Object.keys(variants).map(Number);
    const entries=[...new Set(widths.map(width=>available.find(size=>size>=width) ?? available.at(-1)))];
    const src=variants[entries[0]];
    return entries.length===1 ? {src} : {src,srcSet:entries.map(width=>variants[width]+' '+width+'w').join(', '),sizes};
  }
  const src = cloudImage(url,widths[0]);
  if (src === url || widths.length === 1) return {src};
  return {src,srcSet:widths.map(width=>cloudImage(url,width)+' '+width+'w').join(', '),sizes};
}
