/**
 * One-time local data import from a backed-up SQLite file into an EMPTY Neon
 * PostgreSQL schema. Never overwrites existing rows or clears the source.
 *
 * Required:
 *   SQLITE_SOURCE=/absolute/path/to/business.sqlite
 *   DATABASE_URL=postgresql://...   (or DATABASE_URL_ENV=<custom Neon key>)
 *
 * Run AFTER npm run db:migrate. The POS remains offline until the full
 * asynchronous PostgreSQL runtime adapter has been migrated and tested.
 */
import 'dotenv/config';
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import pg from 'pg';
import {resolveDatabaseUrl} from '../src/database-url.js';

export const TABLES = Object.freeze([
  'customers','messages','products','orders','settings','order_drafts',
  'processed_updates','inventory','stock_movements','payments','followups',
  'consent','pos_sales','pos_sale_items'
]);
const quoted = name => '"' + name.replaceAll('"','""') + '"';
export function makeInsert(table, columns) {
  if(!TABLES.includes(table) || !columns.length || !columns.every(c=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(c)))
    throw Error('Invalid table or columns');
  return 'INSERT INTO ' + quoted(table) + ' (' + columns.map(quoted).join(', ') +
    ') VALUES (' + columns.map((_,i)=>'$'+(i+1)).join(', ')+')';
}
export function normalizeRow(row, columns){
  return columns.map(k=>row[k] === undefined ? null : typeof row[k]==='bigint' ? row[k].toString() : row[k]);
}
async function importData(){
  const file=process.env.SQLITE_SOURCE;
  if(!file || !existsSync(file)) throw Error('Set SQLITE_SOURCE to the backed-up SQLite file path');
  const url=resolveDatabaseUrl(process.env);
  const sqlite = new DatabaseSync(file, {readOnly:true});
  const client = new pg.Client({connectionString:url,connectionTimeoutMillis:12000});
  try {
    await client.connect();
    await client.query('BEGIN');
    // Fail before importing if *any* application table already has records.
    for (const table of TABLES) {
      const count=await client.query('SELECT COUNT(*)::int AS n FROM '+quoted(table));
      if(count.rows[0].n>0) throw Error('Destination table '+table+' is not empty; import cancelled (no records changed)');
    }
    const counts = {};
    for(const table of TABLES){
      const has=sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?").get(table).n;
      if(!has){counts[table]=0;continue;}
      const pgCols=await client.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',
        ['public',table]
      );
      const targetColumns=new Set(pgCols.rows.map(r=>r.column_name));
      const sourceColumns=sqlite.prepare('PRAGMA table_info('+quoted(table)+')').all().map(c=>c.name);
      const columns=sourceColumns.filter(c=>targetColumns.has(c));
      if(!columns.length)throw Error('No compatible columns for '+table);
      // Protect existing data: reject an incompatible schema rather than silently drop fields.
      const unknown=sourceColumns.filter(c=>!targetColumns.has(c));
      if(unknown.length)throw Error('Unmapped SQLite columns in '+table+': '+unknown.join(', '));
      const stmt=makeInsert(table,columns);
      let count=0;
      for(const row of sqlite.prepare('SELECT * FROM '+quoted(table)).iterate()){
        await client.query(stmt,normalizeRow(row,columns));
        count++;
      }
      counts[table]=count;
      if(columns.includes('id')){
        const seq=await client.query('SELECT pg_get_serial_sequence($1,$2) AS seq',['public.'+table,'id']);
        if(seq.rows[0]?.seq){
          await client.query(
            'SELECT setval($1::regclass, (SELECT COALESCE(MAX(id),1) FROM '+quoted(table)+'), (SELECT COUNT(*)>0 FROM '+quoted(table)+'))',
            [seq.rows[0].seq]
          );
        }
      }
    }
    await client.query('COMMIT');
    console.log('SQLite to Neon import completed. Rows by table:',counts);
    console.log('Note: product image files require separate persistent object-storage migration.');
  } catch(err) {
    try { await client.query('ROLLBACK'); }catch{}
    throw err;
  } finally {
    await client.end().catch(()=>{});
    sqlite.close();
  }
}
if(process.argv[1] && import.meta.url === new URL('file://'+process.argv[1].replaceAll('\\','/')).href){
  importData().catch(err=>{console.error('Data import cancelled:',err.message);process.exitCode=1;});
}
