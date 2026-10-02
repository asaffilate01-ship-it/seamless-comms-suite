import assert from "node:assert/strict";
import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db=new PGlite();const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const sql=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554"))for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
 await db.exec(sql);
}
const admin="dddddddd-1111-4111-8111-dddddddddddd",stranger="eeeeeeee-2222-4222-8222-eeeeeeeeeeee";
for(const id of [admin,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
async function asService(fn){await db.exec("BEGIN;SET LOCAL ROLE service_role;");await db.query("SELECT set_config('request.jwt.claim.role','service_role',true)");try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}

const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const luton=pilot.tenants.find(x=>x.tenantSlug==="cafe1-luton");assert(luton?.tenantId);
await asUser(admin,()=>db.query("SELECT public.platform_set_tenant_service($1,'dishbee.assisted-ordering',true,'{}'::jsonb)",[luton.tenantId]));
await asService(()=>db.query("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1 AND service_key IN ('dishbee.assisted-ordering','omniqora.payments','omniqora.connect')",[luton.tenantId]));

const first=await asUser(admin,async()=> (await db.query(
 "SELECT public.order_create_manual_session($1,'dishbee',NULL,NULL,'manual',$2,$3,$4::jsonb,$5,120) AS id",
 [luton.tenantId,"+447700900001","Test Customer",JSON.stringify({items:[{name:"Lasagne",qty:2,unit_minor:899}],total_minor:1798,currency:"GBP"}),"test-order-0001"]
)).rows[0].id);
const again=await asUser(admin,async()=> (await db.query(
 "SELECT public.order_create_manual_session($1,'dishbee',NULL,NULL,'manual',$2,$3,$4::jsonb,$5,120) AS id",
 [luton.tenantId,"+447700900001","Test Customer",JSON.stringify({items:[{name:"Lasagne",qty:2,unit_minor:899}],total_minor:1798,currency:"GBP"}),"test-order-0001"]
)).rows[0].id);
assert.equal(first,again);

await asService(()=>db.query(
 "SELECT public.order_mark_payment_requested($1,'payments.adyen','pay-ref-1','https://pay.example.invalid/x','payment-link-0001',now()+interval '15 minutes','{}'::jsonb)",
 [first]
));
let state=await asUser(admin,()=>db.query("SELECT status FROM public.order_intake_sessions WHERE id=$1",[first]));
assert.equal(state.rows[0].status,"awaiting_payment");

await asService(()=>db.query("SELECT public.server_order_payment_status('payments.adyen','pay-ref-1','paid','{}'::jsonb)"));
state=await asUser(admin,()=>db.query("SELECT status FROM public.order_intake_sessions WHERE id=$1",[first]));
assert.equal(state.rows[0].status,"handoff_ready");

const claimed=await asService(()=>db.query("SELECT id,status,claimed_by_key_id FROM public.server_claim_order_handoff($1,'dishbee','oqsvc_dishbee_test',10)",[luton.tenantId]));
assert.equal(claimed.rows.length,1);assert.equal(claimed.rows[0].status,"claimed");assert.equal(claimed.rows[0].claimed_by_key_id,"oqsvc_dishbee_test");

await asService(()=>db.query("SELECT public.server_ack_order_handoff($1,'oqsvc_dishbee_test','dishbee-order-123',true,'{}'::jsonb)",[first]));
const submitted=await asUser(admin,()=>db.query("SELECT status,target_order_id FROM public.order_intake_sessions WHERE id=$1",[first]));
assert.deepEqual(submitted.rows[0],{status:"submitted",target_order_id:"dishbee-order-123"});

const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.order_intake_sessions WHERE tenant_id=$1",[luton.tenantId]));
assert.equal(hidden.rows.length,0);

const impl=await db.query("SELECT service_key,implementation_status FROM public.service_catalogue WHERE service_key IN ('omniqora.voice','dishbee.assisted-ordering') ORDER BY service_key");
assert(impl.rows.every(r=>r.implementation_status==="built_main"));

await db.close();console.log("assisted ordering payment and Dishbee pull/ack handoff verified");
