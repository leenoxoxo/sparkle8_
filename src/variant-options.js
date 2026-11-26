export const variantTypes = [
  ['color','Color','اللون'],
  ['model','Phone model','طراز الهاتف'],
  ['size','Size','المقاس'],
  ['custom','Custom option','خيار مخصص']
];

export function variantChoices(groups, selections) {
  return groups.map(group => {
    const value = group.values.find(value => value.id === selections?.[group.id]);
    return value && {kind:group.kind,name:group.name,nameAr:group.nameAr,
      value:value.name,valueAr:value.nameAr,color:value.color};
  }).filter(Boolean);
}

export function selectionKey(groups,selections) {
  return JSON.stringify(groups.map(group => selections?.[group.id] ?? null));
}

export function variantCombinations(groups,limit=40) {
  if (!groups.length || groups.some(group=>!group.values.length)) return [];
  if (groups.reduce((count,group)=>count*group.values.length,1)>limit) return null;
  return groups.reduce((rows,group)=>rows.flatMap(row=>group.values.map(value=>({...row,[group.id]:value.id}))),[{}]);
}

export function variantDescription(option,lang) {
  if (!option) return '';
  const ar = lang === 'ar';
  if (!option.choices?.length) return ar ? option.nameAr || option.name : option.name;
  return option.choices.map(choice =>
    (ar ? choice.nameAr || choice.name : choice.name) + ': ' +
    (ar ? choice.valueAr || choice.value : choice.value)).join(' · ');
}
