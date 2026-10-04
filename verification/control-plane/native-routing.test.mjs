import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE PUBLICATION supabase_realtime;");
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const sql=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554")){
  for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
 }
 await db.exec(sql);
}
const admin="22222222-aaaa-4aaa-8aaa-222222222222",stranger="11111111-bbbb-4bbb-8bbb-111111111111";
for(const id of[admin,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
async function asService(fn){await db.exec("BEGIN;SET LOCAL ROLE service_role;");try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}

const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const tenant=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(tenant?.tenantId);

await asUser(admin,()=>db.query("INSERT INTO public.routing_policies(tenant_id,product_key,policy_key,objective,status) VALUES($1,'mealdeck','default','balanced','active')",[tenant.tenantId]));
await asService(()=>db.query("INSERT INTO public.routing_provider_observations(tenant_id,product_key,provider_key,operation,succeeded,latency_ms,estimated_cost_minor,currency) VALUES($1,'mealdeck','maps.google','matrix',true,110,2,'GBP'),($1,'mealdeck','maps.mapbox','matrix',true,350,1,'GBP'),($1,'mealdeck','maps.openrouteservice','matrix',false,800,0,'GBP')",[tenant.tenantId]));
const ranked=await asUser(admin,()=>db.query("SELECT provider_key,score FROM public.routing_rank_providers($1,'mealdeck','matrix',168)",[tenant.tenantId]));
assert.equal(ranked.rows[0].provider_key,"maps.google");
const hiddenRank=await asUser(stranger,()=>db.query("SELECT * FROM public.routing_rank_providers($1,'mealdeck','matrix',168)",[tenant.tenantId]));
assert.equal(hiddenRank.rows.length,0);

const agent=(await asUser(admin,()=>db.query("INSERT INTO public.dispatch_agents(tenant_id,product_key,user_id,name,status,skills) VALUES($1,'mealdeck',$2,'Route Driver','available',ARRAY['cold-chain']) RETURNING id",[tenant.tenantId,admin]))).rows[0].id;
const vehicle=(await asUser(admin,()=>db.query("INSERT INTO public.dispatch_vehicles(tenant_id,product_key,registration,vehicle_type,capacity,status) VALUES($1,'mealdeck','VRP1','van',10,'available') RETURNING id",[tenant.tenantId]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.dispatch_shifts(tenant_id,product_key,agent_id,starts_at,ends_at,planned_status) VALUES($1,'mealdeck',$2,now()-interval '1 hour',now()+interval '8 hours','confirmed')",[tenant.tenantId,agent]));
await asUser(admin,()=>db.query("INSERT INTO public.dispatch_agent_positions(tenant_id,product_key,agent_id,latitude,longitude,observed_at) VALUES($1,'mealdeck',$2,51.8787,-0.4200,now())",[tenant.tenantId,agent]));

const job=(await asUser(admin,()=>db.query("INSERT INTO public.dispatch_jobs(tenant_id,product_key,job_type,status,priority,required_skills,required_vehicle_types,capacity_demand) VALUES($1,'mealdeck','delivery','unassigned','high',ARRAY['cold-chain'],ARRAY['van'],5) RETURNING id",[tenant.tenantId]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.dispatch_job_stops(job_id,tenant_id,position,stop_kind,latitude,longitude,service_seconds,status) VALUES($1,$2,0,'pickup',51.8800,-0.4170,120,'pending'),($1,$2,1,'dropoff',51.9000,-0.4000,60,'pending')",[job,tenant.tenantId]));
const count=await asUser(admin,async()=> (await db.query("SELECT public.dispatch_generate_assignment_recommendations($1,'mealdeck',$2,5) AS n",[tenant.tenantId,job])).rows[0].n);
assert.equal(Number(count),1);
const rec=await asUser(admin,()=>db.query("SELECT * FROM public.routing_assignment_recommendations WHERE job_id=$1 AND status='candidate' ORDER BY score DESC LIMIT 1",[job]));
assert.equal(rec.rows[0].agent_id,agent);assert.equal(rec.rows[0].vehicle_id,vehicle);
await asUser(admin,()=>db.query("SELECT public.dispatch_apply_assignment_recommendation($1)",[rec.rows[0].id]));
const assigned=await asUser(admin,()=>db.query("SELECT status,assigned_agent_id,assigned_vehicle_id FROM public.dispatch_jobs WHERE id=$1",[job]));
assert.equal(assigned.rows[0].status,"assigned");assert.equal(assigned.rows[0].assigned_agent_id,agent);assert.equal(assigned.rows[0].assigned_vehicle_id,vehicle);
await asUser(admin,()=>db.query("SELECT public.dispatch_update_status($1,'completed')",[job]));

const job2=(await asUser(admin,()=>db.query("INSERT INTO public.dispatch_jobs(tenant_id,product_key,job_type,status,priority) VALUES($1,'mealdeck','service','unassigned','normal') RETURNING id",[tenant.tenantId]))).rows[0].id;
const stop2=(await asUser(admin,()=>db.query("INSERT INTO public.dispatch_job_stops(job_id,tenant_id,position,stop_kind,latitude,longitude,service_seconds,status) VALUES($1,$2,0,'service',51.8850,-0.4100,90,'pending') RETURNING id",[job2,tenant.tenantId]))).rows[0].id;
const opt=await asUser(admin,async()=> (await db.query("SELECT public.routing_create_optimisation($1,'mealdeck','manual','balanced') AS id",[tenant.tenantId])).rows[0].id);
await asUser(admin,()=>db.query("UPDATE public.routing_optimisation_jobs SET status='review',score='{"distanceMetres":1000}'::jsonb WHERE id=$1",[opt]));
const plan=(await asUser(admin,()=>db.query("INSERT INTO public.routing_route_plans(tenant_id,product_key,optimisation_job_id,route_no,agent_id,vehicle_id,planned_distance_metres,planned_duration_seconds,status) VALUES($1,'mealdeck',$2,0,$3,$4,1000,180,'review') RETURNING id",[tenant.tenantId,opt,agent,vehicle]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.routing_route_plan_stops(tenant_id,route_plan_id,sequence,job_id,dispatch_stop_id,latitude,longitude,planned_arrival_at,planned_departure_at) VALUES($1,$2,0,$3,$4,51.8850,-0.4100,now()+interval '3 minutes',now()+interval '5 minutes')",[tenant.tenantId,plan,job2,stop2]));
await asUser(admin,()=>db.query("SELECT public.routing_apply_optimisation($1)",[opt]));
const applied=await asUser(admin,()=>db.query("SELECT status,assigned_agent_id,assigned_vehicle_id FROM public.dispatch_jobs WHERE id=$1",[job2]));
assert.equal(applied.rows[0].status,"assigned");assert.equal(applied.rows[0].assigned_agent_id,agent);assert.equal(applied.rows[0].assigned_vehicle_id,vehicle);
const optStatus=await asUser(admin,()=>db.query("SELECT status FROM public.routing_optimisation_jobs WHERE id=$1",[opt]));assert.equal(optStatus.rows[0].status,"applied");

const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.routing_policies WHERE tenant_id=$1",[tenant.tenantId]));assert.equal(hidden.rows.length,0);

await db.close();
console.log("native Omniqora routing engine verified");
