import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid();
const product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product});

function deriveRisk(input:{dataClasses:string[];allowedTools:string[]}){
 const highData=new Set(["health","financial","biometric","children","special_category","legal_privileged","payment"]);
 const highTools=new Set(["payments.write","messaging.send","infrastructure.write","user.delete","filing.submit","payroll.submit"]);
 if(input.allowedTools.some(x=>highTools.has(x)))return"high";
 if(input.dataClasses.some(x=>highData.has(x)))return"review";
 return"low";
}

export const getIntelligenceWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("ai_use_cases").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("updated_at",{ascending:false}),
  db.from("ai_agent_runs").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("ai_action_proposals").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("intelligence_jobs").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("provider_bindings").select("*,provider:provider_catalogue(*)").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("provider_key")
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{useCases:rs[0].data??[],runs:rs[1].data??[],proposals:rs[2].data??[],jobs:rs[3].data??[],providers:rs[4].data??[]};
});

const useCase=scope.extend({useCaseKey:z.string().regex(/^[a-z0-9.-]{3,100}$/),name:z.string().min(1).max(200),
 purpose:z.string().min(10).max(5000),dataClasses:z.array(z.string().max(80)).max(50).default([]),
 allowedTools:z.array(z.string().max(120)).max(100).default([]),providerRoute:z.record(z.string(),z.unknown()).default({}),
 monthlyBudgetMinor:z.number().int().min(0).nullish(),budgetCurrency:z.string().regex(/^[A-Z]{3}$/).nullish(),
 evidenceRefs:z.array(z.string().max(500)).max(100).default([])});
export const upsertAiUseCase=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof useCase>)=>useCase.parse(i)).handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.ai-governance");requireWriteRole(access.role);
 const risk=deriveRisk(data);const db=context.supabase as any;
 const existing=await db.from("ai_use_cases").select("id,revision,owner_user_id,status").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).eq("use_case_key",data.useCaseKey).maybeSingle();
 if(existing.error)throw new Error(existing.error.message);
 const values={tenant_id:data.tenantId,product_key:data.productKey,use_case_key:data.useCaseKey,name:data.name,purpose:data.purpose,
  data_classes:data.dataClasses,allowed_tools:data.allowedTools,provider_route:data.providerRoute,monthly_budget_minor:data.monthlyBudgetMinor??null,
  budget_currency:data.budgetCurrency??null,risk_level:risk,assessment:{risk,derivedAt:new Date().toISOString(),toolCount:data.allowedTools.length,dataClassCount:data.dataClasses.length},
  evidence_refs:data.evidenceRefs,owner_user_id:existing.data?.owner_user_id??context.userId,status:"assessed",
  revision:(existing.data?.revision??0)+1,approved_by:null,approved_at:null,updated_at:new Date().toISOString()};
 const q=existing.data?db.from("ai_use_cases").update(values).eq("id",existing.data.id):db.from("ai_use_cases").insert(values);
 const {data:row,error}=await q.select("*").single();if(error)throw new Error(error.message);return row;
});

export const approveAiUseCase=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;useCaseId:string})=>z.object({tenantId:uuid,useCaseId:uuid}).parse(i)).handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.ai-governance");requireAdminRole(access.role);const db=context.supabase as any;
 const current=await db.from("ai_use_cases").select("*").eq("tenant_id",data.tenantId).eq("id",data.useCaseId).single();
 if(current.error)throw new Error(current.error.message);
 if(current.data.owner_user_id===context.userId)throw new Error("Independent approval required");
 if(current.data.risk_level==="prohibited")throw new Error("Prohibited AI use case cannot be approved");
 const {data:row,error}=await db.from("ai_use_cases").update({status:"approved",approved_by:context.userId,approved_at:new Date().toISOString(),
  updated_at:new Date().toISOString()}).eq("id",data.useCaseId).select("*").single();if(error)throw new Error(error.message);return row;
});

export const suspendAiUseCase=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;useCaseId:string})=>z.object({tenantId:uuid,useCaseId:uuid}).parse(i)).handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.ai-governance");requireAdminRole(access.role);
 const {data:row,error}=await(context.supabase as any).from("ai_use_cases").update({status:"suspended",updated_at:new Date().toISOString()})
  .eq("tenant_id",data.tenantId).eq("id",data.useCaseId).select("*").single();if(error)throw new Error(error.message);return row;
});

const run=scope.extend({useCaseId:uuid.nullish(),profile:z.enum(["discovery","finance","technical","compliance","product","transaction","accounting","tax","operations"]),
 goal:z.string().min(4).max(5000),maxSteps:z.number().int().min(1).max(32).default(8),providerKey:z.string().max(120).nullish(),model:z.string().max(200).nullish(),
 inputVersion:z.string().max(200).nullish()});
export const startAgentRun=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof run>)=>run.parse(i)).handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.intelligence-runtime");requireWriteRole(access.role);const db=context.supabase as any;
 if(data.useCaseId){
  const uc=await db.from("ai_use_cases").select("status").eq("tenant_id",data.tenantId).eq("id",data.useCaseId).single();
  if(uc.error||!["approved","pilot"].includes(uc.data?.status))throw new Error("Approved AI use case required");
 }
 const {data:row,error}=await db.from("ai_agent_runs").insert({tenant_id:data.tenantId,product_key:data.productKey,use_case_id:data.useCaseId??null,
  profile:data.profile,goal:data.goal,status:"queued",max_steps:data.maxSteps,provider_key:data.providerKey??null,model:data.model??null,
  input_version:data.inputVersion??null,initiated_by:context.userId}).select("*").single();if(error)throw new Error(error.message);
 const job=await db.from("intelligence_jobs").insert({tenant_id:data.tenantId,product_key:data.productKey,job_type:"agent.run",
  subject_type:"ai_agent_run",subject_id:row.id,priority:"normal",input:{runId:row.id,profile:data.profile,goal:data.goal,maxSteps:data.maxSteps,
  providerKey:data.providerKey,model:data.model,inputVersion:data.inputVersion},requirements:{boundedTools:true,approvalForWrites:true,citationsPreferred:true}})
  .select("id").single();if(job.error)throw new Error(job.error.message);return{run:row,jobId:job.data.id};
});

export const cancelAgentRun=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;runId:string})=>z.object({tenantId:uuid,runId:uuid}).parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const run=await db.from("ai_agent_runs").select("initiated_by,status").eq("tenant_id",data.tenantId).eq("id",data.runId).single();
 if(run.error)throw new Error(run.error.message);
 const membership=await db.from("tenant_members").select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
 if(run.data.initiated_by!==context.userId&&!["owner","admin"].includes(membership.data?.role??""))throw new Error("Run cancellation denied");
 await db.from("ai_agent_runs").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",data.runId);
 await db.from("intelligence_jobs").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("tenant_id",data.tenantId).eq("subject_type","ai_agent_run").eq("subject_id",data.runId).in("status",["queued","processing","waiting_review"]);
 return{ok:true};
});

const proposal=scope.extend({runId:uuid.nullish(),actionKey:z.string().min(2).max(160),targetType:z.string().min(1).max(100),targetId:z.string().max(200).nullish(),
 payload:z.record(z.string(),z.unknown()).default({}),rationale:z.string().min(4).max(5000)});
export const createActionProposal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof proposal>)=>proposal.parse(i)).handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.intelligence-runtime");requireWriteRole(access.role);
 const {data:row,error}=await(context.supabase as any).from("ai_action_proposals").insert({tenant_id:data.tenantId,product_key:data.productKey,
  run_id:data.runId??null,action_key:data.actionKey,target_type:data.targetType,target_id:data.targetId??null,payload:data.payload,rationale:data.rationale,
  proposed_by:"human",status:"pending"}).select("*").single();if(error)throw new Error(error.message);return row;
});

export const reviewActionProposal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;proposalId:string;decision:"approved"|"rejected"})=>z.object({tenantId:uuid,proposalId:uuid,
 decision:z.enum(["approved","rejected"])}).parse(i)).handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.intelligence-runtime");requireAdminRole(access.role);
 const {data:row,error}=await(context.supabase as any).from("ai_action_proposals").update({status:data.decision,reviewed_by:context.userId,
  reviewed_at:new Date().toISOString()}).eq("tenant_id",data.tenantId).eq("id",data.proposalId).select("*").single();if(error)throw new Error(error.message);return row;
});
