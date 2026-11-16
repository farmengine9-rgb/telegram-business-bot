import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const now = () => new Date().toISOString();
const ensure = (v, max=3000) => String(v ?? '').slice(0,max);
export async function createStore(file) {
  const dest = path.resolve(file);
  fs.mkdirSync(path.dirname(dest), {recursive:true});
  const db = new DatabaseSync(dest);
  db.exec(`CREATE TABLE IF NOT EXISTS customers (chat_id TEXT PRIMARY KEY, username TEXT, first_name TEXT, last_name TEXT, human INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id,id);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, product TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'pending', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_drafts (chat_id TEXT PRIMARY KEY, step TEXT NOT NULL, product TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 1, customer_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS processed_updates (update_id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);`);
  const productCols=allProductCols();
  function allProductCols(){return db.prepare('PRAGMA table_info(products)').all().map(c=>c.name);}
  if(!productCols.includes('image_url')) db.exec("ALTER TABLE products ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  function all(sql, params=[]) {return db.prepare(sql).all(...params);}
  function one(sql,params=[]) {return db.prepare(sql).get(...params) || null;}
  function save() { /* SQLite commits changes to the database file directly. */ }
  function run(sql,params=[]) {const info=db.prepare(sql).run(...params);return Number(info.lastInsertRowid);}
  function setting(key, fallback=''){return one('SELECT value FROM settings WHERE key=?',[key])?.value ?? fallback;}
  function setSetting(key,value){run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,ensure(value,15000)]);}
  function customer(chatId, user={}) {
    const id=String(chatId);const old=one('SELECT * FROM customers WHERE chat_id=?',[id]);
    if(!old){run('INSERT INTO customers(chat_id,username,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?,?)',[id,ensure(user.username,80),ensure(user.first_name,80),ensure(user.last_name,80),now(),now()]);}
    else if(Object.keys(user).length){run('UPDATE customers SET username=?,first_name=?,last_name=?,updated_at=? WHERE chat_id=?',[ensure(user.username ?? old.username,80),ensure(user.first_name ?? old.first_name,80),ensure(user.last_name ?? old.last_name,80),now(),id]);}
    return one('SELECT * FROM customers WHERE chat_id=?',[id]);
  }
  function message(chatId,role,content){return run('INSERT INTO messages(chat_id,role,content,created_at) VALUES(?,?,?,?)',[String(chatId),role,ensure(content,12000),now()]);}
  function setHuman(chatId, human){customer(chatId);run('UPDATE customers SET human=?, updated_at=? WHERE chat_id=?',[human?1:0,now(),String(chatId)]);}
  function history(chatId, limit=12){return all('SELECT role, content FROM (SELECT id,role,content FROM messages WHERE chat_id=? AND role IN (\'user\',\'assistant\') ORDER BY id DESC LIMIT ?) ORDER BY id ASC',[String(chatId),limit]);}
  function clearHistory(chatId){run('DELETE FROM messages WHERE chat_id=?',[String(chatId)]);}
  function hasUpdate(id){return !!one('SELECT 1 AS x FROM processed_updates WHERE update_id=?',[id]);}
  function markUpdate(id){run('INSERT OR IGNORE INTO processed_updates(update_id,created_at) VALUES(?,?)',[id,now()]);}
  function listCustomers(){return all(`SELECT c.*, (SELECT content FROM messages m WHERE m.chat_id=c.chat_id ORDER BY m.id DESC LIMIT 1) AS last_message, (SELECT created_at FROM messages m WHERE m.chat_id=c.chat_id ORDER BY m.id DESC LIMIT 1) AS last_message_at FROM customers c ORDER BY COALESCE(last_message_at,c.updated_at) DESC`);}
  function listMessages(id){return all('SELECT * FROM messages WHERE chat_id=? ORDER BY id ASC LIMIT 500',[String(id)]);}
  function stats(){return {customers:one('SELECT COUNT(*) n FROM customers').n, messages:one('SELECT COUNT(*) n FROM messages').n, pendingOrders:one("SELECT COUNT(*) n FROM orders WHERE status='pending'").n, handovers:one('SELECT COUNT(*) n FROM customers WHERE human=1').n};}
  function listProducts(){return all('SELECT * FROM products ORDER BY id DESC');}
  function saveProduct(body,id){const values=[ensure(body.name,120),ensure(body.description,1000),ensure(body.price,80),body.active===false||body.active===0?0:1,ensure(body.image_url,1000)];if(id){run('UPDATE products SET name=?,description=?,price=?,active=?,image_url=? WHERE id=?',[...values,Number(id)]);return Number(id);}return run('INSERT INTO products(name,description,price,active,image_url,created_at) VALUES(?,?,?,?,?,?)',[...values,now()]);}
  function deleteProduct(id){run('DELETE FROM products WHERE id=?',[Number(id)]);}
  function getDraft(chatId){return one('SELECT * FROM order_drafts WHERE chat_id=?',[String(chatId)]);}
  function startDraft(chatId){customer(chatId);run("INSERT INTO order_drafts(chat_id,step,updated_at) VALUES(?,'product',?) ON CONFLICT(chat_id) DO UPDATE SET step='product',product='',quantity=1,customer_name='',phone='',address='',notes='',updated_at=excluded.updated_at",[String(chatId),now()]);return getDraft(chatId);}
  const draftColumns=['step','product','quantity','customer_name','phone','address','notes'];
  function updateDraft(chatId,field,value){if(!draftColumns.includes(field))throw Error('Invalid draft field');const v=field==='quantity'?Math.max(1,Math.min(100,Number(value)||1)):ensure(value,field==='address'?500:250);run(`UPDATE order_drafts SET ${field}=?,updated_at=? WHERE chat_id=?`,[v,now(),String(chatId)]);return getDraft(chatId);}
  function clearDraft(chatId){run('DELETE FROM order_drafts WHERE chat_id=?',[String(chatId)]);}
  function confirmDraft(chatId){const d=getDraft(chatId);if(!d||d.step!=='confirm')throw Error('Order not ready');const id=saveOrder({chat_id:chatId,product:d.product,quantity:d.quantity,status:'pending',notes:`Name: ${d.customer_name}\nPhone: ${d.phone}\nAddress: ${d.address}\nCustomer notes: ${d.notes}`});clearDraft(chatId);return id;}
  function customerOrders(chatId){return all('SELECT id,product,quantity,status,created_at FROM orders WHERE chat_id=? ORDER BY id DESC LIMIT 10',[String(chatId)]);}
  function getOrder(id){return one('SELECT * FROM orders WHERE id=?',[Number(id)]);}
  const statuses=['pending','confirmed','processing','fulfilled','cancelled'];
  function listOrders(){return all('SELECT * FROM orders ORDER BY id DESC');}
  function saveOrder(body,id){const qty=Math.max(1,Math.min(9999,Number.parseInt(body.quantity,10)||1));const status=statuses.includes(body.status)?body.status:'pending';const fields=[ensure(body.chat_id,80),ensure(body.product,250),qty,status,ensure(body.notes,2000)];if(id){run('UPDATE orders SET chat_id=?,product=?,quantity=?,status=?,notes=? WHERE id=?',[...fields,Number(id)]);return Number(id);}return run('INSERT INTO orders(chat_id,product,quantity,status,notes,created_at) VALUES(?,?,?,?,?,?)',[...fields,now()]);}
  function deleteOrder(id){run('DELETE FROM orders WHERE id=?',[Number(id)]);}
  return {all,one,run,setting,setSetting,customer,message,setHuman,history,clearHistory,hasUpdate,markUpdate,listCustomers,listMessages,stats,listProducts,saveProduct,deleteProduct,listOrders,saveOrder,deleteOrder,getOrder,getDraft,startDraft,updateDraft,clearDraft,confirmDraft,customerOrders,close(){db.close();},databasePath:dest};
}
