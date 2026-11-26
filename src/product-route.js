export function resolveProduct(products, slug) {
  const product = products.find(p => p.slug === slug || p.aliases?.some(alias => alias.slug === slug));
  if (!product) return undefined;
  const alias = product.aliases?.find(alias => alias.slug === slug);
  return alias ? {...product,defaultVariant:alias.variant} : product;
}
