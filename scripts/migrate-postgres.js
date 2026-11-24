import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import pg from 'pg';

const url=process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.NEON_DATABASE_URL;
if(!url){
  console.error('DATABASE_URL (or POSTGRES_URL/NEON_DATABASE_URL) is required. No changes made.');
  process.exitCode=1;
}else{
  const client=new pg.Client({connectionString:url,connectionTimeoutMillis:12000});
  try{
    await client.connect();
    const sql=await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'../db/postgres-schema.sql'),'utf8');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    const result=await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('customers','messages','products','orders','settings','order_drafts','processed_updates','inventory','stock_movements','payments','followups','consent','pos_sales','pos_sale_items')");
    console.log('Neon schema check:',result.rows[0].count,'of 14 tables present.');
    if(result.rows[0].count!==14) process.exitCode=1;
  }catch(err){
    try{await client.query('ROLLBACK');}catch{}
    console.error('Schema migration failed:',err.code||err.message);
    process.exitCode=1;
  }finally{await client.end().catch(()=>{});}
}
