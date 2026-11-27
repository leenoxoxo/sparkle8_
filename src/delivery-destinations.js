export const deliveryRegions = [
  ['west-bank','West Bank','الضفة الغربية'],
  ['inside-1948','Inside / 1948 Areas','الداخل'],
  ['east-jerusalem','East Jerusalem','القدس الشرقية'],
  ['west-jerusalem','West Jerusalem','القدس الغربية'],
];

export function destinationSearch(value) {
  return value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'')
    .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/[^\p{L}\p{N}]+/gu,'');
}

export function matchesDestination(item,query) {
  const term=destinationSearch(query);
  const region=deliveryRegions.find(([code])=>code===item.region);
  return [item.name,item.name_ar,item.code,...(region?.slice(1)??[])].some(value=>destinationSearch(value).includes(term));
}
