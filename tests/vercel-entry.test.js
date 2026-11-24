import test from 'node:test';
import assert from 'node:assert/strict';
import app, {createServer} from '../src/server.js';

test('Vercel entry point exports an Express request handler', () => {
  assert.equal(typeof app, 'function');
  assert.equal(typeof createServer, 'function');
});

test('Vercel entry point fails closed before persistent database migration', async t => {
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const health=await fetch(base+'/healthz');
  assert.equal(health.status,200);
  assert.equal((await health.json()).status,'migration_pending');
  const response=await fetch(base+'/');
  assert.equal(response.status,503);
  assert.match((await response.json()).error,/Migration in progress/);
});
