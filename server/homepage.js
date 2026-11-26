import {defaultHomepage,homeSectionIds} from '../src/homepage-model.js';
import {cloudinaryPath} from './images.js';
import {integer,invalid,slug,text} from './validation.js';

const defaults=defaultHomepage();
const stockImages=new Set([...defaults.hero.images,...Object.values(defaults.sections).map(section=>section.image)].filter(Boolean));
const list=(items,limit,fn)=>{
  if (!Array.isArray(items) || items.length>limit) invalid();
  return items.map(fn);
};
const bilingual=(value,max,required=false)=>({
  en:text(value?.en ?? '',max,required?1:0),ar:text(value?.ar ?? '',max,required?1:0)
});
const image=(value,required=false)=>{
  if (!value && !required) return '';
  if (typeof value!=='string' || (!stockImages.has(value) && !cloudinaryPath.test(value))) invalid();
  return value;
};
const href=value=>{
  const target=text(value,300);
  if (/^\/(?!\/)[^\\\s]*$/.test(target)) return target;
  const parsed=URL.parse(target);
  if (parsed?.protocol!=='https:' || parsed.username || parsed.password) invalid();
  return parsed.href;
};
const day=value=>{
  if (!value) return '';
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const date=new Date(value+'T00:00:00Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0,10)!==value) invalid();
  return value;
};
const selection=(items,max)=>items===null ? null : [...new Set(list(items,max,value=>{if(!slug(value))invalid();return value;}))];
const button=value=>({label:bilingual(value?.label,65,true),href:href(value?.href)});

export function homepageInput(value) {
  const order=selection(value?.order,homeSectionIds.length);
  if (!order || order.length!==homeSectionIds.length || order.some(id=>!homeSectionIds.includes(id))) invalid();
  const sections=Object.fromEntries(homeSectionIds.map(id=>{
    const item=value.sections?.[id];
    if (typeof item?.visible!=='boolean') invalid();
    return [id,{visible:item.visible,title:bilingual(item.title,100,true),description:bilingual(item.description,450),image:image(item.image)}];
  }));
  const images=list(value.hero?.images,8,url=>image(url,true));
  if (!images.length) invalid();
  const banners=list(value.banners,12,item=>{
    if (typeof item?.active!=='boolean') invalid();
    const starts=day(item.starts),ends=day(item.ends);
    if (starts && ends && starts>ends) invalid();
    return {active:item.active,starts,ends,image:image(item.image),title:bilingual(item.title,140,true),
      description:bilingual(item.description,450),button:item.button ? button(item.button) : null};
  });
  const reviews=list(value.reviews,30,item=>{
    if (typeof item?.approved!=='boolean' || typeof item?.visible!=='boolean' || (item.image && item.imageApproved!==true)) invalid();
    const rating=integer(item.rating,5);
    if (!rating) invalid();
    const review=bilingual(item.text,600);
    if (!review.en && !review.ar) invalid();
    const related=item.related ?? '';
    if (related && !/^\/(?:shop|workshops)\/[a-z0-9-]+$/.test(related)) invalid();
    return {approved:item.approved,visible:item.visible,imageApproved:item.imageApproved===true,rating,
      name:text(item.name,100),text:review,image:image(item.image),related};
  });
  return {order,sections,hero:{images,title:bilingual(value.hero.title,130,true),description:bilingual(value.hero.description,450,true),
    primary:button(value.hero.primary),secondary:button(value.hero.secondary)},experience:bilingual(value.experience,130),
    featuredProducts:selection(value.featuredProducts,40),featuredWorkshops:selection(value.featuredWorkshops,30),banners,reviews};
}
