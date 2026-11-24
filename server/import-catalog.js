import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {extname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {legacyProducts} from '../src/legacy-catalog.js';
import {arabicTranslations} from '../src/storefront-translations.js';
import {kits} from '../src/kits.js';
import {priceCents} from '../src/cart-model.js';
import {productInput} from './catalog.js';
import {createPool,repository} from './database.js';
import {cloudImages} from './images.js';

const featured = new Set(['soft-blue-pink-cream-case','marshmallow-mirror','candy-cloud-brush']);
const ar = value => arabicTranslations[value] ?? '';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const folders = ['SHOP IMGS','CUSTOM ORDERS IMGS'];

async function imageFiles() {
  const files = new Map();
  for (const root of ['public','.']) {
    for (const folder of folders) {
      for (const entry of await readdir(join(root,folder),{withFileTypes:true})) {
        if (!entry.isFile()) continue;
        const extension = extname(entry.name).toLowerCase().replace(/^\.jpe?g?$|^\.jpeg$/, '.jpg');
        const mime = {'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif'}[extension];
        if (!mime) throw new Error('Review unsupported image format: ' + join(root,folder,entry.name));
        const bytes = await readFile(join(root,folder,entry.name));
        const hash = sha(bytes);
        const source = '/' + encodeURIComponent(folder) + '/' + encodeURIComponent(entry.name);
        const key = hash + extension;
        files.set(join(root,folder,entry.name), {source,key,mime,bytes});
      }
    }
  }
  const kitPhoto = 'DIY FIXED1.PNG';
  const bytes = await readFile(join('public',kitPhoto));
  const key = sha(bytes) + '.png';
  files.set(kitPhoto,{source:'/' + encodeURIComponent(kitPhoto),key,mime:'image/png',bytes});
  return [...files.values()];
}

export async function catalogImportPlan(urls = new Map(), files = null) {
  files ??= await imageFiles();
  // Public entries come first and determine the image served by the original storefront.
  const paths = new Map();
  for (const image of files) if (!paths.has(image.source)) {
    paths.set(image.source, urls.get(image.key) || 'https://res.cloudinary.com/sparkle-preview/image/upload/sparkle/products/' + image.key);
  }
  const imageUrl = path => {
    const url = paths.get(path);
    if (!url) throw new Error('Missing catalog image: ' + path);
    return url;
  };
  const kitProducts = kits.map((kit,i) => ({...kit,kind:'kit',featured:false,category:'DIY Kits',
    tone:'cream',icon:'🎀',image:'/DIY%20FIXED1.PNG',details:kit.includes,addedOrder:22+i,defaultOrder:22+i}));
  const products = [...legacyProducts,...kitProducts].map(p => {
    const options = p.variants?.length ? p.variants : [{...p,id:''}];
    const gallery = [p.image,...(p.images ?? [])].filter(Boolean).map(imageUrl);
    const skus = options.map(option => {
      const activePrice = priceCents(option.price);
      return {variant:option.id, base_price:priceCents(option.originalPrice) ?? activePrice,
        sale_price:priceCents(option.originalPrice) != null ? activePrice : null, stock:null, low_stock:2};
    });
    const {skus: validatedSkus, ...product} = productInput(p.slug,{
      published:true,archived:false,skus,
      presentation:{...p,nameAr:ar(p.name),descriptionAr:ar(p.description),categoryAr:ar(p.category),collectionAr:ar(p.collection),
        featured:featured.has(p.slug),images:gallery,displayPrice:p.price,
        priceMode:p.price.endsWith('+') ? 'starting' : priceCents(p.price) == null ? 'quote' : 'exact',
        variants:p.variants?.map(option => ({...option,nameAr:ar(option.name),displayPrice:option.price,
          images:[option.image,...(option.images ?? [])].filter(Boolean).map(imageUrl)}))}
    });
    return {target:p.slug,product,skus:validatedSkus};
  });
  return {products, images:[...new Map(files.map(image => [image.key,image])).values()]};
}

async function main() {
  const files = await imageFiles();
  const {products,images} = await catalogImportPlan(new Map(),files);
  console.log(`Catalog verified: ${products.length} products and kits with ${images.length} distinct images.`);
  if (!process.argv.includes('--apply')) return;
  const pool = createPool(process.env.DATABASE_URL);
  const db = repository(pool);
  const upload = cloudImages(process.env);
  try {
    const existing = new Set((await db.productSlugs()).map(row => row.slug));
    if (products.every(({target}) => existing.has(target))) {
      console.log('Catalog is already present.');
      return;
    }
    const urls = new Map();
    for (const {key,bytes} of images) {
      const [hash,deliveryFormat] = key.split('.');
      const url = await upload(bytes,hash,{existing:true,deliveryFormat});
      const stored = await fetch(url,{signal:AbortSignal.timeout(30000)});
      if (!stored.ok || sha(Buffer.from(await stored.arrayBuffer())) !== hash) throw new Error('Image checksum mismatch: ' + key);
      urls.set(key,url);
    }
    const ready = await catalogImportPlan(urls,files);
    for (const {target,product,skus} of ready.products) {
      if (!existing.has(target)) await db.saveProduct(target,product,skus);
    }
  } finally {await pool?.end();}
  console.log('Import complete. Set verified quantities in Sparkle Admin before accepting orders.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {console.error(error.message);process.exitCode = 1;});
}
