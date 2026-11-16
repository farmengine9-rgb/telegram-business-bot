import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../src/store.js';
import {beginProductOrder,processOrderInput} from '../src/orderflow.js';
import {readSiteSettings,defaultsForSite} from '../src/siteconfig.js';

test('Product deep link starts persistent order with selected product',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deeporder-'));
 let store=await createStore(path.join(dir,'business.sqlite'));
 const id=store.saveProduct({name:'Premium Cotton T-Shirt',price:'8500',description:'Cotton',active:true});
 const result=beginProductOrder(store,'991',String(id));
 assert.match(result.reply,/Premium Cotton T-Shirt/);
 assert.match(result.reply,/How many/);
 assert.equal(store.getDraft('991').product,'Premium Cotton T-Shirt');
 assert.equal(store.getDraft('991').step,'quantity');
 store.close();store=await createStore(path.join(dir,'business.sqlite'));
 assert.match(processOrderInput(store,'991','2').reply,/name/i);
 assert.equal(store.getDraft('991').quantity,2);
 store.close();fs.rmSync(dir,{recursive:true,force:true});
});
test('Product links cannot start orders for inactive or deleted products',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deeplink-invalid-'));
 const store=await createStore(path.join(dir,'db.sqlite'));
 const id=store.saveProduct({name:'Hidden Item',price:'100',description:'',active:false});
 assert.match(beginProductOrder(store,'5',String(id)).reply,/no longer available/);
 assert.equal(store.getDraft('5'),null);
 assert.match(beginProductOrder(store,'5','invalid').reply,/Invalid product link/);
 store.close();fs.rmSync(dir,{recursive:true,force:true});
});
test('Site settings fallback uses detected Telegram username when saved username blank',()=>{
 const data=JSON.stringify({...defaultsForSite({name:'Shop'}),'telegram_username':''});
 assert.equal(readSiteSettings(data,{name:'Shop'},'my_store_bot').telegram_username,'my_store_bot');
});
test('Public order button creates Telegram deep link with selected product',()=>{
 const src=fs.readFileSync(new URL('../site-public/site.js',import.meta.url),'utf8');
 assert.match(src,/\?start=p_\$\{id\}/);
 assert.match(src,/productOrderLink\(telegramUsername,product\.id\)/);
});
