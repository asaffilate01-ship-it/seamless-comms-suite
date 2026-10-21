import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService} from "@/modules/platform/access";

const uuid=z.string().uuid();
const productKey=z.literal("omniqora");
const tenant=z.object({tenantId:uuid,productKey});
const employee=tenant.extend({employeeId:uuid});
const requestSource=tenant.extend({purpose:z.string().trim().min(20).max(700)});
const sourceReview=tenant.extend({
 sourceId:uuid,decision:z.enum(["approved","rejected","revoked"]),
 note:z.string().trim().min(12).max(1000),
});
const modelRate=tenant.extend({
 employeeId:uuid,taskId:uuid,sourceId:uuid,idempotencyKey:uuid,
 providerKey:z.string().regex(/^[a-z0-9][a-z0-9._-]{2,99}$/),
 modelKey:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/),
 currency:z.enum(["GBP","EUR","USD"]),
 inputTokens:z.number().int().min(256).max(1200),
 outputTokens:z.number().int().min(64).max(256),
});
const review=employee.extend({
 admissionId:uuid,decision:z.enum(["accepted","rejected"]),
 note:z.string().trim().min(12).max(1000),
});
const cancel=employee.extend({admissionId:uuid});

interface ReadonlySource {
 id:string;source_key:string;status:string;purpose:string;
 requester_id:string;reviewer_id:string|null;review_note:string|null;
 expires_at:string|null;revision:number;
}
interface ReadonlyPilot {
 enabled:boolean;expires_at:string;daily_limit:number;
 max_run_cost_minor:number;
}
interface ReadonlyProvider {
 provider_key:string;status:string;environment:string;last_verified_at:string|null;
}
interface ReadonlyTariff {
 provider_key:string;model_key:string;currency:"GBP"|"EUR"|"USD";
 verified_at:string;rate_version:string;
 input_minor_per_million:number;output_minor_per_million:number;
}
interface ReadonlyBudget {
 period_month:string;currency:string;limit_minor:number;reserved_minor:number;spent_minor:number;
}
export interface ReadonlyAdmission {
 id:string;runId:string;jobId:string;status:string;
 taskId:string;sourceId:string;admittedAt:string;finishedAt:string|null;
 modelKey:string;providerKey:string;reservationId:string;
 summary:string|null;meteredCostMinor:number|null;
 inputTokens:number|null;outputTokens:number|null;
 reviewedBy:string|null;reviewNote:string|null;
}
export interface ReadonlyWorkspace {
 pilot:ReadonlyPilot|null;
 sources:ReadonlySource[];
 providers:ReadonlyProvider[];
 tariffs:ReadonlyTariff[];
 budgets:ReadonlyBudget[];
 admissions:ReadonlyAdmission[];
}
async function requireWorkforceAdmin(context:any,tenantId:string){
 const access=await requireService(context,tenantId,"omniqora.ai-workforce");
 requireAdminRole(access.role);
}

export const getAiWorkforceReadonlyWorkspace=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((i:z.input<typeof employee>)=>employee.parse(i))
 .handler(async({context,data}):Promise<ReadonlyWorkspace>=>{
  await requireWorkforceAdmin(context,data.tenantId);
  const db=context.supabase as any;
  const [pilot,source,providers,rates,budgets,admissions]=await Promise.all([
   db.from("ai_workforce_readonly_pilots")
    .select("enabled,expires_at,daily_limit,max_run_cost_minor")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).maybeSingle(),
   db.from("ai_workforce_readonly_sources")
    .select("id,source_key,status,purpose,requester_id,reviewer_id,review_note,expires_at,revision")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey),
   db.from("provider_bindings").select("provider_key,status,environment,last_verified_at")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .eq("environment","production").limit(50),
   db.from("ai_reviewed_model_rates")
    .select("provider_key,model_key,currency,verified_at,rate_version,input_minor_per_million,output_minor_per_million")
    .eq("status","approved").eq("evaluation_passed",true)
    .gte("verified_at",new Date(Date.now()-30*86400000).toISOString())
    .limit(60),
   db.from("ai_spend_budgets")
    .select("period_month,currency,limit_minor,reserved_minor,spent_minor")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .order("period_month",{ascending:false}).limit(8),
   db.from("ai_workforce_readonly_admissions")
    .select("id,run_id,job_id,task_id,source_id,provider_key,model_key,status,reservation_id,admitted_at,finished_at,review_by,review_note")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .eq("employee_id",data.employeeId)
    .order("admitted_at",{ascending:false}).limit(30),
  ]);
  for(const q of [pilot,source,providers,rates,budgets,admissions]){
   if(q.error)throw new Error(q.error.message);
  }
  const records=admissions.data??[];
  const ids=records.map((x:any)=>x.run_id);
  let runs:any[]=[];
  if(ids.length){
   const q=await db.from("ai_agent_runs").select("id,result,token_usage")
     .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).in("id",ids);
   if(q.error)throw new Error(q.error.message);
   runs=q.data??[];
  }
  const map=new Map(runs.map((x:any)=>[x.id,x]));
  return {
   pilot:pilot.data??null,sources:source.data??[],
   providers:providers.data??[],tariffs:rates.data??[],budgets:budgets.data??[],
   admissions:records.map((a:any)=>{
    const run=map.get(a.run_id);
    const summary=run?.result?.summary;
    const metered=run?.result?.meteredCostMinor;
    const used=run?.token_usage;
    return {
     id:a.id,runId:a.run_id,jobId:a.job_id,taskId:a.task_id,
     sourceId:a.source_id,status:a.status,providerKey:a.provider_key,
     modelKey:a.model_key,reservationId:a.reservation_id,admittedAt:a.admitted_at,
     finishedAt:a.finished_at,reviewedBy:a.review_by??null,reviewNote:a.review_note??null,
     summary:typeof summary==="string"?summary.slice(0,3500):null,
     meteredCostMinor:typeof metered==="number"?metered:null,
     inputTokens:typeof used?.inputTokens==="number"?used.inputTokens:null,
     outputTokens:typeof used?.outputTokens==="number"?used.outputTokens:null,
    } as ReadonlyAdmission;
   }),
  };
 });

export const requestAiWorkforceReadonlySource=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((i:z.input<typeof requestSource>)=>requestSource.parse(i))
 .handler(async({context,data}):Promise<{id:string;status:string}>=>{
  await requireWorkforceAdmin(context,data.tenantId);
  const {data:row,error}=await(context.supabase as any).rpc(
   "request_ai_workforce_readonly_source",{
    _tenant:data.tenantId,_product:data.productKey,_purpose:data.purpose,
   });
  if(error)throw new Error(error.message);
  return {id:row.id,status:row.status};
 });

export const reviewAiWorkforceReadonlySource=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((i:z.input<typeof sourceReview>)=>sourceReview.parse(i))
 .handler(async({context,data}):Promise<{id:string;status:string}>=>{
  await requireWorkforceAdmin(context,data.tenantId);
  const {data:row,error}=await(context.supabase as any).rpc(
   "review_ai_workforce_readonly_source",{
    _tenant:data.tenantId,_product:data.productKey,_source:data.sourceId,
    _decision:data.decision,_note:data.note,
   });
  if(error)throw new Error(error.message);
  return {id:row.id,status:row.status};
 });

export const queueAiWorkforceReadonlyAnalysis=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((i:z.input<typeof modelRate>)=>modelRate.parse(i))
 .handler(async({context,data}):Promise<{
  admissionId:string;runId:string;jobId:string;status:"queued";alreadyExists:boolean;humanReviewRequired:true;
 }>=>{
  await requireWorkforceAdmin(context,data.tenantId);
  const {data:result,error}=await(context.supabase as any).rpc(
   "queue_ai_workforce_readonly_analysis",{
    _tenant:data.tenantId,_product:data.productKey,
    _employee:data.employeeId,_task:data.taskId,_source:data.sourceId,
    _provider:data.providerKey,_model:data.modelKey,_currency:data.currency,
    _input_tokens:data.inputTokens,_output_tokens:data.outputTokens,
    _idempotency:data.idempotencyKey,
   });
  if(error)throw new Error(error.message);
  if(!result||result.humanReviewRequired!==true||
    typeof result.admissionId!=="string"||typeof result.runId!=="string"||
    typeof result.jobId!=="string")
    throw new Error("Unverified CRM admission result");
  return result;
 });

export const cancelAiWorkforceReadonlyAnalysis=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((i:z.input<typeof cancel>)=>cancel.parse(i))
 .handler(async({context,data}):Promise<{status:"cancelled";admissionId:string}>=>{
  await requireWorkforceAdmin(context,data.tenantId);
  const db=context.supabase as any;
  const admission=await db.from("ai_workforce_readonly_admissions")
    .select("id").eq("id",data.admissionId).eq("tenant_id",data.tenantId)
    .eq("product_key",data.productKey).eq("employee_id",data.employeeId).single();
  if(admission.error||!admission.data)throw new Error("Admission is outside this employee scope");
  const {data:result,error}=await db.rpc("cancel_ai_workforce_readonly_queued",{
   _tenant:data.tenantId,_product:data.productKey,_admission:data.admissionId,
  });
  if(error)throw new Error(error.message);
  if(result?.status!=="cancelled")throw new Error("Canonical budget cancellation not confirmed");
  return {admissionId:data.admissionId,status:"cancelled"};
 });

export const reviewAiWorkforceReadonlyResult=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((i:z.input<typeof review>)=>review.parse(i))
 .handler(async({context,data}):Promise<{decision:string;humanReviewed:true;customerActions:0}>=>{
  await requireWorkforceAdmin(context,data.tenantId);
  const db=context.supabase as any;
  const admission=await db.from("ai_workforce_readonly_admissions")
   .select("id").eq("id",data.admissionId).eq("tenant_id",data.tenantId)
   .eq("product_key",data.productKey).eq("employee_id",data.employeeId).single();
  if(admission.error||!admission.data)throw new Error("Not a scoped employee analysis");
  const {data:result,error}=await db.rpc("review_ai_workforce_readonly_result",{
   _tenant:data.tenantId,_product:data.productKey,_admission:data.admissionId,
   _decision:data.decision,_note:data.note,
  });
  if(error)throw new Error(error.message);
  if(result?.humanReviewed!==true||result.customerActions!==0)
   throw new Error("Unverified human result review response");
  return result;
 });
