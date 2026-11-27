import React,{lazy,Suspense,useEffect,useState} from 'react';
import {api} from './commerce-api.js';
import {seasonalDefaults} from './seasonal-settings.js';

const WinterEffects=lazy(()=>import('./WinterEffects.jsx'));
const localPreview=import.meta.env.DEV && new URLSearchParams(location.search).get('winter-preview')==='1';

export default function SeasonalStorefront({animate}){
  const [settings,setSettings]=useState(null);
  useEffect(()=>{
    if(localPreview)return;
    let active=true,last=0;
    const refresh=()=>{
      if(Date.now()-last<30000)return;
      last=Date.now();
      api('/seasonal-effects').then(value=>{if(active)setSettings(value);})
        .catch(()=>{if(active)setSettings(null);});
    };
    refresh();
    window.addEventListener('focus',refresh);
    return ()=>{active=false;window.removeEventListener('focus',refresh);};
  },[]);
  const current=localPreview?{...seasonalDefaults,enabled:true}:settings;
  return current?.enabled?<Suspense fallback={null}><WinterEffects settings={current} animate={animate}/></Suspense>:null;
}
