import {imageCatalog} from './image-catalog.js';

export const homeSectionIds = ['explore','featured','kits','workshops','custom','about','reviews','order'];
const section = (en,ar,text='',textAr='',image='') => ({title:{en,ar},description:{en:text,ar:textAr},image,visible:true});
export const localText = (value,lang) => value?.[lang] || value?.en || '';

export function defaultHomepage() {
  return {
    order:[...homeSectionIds],
    hero:{
      title:{en:'Create Something That Feels Like You.',ar:'اصنعي شيئاً يشبهك تماماً.'},
      description:{en:'Handmade creations, DIY kits & creative workshops designed to add a little sparkle to your everyday life.',
        ar:'إبداعات يدوية وأطقم للتزيين وورش إبداعية تضيف لمسة من البريق إلى يومك.'},
      images:[...imageCatalog.home],
      primary:{label:{en:'Shop Now',ar:'تسوّقي الآن'},href:'/shop'},
      secondary:{label:{en:'Explore Workshops',ar:'استكشفي الورش'},href:'/workshops'}
    },
    sections:{
      explore:section('Find Your Kind of Sparkle','اكتشفي لمستك الخاصة'),
      featured:section('A Little Sparkle for You','قليل من البريق لكِ'),
      kits:section('Create It Yourself','اصنعيها بنفسك','Decorate your own piece with Japanese Cream, charms, and a little imagination.',
        'زيّني قطعتك بالكريمة اليابانية والزينة ولمسة من خيالك.','/DIY%20FIXED1.PNG'),
      workshops:section('Make. Create. Sparkle.','اصنعي. أبدعي. تألقي.'),
      custom:section('Made Your Way','مصنوع بطريقتك','Your idea. Your style. Your Sparkle.','فكرتك. أسلوبك. لمستك الخاصة.',imageCatalog.customOrders[0]),
      about:section('About Sparkle','عن سباركل','Sparkle is a Palestinian studio that makes everyday pieces feel special with Japanese Cream, creativity, and handmade details.',
        'سباركل استوديو فلسطيني يضفي لمسة خاصة على القطع اليومية بالكريمة اليابانية والإبداع والتفاصيل اليدوية.',imageCatalog.about.story),
      reviews:section('Loved by You ♡','أحببتم سباركل ♡'),
      order:section('How to Order','طريقة الطلب')
    },
    experience:{en:'4 years of experience',ar:'٤ سنوات من الخبرة'},
    featuredProducts:null,
    featuredWorkshops:null,
    banners:[],reviews:[]
  };
}

export function workshopSchedule(workshop,now=new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workshop.date ?? '')) return 'unscheduled';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hebron',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
    .formatToParts(now);
  const part=type=>parts.find(entry=>entry.type===type).value;
  const today=part('year')+'-'+part('month')+'-'+part('day');
  if (workshop.date>today) return 'upcoming';
  if (workshop.date<today) return 'past';
  return workshop.startTime && workshop.startTime>part('hour')+':'+part('minute') ? 'upcoming' : 'past';
}

export function homepageWorkshops(workshops,selected,now) {
  const candidates = workshops.filter(workshop => workshopSchedule(workshop,now)!=='past' &&
    workshop.status!=='Fully booked' && workshop.seats!==0);
  if (selected !== null) return selected.flatMap(slug=>candidates.filter(item=>item.slug===slug)).slice(0,2);
  return [...candidates].sort((a,b)=>(a.date || '9999').localeCompare(b.date || '9999')).slice(0,2);
}
