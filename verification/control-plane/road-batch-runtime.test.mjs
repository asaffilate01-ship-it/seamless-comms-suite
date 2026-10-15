import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db=new PGlite(),migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE PUBLICATION supabase_realtime;");
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const sql=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554"))for(const user of
  ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521",
   "890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,'fixture@example.invalid')",[user]);
 await db.exec(sql);
}
const admin="ca150000-0000-4000-8000-000000000001",other="ca150000-0000-4000-8000-000000000002";
for(const id of [admin,other])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){
 await db.exec("BEGIN;SET LOCAL ROLE authenticated");
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
 try{let out=await fn();await db.exec("COMMIT");return out;}
 catch(error){await db.exec("ROLLBACK");throw error;}
}
async function asService(fn){
 await db.exec("BEGIN;SET LOCAL ROLE service_role");
 await db.query("SELECT set_config('request.jwt.claim.role','service_role',true)");
 try{let out=await fn();await db.exec("COMMIT");return out;}
 catch(error){await db.exec("ROLLBACK");throw error;}
}
const bootstrap=await asUser(admin,async()=>(
 await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS data")).rows[0].data);
const t=bootstrap.tenants.find(x=>x.tenantSlug==="mealdeck");assert(t?.tenantId);
await asService(async()=>{
 await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='mealdeck'",[t.tenantId]);
 await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status) VALUES($1,'omniqora.routing-engine','active') ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active'",[t.tenantId]);
});
async function createOpt(){return(await asUser(admin,()=>db.query(
 "SELECT public.routing_create_optimisation($1,'mealdeck','manual','balanced') AS id",
 [t.tenantId]))).rows[0].id;}
const opt=await createOpt(),secondOpt=await createOpt();
const coords=Array.from({length:16},(_,i)=>({lat:51.70+i*.002,lng:-.42+i*.002}));
const key="ca150000-0000-4000-8000-000000000003",another="ca150000-0000-4000-8000-000000000004";
async function queue(id,req=key,points=coords){return (await db.query(
 "SELECT public.routing_queue_matrix_batch($1,$2::jsonb,$3::uuid) AS id",
 [id,JSON.stringify(points),req])).rows[0].id;}
await assert.rejects(asUser(other,()=>queue(opt)),/Road routing administrator required/);
const batch=await asUser(admin,()=>queue(opt));
assert(batch);
assert.equal(await asUser(admin,()=>queue(opt)),batch);
await assert.rejects(asUser(admin,()=>queue(opt,another)),/different batch/);
const tiles=await asUser(admin,()=>db.query(
 "SELECT t.row_offset,t.column_offset,t.matrix_job_id,m.origins,m.destinations,m.status FROM public.routing_road_batch_tiles t JOIN public.routing_matrix_jobs m ON m.id=t.matrix_job_id WHERE t.batch_id=$1 ORDER BY t.row_offset,t.column_offset",[batch]));
assert.deepEqual(tiles.rows.map(x=>[x.row_offset,x.column_offset]),[[0,0],[0,8],[8,0],[8,8]]);
assert(tiles.rows.every(t=>t.origins.length===8&&t.destinations.length===8));
const quota=await asUser(admin,()=>db.query(
 "SELECT requests,elements FROM public.routing_matrix_daily_quota WHERE tenant_id=$1",[t.tenantId]));
assert.deepEqual(quota.rows[0],{requests:4,elements:256});
await assert.rejects(asUser(admin,()=>queue(secondOpt,another,
 coords.slice(0,9))),/quota exceeded/);
const second=await asUser(admin,()=>db.query(
 "SELECT road_batch_id FROM public.routing_optimisation_jobs WHERE id=$1",[secondOpt]));
assert.equal(second.rows[0].road_batch_id,null);
assert.equal((await asUser(admin,()=>db.query("SELECT count(*)::int AS n FROM public.routing_road_batches"))).rows[0].n,1);
for(const tile of tiles.rows){
 const cells=tile.origins.flatMap((_,i)=>tile.destinations.map((__,j)=>({
  originIndex:i,destinationIndex:j,status:"ok",
  distanceMetres:tile.row_offset+i===tile.column_offset+j?0:800,
  durationSeconds:tile.row_offset+i===tile.column_offset+j?0:120
 })));
 await asService(()=>db.query("UPDATE public.routing_matrix_jobs SET status='running' WHERE id=$1",[tile.matrix_job_id]));
 await asService(()=>db.query(
  "SELECT public.service_complete_road_matrix($1,'mealdeck',$2,'maps.openrouteservice','road',$3::jsonb)",
  [t.tenantId,tile.matrix_job_id,JSON.stringify(cells)]));
}
const driver=(await asUser(admin,()=>db.query(
 "INSERT INTO public.dispatch_agents(tenant_id,product_key,name,status,skills,capacity) VALUES($1,'mealdeck','Pilot driver','available',ARRAY['delivery'],10) RETURNING id",[t.tenantId]))).rows[0].id;
const vehicle=(await asUser(admin,()=>db.query(
 "INSERT INTO public.dispatch_vehicles(tenant_id,product_key,registration,vehicle_type,status,capacity) VALUES($1,'mealdeck','RD16','van','available',10) RETURNING id",[t.tenantId]))).rows[0].id;
const job=(await asUser(admin,()=>db.query(
 "INSERT INTO public.dispatch_jobs(tenant_id,product_key,job_type,status,priority,required_skills,required_vehicle_types,capacity_demand) VALUES($1,'mealdeck','food_delivery','unassigned','normal',ARRAY['delivery'],ARRAY['van'],1) RETURNING id",[t.tenantId]))).rows[0].id;
const stop=(await asUser(admin,()=>db.query(
 "INSERT INTO public.dispatch_job_stops(job_id,tenant_id,position,stop_kind,latitude,longitude) VALUES($1,$2,0,'dropoff',51.73,-.39) RETURNING id",[job,t.tenantId]))).rows[0].id;
await asUser(admin,()=>db.query(
 "UPDATE public.routing_optimisation_jobs SET status='review',score=$2::jsonb,input_snapshot=input_snapshot||$3::jsonb WHERE id=$1",
 [opt,JSON.stringify({constraintBreaches:0,unassignedJobs:0}),
 JSON.stringify({routeQuality:"road",providerKey:"maps.openrouteservice"})]));
const route=(await asUser(admin,()=>db.query(
 "INSERT INTO public.routing_route_plans(tenant_id,product_key,optimisation_job_id,route_no,agent_id,vehicle_id,planned_distance_metres,planned_duration_seconds,status) VALUES($1,'mealdeck',$2,0,$3,$4,800,120,'review') RETURNING id",
 [t.tenantId,opt,driver,vehicle]))).rows[0].id;
await asUser(admin,()=>db.query(
 "INSERT INTO public.routing_route_plan_stops(tenant_id,route_plan_id,sequence,job_id,dispatch_stop_id,latitude,longitude) VALUES($1,$2,0,$3,$4,51.73,-.39)",
 [t.tenantId,route,job,stop]));
await asService(()=>db.query("UPDATE public.routing_matrix_jobs SET completed_at=now()-interval '25 hours' WHERE id=$1",[tiles.rows[0].matrix_job_id]));
await assert.rejects(asUser(admin,()=>db.query("SELECT public.routing_apply_optimisation($1)",[opt])),/matrix expired/i);
await asService(()=>db.query("UPDATE public.routing_matrix_jobs SET completed_at=now() WHERE id=$1",[tiles.rows[0].matrix_job_id]));
await asUser(admin,()=>db.query("UPDATE public.dispatch_job_stops SET longitude=-.38 WHERE id=$1",[stop]));
await assert.rejects(asUser(admin,()=>db.query("SELECT public.routing_apply_optimisation($1)",[opt])),/coordinates changed/i);
await asUser(admin,()=>db.query("UPDATE public.dispatch_job_stops SET longitude=-.39 WHERE id=$1",[stop]));
await asUser(admin,()=>db.query("SELECT public.routing_apply_optimisation($1)",[opt]));
const done=await asUser(admin,()=>db.query("SELECT status,assigned_agent_id FROM public.dispatch_jobs WHERE id=$1",[job]));
assert.deepEqual(done.rows[0],{status:"assigned",assigned_agent_id:driver});
await db.close();
console.log("16-node routing tiles: atomic 256-element budget, replay protection, complete receipts, expiry/coordinate denial and reviewed dispatch");
