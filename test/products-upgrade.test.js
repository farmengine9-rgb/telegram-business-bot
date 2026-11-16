import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createStore} from '../src/store.js';
import {publicProducts} from '../src/siteconfig.js';

test('Old products table receives image_url column without losing records',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-migration-'));const file=path.join(dir,'db.sqlite');
 const legacy=new DatabaseSync(file);
 legacy.exec("CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',price TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)");
 legacy.prepare('INSERT INTO products(name,description,price,active,created_at) VALUES(?,?,?,?,?)').run('Old shirt','cotton','8500',1,new Date().toISOString());legacy.close();
 const db=await createStore(file);assert.equal(db.listProducts()[0].name,'Old shirt');assert.equal(db.listProducts()[0].image_url,'');
 db.saveProduct({name:'Old shirt',description:'cotton',price:'8500',active:true,image_url:'https://example.com/photo.jpg'},1);
 assert.equal(db.listProducts()[0].image_url,'https://example.com/photo.jpg');db.close();
 const reopened=await createStore(file);assert.equal(reopened.listProducts()[0].image_url,'https://example.com/photo.jpg');reopened.close();fs.rmSync(dir,{recursive:true,force:true});
});
test('Public catalog includes photo link but not internal product data',()=>{
 const products=publicProducts([{id:1,name:'Shoe',description:'Demo',price:'15000',active:1,image_url:'/product-images/0123456789abcdef0123456789abcdef.jpg',private:'hidden'}]);
 assert.equal(products[0].image_url,'/product-images/0123456789abcdef0123456789abcdef.jpg');assert.equal(products[0].private,undefined);
});
