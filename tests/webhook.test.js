import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

test('Telegram webhook rejects unauthenticated messages and deduplicates updates', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-webhook-test-'));
  const processed = new Set();
  const seen = [];
  const store = {
    databasePath: path.join(dir,'business.sqlite'),
    setting: () => '',
    hasUpdate: (id) => processed.has(id),
    markUpdate: (id) => processed.add(id),
  };
  const bot = { handle: async update => { seen.push(update.update_id); } };
  const secret = '0123456789abcdefghijklmnopqrstuvwxyzABCDEF';
  const app = createServer(store,bot,{
    TELEGRAM_WEBHOOK_SECRET:secret,
    SESSION_SECRET:'0123456789abcdefghijklmnopqrstuvwxyzABCDEF',
    ADMIN_PASSWORD:'a-strong-test-password',
    NODE_ENV:'test'
  });
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  t.after(async () => {
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const url = 'http://127.0.0.1:' + server.address().port + '/api/telegram/webhook';
  const post = (header, body) => fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json',...(header?{'X-Telegram-Bot-Api-Secret-Token':header}:{})},
    body:JSON.stringify(body)
  });
  assert.equal((await post('',{update_id:12})).status,403);
  assert.equal((await post('bad-token',{update_id:12})).status,403);
  assert.equal((await post(secret,{no_update_id:1})).status,400);
  assert.equal((await post(secret,{update_id:12})).status,200);
  assert.equal((await post(secret,{update_id:12})).status,200);
  assert.deepEqual(seen,[12]);
});
