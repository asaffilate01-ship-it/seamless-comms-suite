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
async function inContext(role,subject,fn){
 assert(["authenticated","service_role"].includes(role));
 await db.exec("BEGIN;SET LOCAL ROLE "+role+";");
 try{
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[subject,role]);
  const value=await fn();await db.exec("COMMIT");return value;
 }catch(error){await db.exec("ROLLBACK");throw error;}
}
const asAdmin=fn=>inContext("authenticated",admin,fn);
const asService=fn=>inContext("service_role","",fn);

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
const dishbeeWorkspace="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
await asService(async()=>{
 await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='haccora'",[mealdeck.tenantId]);
 await db.query("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1 AND service_key LIKE 'haccora.%'",[mealdeck.tenantId]);
 await db.query("INSERT INTO public.product_connections(tenant_id,product_key,external_tenant_id,status,last_verified_at) VALUES($1,'haccora','haccora-mealdeck','connected',now())",[mealdeck.tenantId]);
 // Disposable fixture only: the implementation never deletes operational jobs.
 await db.query("DELETE FROM public.provisioning_jobs WHERE tenant_id=$1 AND ((target_kind='product' AND target_key='haccora') OR (target_kind='service' AND target_key LIKE 'haccora.%'))",[mealdeck.tenantId]);
 await db.query("INSERT INTO public.product_connections(tenant_id,product_key,external_tenant_id,status) VALUES($1,'dishbee',$2,'connected')",[mealdeck.tenantId,dishbeeWorkspace]);
});
const report=async()=>asAdmin(async()=> (await db.query("SELECT public.platform_haccora_readiness($1) AS r",[mealdeck.tenantId])).rows[0].r);
const controlPlaneOnly=await report();
assert.equal(controlPlaneOnly.controlPlaneReady,true);
assert.equal(controlPlaneOnly.operationalRuntime.required,true);
assert.equal(controlPlaneOnly.operationalRuntime.ready,false);
assert.equal(controlPlaneOnly.ready,false);

await asService(()=>db.query(
  `INSERT INTO public.platform_events(
    tenant_id,product_key,event_type,event_version,occurred_at,source_service,
    subject_type,subject_id,idempotency_key,data_classification,payload
  ) VALUES(
    $1,'dishbee','dishbee.runtime.readiness',1,now(),'dishbee.runtime',
    'tenant',$3,$2,'internal',
    jsonb_build_object('dishbeeTenantId',$3::text) || '{"haccora":{"enabled":true,"configured":true,"ready":true,"activeLocations":1,"passedLocations":1,"failedLocations":0,"unprobedLocations":0,"deadEvents":0,"pendingEvents":0}}'::jsonb
  )`,
  [mealdeck.tenantId,"haccora-runtime-ready:"+mealdeck.tenantId,dishbeeWorkspace],
));
const ready=await report();
assert.equal(ready.ready,true);
assert.equal(ready.aiReady,true);
assert.equal(ready.operationalRuntime.ready,true);
assert.equal(ready.operationalRuntime.passedLocations,1);

// AI subscriptions cannot substitute for a required compliance module.
await asService(()=>db.query("UPDATE public.tenant_services SET status='requested' WHERE tenant_id=$1 AND service_key='haccora.haccp'",[mealdeck.tenantId]));
assert.equal((await report()).controlPlaneReady,false);
assert.equal((await report()).ready,false);
await asService(()=>db.query("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1 AND service_key='haccora.haccp'",[mealdeck.tenantId]));
const eventKey="haccora-runtime-ready:"+mealdeck.tenantId;
for (const timestamp of ["now()-interval '16 minutes'","now()+interval '1 hour'"]) {
  await asService(()=>db.query(`UPDATE public.platform_events SET occurred_at=${timestamp} WHERE idempotency_key=$1`,[eventKey]));
  assert.equal((await report()).operationalRuntime.fresh,false);
  assert.equal((await report()).ready,false);
}
await asService(()=>db.query("UPDATE public.platform_events SET occurred_at=now(),subject_id='different-workspace' WHERE idempotency_key=$1",[eventKey]));
assert.equal((await report()).ready,false);
await asService(()=>db.query("UPDATE public.platform_events SET subject_id=$2 WHERE idempotency_key=$1",[eventKey,dishbeeWorkspace]));
await asService(()=>db.query("UPDATE public.platform_events SET payload=jsonb_set(payload,'{haccora,unprobedLocations}','1') WHERE idempotency_key=$1",[eventKey]));
assert.equal((await report()).ready,false);
await asService(()=>db.query("UPDATE public.platform_events SET payload=jsonb_set(payload,'{haccora,unprobedLocations}','0') WHERE idempotency_key=$1",[eventKey]));
assert.equal((await report()).ready,true);
await assert.rejects(()=>inContext("authenticated","",()=>db.query("SELECT public.platform_haccora_readiness($1)",[mealdeck.tenantId])),/Tenant access denied/);
await db.close();
console.log("Haccora required-service, workspace, freshness and access readiness verified");
