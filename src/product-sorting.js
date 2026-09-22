export function sortProducts(products, sortBy = 'default') {
  return [...products].sort((a, b) => {
    let difference = 0;
    if (sortBy === 'price-asc' || sortBy === 'price-desc') {
      const aKnown = Number.isFinite(a.priceValue);
      const bKnown = Number.isFinite(b.priceValue);
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      if (aKnown) difference = sortBy === 'price-asc' ? a.priceValue - b.priceValue : b.priceValue - a.priceValue;
    } else if (sortBy === 'newest') {
      difference = b.addedOrder - a.addedOrder;
    } else if (sortBy === 'oldest') {
      difference = a.addedOrder - b.addedOrder;
    }
    return difference || a.defaultOrder - b.defaultOrder;
  });
}
