import React,{useId,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {deliveryRegions,matchesDestination} from './delivery-destinations.js';

export default function CityPicker({cities,selected,onSelect,lang,disabled,error}){
  const ar=lang==='ar',l=(en,arText)=>ar?arText:en;
  const id=useId(),input=useRef(null);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(-1);
  const name=city=>ar?city.name_ar:city.name;
  const matches=cities.filter(city=>matchesDestination(city,query));
  const ordered=deliveryRegions.flatMap(([region])=>matches.filter(city=>city.region===region));
  const select=city=>{onSelect(city);setOpen(false);setQuery('');setActive(-1);};
  const close=()=>{setOpen(false);setQuery('');setActive(-1);};
  return <div className="city-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))close();}}>
    <label htmlFor={id}><span>{l('City','المدينة')}<span aria-hidden="true"> *</span></span></label>
    <div className="city-picker-field">
      <input ref={input} id={id} name="city" type="text" role="combobox" aria-autocomplete="list" aria-required="true"
        aria-expanded={open} aria-controls={id+'-list'} aria-invalid={Boolean(error)||undefined} aria-describedby={error?id+'-error':undefined}
        aria-activedescendant={open&&ordered[active] ? id+ordered[active].code : undefined}
        autoComplete="off" disabled={disabled} placeholder={l('Select your city','اختاري مدينتك')}
        value={open?query:selected?name(selected):''} onFocus={()=>setOpen(true)}
        onClick={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(-1);onSelect(null);}}
        onKeyDown={event=>{
          if(event.key==='Escape'&&open){event.preventDefault();close();}
          if(event.key==='ArrowDown'||event.key==='ArrowUp'){
            event.preventDefault();setOpen(true);
            const index=event.key==='ArrowDown'?Math.min(active+1,ordered.length-1):Math.max(active-1,0);
            if(ordered[index]){
              setActive(index);
              requestAnimationFrame(()=>document.getElementById(id+ordered[index].code)?.scrollIntoView({block:'nearest'}));
            }
          }
          if(event.key==='Enter'&&open){
            event.preventDefault();
            if(ordered[active])select(ordered[active]);
          }
        }}/>
      <button type="button" disabled={disabled} aria-label={l('Toggle cities','عرض المدن')} aria-expanded={open}
        onPointerDown={event=>event.preventDefault()} onClick={()=>{if(open)close();else{input.current.focus();setOpen(true);}}}>
        <ChevronDown size={20} aria-hidden="true"/>
      </button>
    </div>
    {error&&<small className="checkout-field-error" id={id+'-error'} role="alert">{error}</small>}
    <div id={id+'-list'} role="listbox" aria-label={l('Delivery cities','مدن التوصيل')} hidden={!open} className="city-picker-list">
      {deliveryRegions.map(([region,en,arabic])=>{
        const rows=matches.filter(city=>city.region===region);
        if(!rows.length)return null;
        return <div key={region} role="group" aria-label={l(en,arabic)}>
          <p aria-hidden="true">{l(en,arabic)}</p>
          {rows.map(city=><div key={city.code} id={id+city.code} role="option" tabIndex={-1}
            aria-selected={selected?.code===city.code} data-active={ordered[active]?.code===city.code}
            onPointerDown={event=>{if(event.pointerType==='mouse')event.preventDefault();}}
            onMouseDown={event=>event.preventDefault()}
            onClick={()=>select(city)}>{name(city)}</div>)}
        </div>;
      })}
      {!ordered.length&&<p role="status">{l('No matching cities.','لا توجد مدن مطابقة.')}</p>}
    </div>
  </div>;
}
