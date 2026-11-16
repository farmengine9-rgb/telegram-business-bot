import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {createStore} from '../src/store.js';
import {getIncoming,instructions} from '../src/bot.js';

test('SQLite store persists products, customers, messages, and orders across reload',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tgbot-'));const file=path.join(dir,'test.sqlite');let db=await createStore(file);db.customer('123',{first_name:'Ada'});db.message('123','user','Hello');db.setHuman('123',true);db.saveProduct({name:'Yoghurt',price:'₦2,000',active:true});db.saveOrder({chat_id:'123',product:'Yoghurt',quantity:2});db.setSetting('ai_prompt','Friendly tone');db.close();db=await createStore(file);assert.equal(db.listCustomers()[0].first_name,'Ada');assert.equal(db.listMessages('123')[0].content,'Hello');assert.equal(db.listCustomers()[0].human,1);assert.equal(db.listProducts()[0].name,'Yoghurt');assert.equal(db.listOrders()[0].quantity,2);assert.equal(db.setting('ai_prompt'),'Friendly tone');db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('Telegram filters non-private and non-text updates',()=>{assert.equal(getIncoming({message:{chat:{type:'group'},text:'hello'}}),null);assert.equal(getIncoming({message:{chat:{type:'private'},photo:[]}}),null);assert.equal(getIncoming({message:{chat:{type:'private',id:123},text:'Hello'}}).chatId,'123');});
test('AI prompt includes only active products and safety instructions',()=>{const s=instructions({name:'Example',description:'',hours:'',contact:'',policies:'',faq:''},[{active:1,name:'Yoghurt',price:'₦2,000',description:'fresh'},{active:0,name:'Secret',price:'',description:''}],'Be brief');assert.match(s,/Yoghurt/);assert.doesNotMatch(s,/Secret/);assert.match(s,/Never invent/);assert.match(s,/Be brief/);});

import {processOrderInput} from '../src/orderflow.js';

test('guided order workflow validates fields and persists submitted request',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tgorder-'));const file=path.join(dir,'db.sqlite');
  let db=await createStore(file);const chat='789';
  assert.match(processOrderInput(db,chat,'/order').reply,/product or service/i);
  assert.match(processOrderInput(db,chat,'Deep cleaning').reply,/how many/i);
  assert.match(processOrderInput(db,chat,'0').reply,/number/i);
  processOrderInput(db,chat,'2');processOrderInput(db,chat,'Amaka James');
  processOrderInput(db,chat,'+234 800 111 2233');processOrderInput(db,chat,'Abuja');
  const summary=processOrderInput(db,chat,'NONE').reply;
  assert.match(summary,/Deep cleaning/);assert.match(summary,/Reply YES/);
  db.close();db=await createStore(file);
  const receipt=processOrderInput(db,chat,'YES');assert.ok(receipt.orderId>0);
  assert.equal(db.getDraft(chat),null);assert.equal(db.customerOrders(chat)[0].status,'pending');
  assert.match(processOrderInput(db,chat,'/myorders').reply,/Deep cleaning/);
  db.close();fs.rmSync(dir,{recursive:true,force:true});
});
test('cancelled drafts are not orders and customer cannot inspect another chat',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tgorders-'));const db=await createStore(path.join(dir,'db.sqlite'));
  processOrderInput(db,'1','/order');processOrderInput(db,'1','Service');processOrderInput(db,'1','/cancelorder');
  assert.equal(db.getDraft('1'),null);assert.equal(db.listOrders().length,0);
  db.saveOrder({chat_id:'2',product:'Private item',quantity:1});
  assert.match(processOrderInput(db,'1','/myorders').reply,/no recorded/i);
  assert.match(processOrderInput(db,'2','/myorders').reply,/Private item/);
  db.close();fs.rmSync(dir,{recursive:true,force:true});
});
