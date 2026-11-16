import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultsForSite,readSiteSettings,updateSiteSettings,publicProducts} from '../src/siteconfig.js';
import {createStore} from '../src/store.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';

test('Public site defaults are grounded in the configured business',()=>{
 const site=defaultsForSite({name:'Demo Services',description:'Care and upkeep',hours:'Weekdays'},'demobot');
 assert.equal(site.name,'Demo Services');assert.equal(site.telegram_username,'demobot');assert.equal(site.hours,'Weekdays');
});
test('Website editor validates Telegram usernames and colors',()=>{
 const old=defaultsForSite();
 assert.throws(()=>updateSiteSettings(old,{telegram_username:'https://t.me/abc'}),/Telegram username/);
 assert.throws(()=>updateSiteSettings(old,{theme_color:'red; background:url(x)'}),/Theme color/);
 assert.equal(updateSiteSettings(old,{telegram_username:'sample_business_bot'}).telegram_username,'sample_business_bot');
});
test('Public catalog excludes inactive products and private database fields',()=>{
 const result=publicProducts([{id:1,name:'Public',price:'₦100',active:1,description:'A',secret:'no'},{id:2,name:'Hidden',active:0}]);
 assert.equal(result.length,1);assert.equal(result[0].name,'Public');assert.equal('secret' in result[0],false);
});
test('Website settings survive database restart without losing products', async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tgphase5-'));const file=path.join(folder,'db.sqlite');
 let db=await createStore(file);db.saveProduct({name:'Service',description:'Test',price:'Quote required',active:true});
 const updated=updateSiteSettings(defaultsForSite(),{name:'Acme',headline:'We show up'});db.setSetting('website_settings',JSON.stringify(updated));db.close();
 db=await createStore(file);const site=readSiteSettings(db.setting('website_settings',''));
 assert.equal(site.name,'Acme');assert.equal(site.headline,'We show up');assert.equal(db.listProducts().length,1);db.close();fs.rmSync(folder,{recursive:true,force:true});
});
