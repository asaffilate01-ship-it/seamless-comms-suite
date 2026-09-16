import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable embedded PostgreSQL only. Never reads deployment credentials.
const db = new PGlite();
const migrations = new URL('../supabase/migrations/', import.meta.url);
let checks = 0;
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE PUBLICATION supabase_realtime;`);
for (const name of (await readdir(migrations)).filter(x=>x.endsWith('.sql')).sort()) {
  const sql = await readFile(new URL(name, migrations),'utf8');
  if (name.startsWith('20260816120554')) {
    // Existing historical demo rows reference these auth IDs. Fixtures only.
    for (const id of ['18bafcd5-3e4c-4044-bb63-10325a0b7209','e66c0525-1787-4250-be26-79f849624521','890c71b1-cf6e-4b68-a56e-dd6050372481','97319fe5-82fd-44cd-b27d-6ae314ee368b']) {
      await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,'fixture@example.invalid']);
    }
  }
  await db.exec(sql);
}
checks++;
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', V='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
for(const id of [A,B,V]) await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,'test@example.invalid']);
async function host(user,fn) {
  await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
  try { const result=await fn();await db.exec('COMMIT');return result; }
  catch(error){await db.exec('ROLLBACK');throw error;}
}
async function create(user,name) {
  return host(user,async()=> (await db.query('SELECT public.create_my_tenant($1,$2) AS t',[name,name.toLowerCase()])).rows[0].t);
}
const ta=await create(A,'Alpha'),tb=await create(B,'Bravo');
assert.notEqual(ta.id,tb.id);checks++;
assert.equal((await create(A,'Repeated')).id,ta.id);checks++;
await assert.rejects(()=>host(B,()=>db.query('INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,$3)',[ta.id,B,'owner'])),e=>e.code==='42501');checks++;
await assert.rejects(()=>host(V,()=>db.query('INSERT INTO public.tenants(name,slug) VALUES($1,$2)',['Bypass','bypass'])),e=>e.code==='42501');checks++;
await assert.rejects(()=>host(V,()=>db.query('SELECT public.create_my_tenant(NULL,$1)',['invalid'])));checks++;
await host(A,()=>db.query('INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,$3)',[ta.id,V,'viewer']));
await host(V,async()=>assert.equal((await db.query("UPDATE public.tenant_members SET role='owner' WHERE user_id=$1 RETURNING role",[V])).rows.length,0));checks++;
await assert.rejects(()=>host(V,()=>db.query('INSERT INTO public.contacts(tenant_id,wa_id) VALUES($1,$2)',[ta.id,'test'])),e=>e.code==='42501');checks++;
await assert.rejects(()=>host(A,()=>db.query('SELECT public.create_rrci_workspace($1,$2,$3)',[ta.id,'Compliance','pilot'])));checks++;
await db.query("INSERT INTO public.addon_entitlements VALUES($1,'rrci','active',now()+interval '1 day','fixture',now())",[ta.id]);
const workspace=await host(A,async()=> (await db.query('SELECT public.create_rrci_workspace($1,$2,$3) AS id',[ta.id,'Compliance','pilot'])).rows[0].id);
await host(A,async()=>assert.equal((await db.query('SELECT public.get_rrci_access($1) AS access',[workspace])).rows[0].access[0].subject,A));checks++;
for(const id of [B,V]) { await host(id,async()=>assert.deepEqual((await db.query('SELECT public.get_rrci_access($1) AS access',[workspace])).rows[0].access,[]));checks++; }
await db.query("UPDATE public.addon_entitlements SET status='suspended' WHERE tenant_id=$1",[ta.id]);
await host(A,async()=>assert.deepEqual((await db.query('SELECT public.get_rrci_access($1) AS access',[workspace])).rows[0].access,[]));checks++;

const tables=(await db.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='business360' AND relkind='r'")).rows;
assert.equal(tables.length,12);assert(tables.every(x=>x.relrowsecurity&&x.relforcerowsecurity));checks++;
async function business(tenant,user,role,fn) {
 await db.exec('BEGIN; SET LOCAL ROLE business360_runtime; SET LOCAL search_path TO business360,pg_catalog;');
 for(const [k,v] of [['b360.tenant',tenant],['b360.user',user],['b360.tenant_role',role]]) await db.query('SELECT set_config($1,$2,true)',[k,v]);
 try{const result=await fn();await db.exec('COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}
}
for(const [tenant,user,project] of [['a','owner-a','pa'],['a','owner-hidden','hidden'],['b','owner-b','pb']]) {
 await business(tenant,user,'owner',async()=>{
  await db.query('INSERT INTO projects(tenant,id,name,currency) VALUES($1,$2,$3,$4)',[tenant,project,project,'GBP']);
  await db.query('INSERT INTO members VALUES($1,$2,$3,$4)',[tenant,project,user,'owner']);
  await db.query('INSERT INTO ai_settings VALUES($1,$2,1,$3)',[tenant,project,'{}']);
  await db.query('INSERT INTO ai_usage(tenant,project,day,model_calls) VALUES($1,$2,$3,5)',[tenant,project,'2026-09-16']);
  await db.query('INSERT INTO ai_runs VALUES($1,$2,$3,$4,$5,$6,0,1,$7,$8,0,NULL,$9,$9,$10)',[tenant,project,'run',user,'finance','test','fixture','ready','now','{}']);
  await db.query('INSERT INTO connector_snapshots VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,'snap','connection','now','{}']);
 });
}
await business('a','owner-a','owner',async()=>{
 for(const table of ['ai_settings','ai_runs','ai_usage','connector_snapshots']) {
  assert.deepEqual((await db.query(`SELECT project FROM ${table}`)).rows,[{project:'pa'}]);checks++;
 }
 assert.equal(Number((await db.query('SELECT business360.tenant_model_calls($1) AS total',['2026-09-16'])).rows[0].total),10);checks++;
 await db.query('INSERT INTO members VALUES($1,$2,$3,$4)',['a','pa','viewer','viewer']);
 await db.query('INSERT INTO members VALUES($1,$2,$3,$4)',['a','pa','analyst','analyst']);
 await db.query('INSERT INTO objects VALUES($1,$2,$3,$4,1,$5)',['a','pa','person_private','pay','{"salary":"50000"}']);
});
await business('b','owner-b','owner',async()=>assert.equal(Number((await db.query('SELECT business360.tenant_model_calls($1) AS total',['2026-09-16'])).rows[0].total),5));checks++;
await business('a','viewer','member',async()=>{
 assert.equal((await db.query('SELECT * FROM objects')).rows.length,0);checks++;
 for(const table of ['ai_settings','ai_runs','ai_usage','connector_snapshots']) {
  assert.equal((await db.query(`UPDATE ${table} SET tenant=tenant RETURNING project`)).rows.length,0);checks++;
 }
});
await assert.rejects(()=>business('a','analyst','member',()=>db.query('INSERT INTO ai_settings VALUES($1,$2,1,$3)',['a','pa','{}'])),e=>e.code==='42501');checks++;
await assert.rejects(()=>business('a','owner-a','owner',()=>db.query('INSERT INTO ai_usage(tenant,project,day) VALUES($1,$2,$3)',['b','pb','tomorrow'])),e=>e.code==='42501');checks++;
await business('a','stranger','admin',async()=>{
 for(const table of ['ai_settings','ai_runs','ai_usage','connector_snapshots']) {assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,0);checks++;}
});
await business('a','owner-a','owner',()=>db.query("DELETE FROM members WHERE \"user\"='viewer'"));
await business('a','viewer','member',async()=>assert.equal((await db.query('SELECT * FROM ai_runs')).rows.length,0));checks++;
await db.close();
console.log(`${checks} PostgreSQL policy/integration checks passed (PGlite, disposable fixtures).`);
