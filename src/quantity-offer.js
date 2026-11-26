export function promotionCopy(p,lang) {
  if(lang==='ar') return p.titleAr || (p.mode==='fixed' ? 'اشتري قطعة والثانية بـ'+(p.amount/100)+' شيكل' :
    p.amount===50 ? 'اشتري قطعة والثانية بنصف السعر' : 'اشتري قطعة والثانية بخصم '+p.amount+'٪');
  return p.title || (p.mode==='fixed' ? 'Buy 1, Get the 2nd for '+('₪'+p.amount/100) : 'Buy 1, Get the 2nd at '+p.amount+'% OFF');
}
