export const SITE_FIELDS=['name','headline','description','services','phone','email','location','hours','telegram_username','theme_color'];
export function defaultsForSite(business={},username=''){
  return {name:business.name||'Your Business',headline:'A better way to serve you',description:business.description||'',services:business.description||'',phone:'',email:'',location:'',hours:business.hours||'',telegram_username:username,theme_color:'#176f73'};
}
export function readSiteSettings(serialized,business={},username=''){
  const defaults=defaultsForSite(business,username);
  if(!serialized)return defaults;
  try{const obj=JSON.parse(serialized);return Object.fromEntries(SITE_FIELDS.map(k=>[k,typeof obj[k]==='string'?(k==='telegram_username'&&!obj[k]?defaults[k]:obj[k]):defaults[k]]));}catch{return defaults;}
}
export function updateSiteSettings(current,body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid website settings');
  const next={...current};
  for(const key of SITE_FIELDS){if(key in body){if(typeof body[key]!=='string'||body[key].length>2000)throw Error('Invalid field: '+key);next[key]=body[key].trim();}}
  if(next.telegram_username&&!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(next.telegram_username))throw Error('Telegram username must be 5-32 letters, digits or underscores and start with a letter');
  if(!/^#[0-9a-fA-F]{6}$/.test(next.theme_color))throw Error('Theme color must be a 6-digit hex color');
  return next;
}
export function publicProducts(products){return products.filter(p=>Number(p.active)===1).map(p=>({id:p.id,name:p.name,description:p.description,price:p.price,image_url:p.image_url||''}));}
