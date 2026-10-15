import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE PUBLICATION supabase_realtime;");
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const sql=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554"))
  for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
   await db.query("INSERT INTO auth.users(id,email) VALUES($1,'fixture@example.invalid')",[id]);
 await db.exec(sql);
}
const admin="e1600000-0000-4000-8000-000000000001";
const driver="e1600000-0000-4000-8000-000000000002";
const stranger="e1600000-0000-4000-8000-000000000003";
for(const user of [admin,driver,stranger])
 await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[user,user+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){
 await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
 try{const out=await fn();await db.exec("COMMIT");return out;}
 catch(error){await db.exec("ROLLBACK");throw error;}
}
async function asService(fn){
 await db.exec("BEGIN; SET LOCAL ROLE service_role;");
 await db.query("SELECT set_config('request.jwt.claim.role','service_role',true)");
 try{const out=await fn();await db.exec("COMMIT");return out;}
 catch(error){await db.exec("ROLLBACK");throw error;}
}
const pilot=await asUser(admin,async()=>(
 await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const tenant=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");
assert(tenant?.tenantId);
await asService(async()=>{
 await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='mealdeck'",[tenant.tenantId]);
 await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status) VALUES($1,'omniqora.routing-engine','active') ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active'",[tenant.tenantId]);
 await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'agent') ON CONFLICT DO NOTHING",[tenant.tenantId,driver]);
 await db.query("INSERT INTO public.provider_bindings(tenant_id,product_key,provider_key,environment,status,secret_refs,health,last_verified_at) VALUES($1,'mealdeck','maps.openrouteservice','production','active',$2::jsonb,$3::jsonb,now())",
  [tenant.tenantId,JSON.stringify({api_key:"ENV_REF_ONLY"}),JSON.stringify({matrixReady:true,independentlyVerified:true})]);
});
const nodes=Array.from({length:16},(_,i)=>({lat:51.80+i*.002,lng:-0.42+i*.0001}));
const source=JSON.stringify(nodes);
const firstOpt=(await asUser(admin,()=>db.query("SELECT public.routing_create_optimisation($1,'mealdeck','manual','balanced') AS id",[tenant.tenantId]))).rows[0].id;
const requestKey="e1600000-0000-4000-8000-000000000004";
const queue=async(opt,body=source,key=requestKey)=>(
 await db.query("SELECT public.routing_queue_optimisation_tiles($1,$2::jsonb,$3::uuid) AS outcome",[opt,body,key])).rows[0].outcome;
await assert.rejects(asUser(driver,()=>queue(firstOpt)),/Routing administrator required/);
await assert.rejects(asUser(stranger,()=>queue(firstOpt)),/Routing administrator required/);
await assert.rejects(asUser(admin,()=>queue(firstOpt,JSON.stringify(nodes.slice(0,8)))),/nine to sixteen/);
await assert.rejects(asUser(admin,()=>queue(firstOpt,JSON.stringify([...nodes.slice(0,15),nodes[0]]))),/unique coordinates/);
const queued=await asUser(admin,()=>queue(firstOpt));
assert.equal(queued.tileCount,4);
assert.equal(queued.requestedElements,256);
const repeated=await asUser(admin,()=>queue(firstOpt,source,"e1600000-0000-4000-8000-000000000005"));
assert.equal(repeated.batchId,queued.batchId);
assert.equal(repeated.reused,true);
await assert.rejects(asUser(admin,()=>queue(firstOpt,JSON.stringify(nodes.map((p,i)=>i===0?{lat:52,lng:0}:p)))),/topology changed/);
const quota=await asUser(admin,()=>db.query("SELECT requests,elements FROM public.routing_matrix_daily_quota WHERE tenant_id=$1",[tenant.tenantId]));
assert.deepEqual(quota.rows,[{requests:4,elements:256}]);
const tiles=await asUser(admin,()=>db.query(
 "SELECT row_start,col_start,row_count,col_count,matrix_job_id FROM public.routing_matrix_batch_tiles WHERE batch_id=$1 ORDER BY row_start,col_start",[queued.batchId]));
assert.deepEqual(tiles.rows.map(t=>[t.row_start,t.col_start,t.row_count,t.col_count]),[
 [0,0,8,8],[0,8,8,8],[8,0,8,8],[8,8,8,8]]);
const hidden=await asUser(driver,()=>db.query("SELECT id FROM public.routing_matrix_batches WHERE tenant_id=$1",[tenant.tenantId]));
assert.equal(hidden.rows.length,0);
await assert.rejects(asUser(driver,()=>db.query("DELETE FROM public.routing_matrix_batch_tiles WHERE batch_id=$1",[queued.batchId])),/permission denied/);
await assert.rejects(asUser(admin,()=>db.query("SELECT public.routing_finalize_optimisation_tiles($1)",[firstOpt])),/Four fresh approved road tiles required/);
const secondOpt=(await asUser(admin,()=>db.query("SELECT public.routing_create_optimisation($1,'mealdeck','manual','balanced') AS id",[tenant.tenantId]))).rows[0].id;
await assert.rejects(asUser(admin,()=>queue(secondOpt,source,"e1600000-0000-4000-8000-000000000006")),/quota exceeded/);
const phantom=await asUser(admin,()=>db.query("SELECT count(*)::integer AS count FROM public.routing_matrix_batches WHERE optimisation_job_id=$1",[secondOpt]));
assert.equal(phantom.rows[0].count,0);
for(const tile of tiles.rows){
 const failedTile=tile.row_start===0&&tile.col_start===0;
 if(failedTile)await asService(()=>db.query("UPDATE public.routing_matrix_jobs SET status='fallback',quality='straight_line_estimate',provider_key='routing.native' WHERE id=$1",[tile.matrix_job_id]));
}
await assert.rejects(asUser(admin,()=>db.query("SELECT public.routing_finalize_optimisation_tiles($1)",[firstOpt])),/Four fresh approved road tiles required/);
await asService(()=>db.query("UPDATE public.routing_matrix_jobs SET status='queued',quality='pending',provider_key=NULL WHERE id=$1",[tiles.rows[0].matrix_job_id]));
for(const tile of tiles.rows){
 const cells=[];
 for(let i=0;i<tile.row_count;i++)for(let j=0;j<tile.col_count;j++){
  const globalA=tile.row_start+i,globalB=tile.col_start+j;
  const difference=Math.abs(globalA-globalB);
  cells.push({originIndex:i,destinationIndex:j,status:"ok",
   distanceMetres:difference*350,durationSeconds:difference*40});
 }
 await asService(async()=>{
  await db.query("UPDATE public.routing_matrix_jobs SET status='running' WHERE id=$1",[tile.matrix_job_id]);
  await db.query("SELECT public.service_complete_road_matrix($1,'mealdeck',$2,'maps.openrouteservice','road',$3::jsonb)",
   [tenant.tenantId,tile.matrix_job_id,JSON.stringify(cells)]);
 });
}
const assembled=await asUser(admin,async()=>(
 await db.query("SELECT public.routing_finalize_optimisation_tiles($1) AS id",[firstOpt])).rows[0].id);
assert(assembled);
const repeatAssembly=await asUser(admin,async()=>(
 await db.query("SELECT public.routing_finalize_optimisation_tiles($1) AS id",[firstOpt])).rows[0].id);
assert.equal(repeatAssembly,assembled);
const aggregate=await asUser(admin,()=>db.query("SELECT status,quality,provider_key,origins,destinations FROM public.routing_matrix_jobs WHERE id=$1",[assembled]));
assert.equal(aggregate.rows[0].status,"completed");
assert.equal(aggregate.rows[0].quality,"road");
assert.equal(aggregate.rows[0].provider_key,"maps.openrouteservice");
assert.deepEqual(aggregate.rows[0].origins,nodes);
assert.deepEqual(aggregate.rows[0].destinations,nodes);
const matrix=await asUser(admin,()=>db.query(
 "SELECT count(*)::integer AS count,MAX(origin_index) AS highest_origin,MAX(destination_index) AS highest_destination FROM public.routing_matrix_cells WHERE matrix_job_id=$1",[assembled]));
assert.equal(matrix.rows[0].count,256);
assert.equal(matrix.rows[0].highest_origin,15);
assert.equal(matrix.rows[0].highest_destination,15);
const receipt=await asUser(admin,()=>db.query(
 "SELECT status,assembled_matrix_job_id FROM public.routing_matrix_batches WHERE id=$1",[queued.batchId]));
assert.deepEqual(receipt.rows[0],{status:"completed",assembled_matrix_job_id:assembled});
const linked=await asUser(admin,()=>db.query(
 "SELECT matrix_job_id,input_snapshot->>'planningMode' AS mode FROM public.routing_optimisation_jobs WHERE id=$1",[firstOpt]));
assert.equal(linked.rows[0].matrix_job_id,assembled);
assert.equal(linked.rows[0].mode,"tiled_road_required");
await db.close();
console.log("16-node routing: four atomically quota-reserved tiles, denied fallback, verified 256-cell assembly and tenant isolation");
