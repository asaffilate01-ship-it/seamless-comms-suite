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
const admin="c1090000-0000-4000-8000-000000000001";
const outsider="c1090000-0000-4000-8000-000000000002";
for(const id of [admin,outsider])
 await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){
 await db.exec("BEGIN;SET LOCAL ROLE authenticated");
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
 try{const val=await fn();await db.exec("COMMIT");return val;}
 catch(e){await db.exec("ROLLBACK");throw e;}
}
async function asService(fn){
 await db.exec("BEGIN;SET LOCAL ROLE service_role");
 await db.query("SELECT set_config('request.jwt.claim.role','service_role',true)");
 try{const val=await fn();await db.exec("COMMIT");return val;}
 catch(e){await db.exec("ROLLBACK");throw e;}
}
const pilot=await seedIsolatedDishbeeTestTenants(db,admin);
const t=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(t?.tenantId);
await asService(async()=>{
 await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='mealdeck'",[t.tenantId]);
 await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status) VALUES($1,'omniqora.routing-engine','active') ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active'",[t.tenantId]);
});
const driver=(await asUser(admin,()=>db.query(
 "INSERT INTO public.dispatch_agents(tenant_id,product_key,name,status,skills,capacity) VALUES($1,'mealdeck','Driver One','available',ARRAY['delivery'],10) RETURNING id",[t.tenantId]))).rows[0].id;
const vehicle=(await asUser(admin,()=>db.query(
 "INSERT INTO public.dispatch_vehicles(tenant_id,product_key,registration,vehicle_type,status,capacity) VALUES($1,'mealdeck','REG123','car','available',10) RETURNING id",[t.tenantId]))).rows[0].id;
const job=(await asUser(admin,()=>db.query(
 "INSERT INTO public.dispatch_jobs(tenant_id,product_key,job_type,status,priority,required_skills,required_vehicle_types,capacity_demand) VALUES($1,'mealdeck','delivery','unassigned','normal',ARRAY['delivery'],ARRAY['car'],2) RETURNING id",[t.tenantId]))).rows[0].id;
const stop=(await asUser(admin,()=>db.query(
 "INSERT INTO public.dispatch_job_stops(job_id,tenant_id,position,stop_kind,latitude,longitude,status) VALUES($1,$2,0,'dropoff',51.875,-0.400,'pending') RETURNING id",[job,t.tenantId]))).rows[0].id;
const opt=(await asUser(admin,()=>db.query(
 "SELECT public.routing_create_optimisation($1,'mealdeck','manual','balanced') AS id",[t.tenantId]))).rows[0].id;
const coords=JSON.stringify([{lat:51.870,lng:-0.420},{lat:51.875,lng:-0.400}]);
const requestKey="c1090000-0000-4000-8000-000000000003";
await assert.rejects(asUser(outsider,()=>db.query(
 "SELECT public.routing_queue_optimisation_matrix($1,$2::jsonb,$3::uuid)",
 [opt,coords,requestKey])),/Routing administrator required/);
const matrix=(await asUser(admin,()=>db.query(
 "SELECT public.routing_queue_optimisation_matrix($1,$2::jsonb,$3::uuid) AS id",
 [opt,coords,requestKey]))).rows[0].id;
assert(matrix);
const queued=await asUser(admin,()=>db.query(
 "SELECT matrix_job_id,status FROM public.routing_optimisation_jobs WHERE id=$1",[opt]));
assert.equal(queued.rows[0].matrix_job_id,matrix);
await assert.rejects(asUser(admin,()=>db.query(
 "SELECT public.routing_queue_optimisation_matrix($1,$2::jsonb,$3::uuid)",
 [opt,coords,requestKey])),/Unbound queued routing optimisation required/);
await asService(()=>db.query("UPDATE public.routing_matrix_jobs SET status='running' WHERE id=$1",[matrix]));
const points=[
 {originIndex:0,destinationIndex:0,status:"ok",distanceMetres:0,durationSeconds:0},
 {originIndex:0,destinationIndex:1,status:"ok",distanceMetres:3800,durationSeconds:520},
 {originIndex:1,destinationIndex:0,status:"ok",distanceMetres:4200,durationSeconds:580},
 {originIndex:1,destinationIndex:1,status:"ok",distanceMetres:0,durationSeconds:0}
];
await asService(()=>db.query(
 "SELECT public.service_complete_road_matrix($1,'mealdeck',$2,'maps.openrouteservice','road',$3::jsonb)",
 [t.tenantId,matrix,JSON.stringify(points)]));
await asUser(admin,()=>db.query(
 "UPDATE public.routing_optimisation_jobs SET status='review',score=$2::jsonb,input_snapshot=$3::jsonb WHERE id=$1",
 [opt,JSON.stringify({constraintBreaches:0,unassignedJobs:0}),
  JSON.stringify({routeQuality:"road",providerKey:"maps.openrouteservice"})]));
const plan=(await asUser(admin,()=>db.query(
 "INSERT INTO public.routing_route_plans(tenant_id,product_key,optimisation_job_id,route_no,agent_id,vehicle_id,planned_distance_metres,planned_duration_seconds,status) VALUES($1,'mealdeck',$2,0,$3,$4,3800,520,'review') RETURNING id",
 [t.tenantId,opt,driver,vehicle]))).rows[0].id;
await asUser(admin,()=>db.query(
 "INSERT INTO public.routing_route_plan_stops(tenant_id,route_plan_id,sequence,job_id,dispatch_stop_id,latitude,longitude,planned_arrival_at,planned_departure_at,service_seconds) VALUES($1,$2,0,$3,$4,51.875,-0.400,now()+interval '8 minutes',now()+interval '9 minutes',60)",
 [t.tenantId,plan,job,stop]));
await asService(()=>db.query("UPDATE public.routing_matrix_jobs SET completed_at=now()-interval '25 hours' WHERE id=$1",[matrix]));
await assert.rejects(asUser(admin,()=>db.query("SELECT public.routing_apply_optimisation($1)",[opt])),/Road matrix expired/);
await asService(()=>db.query("UPDATE public.routing_matrix_jobs SET completed_at=now() WHERE id=$1",[matrix]));
await asUser(admin,()=>db.query("UPDATE public.dispatch_job_stops SET latitude=51.88 WHERE id=$1",[stop]));
await assert.rejects(asUser(admin,()=>db.query("SELECT public.routing_apply_optimisation($1)",[opt])),/coordinates changed/);
await asUser(admin,()=>db.query("UPDATE public.dispatch_job_stops SET latitude=51.875 WHERE id=$1",[stop]));
await asUser(admin,()=>db.query("SELECT public.routing_apply_optimisation($1)",[opt]));
const final=await asUser(admin,()=>db.query(
 "SELECT status,assigned_agent_id,assigned_vehicle_id FROM public.dispatch_jobs WHERE id=$1",[job]));
assert.deepEqual(final.rows[0],{status:"assigned",assigned_agent_id:driver,assigned_vehicle_id:vehicle});
assert.equal((await asUser(admin,()=>db.query("SELECT status FROM public.routing_optimisation_jobs WHERE id=$1",[opt]))).rows[0].status,"applied");
await db.close();
console.log("Road-bound optimisation: scoped queue, expired provider rejection, changed-stop rejection and reviewed application");
