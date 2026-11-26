import React,{useState} from 'react';
import Homepage from './Homepage.jsx';
import {defaultHomepage,homeSectionIds} from './homepage-model.js';
import {storefrontWorkshops} from './workshops.js';
import {api} from './commerce-api.js';
import {useAdminText} from './AdminLocale.jsx';

function Localized({label,value,onChange,area=false}) {
  const t=useAdminText();
  return <div className="admin-form-grid">{['en','ar'].map(lang=>{
    const Input=area?'textarea':'input';
    return <label key={lang}>{t(label)} ({t(lang==='ar'?'Arabic':'English')})
      <Input value={value?.[lang] || ''} dir={lang==='ar'?'rtl':'ltr'}
        onChange={event=>onChange({...value,[lang]:event.target.value})}/></label>;
  })}</div>;
}

function move(items,index,delta) {
  const next=[...items];
  [next[index],next[index+delta]]=[next[index+delta],next[index]];
  return next;
}

function Ordered({items,label,onChange,onRemove}) {
  const t=useAdminText();
  return <ol className="admin-list">{items.map((item,index)=><li className="commerce-actions" key={index}>
    <span>{label(item)}</span>
    <button type="button" disabled={index===0} onClick={()=>onChange(move(items,index,-1))}>{t('Move up')}</button>
    <button type="button" disabled={index===items.length-1} onClick={()=>onChange(move(items,index,1))}>{t('Move down')}</button>
    {onRemove && <button type="button" onClick={()=>onRemove(index)}>{t('Remove')}</button>}
  </li>)}</ol>;
}

function Upload({label,run,onImages,multiple=false}) {
  const t=useAdminText();
  const [uploading,setUploading]=useState(false);
  return <label>{t(label)}<input type="file" disabled={uploading} multiple={multiple} accept="image/png,image/jpeg,image/webp,image/avif" onChange={async event=>{
    const files=[...event.target.files].slice(0,multiple?8:1);
    event.target.value='';
    if (!files.length) return;
    setUploading(true);
    try {await run(async()=>{
      const images=[];
      for (const file of files) images.push((await api('/admin/images','POST',file)).url);
      onImages(images);
    });} finally {setUploading(false);}
  }}/></label>;
}

function ImageField({image,onChange,run,label}) {
  const t=useAdminText();
  return <div>{image && <img className="erp-preview-image" src={image} alt=""/>}
    <Upload label={label} run={run} onImages={([url])=>onChange(url)}/>
    {image && <button type="button" onClick={()=>onChange('')}>{t('Remove image')}</button>}</div>;
}

function ButtonFields({label,value,onChange}) {
  const t=useAdminText();
  return <>
    <Localized label={t(label)+' · '+t('Button label')} value={value.label} onChange={next=>onChange({...value,label:next})}/>
    <label>{t(label)} · {t('Button link')}<input value={value.href} onChange={event=>onChange({...value,href:event.target.value})} placeholder="/shop"/></label>
  </>;
}

function Choices({label,selected,onChange,catalog}) {
  const t=useAdminText();
  const byId=new Map(catalog.map(item=>[item.slug,item]));
  return <div className="commerce-fields"><h3>{t(label)}</h3>
    <label className="commerce-check"><input type="checkbox" checked={selected===null} onChange={event=>onChange(event.target.checked?null:[])}/>{t('Use automatic selection')}</label>
    {selected!==null && <>
      <label>{t('Add to selection')}<select value="" onChange={event=>{if(event.target.value)onChange([...selected,event.target.value]);}}>
        <option value="">{t('Choose an item')}</option>{catalog.filter(item=>!selected.includes(item.slug)).map(item=><option key={item.slug} value={item.slug}>{item.name}</option>)}
      </select></label>
      <Ordered items={selected} label={id=>byId.get(id)?.name || id} onChange={onChange} onRemove={index=>onChange(selected.filter((_,i)=>i!==index))}/>
    </>}
  </div>;
}

const emptyCopy=()=>({en:'',ar:''});
const emptyButton=()=>({label:emptyCopy(),href:'/shop'});
const emptyBanner=()=>({active:false,starts:'',ends:'',image:'',title:emptyCopy(),description:emptyCopy(),button:null});
const emptyReview=()=>({approved:false,visible:true,imageApproved:false,rating:5,name:'',text:emptyCopy(),image:'',related:''});

export default function AdminHomepage({data,run,initialSection = 'hero'}) {
  const t=useAdminText();
  const [draft,setDraft]=useState(()=>data.draft ?? data.published ?? defaultHomepage());
  const [preview,setPreview]=useState('');
  const [lang,setLang]=useState('en');
  const [active,setActive]=useState(initialSection);
  const change=updates=>setDraft(current=>({...current,...updates}));
  const hero=updates=>setDraft(current=>({...current,hero:{...current.hero,...updates}}));
  const section=(id,updates)=>setDraft(current=>({...current,sections:{...current.sections,[id]:{...current.sections[id],...updates}}}));
  const item=(key,index,updates)=>setDraft(current=>({...current,[key]:current[key].map((entry,i)=>i===index?{...entry,...updates}:entry)}));
  const remove=(key,index)=>change({[key]:draft[key].filter((_,i)=>i!==index)});
  const workshops=storefrontWorkshops(data.workshops);
  const translated = (value)=> lang==='ar' ? data.products.find(row=>row.name===value)?.nameAr || value : value;
  const editors=[['hero','Hero'],['sections','Sections'],['features','Featured items'],['banners','Banners'],['reviews','Reviews']];
  return <div className="commerce-fields">
    <div className="commerce-actions">
      {editors.map(([id,label])=><button key={id} type="button" className={active===id?'button':'button secondary'}
        aria-pressed={!preview && active===id} onClick={()=>{setActive(id);setPreview('');}}>{t(label)}</button>)}
      <button type="button" className="button secondary" onClick={()=>setPreview('mobile')}>{t('Preview mobile')}</button>
      <button type="button" className="button secondary" onClick={()=>setPreview('desktop')}>{t('Preview desktop')}</button>
    </div>
    {preview ? <><label>{t('Preview language')}<select value={lang} onChange={event=>setLang(event.target.value)}>
      <option value="en">English</option><option value="ar">العربية</option></select></label>
      <div className="home-cms-preview" dir={lang==='ar'?'rtl':'ltr'} lang={lang} style={{width:preview==='mobile'?390:1100}}>
        <Homepage home={draft} products={data.products} workshops={workshops} lang={lang} t={translated} preview/>
      </div></> : <>
      {active==='hero' && <section className="commerce-panel commerce-fields">
        <h2>{t('Hero')}</h2><Localized label="Headline" value={draft.hero.title} onChange={title=>hero({title})}/>
        <Localized label="Description" value={draft.hero.description} onChange={description=>hero({description})} area/>
        <ButtonFields label="Primary" value={draft.hero.primary} onChange={primary=>hero({primary})}/>
        <ButtonFields label="Secondary" value={draft.hero.secondary} onChange={secondary=>hero({secondary})}/>
        <Upload label="Add hero images" run={run} multiple onImages={images=>hero({images:[...draft.hero.images,...images].slice(0,8)})}/>
        <Ordered items={draft.hero.images} label={image=><img className="erp-preview-image" src={image} alt="Hero image"/>}
          onChange={images=>hero({images})} onRemove={draft.hero.images.length>1 ? index=>hero({images:draft.hero.images.filter((_,i)=>i!==index)}) : null}/>
      </section>}
      {active==='sections' && <section className="commerce-panel commerce-fields">
        <h2>{t('Sections')}</h2>
        <Ordered items={draft.order} label={id=>draft.sections[id].title.en} onChange={order=>change({order})}/>
        {homeSectionIds.map(id=><details key={id} className="commerce-panel"><summary>{draft.sections[id].title.en}</summary>
          <div className="commerce-fields">
            <label className="commerce-check"><input type="checkbox" checked={draft.sections[id].visible} onChange={event=>section(id,{visible:event.target.checked})}/>{t('Show section')}</label>
            <Localized label="Title" value={draft.sections[id].title} onChange={title=>section(id,{title})}/>
            <Localized label="Description" value={draft.sections[id].description} onChange={description=>section(id,{description})} area/>
            {['kits','custom','about'].includes(id) && <ImageField label="Replace section image" image={draft.sections[id].image} run={run} onChange={image=>section(id,{image})}/>}
            {id==='about' && <Localized label="Experience statement" value={draft.experience} onChange={experience=>change({experience})}/>}
          </div>
        </details>)}
      </section>}
      {active==='features' && <section className="commerce-panel commerce-fields">
        <Choices label="Featured products" selected={draft.featuredProducts} onChange={featuredProducts=>change({featuredProducts})} catalog={data.products}/>
        <Choices label="Featured workshops" selected={draft.featuredWorkshops} onChange={featuredWorkshops=>change({featuredWorkshops})} catalog={workshops}/>
      </section>}
      {active==='banners' && <section className="commerce-panel commerce-fields">
        <button type="button" className="button secondary" disabled={draft.banners.length>=12} onClick={()=>change({banners:[...draft.banners,emptyBanner()]})}>{t('Add banner')}</button>
        {draft.banners.map((banner,i)=><div className="commerce-panel commerce-fields" key={i}>
          <Localized label="Banner title" value={banner.title} onChange={title=>item('banners',i,{title})}/>
          <Localized label="Banner description" value={banner.description} onChange={description=>item('banners',i,{description})} area/>
          <ImageField label="Banner image" image={banner.image} run={run} onChange={image=>item('banners',i,{image})}/>
          <label>{t('Starts')}<input type="date" value={banner.starts} onChange={event=>item('banners',i,{starts:event.target.value})}/></label>
          <label>{t('Ends')}<input type="date" value={banner.ends} onChange={event=>item('banners',i,{ends:event.target.value})}/></label>
          <label className="commerce-check"><input type="checkbox" checked={banner.active} onChange={event=>item('banners',i,{active:event.target.checked})}/>{t('Enable banner')}</label>
          {banner.button ? <><ButtonFields label="Banner" value={banner.button} onChange={button=>item('banners',i,{button})}/>
            <button type="button" onClick={()=>item('banners',i,{button:null})}>{t('Remove button')}</button></> :
            <button type="button" onClick={()=>item('banners',i,{button:emptyButton()})}>{t('Add button')}</button>}
          <button type="button" className="button secondary" onClick={()=>remove('banners',i)}>{t('Remove banner')}</button>
        </div>)}
      </section>}
      {active==='reviews' && <section className="commerce-panel commerce-fields">
        <p>{t('Add reviews received from customers. Publish photos only with the customer’s permission.')}</p>
        <button type="button" className="button secondary" disabled={draft.reviews.length>=30} onClick={()=>change({reviews:[...draft.reviews,emptyReview()]})}>{t('Add review')}</button>
        <Ordered items={draft.reviews} label={review=>review.name || t('New review')} onChange={reviews=>change({reviews})}/>
        {draft.reviews.map((review,i)=><div className="commerce-panel commerce-fields" key={i}>
          <label>{t('Customer display name')}<input value={review.name} onChange={event=>item('reviews',i,{name:event.target.value})}/></label>
          <Localized label="Review text" value={review.text} onChange={text=>item('reviews',i,{text})} area/>
          <label>{t('Star rating')}<select value={review.rating} onChange={event=>item('reviews',i,{rating:Number(event.target.value)})}>
            {[1,2,3,4,5].map(rating=><option key={rating}>{rating}</option>)}</select></label>
          <label>{t('Related product or workshop')}<select value={review.related} onChange={event=>item('reviews',i,{related:event.target.value})}>
            <option value="">{t('None')}</option>{data.products.map(p=><option key={p.slug} value={'/shop/'+p.slug}>{p.name}</option>)}
            {workshops.map(w=><option key={w.slug} value={'/workshops/'+w.slug}>{w.name}</option>)}</select></label>
          {[['approved','Approve authentic review'],['visible','Show review'],['imageApproved','Customer approved this photo']].map(([field,label])=>
            <label key={field} className="commerce-check"><input type="checkbox" checked={review[field]} onChange={event=>item('reviews',i,{[field]:event.target.checked,
              ...(field==='imageApproved' && !event.target.checked?{image:''}:{})})}/>{t(label)}</label>)}
          {review.imageApproved && <ImageField label="Customer photo" image={review.image} run={run} onChange={image=>item('reviews',i,{image})}/>}
          <button type="button" className="button secondary" onClick={()=>{if(window.confirm(t('Remove this review from the draft?')))remove('reviews',i);}}>{t('Delete review')}</button>
        </div>)}
      </section>}
    </>}
    <div className="commerce-actions">
      <button type="button" className="button secondary" onClick={()=>run(()=>api('/admin/homepage','PUT',{home:draft,publish:false}),t('Homepage draft saved.'))}>{t('Save draft')}</button>
      <button type="button" className="button" onClick={()=>run(()=>api('/admin/homepage','PUT',{home:draft,publish:true}),t('Homepage published.'))}>{t('Publish homepage')}</button>
    </div>
  </div>;
}
