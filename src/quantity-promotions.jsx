import React,{useEffect,useState} from 'react';
import {api,ils} from './commerce-api.js';
import {priceRange} from './range-pricing.js';
import './quantity-promotions.css';

import {promotionCopy} from './quantity-offer.js';
export {promotionCopy};

export function PromotionBadge({promotion,lang,details=false}) {
  if(!promotion) return null;
  const description=lang==='ar' ? promotion.descriptionAr : promotion.description;
  return <div className="quantity-promotion" data-commerce>
    <span>{promotionCopy(promotion,lang)}</span>
    {details && description && <p>{description}</p>}
  </div>;
}

export function usePricePreview(items,enabled) {
  const [state,setState]=useState(null);
  const key=enabled && items.length ? JSON.stringify(items.map(({productId,variantId,quantity,kitChoices})=>
    ({productId,variantId,quantity,kitChoices}))) : '';
  useEffect(()=>{
    if (!key) {setState(null);return;}
    let active=true;
    const refresh=()=>api('/checkout/preview','POST',{items:JSON.parse(key)}).then(quote=>{
      if(active) setState({key,quote});
    }).catch(()=>{if(active) setState({key,error:true});});
    const timer=setTimeout(refresh,180);
    return ()=>{active=false;clearTimeout(timer);};
  },[key]);
  return key && state?.key===key ? state : {};
}

export function promotionTotal(quote) {
  return quote.estimatedMin == null ? ils(quote.total) : priceRange(quote.estimatedMin,quote.estimatedMax,ils);
}

export function originalPromotionSubtotal(quote) {
  if(quote.estimatedMin == null) return ils(quote.subtotal);
  return priceRange(quote.estimatedMin+quote.discount,quote.estimatedMax+quote.discount,ils);
}
