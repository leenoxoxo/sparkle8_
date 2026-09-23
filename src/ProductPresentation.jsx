import { swatchBackground } from './cart-model.js';
import React from 'react';

export function ProductVariantSelector({ variants, selected, onSelect, t }) {
  const colorsOnly = variants.every(variant => variant.colors?.length);
  return <fieldset className="product-variants">
    <legend>{t(colorsOnly ? 'Color' : 'Option')}: <span aria-live="polite">{t(selected.name)}</span></legend>
    <div>{variants.map(variant => {
      const colors = variant.colors;
      const background = swatchBackground(colors);
      return <button type="button" className={colors?.length ? 'color-swatch' : 'variant-option'} key={variant.id}
        aria-label={`${t('Select')} ${t(variant.name)}`} title={t(variant.name)}
        aria-pressed={variant.id === selected.id} onClick={() => onSelect(variant.id)}>
        {colors?.length ? <span className="swatch-color" style={{background}} aria-hidden="true"/> : t(variant.name)}
      </button>;
    })}</div>
  </fieldset>;
}

export function ProductDetailPrice({ product, t, lang }) {
  const amount = value => Number.parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''));
  const price = amount(product.price), original = amount(product.originalPrice);
  const discounted = Number.isFinite(price) && Number.isFinite(original) && original > price && price >= 0;
  const discount = discounted ? Math.round((original - price) / original * 100) : null;
  return <div className="product-price-row">
    <strong aria-label={t(discounted ? 'Sale price' : 'Price')}>{t(product.price)}</strong>
    {discounted && <><del aria-label={t('Original price')}>{product.originalPrice}</del><span className="sale-badge">{lang === 'ar' ? `خصم ${discount}%` : `${discount}% OFF`}</span></>}
  </div>;
}
