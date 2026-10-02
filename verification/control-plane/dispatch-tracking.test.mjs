import assert from "node:assert/strict";
import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";

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
const admin="11111111-aaaa-4aaa-8aaa-111111111111",stranger="22222222-bbbb-4bbb-8bbb-222222222222";
for(const id of [admin,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const md=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(md?.tenantId);

const agent=(await asUser(admin,()=>db.query("INSERT INTO public.dispatch_agents(tenant_id,product_key,name,agent_role,status,skills) VALUES($1,'mealdeck','Driver One','food_delivery','available',ARRAY['delivery']) RETURNING id",[md.tenantId]))).rows[0].id;
const vehicle=(await asUser(admin,()=>db.query("INSERT INTO public.dispatch_vehicles(tenant_id,product_key,registration,vehicle_type,status) VALUES($1,'mealdeck','MD01ABC','car','available') RETURNING id",[md.tenantId]))).rows[0].id;
const job=await asUser(admin,async()=> (await db.query(
 "SELECT public.dispatch_create_job($1,'mealdeck',NULL,'food_delivery','normal','order-123','{}'::jsonb,$2::jsonb) AS id",
 [md.tenantId,JSON.stringify([{kind:"pickup",lat:51.8787,lng:-0.42,address:"Pickup"},{kind:"dropoff",lat:51.88,lng:-0.41,address:"Customer"}])]
)).rows[0].id);
assert(job);
await asUser(admin,()=>db.query("SELECT public.dispatch_assign_job($1,$2,$3)",[job,agent,vehicle]));
let assigned=await asUser(admin,()=>db.query("SELECT status,assigned_agent_id,assigned_vehicle_id FROM public.dispatch_jobs WHERE id=$1",[job]));
assert.deepEqual(assigned.rows[0],{status:"assigned",assigned_agent_id:agent,assigned_vehicle_id:vehicle});
await asUser(admin,()=>db.query("SELECT public.dispatch_update_status($1,'accepted')",[job]));
await asUser(admin,()=>db.query("SELECT public.dispatch_update_status($1,'en_route')",[job]));
await asUser(admin,()=>db.query("INSERT INTO public.dispatch_agent_positions(tenant_id,product_key,agent_id,job_id,latitude,longitude,observed_at) VALUES($1,'mealdeck',$2,$3,51.879,-0.415,now())",[md.tenantId,agent,job]));
await asUser(admin,()=>db.query("INSERT INTO public.tracking_snapshots(tenant_id,subject_type,subject_id,status,latitude,longitude,progress) VALUES($1,'dispatch_job',$2,'en_route',51.879,-0.415,0.5)",[md.tenantId,job]));
const rawToken="tracking-token-abcdefghijklmnopqrstuvwxyz0123456789";
const hash=createHash("sha256").update(rawToken).digest("hex");
await asUser(admin,()=>db.query("INSERT INTO public.public_tracking_tokens(tenant_id,subject_type,subject_id,token_hash,expires_at) VALUES($1,'dispatch_job',$2,$3,now()+interval '1 day')",[md.tenantId,job,hash]));
const snapshot=await asUser(admin,()=>db.query("SELECT status,latitude,longitude,progress FROM public.tracking_snapshots WHERE tenant_id=$1 AND subject_id=$2",[md.tenantId,job]));
assert.equal(snapshot.rows[0].status,"en_route");
assert.equal(snapshot.rows[0].latitude,51.879);
assert.equal(snapshot.rows[0].longitude,-0.415);
assert.equal(Number(snapshot.rows[0].progress),0.5);
await asUser(admin,()=>db.query("SELECT public.dispatch_update_status($1,'completed')",[job]));
const done=await asUser(admin,()=>db.query("SELECT status FROM public.dispatch_jobs WHERE id=$1",[job]));assert.equal(done.rows[0].status,"completed");
const availability=await asUser(admin,()=>db.query("SELECT status FROM public.dispatch_agents WHERE id=$1",[agent]));assert.equal(availability.rows[0].status,"available");
const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.dispatch_jobs WHERE tenant_id=$1",[md.tenantId]));assert.equal(hidden.rows.length,0);
const impl=await db.query("SELECT implementation_status FROM public.service_catalogue WHERE service_key IN('omniqora.geo','omniqora.dispatch','omniqora.fleet','omniqora.tracking','omniqora.agent')");
assert(impl.rows.every(r=>r.implementation_status==="built_main"));
await db.close();console.log("MealDeck shared dispatch fleet signed-tracking foundation verified");
