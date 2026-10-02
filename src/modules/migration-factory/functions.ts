import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const uuid=z.string().uuid();

export const getMigrationFactoryAsset=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{assetId:string})=>z.object({assetId:uuid}).parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;
 const [asset,audits,findings,targets,adapters,checks,plan,runs,evaluation]=await Promise.all([
  db.from("portfolio_assets").select("*").eq("id",data.assetId).single(),
  db.from("portfolio_repo_audits").select("*").eq("asset_id",data.assetId).order("created_at",{ascending:false}),
  db.from("portfolio_capability_findings").select("*").eq("asset_id",data.assetId).order("capability_key"),
  db.from("portfolio_migration_targets").select("*,target_tenant:tenants(name,slug),connection:product_connections(*)").eq("asset_id",data.assetId).order("created_at"),
  db.from("portfolio_migration_adapters").select("*").eq("asset_id",data.assetId).order("adapter_key"),
  db.from("portfolio_shadow_checks").select("*").eq("asset_id",data.assetId).order("checked_at",{ascending:false}).limit(200),
  db.from("portfolio_cutover_plans").select("*").eq("asset_id",data.assetId).maybeSingle(),
  db.from("portfolio_cutover_runs").select("*").eq("asset_id",data.assetId).order("created_at",{ascending:false}),
  db.rpc("migration_evaluate_asset",{_asset:data.assetId})
 ]);
 for(const r of[asset,audits,findings,targets,adapters,checks,plan,runs,evaluation])if(r.error)throw new Error(r.error.message);
 return{asset:asset.data,audits:audits.data??[],findings:findings.data??[],targets:targets.data??[],adapters:adapters.data??[],checks:checks.data??[],plan:plan.data??null,runs:runs.data??[],evaluation:evaluation.data};
});

const audit=z.object({tenantId:uuid,assetId:uuid,repositoryUrl:z.string().url().nullish(),commitSha:z.string().max(100).nullish(),status:z.enum(["passed","failed","manual_review"]),stack:z.record(z.string(),z.unknown()).default({}),capabilities:z.array(z.unknown()).default([]),risks:z.array(z.unknown()).default([]),evidence:z.record(z.string(),z.unknown()).default({})});
export const recordRepoAudit=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof audit>)=>audit.parse(i)).handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("portfolio_repo_audits").insert({tenant_id:data.tenantId,asset_id:data.assetId,repository_url:data.repositoryUrl??null,commit_sha:data.commitSha??null,status:data.status,stack:data.stack,capabilities:data.capabilities,risks:data.risks,evidence:data.evidence,audited_at:new Date().toISOString()}).select("*").single();if(error)throw new Error(error.message);return row;
});

const target=z.object({assetId:uuid,targetTenantId:uuid,productKey:z.string().min(2).max(80),sourceWorkspaceId:z.string().max(200).nullish(),required:z.boolean().default(true)});
export const mapMigrationTarget=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof target>)=>target.parse(i)).handler(async({context,data})=>{
 const r=await(context.supabase as any).rpc("migration_map_target",{_asset:data.assetId,_target_tenant:data.targetTenantId,_product:data.productKey,_source_workspace:data.sourceWorkspaceId??null,_required:data.required});if(r.error)throw new Error(r.error.message);return{targetId:r.data as string};
});

export const refreshMigrationTarget=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{targetId:string})=>z.object({targetId:uuid}).parse(i)).handler(async({context,data})=>{
 const r=await(context.supabase as any).rpc("migration_refresh_target",{_target:data.targetId});if(r.error)throw new Error(r.error.message);return r.data;
});

const adapter=z.object({tenantId:uuid,assetId:uuid,adapterKey:z.string().regex(/^[a-z0-9.-]{3,100}$/),direction:z.enum(["source_to_target","target_to_source","bidirectional","control_only"]).default("bidirectional"),contract:z.record(z.string(),z.unknown()).default({}),mapping:z.record(z.string(),z.unknown()).default({}),idempotencyStrategy:z.string().min(1).max(1000),rollbackStrategy:z.string().min(1).max(4000),status:z.enum(["configured","verified","failed"]).default("verified")});
export const saveMigrationAdapter=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof adapter>)=>adapter.parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;
 const values={tenant_id:data.tenantId,asset_id:data.assetId,adapter_key:data.adapterKey,direction:data.direction,contract:data.contract,mapping:data.mapping,idempotency_strategy:data.idempotencyStrategy,rollback_strategy:data.rollbackStrategy,status:data.status,verified_at:data.status==="verified"?new Date().toISOString():null};
 const existing=await db.from("portfolio_migration_adapters").select("id").eq("asset_id",data.assetId).eq("adapter_key",data.adapterKey).maybeSingle();if(existing.error)throw new Error(existing.error.message);
 const q=existing.data?db.from("portfolio_migration_adapters").update(values).eq("id",existing.data.id):db.from("portfolio_migration_adapters").insert(values);
 const{data:row,error}=await q.select("*").single();if(error)throw new Error(error.message);return row;
});

const check=z.object({tenantId:uuid,assetId:uuid,targetId:uuid.nullish(),checkKey:z.string().min(1).max(120),checkType:z.enum(["record_count","sample_parity","money_parity","order_parity","event_parity","auth_parity","manual"]),status:z.enum(["passed","failed","warning"]),sourceValue:z.unknown().optional(),targetValue:z.unknown().optional(),evidence:z.record(z.string(),z.unknown()).default({})});
export const recordShadowCheck=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof check>)=>check.parse(i)).handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("portfolio_shadow_checks").insert({tenant_id:data.tenantId,asset_id:data.assetId,target_id:data.targetId??null,check_key:data.checkKey,check_type:data.checkType,status:data.status,source_value:data.sourceValue??null,target_value:data.targetValue??null,evidence:data.evidence}).select("*").single();if(error)throw new Error(error.message);return row;
});

const plan=z.object({tenantId:uuid,assetId:uuid,rollbackStrategy:z.string().min(1).max(4000),changeWindow:z.string().max(500).nullish(),freezeStrategy:z.string().max(2000).nullish(),dnsStrategy:z.string().max(2000).nullish(),communicationPlan:z.string().max(4000).nullish(),smokeTests:z.array(z.unknown()).default([]),approve:z.boolean().default(false)});
export const saveCutoverPlan=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof plan>)=>plan.parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;const values={tenant_id:data.tenantId,asset_id:data.assetId,rollback_strategy:data.rollbackStrategy,change_window:data.changeWindow??null,freeze_strategy:data.freezeStrategy??null,dns_strategy:data.dnsStrategy??null,communication_plan:data.communicationPlan??null,smoke_tests:data.smokeTests,owner_user_id:context.userId,approved_by:data.approve?context.userId:null,approved_at:data.approve?new Date().toISOString():null,updated_at:new Date().toISOString()};
 const{data:row,error}=await db.from("portfolio_cutover_plans").upsert(values,{onConflict:"asset_id"}).select("*").single();if(error)throw new Error(error.message);return row;
});

export const evaluateMigrationAsset=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{assetId:string})=>z.object({assetId:uuid}).parse(i)).handler(async({context,data})=>{const r=await(context.supabase as any).rpc("migration_evaluate_asset",{_asset:data.assetId});if(r.error)throw new Error(r.error.message);return r.data;});
export const markMigrationCutoverReady=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{assetId:string})=>z.object({assetId:uuid}).parse(i)).handler(async({context,data})=>{const r=await(context.supabase as any).rpc("migration_mark_cutover_ready",{_asset:data.assetId});if(r.error)throw new Error(r.error.message);return r.data;});


const dishbeeBootstrap=z.object({
 assetId:uuid,
 cafe1LutonWorkspace:z.string().trim().min(1).max(200),
 cafe1StAlbansWorkspace:z.string().trim().min(1).max(200),
 mealDeckWorkspace:z.string().trim().min(1).max(200),
});

export const bootstrapDishbeeMigrationTargets=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((i:z.input<typeof dishbeeBootstrap>)=>dishbeeBootstrap.parse(i))
 .handler(async({context,data})=>{
  const r=await(context.supabase as any).rpc("migration_bootstrap_dishbee_targets",{
   _asset:data.assetId,
   _luton_workspace:data.cafe1LutonWorkspace,
   _stalbans_workspace:data.cafe1StAlbansWorkspace,
   _mealdeck_workspace:data.mealDeckWorkspace,
  });
  if(r.error)throw new Error(r.error.message);
  return r.data;
 });
