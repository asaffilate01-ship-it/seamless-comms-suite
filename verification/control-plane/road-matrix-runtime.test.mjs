import {seedIsolatedDishbeeTestTenants} from "./dishbee-fixture.mjs";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE PUBLICATION supabase_realtime;");
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const content=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554")){
  for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
   await db.query("INSERT INTO auth.users(id,email) VALUES($1,'fixture@example.invalid')",[id]);
 }
 await db.exec(content);
}
const admin="44410000-0000-4000-8000-000000000001";
const agent="44410000-0000-4000-8000-000000000002";
const stranger="44410000-0000-4000-8000-000000000003";
for(const user of [admin,agent,stranger])
 await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[user,user+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,action){
 await db.exec("BEGIN;SET LOCAL ROLE authenticated");
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
 try{const val=await action();await db.exec("COMMIT");return val}
 catch(err){await db.exec("ROLLBACK");throw err}
}
async function asService(action){
 await db.exec("BEGIN;SET LOCAL ROLE service_role");
 await db.query("SELECT set_config('request.jwt.claim.role','service_role',true)");
 try{const val=await action();await db.exec("COMMIT");return val}
 catch(err){await db.exec("ROLLBACK");throw err}
}
const pilot=await seedIsolatedDishbeeTestTenants(db,admin);
const t=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(t?.tenantId);
await asService(async()=>{
 await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='mealdeck'",[t.tenantId]);
 await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status) VALUES($1,'omniqora.routing-engine','active') ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active'",[t.tenantId]);
 await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'agent') ON CONFLICT DO NOTHING",[t.tenantId,agent]);
});
const points=JSON.stringify([{lat:51.879,lng:-0.420}]);
const changedPoints=JSON.stringify([{lat:51.880,lng:-0.420}]);
const key="d0190000-0000-4000-8000-000000000001";
const queue=async(uuid,origins=points)=>(
 await db.query("SELECT public.routing_queue_matrix($1,'mealdeck','driving',$2::jsonb,$3::jsonb,false,$4::uuid) AS id",
  [t.tenantId,origins,points,uuid])).rows[0].id;
const first=await asUser(admin,()=>queue(key));
assert(first);
assert.equal(await asUser(admin,()=>queue(key)),first);
await assert.rejects(asUser(admin,()=>queue(key,changedPoints)),/different matrix input/);
const quota=await asUser(admin,()=>db.query("SELECT requests,elements FROM public.routing_matrix_daily_quota WHERE tenant_id=$1",[t.tenantId]));
assert.deepEqual(quota.rows.map(row=>({requests:row.requests,elements:row.elements})),[{requests:1,elements:1}]);
await assert.rejects(asUser(agent,()=>queue("d0190000-0000-4000-8000-000000000004")),/Routing administrator required/);
await assert.rejects(asUser(stranger,()=>queue("d0190000-0000-4000-8000-000000000005")),/Routing administrator required/);
const blocked=await asUser(agent,()=>db.query("SELECT id FROM public.routing_matrix_jobs WHERE tenant_id=$1",[t.tenantId]));
assert.equal(blocked.rows.length,0);
await assert.rejects(asUser(admin,()=>db.query(
 "INSERT INTO public.routing_matrix_jobs(tenant_id,product_key,origins,destinations) VALUES($1,'mealdeck',$2::jsonb,$3::jsonb)",[t.tenantId,points,points])),/permission denied/);
await asService(()=>db.query("UPDATE public.routing_matrix_jobs SET status='running' WHERE id=$1",[first]));
const cell=JSON.stringify([{originIndex:0,destinationIndex:0,status:"estimated",distanceMetres:0,durationSeconds:null}]);
await assert.rejects(asUser(admin,()=>db.query(
 "SELECT public.service_complete_road_matrix($1,'mealdeck',$2,'routing.native','straight_line_estimate',$3::jsonb)",
 [t.tenantId,first,cell])),/permission denied/);
const written=await asService(()=>db.query(
 "SELECT public.service_complete_road_matrix($1,'mealdeck',$2,'routing.native','straight_line_estimate',$3::jsonb) AS count",
 [t.tenantId,first,cell]));
assert.equal(written.rows[0].count,1);
const stored=await asUser(admin,()=>db.query("SELECT status,quality FROM public.routing_matrix_jobs WHERE id=$1",[first]));
assert.deepEqual(stored.rows[0],{status:"fallback",quality:"straight_line_estimate"});
for(let i=2;i<=8;i++){
 const request="d0190000-0000-4000-8000-"+String(i).padStart(12,"0");
 await asUser(admin,()=>queue(request));
}
await assert.rejects(asUser(admin,()=>queue("d0190000-0000-4000-8000-000000000009")),/quota exceeded/);
const count=await asUser(admin,()=>db.query("SELECT requests,elements FROM public.routing_matrix_daily_quota WHERE tenant_id=$1",[t.tenantId]));
assert.deepEqual(count.rows[0],{requests:8,elements:8});
await db.close();
console.log("Road matrix admission, idempotent quota, service-only receipts and tenant role isolation verified");
