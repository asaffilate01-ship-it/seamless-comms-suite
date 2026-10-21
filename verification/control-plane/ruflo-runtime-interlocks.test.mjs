import assert from "node:assert/strict";
import test from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {seedIsolatedDishbeeTestTenants} from "./dishbee-fixture.mjs";

const admin="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const outsider="cccccccc-cccc-4ccc-8ccc-cccccccccccc";

test("Ruflo staging interlock, permissions and emergency stop on isolated PostgreSQL",async()=>{
 const db=new PGlite();
 const rows=async(query,params=[])=> (await db.query(query,params)).rows;
 const asUser=async(user,fn)=>{
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
  try{const value=await fn();await db.exec("COMMIT");return value;}
  catch(error){await db.exec("ROLLBACK");throw error;}
 };
 try{
  await db.exec(
   "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; "+
   "CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated; "+
   "CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb); "+
   "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ "+
   "SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$; "+
   "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ "+
   "SELECT NULLIF(current_setting('request.jwt.claim.role',true),'') $$; "+
   "CREATE PUBLICATION supabase_realtime;"
  );
  const folder=new URL("../../supabase/migrations/",import.meta.url);
  const files=(await readdir(folder)).filter(x=>x.endsWith(".sql")).sort();
  for(const name of files){
   if(name.startsWith("20260816120554")){
    for(const key of [
     "18bafcd5-3e4c-4044-bb63-10325a0b7209",
     "e66c0525-1787-4250-be26-79f849624521",
     "890c71b1-cf6e-4b68-a56e-dd6050372481",
     "97319fe5-82fd-44cd-b27d-6ae314ee368b",
    ])await db.query("INSERT INTO auth.users(id,email) VALUES($1,'fixture@example.invalid')",[key]);
   }
   const sql=await readFile(new URL(name,folder),"utf8");
   try{await db.exec(sql);}catch(error){
    throw new Error("Ruflo isolated migration replay failed: "+name+": "+error.message,{cause:error});
   }
  }
  for(const user of [admin,owner,outsider])
   await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[user,user+"@example.invalid"]);
  await rows("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
  const fixture=await seedIsolatedDishbeeTestTenants(db,admin);
  const tenant=fixture.tenants.find(t=>t.tenantSlug==="cafe1-luton").tenantId;
  const foreignTenant=fixture.tenants.find(t=>t.tenantSlug==="cafe1-st-albans").tenantId;
  const product="dishbee";
  await rows("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'owner')",[tenant,owner]);
  await rows("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'viewer')",[foreignTenant,outsider]);
  await rows(
   "INSERT INTO public.tenant_services(tenant_id,service_key,status,valid_from) "+
   "VALUES($1,'omniqora.intelligence-runtime','active',now()-interval '1 hour') "+
   "ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active', "+
   "valid_from=EXCLUDED.valid_from,valid_until=NULL",[tenant]
  );
  // The canonical test blueprint deliberately leaves tenant products in
  // "requested"; activate THIS disposable PGlite fixture only to exercise
  // the downstream approval boundary. Never use this as a live provisioner.
  await rows(
   "UPDATE public.tenant_products SET status='active',activated_at=now() "+
   "WHERE tenant_id=$1 AND product_key=$2",[tenant,product]
  );
  const productRow=await rows("SELECT status FROM public.tenant_products WHERE tenant_id=$1 AND product_key=$2",[tenant,product]);
  assert.equal(productRow[0]?.status,"active","Disposable fixture is explicitly activated");
  await rows(
   "INSERT INTO public.ai_ruflo_pilot_requests "+
   "(tenant_id,product_key,data_region,reason,status,requested_by,reviewed_by,reviewed_at) "+
   "VALUES($1,$2,'GB','Synthetic approved read-only Ruflo staging trial', "+
   "'shortlisted',$3,$4,now())",[tenant,product,owner,admin]
  );
  await rows(
   "INSERT INTO public.ai_ruflo_tenant_bindings "+
   "(tenant_id,product_key,status,upstream_version,executable_sha256, "+
   "probe_manifest_sha256,data_region,allowed_probe_tools, "+
   "verified_at,verified_by,evidence_reference) "+
   "VALUES($1,$2,'sandbox_verified','test-only',$3,$4,'GB', "+
   "ARRAY['swarm_health'],now()-interval '1 minute',$5, "+
   "'synthetic-test-evidence-only')",
   [tenant,product,"a".repeat(64),"b".repeat(64),admin]
  );

  const gate=async(t=tenant,tool="swarm_health",region="GB")=>
   (await rows("SELECT public.ruflo_probe_gate($1,$2,$3,$4) AS allowed",[t,product,tool,region]))[0].allowed;
  assert.equal(await gate(),false,"Missing staging activation row denies");
  assert.equal(await gate(foreignTenant),false,"Other tenant denied");
  assert.equal(await gate(tenant,"agent_execute"),false,"Mutation tool denied");

  // Synthetic fixture only. No such approval record is ever seeded or
  // provisioned by the actual migration/production release process.
  await rows(
   "INSERT INTO public.ai_ruflo_staging_controls "+
   "(tenant_id,product_key,status,approved_by,approved_at,expires_at,evidence_reference) "+
   "VALUES($1,$2,'staging_approved',$3,now(),now()+interval '1 hour', "+
   "'synthetic-independent-stage-review')",[tenant,product,admin]
  );
  assert.equal(await gate(),true);
  assert.equal(await gate(tenant,"agent_execute"),false);
  assert.equal(await gate(tenant,"swarm_health","DE"),false);
  const task=await asUser(owner,async()=>(await rows(
   "SELECT (public.request_ruflo_probe($1,$2,'swarm_health',$3)).id AS id",
   [tenant,product,randomUUID()],
  ))[0].id);
  assert.ok(task);
  await assert.rejects(asUser(outsider,async()=>rows(
   "SELECT public.stop_ruflo_sandbox($1,$2,'Unauthorised cross-tenant stop attempt')",
   [tenant,product],
  )),/tenant administrator/i);
  const outsideRead=await asUser(outsider,async()=>rows(
   "SELECT status FROM public.ai_ruflo_staging_controls WHERE tenant_id=$1",[tenant],
  ));
  assert.equal(outsideRead.length,0);

  const stopped=await asUser(owner,async()=>(await rows(
   "SELECT public.stop_ruflo_sandbox($1,$2,$3) AS result",
   [tenant,product,"Emergency security suspension of synthetic test sandbox"],
  ))[0].result);
  assert.equal(stopped.status,"suspended");
  assert.equal(stopped.queuedProbesDenied,1);
  assert.equal(stopped.customerAgentExecutionEnabled,false);
  assert.equal(await gate(),false);
  assert.deepEqual(await rows(
   "SELECT status,error_code FROM public.ai_ruflo_probe_tasks WHERE id=$1",[task],
  ),[{status:"denied",error_code:"policy_denied"}]);
  const control=await rows("SELECT status FROM public.ai_ruflo_staging_controls WHERE tenant_id=$1 AND product_key=$2",[tenant,product]);
  assert.equal(control[0].status,"suspended");
  const binding=await rows("SELECT status FROM public.ai_ruflo_tenant_bindings WHERE tenant_id=$1 AND product_key=$2",[tenant,product]);
  assert.equal(binding[0].status,"suspended");
  await assert.rejects(asUser(owner,()=>rows(
   "SELECT public.request_ruflo_probe($1,$2,'swarm_health',$3)",[tenant,product,randomUUID()],
  )),/verification required/i);
 }finally{await db.close();}
});
