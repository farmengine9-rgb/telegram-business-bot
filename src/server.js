import express from 'express';
import crypto from 'node:crypto';
import {paystackRequest} from './phase4.js';
import {generateAI,liveCatalog} from './ai.js';
import path from 'node:path';
import fs from 'node:fs';
import {readSiteSettings,updateSiteSettings,publicProducts} from './siteconfig.js';
import {fileURLToPath} from 'node:url';

const fail=(res,status,message)=>res.status(status).json({error:message});
const validText=(x,max=3000)=>typeof x==='string' && x.trim().length>0 && x.length<=max;
function checkPassword(provided,expected){const a=crypto.scryptSync(String(provided), 'telegram-dashboard', 64), b=crypto.scryptSync(String(expected),'telegram-dashboard',64);return crypto.timingSafeEqual(a,b);}
function tokenSign(payload,secret){const data=Buffer.from(JSON.stringify(payload)).toString('base64url');return `${data}.${crypto.createHmac('sha256',secret).update(data).digest('base64url')}`;}
function verifyToken(raw,secret){if(!raw||!raw.includes('.'))return false;const [data,sig]=raw.split('.');const expected=crypto.createHmac('sha256',secret).update(data).digest('base64url');if(!sig||sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false;try{const v=JSON.parse(Buffer.from(data,'base64url'));return v.admin===true && v.exp>Date.now();}catch{return false;}}
export function createServer(store,bot,env=process.env){
  const app=express();app.disable('x-powered-by');app.use(express.json({limit:'3mb'}));
  app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');res.set('X-Frame-Options','DENY');res.set('Cache-Control','no-store');next();});
  const secret=env.SESSION_SECRET;
  const password=env.ADMIN_PASSWORD;
  const production=env.NODE_ENV==='production';
  const cookieName='tg_dashboard_session';
  const getCookie=req=>{const match=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));return match?match.slice(cookieName.length+1):'';};
  const isAdmin=req=>verifyToken(getCookie(req),secret);
  const requireAdmin=(req,res,next)=>isAdmin(req)?next():fail(res,401,'Please log in');
  const sameOrigin=(req,res,next)=>{if(['POST','PUT','PATCH','DELETE'].includes(req.method)){const origin=req.get('origin');if(origin){const expected=`${req.protocol}://${req.get('host')}`;if(origin!==expected)return fail(res,403,'Cross-origin request rejected');}}next();};
  app.use(sameOrigin);
  const loginAttempts=new Map();
  app.post('/api/login',(req,res)=>{const ip=req.ip;const entry=loginAttempts.get(ip)||{count:0,until:0};if(entry.until>Date.now())return fail(res,429,'Too many attempts. Try again later.');if(!validText(req.body?.password,1000)||!checkPassword(req.body.password,password)){entry.count++;if(entry.count>=7){entry.until=Date.now()+15*60*1000;entry.count=0;}loginAttempts.set(ip,entry);return fail(res,401,'Invalid password');}loginAttempts.delete(ip);res.cookie(cookieName,tokenSign({admin:true,exp:Date.now()+8*60*60*1000},secret),{httpOnly:true,sameSite:'strict',secure:production,path:'/',maxAge:8*60*60*1000});res.json({ok:true});});
  app.post('/api/logout',requireAdmin,(req,res)=>{res.clearCookie(cookieName,{path:'/',sameSite:'strict',secure:production});res.json({ok:true});});
  app.get('/api/me',(req,res)=>res.json({authenticated:isAdmin(req)}));
  // Phase 5: read-only, anonymous public site. Never expose customers, orders, sessions, secrets or private settings.
  const business=JSON.parse(fs.readFileSync(new URL('../business.json',import.meta.url),'utf8'));
  function siteSettings(){return readSiteSettings(store.setting('website_settings',''),business,env.TELEGRAM_BOT_USERNAME||store.setting('telegram_bot_username',''));}
  app.get('/public-api/site',(req,res)=>{
    const config=siteSettings();
    const products=publicProducts(store.listProducts());
    res.json({site:config,products});
  });
  const imgDir=path.resolve(path.dirname(store.databasePath),'product-images');
  fs.mkdirSync(imgDir,{recursive:true});
  app.get('/product-images/:filename',(req,res)=>{
    const name=req.params.filename;
    if(!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(name))return res.sendStatus(404);
    res.set('Cache-Control','public, max-age=86400');
    res.sendFile(path.join(imgDir,name));
  });
  // Telegram webhook endpoint: authenticated by the secret configured with BotFather's API.
  // Activate only after migrating to durable storage and setting Telegram's webhook URL.
  app.post('/api/telegram/webhook', async (req,res)=>{
    const secretValue=env.TELEGRAM_WEBHOOK_SECRET||'';
    const received=req.get('X-Telegram-Bot-Api-Secret-Token')||'';
    if(!secretValue || secretValue.length<32 || received.length!==secretValue.length ||
       !crypto.timingSafeEqual(Buffer.from(received),Buffer.from(secretValue))){
      return res.sendStatus(403);
    }
    const update=req.body;
    if(!update || !Number.isSafeInteger(update.update_id) || update.update_id<0){
      return fail(res,400,'Invalid Telegram update');
    }
    try{
      if(!store.hasUpdate(update.update_id)){
        await bot.handle(update);
        store.markUpdate(update.update_id);
      }
      res.json({ok:true});
    }catch(err){
      console.error('Telegram webhook processing failed:',err.message);
      res.status(500).json({error:'Telegram update processing failed'});
    }
  });
  app.use('/api',requireAdmin);
  app.post('/api/product-image',(req,res)=>{
    try{const {data_url}=req.body||{};if(typeof data_url!=='string')return fail(res,400,'Image required');
      const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data_url);
      if(!m||m[2].length>2_800_000)return fail(res,400,'Use PNG, JPEG, or WebP under 2 MB');
      const bytes=Buffer.from(m[2],'base64');if(bytes.length>2_000_000||bytes.length<32)return fail(res,400,'Image must be 2 MB or smaller');
      const ext={png:'png',jpeg:'jpg',webp:'webp'}[m[1]];
      const isPng=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const isJpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const isWebp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
      if(!(ext==='png'&&isPng||ext==='jpg'&&isJpeg||ext==='webp'&&isWebp))return fail(res,400,'Image content does not match its type');
      const filename=crypto.randomBytes(16).toString('hex')+'.'+ext;fs.writeFileSync(path.join(imgDir,filename),bytes,{flag:'wx'});
      res.json({image_url:'/product-images/'+filename});
    }catch(e){console.error('Image upload failed:',e.message);fail(res,400,'Image could not be saved');}
  });
  function validImageUrl(value){return typeof value==='string'&&value.length<=1000&&(!value||/^\/product-images\/[a-f0-9]{32}\.(?:png|jpg|webp)$/.test(value)||/^https:\/\/[^\s<>\"']+$/.test(value));}
  function checkProduct(body){return validText(body?.name,120)&&typeof body.description==='string'&&body.description.length<=1000&&typeof body.price==='string'&&body.price.length<=80&&validImageUrl(body.image_url||'');}
  app.post('/api/products/bulk',(req,res)=>{const items=req.body?.products;if(!Array.isArray(items)||!items.length||items.length>100||!items.every(checkProduct))return fail(res,400,'Provide 1–100 valid products');
    const ids=[];for(const item of items){const existing=store.listProducts().find(p=>p.name.trim().toLowerCase()===item.name.trim().toLowerCase());ids.push(store.saveProduct(item,existing?.id));}res.json({count:ids.length,ids});
  });
  app.get('/api/site-settings',(req,res)=>res.json(siteSettings()));
  app.put('/api/site-settings',(req,res)=>{
    try{const next=updateSiteSettings(siteSettings(),req.body);store.setSetting('website_settings',JSON.stringify(next));res.json(next);}
    catch(e){fail(res,400,e.message);}
  });
  app.get('/api/stats',(req,res)=>res.json(store.stats()));
  app.get('/api/customers',(req,res)=>res.json(store.listCustomers()));
  app.get('/api/conversations/:id',(req,res)=>{const id=req.params.id;res.json({customer:store.customer(id),messages:store.listMessages(id)});});
  app.patch('/api/customers/:id',(req,res)=>{if(typeof req.body.human!=='boolean')return fail(res,400,'human must be boolean');store.setHuman(req.params.id,req.body.human);res.json({ok:true});});
  app.post('/api/conversations/:id/reply',async(req,res)=>{if(!validText(req.body?.text,3500))return fail(res,400,'Message must be 1-3500 characters');try{await bot.staffReply(req.params.id,req.body.text);res.json({ok:true});}catch(err){console.error('Staff send failed:',err.message);fail(res,502,'Unable to send via Telegram. Check chat ID and bot permissions.');}});
  app.get('/api/products',(req,res)=>res.json(store.listProducts()));
  app.post('/api/products',(req,res)=>{if(!checkProduct(req.body))return fail(res,400,'Invalid product details or image URL');res.json({id:store.saveProduct(req.body)});});
  app.put('/api/products/:id',(req,res)=>{if(!checkProduct(req.body))return fail(res,400,'Invalid product details or image URL');res.json({id:store.saveProduct(req.body,req.params.id)});});
  app.delete('/api/products/:id',(req,res)=>{store.deleteProduct(req.params.id);res.json({ok:true});});
  app.get('/api/orders',(req,res)=>res.json(store.listOrders()));
  app.post('/api/orders',(req,res)=>{if(!validText(req.body?.chat_id,80)||!validText(req.body?.product,250))return fail(res,400,'Customer chat ID and product required');res.json({id:store.saveOrder(req.body)});});
  app.put('/api/orders/:id',(req,res)=>{if(!validText(req.body?.chat_id,80)||!validText(req.body?.product,250))return fail(res,400,'Customer chat ID and product required');res.json({id:store.saveOrder(req.body,req.params.id)});});
  app.post('/api/orders/:id/notify',async(req,res)=>{const order=store.getOrder(req.params.id);if(!order)return fail(res,404,'Order not found');if(!/^\d+$/.test(order.chat_id))return fail(res,400,'Order has no valid Telegram chat ID');try{await bot.send(order.chat_id,`Update on your order request #${order.id}: ${order.status.toUpperCase()}. Please contact staff if you need clarification. This message is not a payment receipt.`);res.json({ok:true});}catch(err){console.error('Order update notification failed:',err.message);fail(res,502,'Telegram notification failed');}});
  app.delete('/api/orders/:id',(req,res)=>{store.deleteOrder(req.params.id);res.json({ok:true});});
  // Phase 4: stock management, reporting, payments and consent-based follow-ups.
  app.get('/api/inventory',(req,res)=>res.json(store.listInventory()));
  app.get('/api/stock-movements',(req,res)=>res.json(store.stockMovements()));
  app.post('/api/inventory/:id/adjust',(req,res)=>{try{const qty=store.adjustStock(req.params.id,req.body.delta,req.body.reason,req.body.reorder_level);res.json({quantity:qty});}catch(e){fail(res,400,e.message);}});
  app.get('/api/reports',(req,res)=>res.json(store.reports()));
  app.get('/api/payments',(req,res)=>res.json(store.listPayments()));
  app.post('/api/payments/initialize',async(req,res)=>{
    if(!env.PAYSTACK_SECRET_KEY)return fail(res,400,'Set PAYSTACK_SECRET_KEY in .env to enable checkout');
    const {order_id,email,amount_naira}=req.body||{};
    const amount=Number(amount_naira);const kobo=Math.round(amount*100);
    if(!Number.isFinite(amount)||amount<1||!Number.isSafeInteger(kobo)||Math.abs(kobo/100-amount)>0.00001)return fail(res,400,'Enter a valid NGN amount (minimum ₦1)');
    if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email))return fail(res,400,'Valid customer email required');
    const order=store.getOrder(order_id);if(!order)return fail(res,404,'Order not found');
    const reference='TB'+order.id+'-'+crypto.randomBytes(12).toString('hex');
    try{
      const id=store.createPayment(order.id,email,kobo,reference);
      const data=await paystackRequest(env.PAYSTACK_SECRET_KEY,'POST','/transaction/initialize',{email,amount:String(kobo),reference,currency:'NGN',metadata:{order_id:order.id}});
      store.setCheckout(reference,data.authorization_url);
      res.json({id,reference,checkout_url:data.authorization_url,notice:'Not paid until verified'});
    }catch(e){console.error('Paystack initialize failed:',e.message);fail(res,502,'Payment link could not be initialized; no payment has been confirmed.');}
  });
  app.post('/api/payments/:reference/verify',async(req,res)=>{
    if(!env.PAYSTACK_SECRET_KEY)return fail(res,400,'Configure PAYSTACK_SECRET_KEY first');
    const ref=req.params.reference;if(!/^[\w.=-]{1,90}$/.test(ref)||!store.getPayment(ref))return fail(res,404,'Unknown payment');
    try{const data=await paystackRequest(env.PAYSTACK_SECRET_KEY,'GET','/transaction/verify/'+encodeURIComponent(ref));const status=store.reconcilePayment(ref,data);res.json({status});}
    catch(e){console.error('Paystack verification failed:',e.message);fail(res,502,'Payment verification failed or values do not match; do not fulfill based on this payment.');}
  });
  app.post('/api/payments/:reference/send',async(req,res)=>{
    const payment=store.getPayment(req.params.reference);if(!payment||!payment.authorization_url)return fail(res,404,'Checkout link not available');
    const order=store.getOrder(payment.order_id);if(!order||!/^[0-9]+$/.test(order.chat_id))return fail(res,400,'Valid customer Telegram chat required');
    try{await bot.send(order.chat_id,`Payment link for order #${order.id}: ${payment.authorization_url}\nAmount: ₦${(payment.amount_kobo/100).toLocaleString('en-NG',{minimumFractionDigits:2})}. Payment is optional until you confirm the order with staff. We will verify payment before processing.`);res.json({ok:true});}
    catch(e){console.error('Payment link send failed:',e.message);fail(res,502,'Could not send payment link');}
  });
  app.get('/api/followups',(req,res)=>res.json(store.listFollowups()));
  app.post('/api/followups',(req,res)=>{try{const id=store.createFollowup(req.body?.chat_id,req.body?.message);res.json({id});}catch(e){fail(res,400,e.message);}});
  app.post('/api/followups/:id/send',async(req,res)=>{
    const f=store.getFollowup(req.params.id);if(!f)return fail(res,404,'Follow-up not found');if(f.status!=='draft')return fail(res,400,'Already sent');
    if(!store.hasConsent(f.chat_id))return fail(res,403,'Customer has not opted in or has unsubscribed');
    try{await bot.send(f.chat_id,f.message);store.message(f.chat_id,'staff',f.message);store.markFollowup(f.id);res.json({ok:true});}
    catch(e){console.error('Follow-up send failed:',e.message);fail(res,502,'Telegram send failed');}
  });
  // Point of sale: all endpoints remain behind the existing admin session.
  app.get('/api/pos/catalog',(req,res)=>res.json(store.listProducts().filter(p=>p.active).map(p=>({...p,quantity:store.one('SELECT quantity FROM inventory WHERE product_id=?',[p.id])?.quantity??0}))));
  app.get('/api/pos/sales',(req,res)=>res.json(store.posSales()));
  app.get('/api/pos/summary',(req,res)=>res.json(store.posSummary()));
  app.get('/api/pos/sales/:id',(req,res)=>{const sale=store.posSale(req.params.id);return sale?res.json(sale):fail(res,404,'Receipt not found');});
  app.post('/api/pos/checkout',(req,res)=>{try{res.status(201).json(store.posCheckout(req.body));}catch(e){fail(res,400,e.message);}});
  app.post('/api/pos/sales/:id/confirm-transfer',(req,res)=>{try{res.json(store.posConfirmTransfer(req.params.id));}catch(e){fail(res,400,e.message);}});
  app.post('/api/pos/sales/:id/cancel',(req,res)=>{try{res.json(store.posCancelTransfer(req.params.id));}catch(e){fail(res,400,e.message);}});
  // Private, read-only AI preview: no Telegram message and no order modifications.
  app.get('/api/ai/catalog',(req,res)=>res.json({products:liveCatalog(store)}));
  app.post('/api/ai/preview',async(req,res)=>{
    if(!validText(req.body?.question,1200))return fail(res,400,'Enter a test question (max 1200 characters)');
    if(store.setting('ai_enabled','true')!=='true')return fail(res,409,'AI is disabled in settings');
    try{
      const client={chat:{completions:{create:async payload=>{
        const r=await fetch((env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1').replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.OPENROUTER_API_KEY},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
        const d=await r.json();if(!r.ok)throw Error(d?.error?.message||`OpenRouter HTTP ${r.status}`);return d;
      }}}};
      const answer=await generateAI(store,business,client,env.OPENROUTER_MODEL||'openai/gpt-4o-mini',req.body.question,{extra:store.setting('ai_prompt','')});
      res.json({answer,model:env.OPENROUTER_MODEL||'openai/gpt-4o-mini'});
    }catch(e){console.error('AI preview error:',e.message);fail(res,502,'OpenRouter preview failed; check API key, model and credits in the server console');}
  });
  app.get('/api/settings',(req,res)=>res.json({ai_enabled:store.setting('ai_enabled','true')==='true',ai_prompt:store.setting('ai_prompt','')}));
  app.put('/api/settings',(req,res)=>{if(typeof req.body.ai_enabled!=='boolean'||typeof req.body.ai_prompt!=='string'||req.body.ai_prompt.length>10000)return fail(res,400,'Invalid AI settings');store.setSetting('ai_enabled',String(req.body.ai_enabled));store.setSetting('ai_prompt',req.body.ai_prompt);res.json({ok:true});});
  const baseDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const adminDir=path.join(baseDir,'admin-public');
  const siteDir=path.join(baseDir,'site-public');
  const posDir=path.join(baseDir,'pos-public');
  app.use('/pos-assets',express.static(posDir,{index:false}));
  app.get('/admin/pos',(req,res)=>res.sendFile(path.join(posDir,'index.html')));
  app.use('/admin',express.static(adminDir,{index:'index.html',redirect:false}));
  app.get('/admin',(req,res)=>res.sendFile(path.join(adminDir,'index.html')));
  app.get('/admin/',(req,res)=>res.sendFile(path.join(adminDir,'index.html')));
  // Backwards compatibility with earlier dashboard HTML referencing /app.js.
  app.get('/app.js',(req,res)=>res.sendFile(path.join(adminDir,'app.js')));
  app.use('/site-assets',express.static(siteDir,{index:false}));
  for(const route of ['/','/products','/services','/contact'])app.get(route,(req,res)=>res.sendFile(path.join(siteDir,'index.html')));
  app.use((err,req,res,next)=>{console.error('Dashboard request failed:',err.message);fail(res,500,'Unexpected server error');});
  return app;
}

/*
 * Vercel migration entry point.
 *
 * Vercel auto-detects src/server.js and requires a default-exported Express
 * application. The existing createServer(store,bot) remains available for the
 * local Node.js application and the tests.
 *
 * IMPORTANT: The current persistence layer uses local SQLite files, so
 * starting it inside a serverless function risks ephemeral data and lost
 * inventory/order writes. Until the PostgreSQL adapter is implemented, this
 * default export deliberately responds with 503 rather than initializing a
 * local database or starting Telegram long polling.
 */
const migrationApp = express();
migrationApp.disable('x-powered-by');
migrationApp.get('/healthz', (req, res) =>
  res.status(200).json({status:'migration_pending',database:'not_configured'})
);
migrationApp.use((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(503).json({
    error:'Migration in progress',
    message:'Persistent database migration is required before this service can accept requests.'
  });
});
export default migrationApp;
