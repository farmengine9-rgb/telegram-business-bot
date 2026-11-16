import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createStore} from '../src/store.js';
import {addPhase4,paystackSignatureValid,paystackRequest} from '../src/phase4.js';

function make(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tg-phase4-'));return {dir,file:path.join(dir,'business.sqlite')};}
test('Phase 4 upgrades an existing Phase 3 SQLite store without losing records',async()=>{
  const f=make();let s=await createStore(f.file);s.customer('111',{first_name:'Bisi'});const p=s.saveProduct({name:'Cleaning Kit',price:'₦4000'});const order=s.saveOrder({chat_id:'111',product:'Cleaning Kit',quantity:1});s.close();
  s=addPhase4(await createStore(f.file));assert.equal(s.listCustomers()[0].first_name,'Bisi');assert.equal(s.getOrder(order).product,'Cleaning Kit');assert.equal(s.listInventory()[0].id,p);assert.equal(s.listInventory()[0].quantity,0);
  s.adjustStock(p,10,'New delivery',3);assert.equal(s.listInventory()[0].quantity,10);s.close();
  s=addPhase4(await createStore(f.file));assert.equal(s.listInventory()[0].quantity,10);assert.equal(s.stockMovements().length,1);s.close();fs.rmSync(f.dir,{recursive:true,force:true});
});
test('Inventory cannot go negative; movements have reasons',async()=>{
  const f=make();const s=addPhase4(await createStore(f.file));const p=s.saveProduct({name:'Pack'});assert.throws(()=>s.adjustStock(p,-1,'sale'),/Insufficient/);assert.throws(()=>s.adjustStock(p,2,''),/reason/);s.adjustStock(p,5,'Restock');s.adjustStock(p,-3,'Damaged');assert.equal(s.listInventory()[0].quantity,2);s.close();fs.rmSync(f.dir,{recursive:true,force:true});
});
test('Payment stays pending until verified; rejects incorrect amount, reference or currency',async()=>{
  const f=make();const s=addPhase4(await createStore(f.file));const order=s.saveOrder({chat_id:'111',product:'Clean'});s.createPayment(order,'test@example.com',125000,'TB1-test');assert.equal(s.getPayment('TB1-test').status,'pending');assert.throws(()=>s.reconcilePayment('TB1-test',{reference:'TB1-test',status:'success',amount:100,currency:'NGN'}),/mismatch/);assert.throws(()=>s.reconcilePayment('TB1-test',{reference:'TB1-test',status:'success',amount:125000,currency:'USD'}),/mismatch/);assert.equal(s.reports().verifiedRevenueKobo,0);assert.equal(s.reconcilePayment('TB1-test',{reference:'TB1-test',status:'success',amount:125000,currency:'NGN'}),'paid');assert.equal(s.reports().verifiedRevenueKobo,125000);assert.equal(s.reports().verifiedPayments,1);s.close();fs.rmSync(f.dir,{recursive:true,force:true});
});
test('Follow-ups require explicit opt-in and respect unsubscribe',async()=>{
  const f=make();const s=addPhase4(await createStore(f.file));s.customer('123');assert.throws(()=>s.createFollowup('123','Hello'),/opted in/);s.consent('123',true);const id=s.createFollowup('123','Thanks for your order');assert.equal(s.hasConsent('123'),true);assert.equal(s.getFollowup(id).status,'draft');s.consent('123',false);assert.equal(s.hasConsent('123'),false);s.close();fs.rmSync(f.dir,{recursive:true,force:true});
});
test('Legacy Paystack HMAC signature validation checks raw bytes',()=>{
  const raw=Buffer.from('{"event":"charge.success"}');const signature=crypto.createHmac('sha512','sk_test_example').update(raw).digest('hex');assert.equal(paystackSignatureValid('sk_test_example',raw,signature),true);assert.equal(paystackSignatureValid('sk_test_example',Buffer.from('modified'),signature),false);assert.equal(paystackSignatureValid('sk_test_example',raw,'bad'),false);
});
test('Paystack API client uses secret on backend and rejects failed responses',async()=>{
  let request;
  const stub=async(url,opts)=>{request={url,opts};return {ok:true,json:async()=>({status:true,data:{reference:'test',authorization_url:'https://checkout.paystack.com/test'}})};};
  const d=await paystackRequest('sk_test_secret','POST','/transaction/initialize',{email:'test@example.com',amount:'10000'},stub);
  assert.equal(d.reference,'test');assert.equal(request.url,'https://api.paystack.co/transaction/initialize');assert.equal(request.opts.headers.Authorization,'Bearer sk_test_secret');
});
