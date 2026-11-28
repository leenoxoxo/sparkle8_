import React from 'react';
import {Sparkles} from 'lucide-react';
import './storefront-loading.css';

export function SparkleWordmark(){
  return <><Sparkles className="brand-mark" size={24} strokeWidth={2} aria-hidden="true"/><span>Sparkle</span></>;
}

export default function StorefrontLoading({loading,lang}){
  return <div className="storefront-loading" data-loading={loading} data-commerce>
    <div className="storefront-loading-mark">
      <div className="brand" aria-hidden="true"><SparkleWordmark/></div>
      <span className="storefront-loading-sparkle" aria-hidden="true">✦</span>
      <span className="storefront-loading-sparkle" aria-hidden="true">✧</span>
    </div>
    {loading&&<span className="storefront-loading-status" role="status">{lang==='ar'?'جارٍ تحميل سباركل…':'Loading Sparkle…'}</span>}
  </div>;
}
