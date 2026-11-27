import {seasonalDefaults} from '../src/seasonal-settings.js';
import {invalid} from './validation.js';

function optionalDate(value){
  if(value==='')return '';
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))invalid();
  const date=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value||value.startsWith('0000'))invalid();
  return value;
}

export function seasonalInput(body){
  const {enabled,snow,sparkles,frost,intensity,speed}=body??{};
  if(![enabled,snow,sparkles,frost].every(value=>typeof value==='boolean')||
    !['low','medium','high'].includes(intensity)||!['slow','normal','fast'].includes(speed))invalid();
  const startDate=optionalDate(body.startDate??'');
  const endDate=optionalDate(body.endDate??'');
  if(startDate&&endDate&&endDate<startDate)invalid();
  return {enabled,snow,sparkles,frost,intensity,speed,startDate,endDate};
}

export async function readSeasonalSettings(db){
  return (await db.contentItem('website','seasonal-effects'))?.body ?? seasonalDefaults;
}
