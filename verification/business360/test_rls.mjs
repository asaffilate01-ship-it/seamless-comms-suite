// SQL policy tests on embedded PostgreSQL (PGlite). No external database touched.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const { PGlite }=require(process.env.BUSINESS360_PGLITE_PATH || '@electric-sql/pglite');
const db=new PGlite();let passed=0;
const migration=new URL('../../supabase/migrations/20260916120000_business360_rls.sql',import.meta.url);
await db.exec(await readFile(migration,'utf8'));
const tables=await db.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='business360' AND relkind='r'");
assert.equal(tables.rows.length,7);assert(tables.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));passed++;
async function as(tenant,user,role,fn){
 await db.exec('BEGIN; SET LOCAL ROLE business360_runtime; SET LOCAL search_path TO business360,pg_catalog;');
 for(const [key,value] of [['b360.tenant',tenant],['b360.user',user],['b360.tenant_role',role]])await db.query('SELECT set_config($1,$2,true)',[key,value]);
 try{const r=await fn();await db.exec('COMMIT');return r;}catch(e){await db.exec('ROLLBACK');throw e;}
}
for(const [tenant,user,id] of [['a','owner-a','pa'],['b','owner-b','pb']]){
 await as(tenant,user,'owner',async()=>{
  await db.query('INSERT INTO projects(tenant,id,name,currency) VALUES($1,$2,$3,$4)',[tenant,id,'Business '+tenant,'GBP']);
  await db.query('INSERT INTO members VALUES($1,$2,$3,$4)',[tenant,id,user,'owner']);
  await db.query('INSERT INTO objects VALUES($1,$2,$3,$4,$5,$6)',[tenant,id,'department','ops',1,'{}']);
  await db.query('INSERT INTO audit(tenant,project,created,actor,event,payload,previous,digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[tenant,id,'now',user,'created','{}','0','1']);
 });
}
passed++;
await as('a','owner-a','owner',async()=>{
 assert.deepEqual((await db.query('SELECT id FROM projects')).rows,[{id:'pa'}]);
 assert.deepEqual((await db.query('SELECT tenant FROM objects')).rows,[{tenant:'a'}]);
 await db.query('INSERT INTO members VALUES($1,$2,$3,$4)',['a','pa','viewer-a','viewer']);
 await db.query('INSERT INTO members VALUES($1,$2,$3,$4)',['a','pa','analyst-a','analyst']);
 await db.query('INSERT INTO objects VALUES($1,$2,$3,$4,$5,$6)',['a','pa','person_private','pay',1,'{"salary":"50000"}']);
});passed++;
await as('a','stranger','admin',async()=>assert.equal((await db.query('SELECT * FROM objects')).rows.length,0));passed++;
await as('a','viewer-a','member',async()=>assert.deepEqual((await db.query('SELECT kind FROM objects')).rows,[{kind:'department'}]));passed++;
for(const [tenant,user,kind,target] of [['a','viewer-a','department','a'],['a','analyst-a','person_private','a'],['a','analyst-a','business_financials','a'],['a','owner-a','department','b']]){
 await assert.rejects(()=>as(tenant,user,'member',()=>db.query('INSERT INTO objects VALUES($1,$2,$3,$4,$5,$6)',[target,target==='a'?'pa':'pb',kind,'forbidden',1,'{}'])),e=>e.code==='42501');passed++;
}
await as('a','owner-a','owner',async()=>{
 assert.equal((await db.query("UPDATE audit SET event='tampered' RETURNING seq")).rows.length,0);
 assert.equal((await db.query('DELETE FROM audit RETURNING seq')).rows.length,0);
 assert.equal((await db.query("DELETE FROM members WHERE role='owner' RETURNING role")).rows.length,0);
});passed++;
await as('a','owner-a','owner',()=>db.query("DELETE FROM members WHERE \"user\"='viewer-a'"));
await as('a','viewer-a','member',async()=>assert.equal((await db.query('SELECT * FROM objects')).rows.length,0));passed++;
await db.close();console.log(`${passed} SQL/RLS checks passed on embedded PostgreSQL (PGlite).`);
