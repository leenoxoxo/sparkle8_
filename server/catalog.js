import {integer, invalid, slug, text} from './validation.js';
import {cloudinaryPath} from './images.js';
import {priceRange,rangeExplanation} from '../src/range-pricing.js';
import {selectionKey,variantChoices,variantTypes} from '../src/variant-options.js';

const localImage = /^\/(SHOP%20IMGS|CUSTOM%20ORDERS%20IMGS)\/[a-z0-9% ._'-]+\.(png|jpe?g|jpe|webp)$/i;

function images(value) {
  if (!Array.isArray(value) || value.length > 30 || value.some(path =>
    typeof path !== 'string' || !(cloudinaryPath.test(path) || localImage.test(path)) || /%2f|%5c|%2e/i.test(path))) invalid();
  return [...new Set(value)];
}

function optionGroups(input) {
  if (!Array.isArray(input) || input.length > 4) invalid();
  const ids = new Set();
  return input.map(group => {
    if (!slug(group?.id) || ids.has(group.id) || !variantTypes.some(([kind])=>kind===group.kind) ||
      !Array.isArray(group.values) || group.values.length < 1 || group.values.length > 40) invalid();
    ids.add(group.id);
    const values = new Set();
    return {id:group.id,kind:group.kind,name:text(group.name,80),nameAr:text(group.nameAr ?? '',80,0),
      values:group.values.map(value=>{
        if (!slug(value?.id) || values.has(value.id) ||
          (value.color != null && (group.kind !== 'color' || !/^#[0-9a-f]{6}$/i.test(value.color) || typeof value.color !== 'string'))) invalid();
        values.add(value.id);
        return {id:value.id,name:text(value.name,80),nameAr:text(value.nameAr ?? '',80,0),color:value.color ?? null};
      })};
  });
}

export function productInput(slugValue, body) {
  const p = body?.presentation;
  if (!slug(slugValue) || !p || !Array.isArray(body.skus) || body.skus.length > 40 ||
    typeof body.published !== 'boolean' || typeof body.archived !== 'boolean') invalid();
  const gallery = images(p.images ?? []);
  const groups = optionGroups(p.optionGroups ?? []);
  const combinations = new Set();
  const inputVariants = p.variants ?? [];
  if (!Array.isArray(inputVariants) || inputVariants.length > 40 || (groups.length && !inputVariants.length)) invalid();
  const variants = inputVariants.map(option => {
    if (!slug(option?.id)) invalid();
    const gallery = images(option.images ?? (option.image ? [option.image] : []));
    const inputColors = option.colors ?? [];
    if (!Array.isArray(inputColors) || inputColors.length > 8 || inputColors.some(color => typeof color !== 'string')) invalid();
    const colors = inputColors.map(color => color.trim()).filter(Boolean);
    if (colors.some(color => !/^#[a-f0-9]{6}$/i.test(color))) invalid();
    if (['enabled','visible'].some(key=>option[key] != null && typeof option[key] !== 'boolean')) invalid();
    let selections, choices;
    if (groups.length) {
      if (!option.selections || typeof option.selections!=='object' || Array.isArray(option.selections) ||
        Object.keys(option.selections).length !== groups.length ||
        groups.some(group=>!group.values.some(value=>value.id===option.selections[group.id]))) invalid();
      selections = Object.fromEntries(groups.map(group=>[group.id,option.selections[group.id]]));
      const key = selectionKey(groups,selections);
      if (combinations.has(key)) invalid();
      combinations.add(key);
      choices = variantChoices(groups,selections);
    }
    return {id: option.id, sku: text(option.sku ?? '',100,0),
      name: choices ? choices.map(choice=>choice.value).join(' / ') : text(option.name,100),
      nameAr: choices ? choices.map(choice=>choice.valueAr || choice.value).join(' / ') : text(option.nameAr ?? '',100,0),
      colors:choices ? choices.map(choice=>choice.color).filter(Boolean) : colors,
      image: gallery[0], images: gallery, displayPrice:text(option.displayPrice ?? '', 50, 0),
      enabled:option.enabled !== false,visible:option.visible !== false,
      displayOrder:integer(option.displayOrder ?? 0,1000000),
      ...(choices && {selections,choices})};
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
      unit_cost:sku.unit_cost == null ? null : integer(sku.unit_cost,100000000),
      stock: sku.stock == null ? null : integer(sku.stock, 1000000),
      expectedStock: sku.expectedStock == null ? null : integer(sku.expectedStock, 1000000),
      low_stock: integer(sku.low_stock, 1000000)};
  });
  const aliases = p.aliases ?? [];
  if (!Array.isArray(aliases) || aliases.length > 40 || aliases.some(alias =>
    !slug(alias?.slug) || !ids.includes(alias.variant))) invalid();
  const details = p.details ?? [];
  if (!Array.isArray(details) || details.length > 30) invalid();
  const priceMode = p.priceMode ?? 'exact';
  if (!['exact','range','starting','quote'].includes(priceMode)) invalid();
  const minPrice = priceMode === 'range' ? integer(p.minPrice,100000000) : null;
  const maxPrice = priceMode === 'range' ? integer(p.maxPrice,100000000) : null;
  const defaultPrice = priceMode === 'exact' && p.defaultPrice != null ? integer(p.defaultPrice,100000000) : null;
  if (maxPrice < minPrice) invalid();
  const saleDates = [p.saleStarts,p.saleEnds].map(value => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.length > 35 || !Number.isFinite(Date.parse(value))) invalid();
    return new Date(value).toISOString();
  });
  if (saleDates[0] && saleDates[1] && saleDates[1] <= saleDates[0]) invalid();
  if (priceMode !== 'exact' && skus.some(sku => sku.base_price !== null)) invalid();
  return {published: body.published && !body.archived, archived: body.archived, skus,
    presentation: {kind: p.kind === 'kit' ? 'kit' : 'shop', sku:text(p.sku ?? '',100,0), draft:p.draft === true,
      kitPieces:p.kitPieces == null ? null : integer(p.kitPieces,8),
      kitOptions:Array.isArray(p.kitOptions) && p.kitOptions.length <= 25 ? [...new Set(p.kitOptions.map(option => text(option,80)))] : [],
      kitPalette:Array.isArray(p.kitPalette) && p.kitPalette.length <= 25 ? [...new Set(p.kitPalette.map(option => text(option,80)))] : [],
      kitDecorations:Array.isArray(p.kitDecorations) && p.kitDecorations.length <= 25 ? [...new Set(p.kitDecorations.map(option => text(option,80)))] : [],
      saleStarts:saleDates[0],saleEnds:saleDates[1],
      cost:p.cost == null ? null : integer(p.cost,100000000),trackStock:p.trackStock !== false,
      madeToOrder:p.madeToOrder === true,
      name: text(p.name, 150), nameAr: text(p.nameAr ?? '', 150, 0),
      description: text(p.description ?? '', 2000, 0), descriptionAr: text(p.descriptionAr ?? '', 2000, 0),
      category: text(p.category, 80), categoryAr: text(p.categoryAr ?? '', 80, 0),
      collection: text(p.collection ?? '', 100, 0), collectionAr: text(p.collectionAr ?? '', 100, 0),
      image: gallery[0], images: gallery, variants, optionGroups:groups, defaultPrice, aliases, details: details.map(line => text(line, 500)),
      tone: ['cream','pink','rose','lilac','peach'].includes(p.tone) ? p.tone : 'pink',
      icon: text(p.icon ?? '🎀', 20), priceMode, displayPrice: text(p.displayPrice ?? '', 50, 0),
      minPrice,maxPrice,
      ...(priceMode === 'range' && {
        pricingExplanation:text(p.pricingExplanation || rangeExplanation.en,1000),
        pricingExplanationAr:text(p.pricingExplanationAr || rangeExplanation.ar,1000)
      }),
      defaultVariant: ids.includes(p.defaultVariant) ? p.defaultVariant : ids[0],
      defaultOrder: integer(p.defaultOrder ?? 0, 1000000), addedOrder: integer(p.addedOrder ?? 0, 1000000),
      featured: p.featured === true}};
}

const ils = cents => '₪' + (cents / 100).toLocaleString('en-US', {maximumFractionDigits: 2, useGrouping: false});

function price(sku, presentation) {
  if (presentation.priceMode === 'range') return {
    price:priceRange(presentation.minPrice,presentation.maxPrice),priceValue:presentation.minPrice/100,
    availableStock:sku?.stock ?? 0,
    purchasable:sku?.stock > 0,
    status:!sku || sku.stock === 0 ? 'Sold Out' : 'Available to order'
  };
  if (!sku || sku.base_price == null) return {price: presentation.displayPrice || 'Message us', status: 'Available to order', purchasable: false};
  const sale = sku.sale_price ?? sku.base_price;
  return {price: ils(sale), priceValue: sale / 100,
    availableStock:sku.stock ?? 0,
    originalPrice: sale < sku.base_price ? ils(sku.base_price) : undefined,
    discountPercent: sale < sku.base_price ? Math.round((sku.base_price - sale) * 100 / sku.base_price) : undefined,
    purchasable: sku.stock > 0,
    status: sku.stock === 0 ? 'Sold Out' : sku.stock == null ? 'Available to order' : 'Available'};
}

export function storefrontProducts(rows) {
  return rows.map(row => {
    const {cost,sku:productSku,...p} = row.presentation;
    const skus = row.catalog_skus.filter(sku => sku.active);
    const variants = (p.variants ?? []).filter(option => option.visible !== false && skus.some(sku => sku.variant === option.id))
      .sort((a,b)=>(a.displayOrder ?? 0)-(b.displayOrder ?? 0))
      .map(option => {
        const sku = skus.find(sku => sku.variant === option.id);
        const {sku:internalSku,...publicOption}=option;
        return {...publicOption,...price(p.trackStock === false ? {...sku,stock:1} : sku,p.priceMode === 'range' ? p : option),
          ...(p.trackStock === false && {availableStock:null}),
          ...(option.enabled === false && {status:'Unavailable',purchasable:false})};
      });
    const selected = variants.find(option => option.id === p.defaultVariant && option.purchasable) ||
      variants.find(option=>option.purchasable) || variants.find(option=>option.id===p.defaultVariant) || variants[0];
    const sku = skus.find(sku => sku.variant === (selected?.id ?? ''));
    const groups = (p.optionGroups ?? []).map(group=>({...group,values:group.values.filter(value=>
      variants.some(variant=>variant.selections?.[group.id]===value.id))}));
    return {...p, ...(row.quantity_promotion && {quantityPromotion:row.quantity_promotion}),
      optionGroups:groups,slug: row.slug, ...price(p.trackStock === false && sku ? {...sku,stock:1} : sku,p.priceMode === 'range' ? p : selected || p),
      ...(p.trackStock === false && {availableStock:null}),
      ...(variants.length ? {variants, defaultVariant: selected.id,
        status: variants.every(option => option.status === 'Sold Out') ? 'Sold Out' :
          variants.some(option => option.purchasable) ? 'Available' :
            variants.some(option=>option.status==='Available to order') ? 'Available to order' : 'Unavailable',
        purchasable:variants.some(option=>option.purchasable)} : {variants: undefined,
          ...(p.variants?.length && {status:'Unavailable',purchasable:false,defaultVariant:undefined})})};
  }).sort((a, b) => a.defaultOrder - b.defaultOrder);
}
