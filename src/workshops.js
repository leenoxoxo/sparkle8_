import {imageCatalog} from './image-catalog.js';
import {workshopSchedule} from './homepage-model.js';

export const originalWorkshops = [
  { slug: 'japanese-cream-mirror', name: 'Japanese Cream Mirror', status: 'Upcoming', description: 'Learn to pipe, decorate, and finish your very first fake cake mirror. Includes a free boba drink of your choice.', time: 'About 2 hours', location: 'Nablus — Palestine', price: '₪60', icon: '🪞', image: imageCatalog.workshops.named['japanese-cream-basics'], gallery: [imageCatalog.workshops.named['japanese-cream-mirror-2'], imageCatalog.workshops.named['japanese-cream-mirror-3']] },
  { slug: 'japanese-cream-phone-case', name: 'Japanese Cream Phone Case', status: 'Upcoming', description: 'Design a full Japanese Cream case from a plain one. Includes a free boba drink of your choice.', time: 'About 2.5 hours', location: 'Nablus — Palestine', price: '₪60', icon: '📱', image: imageCatalog.workshops.named['japanese-cream-phone-case'], gallery: [imageCatalog.workshops.named['brush-workshop-222'], imageCatalog.workshops.named['japanese-cream-phone-case-333']] },
  { slug: 'brush-workshop', name: 'Japanese Cream Brush', status: 'Upcoming', description: 'Learn to pipe, decorate, and finish your very first cream brush. Includes a free boba drink of your choice.', time: 'About 2 hours', location: 'Nablus — Palestine', price: '₪60', icon: '🖌️', image: imageCatalog.workshops.named['brush-workshop'], gallery: [imageCatalog.workshops.named['japanese-cream-phone-case-22'], imageCatalog.workshops.named['japanese-cream-phone-case-33'], imageCatalog.workshops.named['brush-workshop-333']] },
  { slug: 'private-group-session', name: 'Private Group Session Workshop', status: 'Fully booked', description: 'Order the workshop for your school or birthday party. A private creative session for your friends or a birthday.', time: 'Message us', location: 'Your place', price: 'Send us a message to know the price', icon: '🎂', image: imageCatalog.workshops.named['private-group-session'] }
];

export function storefrontWorkshops(rows) {
  const map=new Map(originalWorkshops.map(item=>[item.slug,{...item,status:item.status==='Upcoming'?'Coming Soon':item.status}]));
  for (const {key,body} of rows) {
    if (!body.published) {map.delete(key);continue;}
    const existing=map.get(key);
    const workshop={...existing,...body,slug:key,managed:true,icon:existing?.icon || '🎀',
      image:body.image || existing?.image,location:body.location || existing?.location,
      duration:body.duration || existing?.time,time:body.duration || existing?.time,
      price:body.price==null ? existing?.price : '₪'+(body.price/100).toFixed(2)};
    const schedule=workshopSchedule(workshop);
    workshop.status=body.seats===0 ? 'Fully booked' : schedule==='upcoming'?'Upcoming':schedule==='past'?'Past workshop':'Coming Soon';
    map.set(key,workshop);
  }
  return [...map.values()];
}
