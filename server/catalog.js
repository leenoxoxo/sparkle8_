import {integer, invalid, slug, text} from './validation.js';
import {cloudinaryPath} from './images.js';

const localImage = /^\/(SHOP%20IMGS|CUSTOM%20ORDERS%20IMGS)\/[a-z0-9% ._'-]+\.(png|jpe?g|jpe|webp)$/i;

function images(value) {
  if (!Array.isArray(value) || value.length > 30 || value.some(path =>
    typeof path !== 'string' || !(cloudinaryPath.test(path) || localImage.test(path)) || /%2f|%5c|%2e/i.test(path))) invalid();
  return [...new Set(value)];
}

export function productInput(slugValue, body) {
  const p = body?.presentation;
  if (!slug(slugValue) || !p || !Array.isArray(body.skus) || body.skus.length > 40 ||
    typeof body.published !== 'boolean' || typeof body.archived !== 'boolean') invalid();
  const gallery = images(p.images ?? []);
  const inputVariants = p.variants ?? [];
  if (!Array.isArray(inputVariants) || inputVariants.length > 40) invalid();
  const variants = inputVariants.map(option => {
    if (!slug(option?.id)) invalid();
    const gallery = images(option.images ?? (option.image ? [option.image] : []));
    const inputColors = option.colors ?? [];
    if (!Array.isArray(inputColors) || inputColors.length > 8 || inputColors.some(color => typeof color !== 'string')) invalid();
    const colors = inputColors.map(color => color.trim()).filter(Boolean);
    if (colors.some(color => !/^#[a-f0-9]{6}$/i.test(color))) invalid();
    return {id: option.id, sku: text(option.sku ?? '',100,0), name: text(option.name, 100), nameAr: text(option.nameAr ?? '', 100, 0),
      colors, image: gallery[0], images: gallery, displayPrice:text(option.displayPrice ?? '', 50, 0)};
  });
  const ids = variants.map(option => option.id);
  const skuIds = body.skus.map(sku => sku?.variant);
  if (new Set(ids).size !== ids.length || skuIds.length !== (ids.length || 1) ||
    new Set(skuIds).size !== skuIds.length || skuIds.some(id => !(ids.length ? ids : ['']).includes(id))) invalid();
  const skus = body.skus.map(sku => {
    const base = sku.base_price == null ? null : integer(sku.base_price, 100000000);
    const discount = sku.discountPercent == null ? null : integer(sku.discountPercent, 100);
    const sale = discount != null && base != null ? Math.round(base * (100 - discount) / 100) :
      sku.sale_price == null ? null : integer(sku.sale_price, base ?? 0);
    if (sale !== null && base === null) invalid();
    return {variant: sku.variant, base_price: base, sale_price: sale,
      stock: sku.stock == null ? null : integer(sku.stock, 1000000),
      expectedStock: sku.expectedStock == null ? null : integer(sku.expectedStock, 1000000),
      low_stock: integer(sku.low_stock, 1000000)};
  });
  const aliases = p.aliases ?? [];
  if (!Array.isArray(aliases) || aliases.length > 40 || aliases.some(alias =>
    !slug(alias?.slug) || !ids.includes(alias.variant))) invalid();
  const details = p.details ?? [];
  if (!Array.isArray(details) || details.length > 30) invalid();
  const priceMode = ['exact','starting','quote'].includes(p.priceMode) ? p.priceMode : 'exact';
  const saleDates = [p.saleStarts,p.saleEnds].map(value => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.length > 35 || !Number.isFinite(Date.parse(value))) invalid();
    return new Date(value).toISOString();
  });
  if (saleDates[0] && saleDates[1] && saleDates[1] <= saleDates[0]) invalid();
  if (priceMode !== 'exact' && skus.some(sku => sku.base_price !== null)) invalid();
  return {published: body.published && !body.archived, archived: body.archived, skus,
    presentation: {kind: p.kind === 'kit' ? 'kit' : 'shop', sku:text(p.sku ?? '',100,0), draft:p.draft === true,
      saleStarts:saleDates[0],saleEnds:saleDates[1],
      cost:p.cost == null ? null : integer(p.cost,100000000),trackStock:p.trackStock !== false,
      madeToOrder:p.madeToOrder === true,
      name: text(p.name, 150), nameAr: text(p.nameAr ?? '', 150, 0),
      description: text(p.description ?? '', 2000, 0), descriptionAr: text(p.descriptionAr ?? '', 2000, 0),
      category: text(p.category, 80), categoryAr: text(p.categoryAr ?? '', 80, 0),
      collection: text(p.collection ?? '', 100, 0), collectionAr: text(p.collectionAr ?? '', 100, 0),
      image: gallery[0], images: gallery, variants, aliases, details: details.map(line => text(line, 500)),
      tone: ['cream','pink','rose','lilac','peach'].includes(p.tone) ? p.tone : 'pink',
      icon: text(p.icon ?? '🎀', 20), priceMode, displayPrice: text(p.displayPrice ?? '', 50, 0),
      defaultVariant: ids.includes(p.defaultVariant) ? p.defaultVariant : ids[0],
      defaultOrder: integer(p.defaultOrder ?? 0, 1000000), addedOrder: integer(p.addedOrder ?? 0, 1000000),
      featured: p.featured === true}};
}

const ils = cents => '₪' + (cents / 100).toLocaleString('en-US', {maximumFractionDigits: 2, useGrouping: false});

function price(sku, presentation) {
  if (!sku || sku.base_price == null) return {price: presentation.displayPrice || 'Message us', status: 'Available to order', purchasable: false};
  const sale = sku.sale_price ?? sku.base_price;
  return {price: ils(sale), priceValue: sale / 100,
    originalPrice: sale < sku.base_price ? ils(sku.base_price) : undefined,
    discountPercent: sale < sku.base_price ? Math.round((sku.base_price - sale) * 100 / sku.base_price) : undefined,
    purchasable: sku.stock > 0,
    status: sku.stock === 0 ? 'Sold Out' : sku.stock == null ? 'Available to order' : 'Available'};
}

export function storefrontProducts(rows) {
  return rows.map(row => {
    const {cost,...p} = row.presentation;
    const skus = row.catalog_skus.filter(sku => sku.active);
    const variants = (p.variants ?? []).filter(option => skus.some(sku => sku.variant === option.id))
      .map(option => {
        const sku = skus.find(sku => sku.variant === option.id);
        return {...option,...price(p.trackStock === false && sku ? {...sku,stock:1} : sku,option)};
      });
    const selected = variants.find(option => option.id === p.defaultVariant) || variants[0];
    const sku = skus.find(sku => sku.variant === (selected?.id ?? ''));
    return {...p, slug: row.slug, ...price(p.trackStock === false && sku ? {...sku,stock:1} : sku,selected || p),
      ...(variants.length ? {variants, defaultVariant: selected.id,
        status: variants.every(option => option.status === 'Sold Out') ? 'Sold Out' :
          variants.some(option => option.purchasable) ? 'Available' : 'Available to order'} : {variants: undefined})};
  }).sort((a, b) => a.defaultOrder - b.defaultOrder);
}
