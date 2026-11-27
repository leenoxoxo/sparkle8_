export const seasonalDefaults = {
  enabled:false, snow:true, sparkles:true, frost:true, intensity:'medium', speed:'normal',
  startDate:'', endDate:'',
};

const calendar=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Hebron', year:'numeric', month:'2-digit', day:'2-digit',
});

export function winterIsActive(settings,now=new Date()){
  if(!settings.enabled)return false;
  const parts=Object.fromEntries(calendar.formatToParts(now).map(({type,value})=>[type,value]));
  const day=[parts.year,parts.month,parts.day].join('-');
  return (!settings.startDate||day>=settings.startDate)&&(!settings.endDate||day<=settings.endDate);
}
