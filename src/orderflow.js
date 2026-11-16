// Guided chat order collection. A request is NOT a confirmed purchase or payment.
export function formatSummary(d){return `Review your order request:\nService/product: ${d.product}\nQuantity: ${d.quantity}\nName: ${d.customer_name}\nPhone: ${d.phone}\nAddress/location: ${d.address}\nNotes: ${d.notes}\n\nReply YES to submit this request, NO to cancel. This does not confirm a booking, stock, delivery, or payment.`;}
// A Telegram deep link /start p_<id> starts the same guided order flow
// as /order, but with the selected active product already filled in.
export function beginProductOrder(store,chatId,productId){
  if(!/^[1-9][0-9]{0,12}$/.test(String(productId)))return {reply:'Invalid product link. Please browse the website or send /order.'};
  const product=store.listProducts().find(p=>Number(p.id)===Number(productId)&&Number(p.active)===1);
  if(!product)return {reply:'That product is no longer available in the catalog. Browse the website or send /order to start a different enquiry.'};
  store.startDraft(chatId);
  store.updateDraft(chatId,'product',product.name);
  store.updateDraft(chatId,'step','quantity');
  return {reply:`You selected: ${product.name}\nPrice: ${product.price||'Ask staff for a quote'}\n\nLet's prepare an order enquiry. How many would you like? Reply with a number from 1 to 100. Send /cancelorder to stop. This is not a confirmed order or payment.`};
}
export function processOrderInput(store,chatId,text){
  const t=String(text||'').trim();
  if(/^\//.test(t)&&!/^\/(order|cancelorder|myorders)(?:@\w+)?$/i.test(t))return null;
  if(/^\/cancelorder(?:@\w+)?$/i.test(t)){store.clearDraft(chatId);return {reply:'Order request cancelled. Send /order when you are ready.'};}
  if(/^\/myorders(?:@\w+)?$/i.test(t)){const orders=store.customerOrders(chatId);return {reply:orders.length?orders.map(o=>`#${o.id} — ${o.product} x${o.quantity} — ${o.status}`).join('\n'):'You have no recorded order requests yet.'};}
  if(/^\/order(?:@\w+)?$/i.test(t)){store.startDraft(chatId);return {reply:'Let’s collect your order request. What product or service would you like? Send /cancelorder anytime.'};}
  const d=store.getDraft(chatId);if(!d)return null;
  if(d.step==='product'){
    if(t.length<2||t.length>250)return {reply:'Please enter a product or service name (2–250 characters).'};
    store.updateDraft(chatId,'product',t);store.updateDraft(chatId,'step','quantity');return {reply:'How many do you need? Reply with a number from 1 to 100.'};
  }
  if(d.step==='quantity'){
    if(!/^[1-9]\d*$/.test(t)||Number(t)>100)return {reply:'Please send a whole number from 1 to 100.'};
    store.updateDraft(chatId,'quantity',Number(t));store.updateDraft(chatId,'step','customer_name');return {reply:'What name should staff use to contact you?'};
  }
  if(d.step==='customer_name'){
    if(t.length<2||t.length>120)return {reply:'Please enter a name (2–120 characters).'};
    store.updateDraft(chatId,'customer_name',t);store.updateDraft(chatId,'step','phone');return {reply:'What phone number should staff contact? Only provide it if you are comfortable sharing it with the business.'};
  }
  if(d.step==='phone'){
    if(!/^\+?[0-9 ()-]{7,22}$/.test(t))return {reply:'Please provide a valid contact number (7–22 characters, digits and optional +, spaces, or dashes).'};
    store.updateDraft(chatId,'phone',t);store.updateDraft(chatId,'step','address');return {reply:'Which area or address is this request for? Share only the details needed for a quotation or delivery.'};
  }
  if(d.step==='address'){
    if(t.length<2||t.length>500)return {reply:'Please enter a location or address (2–500 characters).'};
    store.updateDraft(chatId,'address',t);store.updateDraft(chatId,'step','notes');return {reply:'Any extra instructions? Reply NONE if you have none.'};
  }
  if(d.step==='notes'){
    if(t.length>250)return {reply:'Please keep your notes to 250 characters.'};
    store.updateDraft(chatId,'notes',t.toUpperCase()==='NONE'?'None':t);store.updateDraft(chatId,'step','confirm');return {reply:formatSummary(store.getDraft(chatId))};
  }
  if(d.step==='confirm'){
    if(/^no$/i.test(t)){store.clearDraft(chatId);return {reply:'Request cancelled. Send /order to start a new one.'};}
    if(!/^yes$/i.test(t))return {reply:'Please reply YES to submit your request or NO to cancel.'};
    const orderId=store.confirmDraft(chatId);return {reply:`Your order enquiry #${orderId} was recorded as PENDING. Staff will review it. No payment has been taken and this is not a confirmed order.`,orderId};
  }
  return null;
}
