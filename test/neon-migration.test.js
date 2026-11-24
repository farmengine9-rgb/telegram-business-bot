import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDatabaseUrl} from '../src/database-url.js';
import {makeInsert,normalizeRow,TABLES} from '../scripts/import-sqlite-to-postgres.js';

const url='postgresql://user:password@example.invalid:5432/demo';
test('Neon connection string accepts standard variable',()=>{
  assert.equal(resolveDatabaseUrl({DATABASE_URL:url}),url);
});
test('Neon connection string supports custom Vercel variable name',()=>{
  assert.equal(resolveDatabaseUrl({DATABASE_URL_ENV:'NEON_MYPROJECT_DATABASE_URL',NEON_MYPROJECT_DATABASE_URL:url}),url);
});
test('Neon connection string detects a single custom Neon variable',()=>{
  assert.equal(resolveDatabaseUrl({NEON_MYPROJECT_DATABASE_URL:url}),url);
});
test('Neon connection string does not guess between multiple names',()=>{
  assert.throws(()=>resolveDatabaseUrl({NEON_ONE_DATABASE_URL:url,NEON_TWO_DATABASE_URL:url}),/Multiple Neon variables/);
});
test('Neon connection string rejects untrusted values',()=>{
  assert.throws(()=>resolveDatabaseUrl({DATABASE_URL:'sqlite:///foo'}),/postgres/);
  assert.throws(()=>resolveDatabaseUrl({DATABASE_URL_ENV:'X;DROP TABLE users',X:url}),/Invalid DATABASE_URL_ENV/);
});
test('SQLite import SQL is parameterized and restricted to known tables',()=>{
  assert.ok(TABLES.includes('pos_sale_items'));
  assert.equal(makeInsert('customers',['chat_id','first_name']),'INSERT INTO "customers" ("chat_id", "first_name") VALUES ($1, $2)');
  assert.throws(()=>makeInsert('malicious_table',['id']),/Invalid/);
  assert.throws(()=>makeInsert('products',['id); DROP TABLE users;--']),/Invalid/);
  assert.deepEqual(normalizeRow({id:1n,name:'Shirt'},['id','name','description']),['1','Shirt',null]);
});
