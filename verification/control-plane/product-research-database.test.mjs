import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('research persistence enforces isolation, history and optimistic writes',async t=>{
 const db=new PGlite();
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',viewer='00000000-0000-4000-8000-000000000003';
 const ta='10000000-0000-4000-8000-000000000001',tb='10000000-0000-4000-8000-000000000002',project='20000000-0000-4000-8000-000000000001';
 const req='30000000-0000-4000-8000-000000000001',req2='30000000-0000-4000-8000-000000000002';
 const dossier=JSON.parse(readFileSync(new URL('../../docs/factory/examples/product-research.json',import.meta.url),'utf8'));
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid primary key); CREATE TABLE public.tenants(id uuid primary key);
 CREATE TABLE public.tenant_members(tenant_id uuid,user_id uuid,role text);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT SELECT ON public.tenant_members TO authenticated;
 ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
 CREATE POLICY own_membership ON public.tenant_members FOR SELECT TO authenticated USING(user_id=auth.uid());
 INSERT INTO auth.users VALUES('${a}'),('${b}'),('${viewer}'); INSERT INTO public.tenants VALUES('${ta}'),('${tb}');
 INSERT INTO public.tenant_members VALUES('${ta}','${a}','owner'),('${tb}','${b}','owner'),('${ta}','${viewer}','viewer');`);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261024201227_product_research_projects.sql',import.meta.url),'utf8'));
 async function as(user,role='authenticated'){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('SET ROLE '+role);}
 async function save({tenant=ta,expected=0,request=req,name='Research',body=dossier}={}){return (await db.query('SELECT public.save_product_research_project($1,$2,$3,$4,$5,$6::jsonb) AS result',[tenant,project,expected,request,name,JSON.stringify(body)])).rows[0].result;}
 try{
 await t.test('owner saves first revision and retry is idempotent',async()=>{await as(a);assert.equal((await save()).revision,1);assert.equal((await save()).replayed,true);assert.equal((await db.query('SELECT count(*)::int AS n FROM product_research_revisions')).rows[0].n,1);});
 await t.test('reusing request key for different content is rejected',async()=>{await assert.rejects(save({name:'Changed'}),/different content/);});
 await t.test('stale revision is rejected and valid update retains history',async()=>{await assert.rejects(save({request:req2}),/revision conflict/);assert.equal((await save({expected:1,request:req2,name:'Updated'})).revision,2);assert.equal((await db.query('SELECT count(*)::int AS n FROM product_research_revisions')).rows[0].n,2);});
 await t.test('cross-tenant reads and writes are denied',async()=>{await as(b);assert.equal((await db.query('SELECT * FROM product_research_projects')).rows.length,0);assert.equal((await db.query('SELECT * FROM product_research_revisions')).rows.length,0);await assert.rejects(save(),/access required/);await assert.rejects(save({tenant:tb}),/unavailable/);});
 await t.test('viewer can read but cannot save',async()=>{await as(viewer);assert.equal((await db.query('SELECT * FROM product_research_projects')).rows.length,1);await assert.rejects(save(),/access required/);});
 await t.test('direct writes and history changes are denied',async()=>{await as(a);await assert.rejects(db.exec("UPDATE product_research_projects SET name='Forged'"),/permission denied/);await assert.rejects(db.exec('DELETE FROM product_research_revisions'),/permission denied/);});
 await t.test('anonymous access is denied',async()=>{await as('','anon');await assert.rejects(db.exec('SELECT * FROM product_research_projects'),/permission denied/);await assert.rejects(save(),/permission denied/);});
 await t.test('invalid payload is rejected without storing a revision',async()=>{await as(a);await assert.rejects(save({expected:2,request:'30000000-0000-4000-8000-000000000003',body:{version:1}}),/Invalid research dossier/);assert.equal((await db.query('SELECT count(*)::int AS n FROM product_research_revisions')).rows[0].n,2);});
 await t.test('membership revocation removes read and write access',async()=>{await db.exec('RESET ROLE');await db.query('DELETE FROM tenant_members WHERE user_id=$1',[a]);await as(a);assert.equal((await db.query('SELECT * FROM product_research_projects')).rows.length,0);await assert.rejects(save(),/access required/);});
 }finally{await db.close();}
});
