import assert from "node:assert/strict";
import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db=new PGlite();const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE PUBLICATION supabase_realtime;`);
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){const sql=await readFile(new URL(name,migrations),"utf8");if(name.startsWith("20260816120554"))for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);await db.exec(sql);}
const admin="aaaaaaaa-0001-4001-8001-aaaaaaaaaaaa",stranger="bbbbbbbb-0002-4002-8002-bbbbbbbbbbbb";for(const id of[admin,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
async function asService(fn){await db.exec("BEGIN;SET LOCAL ROLE service_role;");await db.query("SELECT set_config('request.jwt.claim.role','service_role',true)");try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const luton=pilot.tenants.find(x=>x.tenantSlug==="cafe1-luton"),stalbans=pilot.tenants.find(x=>x.tenantSlug==="cafe1-st-albans"),mealdeck=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(luton&&stalbans&&mealdeck);
const ownerTenant=luton.tenantId;
const asset=(await asUser(admin,()=>db.query(`INSERT INTO public.portfolio_assets(
 tenant_id,source_row,name,repository_url,proposed_role,architecture_role,parent_landlord,migration_structure,target_mode,migration_stage,canonical_product_key,stage_progress
) VALUES($1,999,'Dishbee','https://github.com/example/dishbee','Hospitality landlord','landlord',NULL,'Retain Dishbee vertical core; move shared services to Omniqora','landlord','adapter','dishbee',55) RETURNING id`,[ownerTenant]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.portfolio_repo_audits(tenant_id,asset_id,repository_url,status,audited_at,evidence) VALUES($1,$2,'https://github.com/example/dishbee','passed',now(),'{\"ci\":true}'::jsonb)",[ownerTenant,asset]));
await asUser(admin,()=>db.query("INSERT INTO public.portfolio_migration_adapters(tenant_id,asset_id,adapter_key,status,idempotency_strategy,rollback_strategy,verified_at) VALUES($1,$2,'dishbee-v2','verified','source event id + tenant','Disable Omniqora routing and restore source-only operation',now())",[ownerTenant,asset]));
const targets=[["cafe1-luton",luton.tenantId,"dishbee-luton"],["cafe1-st-albans",stalbans.tenantId,"dishbee-stalbans"],["mealdeck",mealdeck.tenantId,"dishbee-mealdeck"]];
for(const[,tenantId,workspace]of targets){
 const tid=await asUser(admin,async()=> (await db.query("SELECT public.migration_map_target($1,$2,'dishbee',$3,true) AS id",[asset,tenantId,workspace])).rows[0].id);assert(tid);
}
let evaluation=await asUser(admin,async()=> (await db.query("SELECT public.migration_evaluate_asset($1) AS e",[asset])).rows[0].e);
assert.equal(evaluation.ready,false);assert(evaluation.blockers.includes("required_targets_not_ready"));assert(evaluation.blockers.includes("shadow_checks_missing"));assert(evaluation.blockers.includes("approved_cutover_plan_missing"));

await asService(async()=>{
 for(const[,tenantId,workspace]of targets){
  await db.query("UPDATE public.tenant_products SET status='active',region_key='gb',locale='en-GB' WHERE tenant_id=$1 AND product_key='dishbee'",[tenantId]);
  await db.query("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1",[tenantId]);
  await db.query("INSERT INTO public.product_connections(tenant_id,product_key,external_tenant_id,status) VALUES($1,'dishbee',$2,'connected') ON CONFLICT(tenant_id,product_key,external_tenant_id) DO UPDATE SET status='connected'",[tenantId,workspace]);
 }
});
const mapped=await asUser(admin,()=>db.query("SELECT id,target_tenant_id FROM public.portfolio_migration_targets WHERE asset_id=$1",[asset]));
for(const row of mapped.rows){const r=await asUser(admin,async()=> (await db.query("SELECT public.migration_refresh_target($1) AS e",[row.id])).rows[0].e);assert.equal(r.ready,true);}
await asUser(admin,()=>db.query("INSERT INTO public.portfolio_shadow_checks(tenant_id,asset_id,check_key,check_type,status,evidence) VALUES($1,$2,'orders-parity','order_parity','passed','{\"source\":100,\"target\":100}'::jsonb)",[ownerTenant,asset]));
await asUser(admin,()=>db.query("INSERT INTO public.portfolio_cutover_plans(asset_id,tenant_id,change_window,freeze_strategy,dns_strategy,communication_plan,rollback_strategy,smoke_tests,owner_user_id,approved_by,approved_at) VALUES($1,$2,'overnight','5 minute final delta','switch only after smoke tests','notify operators','Restore source routes and disable target writes','[\"auth\",\"orders\",\"payments\",\"KDS\"]'::jsonb,$3,$3,now())",[asset,ownerTenant,admin]));
evaluation=await asUser(admin,async()=> (await db.query("SELECT public.migration_evaluate_asset($1) AS e",[asset])).rows[0].e);
assert.equal(evaluation.ready,true);assert.equal(evaluation.requiredTargets,3);assert.equal(evaluation.readyTargets,3);assert.equal(evaluation.failedShadowChecks,0);assert.equal(evaluation.passedShadowChecks,1);
await asUser(admin,()=>db.query("SELECT public.migration_mark_cutover_ready($1)",[asset]));
const stage=await asUser(admin,()=>db.query("SELECT migration_stage,stage_progress FROM public.portfolio_assets WHERE id=$1",[asset]));assert.deepEqual(stage.rows[0],{migration_stage:"cutover_ready",stage_progress:85});
const cutover=await asUser(admin,async()=> (await db.query("SELECT public.migration_begin_cutover($1) AS id",[asset])).rows[0].id);assert(cutover);
const targetsAfter=await asUser(admin,()=>db.query("SELECT status FROM public.portfolio_migration_targets WHERE asset_id=$1",[asset]));assert(targetsAfter.rows.every(r=>r.status==="cutover"));
const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.portfolio_migration_targets WHERE asset_id=$1",[asset]));assert.equal(hidden.rows.length,0);
await db.close();console.log("Dishbee three-target evidence-gated migration factory cutover verified");