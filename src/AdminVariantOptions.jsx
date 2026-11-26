import React from 'react';
import {variantTypes} from './variant-options.js';
import {useAdminText} from './AdminLocale.jsx';
import './variant-options.css';

const optionId = () => crypto.randomUUID();

export function HexColor({label,value,onChange}) {
  return <label className="variant-hex">{label}
    <span><input type="color" aria-label={label} value={/^#[\da-f]{6}$/i.test(value) ? value : '#ffffff'}
      onChange={event=>onChange(event.target.value)}/>
    <input aria-label={label+' HEX'} type="text" maxLength={7} placeholder="#RRGGBB" value={value ?? ''}
      onChange={event=>onChange(event.target.value)}/></span>
  </label>;
}

export function OptionGroups({groups,variants,onChange,onGenerate}) {
  const t=useAdminText();
  const change = (id,patch) => onChange(groups.map(group=>group.id===id ? {...group,...patch} : group));
  return <section className="commerce-panel commerce-fields">
    <h3>{t('Option types')}</h3>
    <p>{t('Add option values, then generate combinations or assign values to existing variants.')}</p>
    {groups.map(group=>{
      const groupInUse=variants.some(variant=>variant.selections?.[group.id]);
      const changeValue=(id,patch)=>change(group.id,{values:group.values.map(value=>value.id===id ? {...value,...patch} : value)});
      return <fieldset key={group.id} className="admin-sku commerce-fields">
        <legend>{group.name || t('New option type')}</legend>
        <div className="admin-form-grid">
          <label>{t('Option type')}<select aria-label={t('Option type')} value={group.kind} onChange={event=>{
            const [kind,name,nameAr]=variantTypes.find(type=>type[0]===event.target.value);
            change(group.id,{kind,name,nameAr,values:group.values.map(value=>({...value,color:null}))});
          }}>{variantTypes.map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
          <label>{t('Option name')}<input maxLength={80} value={group.name} onChange={event=>change(group.id,{name:event.target.value})}/></label>
          <label>{t('Arabic option name')}<input maxLength={80} dir="rtl" value={group.nameAr ?? ''} onChange={event=>change(group.id,{nameAr:event.target.value})}/></label>
        </div>
        {group.values.map(value=>{
          const used=variants.some(variant=>variant.selections?.[group.id]===value.id);
          return <div className="admin-form-grid" key={value.id}>
            <label>{t('Option value')}<input maxLength={80} value={value.name} onChange={event=>changeValue(value.id,{name:event.target.value})}/></label>
            <label>{t('Arabic option value')}<input maxLength={80} dir="rtl" value={value.nameAr ?? ''} onChange={event=>changeValue(value.id,{nameAr:event.target.value})}/></label>
            {group.kind==='color' && <HexColor label={t('Color')} value={value.color} onChange={color=>changeValue(value.id,{color:color || null})}/>}
            <button type="button" className="button secondary" disabled={used} onClick={()=>change(group.id,{values:group.values.filter(item=>item.id!==value.id)})}>{t('Remove value')}</button>
          </div>;
        })}
        <div className="commerce-actions">
          <button type="button" className="button secondary" disabled={group.values.length>=40} onClick={()=>change(group.id,{values:[...group.values,{id:optionId(),name:'',nameAr:''}]})}>{t('Add value')}</button>
          <button type="button" className="button secondary" disabled={groupInUse} onClick={()=>onChange(groups.filter(item=>item.id!==group.id))}>{t('Remove option type')}</button>
        </div>
      </fieldset>;
    })}
    <div className="commerce-actions">
      <button type="button" className="button secondary" disabled={groups.length>=4} onClick={()=>onChange([...groups,{id:optionId(),kind:'color',name:'Color',nameAr:'اللون',values:[]}])}>{t('Add option type')}</button>
      {groups.length>0 && <button type="button" className="button" onClick={onGenerate}>{t('Generate combinations')}</button>}
    </div>
  </section>;
}

export function VariantBulk({onPrice,onStock}) {
  const t=useAdminText();
  const [price,setPrice]=React.useState('');
  const [stock,setStock]=React.useState('');
  const valid = (value,max,pattern) => pattern.test(value) && Number(value)<=max;
  return <section className="commerce-panel">
    <h3>{t('Bulk edit all variants')}</h3>
    <div className="commerce-actions">
      {onPrice && <>
        <label>{t('Price override (₪)')}<input type="number" min="0" max="1000000" step=".01" value={price} onChange={event=>setPrice(event.target.value)}/></label>
        <button type="button" className="button secondary" disabled={!valid(price,1000000,/^\d+(\.\d{1,2})?$/)} onClick={()=>onPrice(Math.round(Number(price)*100))}>{t('Apply price')}</button>
      </>}
      <label>{t('Stock quantity')}<input type="number" min="0" max="1000000" step="1" value={stock} onChange={event=>setStock(event.target.value)}/></label>
      <button type="button" className="button secondary" disabled={!valid(stock,1000000,/^\d+$/)} onClick={()=>onStock(Number(stock))}>{t('Apply stock')}</button>
    </div>
  </section>;
}
