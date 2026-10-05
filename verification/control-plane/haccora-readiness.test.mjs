import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const sql=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554")){
  for(const id of["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
   await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
 }
 await db.exec(sql);
}
const admin="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[admin,"admin@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asAdmin(fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[admin]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
async function privileged(sql,params=[]){await db.exec("SET ROLE service_role");try{return await db.query(sql,params);}finally{await db.exec("RESET ROLE");}}

await asAdmin(()=>db.query("SELECT public.platform_bootstrap_dishbee_pilot()"));
await asAdmin(()=>db.query("SELECT public.platform_enable_haccora_dishbee_pilot(true)"));
const pilot=await asAdmin(async()=> (await db.query("SELECT public.platform_haccora_pilot_readiness() AS r")).rows[0].r);
assert.equal(pilot.tenants.length,3);
assert.equal(pilot.allReady,false);
assert(pilot.tenants.every(t=>t.productStatus==="requested"));
assert(pilot.tenants.every(t=>t.connectionStatus==="not_connected"));
assert(pilot.tenants.every(t=>t.services.aiRequested===true));
const mealdeck=pilot.tenants.find(t=>t.tenantSlug==="mealdeck");
assert(mealdeck?.tenantId);
const report=()=>asAdmin(async()=> (await db.query("SELECT public.platform_haccora_readiness($1) AS r",[mealdeck.tenantId])).rows[0].r);
await privileged("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='haccora'",[mealdeck.tenantId]);
await privileged("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1 AND service_key LIKE 'haccora.%'",[mealdeck.tenantId]);
await privileged("INSERT INTO public.product_connections(tenant_id,product_key,external_tenant_id,status,last_verified_at) VALUES($1,'haccora','haccora-mealdeck','connected',now())",[mealdeck.tenantId]);
await privileged("UPDATE public.provisioning_jobs SET status='succeeded' WHERE tenant_id=$1 AND ((target_kind='product' AND target_key='haccora') OR (target_kind='service' AND target_key LIKE 'haccora.%'))",[mealdeck.tenantId]);
// The pilot bootstrap already creates this connection; update it without duplicating it.
await privileged("INSERT INTO public.product_connections(tenant_id,product_key,external_tenant_id,status,last_verified_at) VALUES($1,'dishbee',$1::text,'connected',now()) ON CONFLICT (tenant_id,product_key) DO UPDATE SET external_tenant_id=EXCLUDED.external_tenant_id,status=EXCLUDED.status,last_verified_at=EXCLUDED.last_verified_at",[mealdeck.tenantId]);
const controlPlaneOnly=await report();
assert.equal(controlPlaneOnly.controlPlaneReady,true);
assert.equal(controlPlaneOnly.operationalRuntime.required,true);
assert.equal(controlPlaneOnly.operationalRuntime.ready,false);
assert.equal(controlPlaneOnly.ready,false);
await privileged(`INSERT INTO public.platform_events(
 tenant_id,product_key,event_type,event_version,occurred_at,source_service,
 subject_type,subject_id,idempotency_key,data_classification,sequence_no,payload
) VALUES($1,'dishbee','dishbee.runtime.readiness',1,now(),'dishbee.runtime','tenant',$1::text,$2,'internal',
 (SELECT coalesce(max(sequence_no),0)+1 FROM public.platform_events WHERE tenant_id=$1),
 jsonb_build_object('dishbeeTenantId',$1::text) || '{"haccora":{"enabled":true,"configured":true,"ready":true,"activeLocations":1,"passedLocations":1,"failedLocations":0,"unprobedLocations":0,"deadEvents":0,"pendingEvents":0}}'::jsonb)`,[mealdeck.tenantId,"haccora-runtime-ready:"+mealdeck.tenantId]);
const ready=await report();
assert.equal(ready.ready,true);
assert.equal(ready.aiReady,true);
assert.equal(ready.operationalRuntime.ready,true);
assert.equal(ready.operationalRuntime.passedLocations,1);
await privileged("UPDATE public.tenant_services SET status='cancelled' WHERE tenant_id=$1 AND service_key='haccora.core'",[mealdeck.tenantId]);
const missingCore=await report();
assert(missingCore.services.active>=missingCore.services.requiredTotal);
assert.equal(missingCore.controlPlaneReady,false);
assert.equal(missingCore.ready,false);
assert.equal(missingCore.aiReady,false);
await privileged("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1 AND service_key='haccora.core'",[mealdeck.tenantId]);
assert.equal((await report()).ready,true);
await privileged("UPDATE public.product_connections SET external_tenant_id='other-workspace' WHERE tenant_id=$1 AND product_key='dishbee'",[mealdeck.tenantId]);
assert.equal((await report()).operationalRuntime.ready,false);
await privileged("UPDATE public.product_connections SET external_tenant_id=$1::text WHERE tenant_id=$1 AND product_key='dishbee'",[mealdeck.tenantId]);
await privileged("UPDATE public.platform_events SET occurred_at=now()-interval '16 minutes' WHERE tenant_id=$1 AND event_type='dishbee.runtime.readiness'",[mealdeck.tenantId]);
assert.equal((await report()).ready,false);
await privileged("UPDATE public.platform_events SET occurred_at=now()+interval '1 day' WHERE tenant_id=$1 AND event_type='dishbee.runtime.readiness'",[mealdeck.tenantId]);
assert.equal((await report()).ready,false);
await privileged("UPDATE public.platform_events SET occurred_at=now(),payload=jsonb_set(payload,'{dishbeeTenantId}',to_jsonb('other-workspace'::text)) WHERE tenant_id=$1 AND event_type='dishbee.runtime.readiness'",[mealdeck.tenantId]);
assert.equal((await report()).ready,false);
await db.exec("BEGIN;SET LOCAL ROLE authenticated;");
await db.query("SELECT set_config('request.jwt.claim.sub','',true)");
await assert.rejects(db.query("SELECT public.platform_haccora_readiness($1)",[mealdeck.tenantId]),/Tenant access denied/);
await db.exec("ROLLBACK");
await db.close();
console.log("Haccora required modules, workspace identity, freshness and fail-closed access verified");
