import { swatchBackground } from './cart-model.js';
import React from 'react';
import './variant-options.css';

export function ProductVariantSelector({ variants, selected, onSelect, t, lang }) {
  const colorsOnly = variants.every(variant => variant.colors?.length);
  return <fieldset className="product-variants">
    <legend>{t(colorsOnly ? 'Color' : 'Option')}: <span aria-live="polite">{selected && t(selected.name)}</span></legend>
    <div>{variants.map(variant => {
      const colors = variant.colors;
      const background = swatchBackground(colors);
      const disabled = variant.status==='Sold Out' || variant.enabled===false;
      const status = disabled ? ' · '+(lang==='ar' ? (variant.enabled===false ? 'غير متاح' : 'نفدت الكمية') : variant.status) : '';
      return <button type="button" className={colors?.length ? 'color-swatch' : 'variant-option'} key={variant.id}
        aria-label={`${t('Select')} ${t(variant.name)}${status}`} title={t(variant.name)+status}
        disabled={disabled} aria-pressed={variant.id === selected?.id} onClick={() => onSelect(variant.id)}>
        {colors?.length ? <span className="swatch-color" style={{background}} aria-hidden="true"/> : t(variant.name)}
      </button>;
    })}</div>
  </fieldset>;
}

export function ProductOptionSelector({groups,variants,selections,onChange,lang}) {
  const ar = lang==='ar';
  const l=(en,arabic)=>ar?arabic:en;
  const name=item=>(ar && item.nameAr) || item.name;
  const colorFirst=[...groups.filter(group=>group.kind==='color'),...groups.filter(group=>group.kind!=='color')];
  return <div className="product-option-groups" data-commerce>
    {colorFirst.map(group=>{
      const selected=group.values.find(value=>value.id===selections[group.id]);
      const options=group.values.filter(value=>variants.some(variant=>variant.selections[group.id]===value.id)).map(value=>{
        const matching=variants.filter(variant=>variant.selections[group.id]===value.id &&
          Object.entries(selections).every(([id,choice])=>id===group.id || variant.selections[id]===choice));
        const disabled=!matching.some(variant=>variant.purchasable);
        const soldOut=disabled && matching.length>0 && matching.every(variant=>variant.status==='Sold Out');
        return {...value,disabled,label:name(value)+(disabled
          ? ' · '+(soldOut ? l('Sold out','نفدت الكمية') : l('Unavailable','غير متاح')) : '')};
      });
      if(group.kind==='color') return <fieldset className="product-variants" key={group.id} data-option-missing={!selected||undefined}>
        <legend>{name(group)}{selected && <> · <span aria-live="polite">{name(selected)}</span></>}</legend>
        <div>{options.map(value=><button type="button" key={value.id} disabled={value.disabled}
          aria-pressed={value.id===selected?.id} aria-label={value.label} title={value.label}
          className={value.color ? 'color-swatch' : 'variant-option'}
          onClick={()=>onChange(group.id,value.id===selected?.id ? '' : value.id)}>
          {value.color ? <span className="swatch-color" style={{background:value.color}} aria-hidden="true"/> : value.label}
        </button>)}</div>
        {options.some(value=>value.disabled) && <small>{l('Some colors are unavailable for this selection.','بعض الألوان غير متاحة لهذا الاختيار.')}</small>}
      </fieldset>;
      return <label key={group.id} data-option-missing={!selected||undefined}>{name(group)}
        <select aria-label={name(group)} value={selected?.id ?? ''} onChange={event=>onChange(group.id,event.target.value)}>
          <option value="">{l('Choose an option','اختاري خياراً')}</option>
          {options.map(value=><option key={value.id} value={value.id} disabled={value.disabled}>{value.label}</option>)}
        </select>
      </label>;
    })}
    {Object.keys(selections).length>0 && <button type="button" className="button secondary" onClick={()=>onChange(null)}>{l('Clear selections','مسح الاختيارات')}</button>}
    {groups.some(group=>!selections[group.id]) && <p aria-live="polite">{l('Select every option to add this product to your cart.','اختاري جميع الخيارات لإضافة المنتج إلى السلة.')}</p>}
  </div>;
}

export function ProductDetailPrice({ product, t, lang }) {
  const amount = value => Number.parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''));
  const price = amount(product.price), original = amount(product.originalPrice);
  const discounted = Number.isFinite(price) && Number.isFinite(original) && original > price && price >= 0;
  const discount = discounted ? Math.round((original - price) / original * 100) : null;
  return <div className="product-price-row">
    <strong aria-label={t(discounted ? 'Sale price' : 'Price')}><bdi dir={product.price?.includes('₪') ? 'ltr' : undefined}>{t(product.price)}</bdi></strong>
    {discounted && <><del aria-label={t('Original price')}>{product.originalPrice}</del><span className="sale-badge">{lang === 'ar' ? `خصم ${discount}%` : `${discount}% OFF`}</span></>}
  </div>;
}
