'use strict';
const $=id=>document.getElementById(id);
const set=(id,value)=>{const e=$(id);if(e)e.textContent=String(value??'');};
let telegramUsername='';
const nairaValue=price=>{const v=String(price||'').trim();if(!v)return 'Ask for a quote';const n=Number(v.replace(/[₦,\s]/g,''));return Number.isFinite(n)&&n>=0?'₦'+n.toLocaleString('en-NG'):v;};
function card(product){
 const e=document.createElement('article');e.className='product';
 const media=document.createElement('div');media.className='product-media';
 if(product.image_url){const img=document.createElement('img');img.src=product.image_url;img.alt=product.name;img.loading='lazy';img.onerror=()=>{img.remove();media.textContent='✦';};media.append(img);}else{media.textContent='✦';media.classList.add('placeholder');}
 const body=document.createElement('div');body.className='product-body';const h=document.createElement('h3');h.textContent=product.name;
 const p=document.createElement('p');p.textContent=product.description||'Ask our team for details.';
 const price=document.createElement('div');price.className='price';price.textContent=nairaValue(product.price);
 const actions=document.createElement('div');actions.className='product-actions';
 const copy=document.createElement('button');copy.type='button';copy.className='product-button secondary';copy.textContent='Copy details';
 copy.addEventListener('click',async()=>{const details=[product.name,nairaValue(product.price),product.description||''].filter(Boolean).join(' — ');try{await navigator.clipboard.writeText(details);copy.textContent='Copied ✓';setTimeout(()=>copy.textContent='Copy details',1600);}catch{window.prompt('Copy product details:',details);}});
 const ask=document.createElement('a');ask.className='product-button';ask.textContent='Enquire / Order ↗';
 const link=productOrderLink(telegramUsername,product.id);if(link){ask.href=link;ask.target='_blank';ask.rel='noopener noreferrer';ask.title='Open an order enquiry for '+product.name+' in Telegram';}else{ask.href='#';ask.addEventListener('click',event=>{event.preventDefault();alert('Telegram ordering is not configured yet. Please ask the business owner to enter the Telegram bot username in Admin → Website Settings.');});ask.title='Telegram bot username needs configuration';}
 actions.append(copy,ask);body.append(h,p,price,actions);e.append(media,body);return e;
}
function serviceRow(text,index){const e=document.createElement('div');e.className='service-row';const n=document.createElement('b');n.textContent=String(index+1).padStart(2,'0');const span=document.createElement('span');span.textContent=text;e.append(n,span);return e;}
function safeTelegram(username){return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username||'')?'https://t.me/'+username:null;}
function productOrderLink(username,id){const base=safeTelegram(username);return base&&Number.isSafeInteger(Number(id))&&Number(id)>0?`${base}?start=p_${id}`:null;}
async function load(){try{const response=await fetch('/public-api/site',{credentials:'omit'});if(!response.ok)throw Error('Unavailable');const {site,products}=await response.json();telegramUsername=site.telegram_username||'';
 set('brand',site.name);set('footer-name',site.name);document.title=site.name+' | Welcome';set('hero-title',site.headline||'Here to make life easier.');set('hero-intro',site.description||'Browse our offerings and message us for help.');set('info-location',site.location||'Ask our team');set('info-hours',site.hours||'Contact for hours');set('info-phone',site.phone||'Contact via Telegram');set('info-email',site.email||'Contact via Telegram');
 if(/^#[0-9a-fA-F]{6}$/.test(site.theme_color))document.documentElement.style.setProperty('--brand',site.theme_color);
 const url=safeTelegram(site.telegram_username);for(const id of ['hero-telegram','service-telegram','contact-telegram']){const e=$(id);if(url){e.href=url;e.target='_blank';e.rel='noopener noreferrer';e.classList.remove('disabled');e.removeAttribute('aria-disabled');}else{e.removeAttribute('href');e.setAttribute('aria-disabled','true');e.title='Business owner: add your Telegram username in Admin → Website Settings';}}
 const list=$('product-list');const visible=(Array.isArray(products)?products:[]).slice(0,location.pathname==='/products'?100:6);list.replaceChildren(...visible.map(card));$('product-empty').hidden=visible.length>0;
 const services=(site.services||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,20);$('service-list').replaceChildren(...(services.length?services:[site.description||'Message us for details about our services.']).map(serviceRow));
 }catch(e){set('hero-intro','Our website is temporarily unable to load business details. Please try again shortly.');$('product-empty').hidden=false;}}
set('year',new Date().getFullYear());const path=location.pathname;document.querySelectorAll('[data-path]').forEach(a=>{if(a.dataset.path===path)a.classList.add('active');});$('menu').addEventListener('click',()=>{const open=$('navigation').classList.toggle('open');$('menu').setAttribute('aria-expanded',String(open));});document.querySelectorAll('#navigation a').forEach(a=>a.addEventListener('click',()=>{$('navigation').classList.remove('open');$('menu').setAttribute('aria-expanded','false');}));
if(path==='/products'){$('offers').scrollIntoView({block:'start'});set('offers-title','All our products');}if(path==='/services')$('services').scrollIntoView({block:'start'});if(path==='/contact')document.querySelector('.contact-section')?.scrollIntoView({block:'start'});
load();
