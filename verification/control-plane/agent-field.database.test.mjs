import {seedIsolatedDishbeeTestTenants} from "./dishbee-fixture.mjs";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE PUBLICATION supabase_realtime;");
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const content=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554"))
  for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
   await db.query("INSERT INTO auth.users(id,email) VALUES($1,'fixture@example.invalid')",[id]);
 await db.exec(content);
}
const admin="31310000-0000-4000-8000-000000000001";
const driverA="31310000-0000-4000-8000-000000000002";
const driverB="31310000-0000-4000-8000-000000000003";
const stranger="31310000-0000-4000-8000-000000000004";
for(const user of [admin,driverA,driverB,stranger])
 await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[user,user+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,callback){
 await db.exec("BEGIN;SET LOCAL ROLE authenticated");
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
 try{const result=await callback();await db.exec("COMMIT");return result;}
 catch(error){await db.exec("ROLLBACK");throw error;}
}
async function asService(callback){
 await db.exec("BEGIN;SET LOCAL ROLE service_role");
 await db.query("SELECT set_config('request.jwt.claim.role','service_role',true)");
 try{const result=await callback();await db.exec("COMMIT");return result;}
 catch(error){await db.exec("ROLLBACK");throw error;}
}
const pilot=await seedIsolatedDishbeeTestTenants(db,admin);
const tenant=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");
assert(tenant?.tenantId);
await asService(async()=>{
 for(const user of [driverA,driverB])
  await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'agent') ON CONFLICT DO NOTHING",
   [tenant.tenantId,user]);
 for(const service of ["omniqora.agent","omniqora.dispatch"])
  await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status) VALUES($1,$2,'active') ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active'",
   [tenant.tenantId,service]);
});
const agentA=(await asUser(admin,()=>db.query(
 "INSERT INTO public.dispatch_agents(tenant_id,product_key,name,status,skills,user_id) VALUES($1,'mealdeck','Driver A','available',ARRAY['delivery'],$2) RETURNING id",
 [tenant.tenantId,driverA]))).rows[0].id;
const agentB=(await asUser(admin,()=>db.query(
 "INSERT INTO public.dispatch_agents(tenant_id,product_key,name,status,skills,user_id) VALUES($1,'mealdeck','Driver B','available',ARRAY['delivery'],$2) RETURNING id",
 [tenant.tenantId,driverB]))).rows[0].id;
async function newJob(agent,ref){
 const id=(await asUser(admin,()=>db.query(
  "SELECT public.dispatch_create_job($1,'mealdeck',NULL,'food_delivery','normal',$2,'{}'::jsonb,$3::jsonb) AS id",
  [tenant.tenantId,ref,JSON.stringify([
   {kind:"pickup",lat:51.879,lng:-0.419,address:"Cafe kitchen"},
   {kind:"dropoff",lat:51.880,lng:-0.410,address:"Recipient"}])]))).rows[0].id;
 await asUser(admin,()=>db.query("SELECT public.dispatch_assign_job($1,$2,NULL)",[id,agent]));
 return id;
}
const jobA=await newJob(agentA,"job-A");
const jobB=await newJob(agentB,"job-B");
const myJobs=await asUser(driverA,()=>db.query(
 "SELECT id FROM public.dispatch_jobs WHERE tenant_id=$1 ORDER BY id",[tenant.tenantId]));
assert.deepEqual(myJobs.rows.map(row=>row.id),[jobA]);
const visibleStops=await asUser(driverA,()=>db.query(
 "SELECT job_id FROM public.dispatch_job_stops ORDER BY job_id"));
assert(visibleStops.rows.every(row=>row.job_id===jobA));
const otherPod=await asUser(driverB,()=>db.query("SELECT id FROM public.dispatch_job_stops WHERE job_id=$1",[jobA]));
assert.equal(otherPod.rows.length,0);
const anonJobs=await asUser(stranger,()=>db.query("SELECT id FROM public.dispatch_jobs WHERE tenant_id=$1",[tenant.tenantId]));
assert.equal(anonJobs.rows.length,0);
await assert.rejects(asUser(driverA,()=>db.query("SELECT public.agent_portal_status($1,'accepted')",[jobB])),/access denied|scope/i);
await assert.rejects(asUser(driverA,()=>db.query("SELECT public.dispatch_update_status($1,'accepted')",[jobB])),/access denied/i);
await asUser(driverA,()=>db.query("SELECT public.agent_portal_status($1,'accepted')",[jobA]));
await assert.rejects(asUser(driverA,()=>db.query("SELECT public.agent_portal_pod($1,'Recipient','')",[jobA])),/not at a recipient/i);
await asUser(driverA,()=>db.query("SELECT public.agent_portal_status($1,'en_route')",[jobA]));
await asUser(driverA,()=>db.query("SELECT public.agent_portal_status($1,'arrived')",[jobA]));
await assert.rejects(asUser(driverA,()=>db.query("SELECT public.agent_portal_pod($1,'Recipient','')",[jobA])),/Dropoff arrival required/i);
const gps=await asUser(driverA,()=>db.query(
 "SELECT public.agent_portal_position($1,51.88,-0.41,now(),15) AS result",[jobA]));
assert.equal(gps.rows[0].result.locationRecorded,true);
await assert.rejects(asUser(driverB,()=>db.query(
 "SELECT public.agent_portal_position($1,51.88,-0.41,now(),10)",[jobA])),/access denied|scope/i);
for(const stage of ["collected","en_route_dropoff","arrived_dropoff"])
 await asUser(driverA,()=>db.query("SELECT public.agent_portal_status($1,$2)",[jobA,stage]));
const proof=await asUser(driverA,()=>db.query(
 "SELECT public.agent_portal_pod($1,'Customer confirmed by driver','left with customer') AS result",[jobA]));
assert.equal(proof.rows[0].result.verifiedByRecipient,false);
await asUser(driverA,()=>db.query("SELECT public.agent_portal_status($1,'completed')",[jobA]));
const finished=await asUser(admin,()=>db.query(
 "SELECT status FROM public.dispatch_jobs WHERE id=$1",[jobA]));
assert.equal(finished.rows[0].status,"completed");
const tracker=await asUser(admin,()=>db.query(
 "SELECT status,latitude FROM public.tracking_snapshots WHERE subject_id=$1",[jobA]));
assert.equal(tracker.rows[0].status,"completed");
assert.equal(tracker.rows[0].latitude,51.88);
await asUser(admin,()=>db.query("UPDATE public.dispatch_agents SET status='suspended' WHERE id=$1",[agentB]));
const blocked=await asUser(driverB,()=>db.query(
 "SELECT id FROM public.dispatch_jobs WHERE tenant_id=$1",[tenant.tenantId]));
assert.equal(blocked.rows.length,0);
await db.close();
console.log("Driver RLS: isolated assigned jobs/stops, signed status, GPS, true dropoff gate and suspended users");
