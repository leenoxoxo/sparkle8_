import React,{lazy,Suspense,useState} from 'react';
import {api} from './commerce-api.js';

const WinterEffects=lazy(()=>import('./WinterEffects.jsx'));

export default function AdminSeasonalEffects({settings,run,ar}){
  const [draft,setDraft]=useState(settings),[preview,setPreview]=useState('');
  const l=(en,arabic)=>ar?arabic:en;
  const checked=[['enabled','Enable winter mode','تفعيل وضع الشتاء'],['snow','Falling snow','تساقط الثلج'],
    ['sparkles','Twinkling sparkles','لمعات متلألئة'],['frost','Frosted accents','حواف شتوية']];
  function change(event){
    const {name,type,checked,value}=event.currentTarget;
    setDraft(previous=>({...previous,[name]:type==='checkbox'?checked:value}));
  }
  return <>
    <form className="commerce-panel commerce-fields" onSubmit={event=>{
      event.preventDefault();
      run(()=>api('/admin/seasonal-effects','PUT',draft));
    }}>
      {checked.map(([name,en,arabic])=><label key={name} className="commerce-check">
        <input type="checkbox" name={name} checked={draft[name]} onChange={change}/>{l(en,arabic)}
      </label>)}
      <div className="admin-form-grid">
        <label>{l('Snow intensity','كثافة الثلج')}<select name="intensity" value={draft.intensity} onChange={change}>
          <option value="low">{l('Low','خفيفة')}</option><option value="medium">{l('Medium','متوسطة')}</option><option value="high">{l('High','عالية')}</option>
        </select></label>
        <label>{l('Animation speed','سرعة الحركة')}<select name="speed" value={draft.speed} onChange={change}>
          <option value="slow">{l('Slow','بطيئة')}</option><option value="normal">{l('Normal','عادية')}</option><option value="fast">{l('Fast','سريعة')}</option>
        </select></label>
        <label>{l('Start date (optional)','تاريخ البدء (اختياري)')}<input type="date" name="startDate" value={draft.startDate} max={draft.endDate||undefined} onChange={change}/></label>
        <label>{l('End date (optional)','تاريخ الانتهاء (اختياري)')}<input type="date" name="endDate" value={draft.endDate} min={draft.startDate||undefined} onChange={change}/></label>
      </div>
      <p>{l('Dates include the start and end days, Palestine time.','تشمل المدة يومي البدء والانتهاء بتوقيت فلسطين.')}</p>
      <div className="commerce-actions"><button className="button">{l('Save seasonal effects','حفظ التأثيرات الموسمية')}</button></div>
    </form>
    <section className="commerce-panel">
      <div className="commerce-actions">
        <button type="button" className="button secondary" aria-pressed={preview==='desktop'} onClick={()=>setPreview('desktop')}>{l('Desktop preview','معاينة سطح المكتب')}</button>
        <button type="button" className="button secondary" aria-pressed={preview==='mobile'} onClick={()=>setPreview('mobile')}>{l('Mobile preview','معاينة الهاتف')}</button>
        {preview&&<button type="button" className="button secondary" onClick={()=>setPreview('')}>{l('Close preview','إغلاق المعاينة')}</button>}
      </div>
      {preview&&<div className="winter-preview-size" data-size={preview}>
        <div className="winter-preview-card"><p className="eyebrow">Sparkle</p>
          <h2>{l('A little winter sparkle','لمسة شتوية من سباركل')}</h2>
          <Suspense fallback={null}><WinterEffects settings={draft} preview/></Suspense>
        </div>
      </div>}
    </section>
  </>;
}
