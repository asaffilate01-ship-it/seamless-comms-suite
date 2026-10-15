import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid();
const scope=z.object({tenantId:uuid,productKey:z.string().regex(/^[a-z0-9][a-z0-9.-]{1,80}$/)});
const currency=z.enum(["GBP","USD","EUR"]);
const mcpServer=z.string().min(3).max(160).regex(/^[A-Za-z0-9._/-]+$/);

export interface AgentFactoryBudget{
 tenant_id:string;product_key:string;period_month:string;
 currency:"GBP"|"USD"|"EUR";limit_minor:number;reserved_minor:number;spent_minor:number;updated_at:string;
}
export interface AgentFactoryRate{
 provider_key:string;model_key:string;rate_version:string;
 currency:"GBP"|"USD"|"EUR";input_minor_per_million:number;
 cached_input_minor_per_million:number|null;output_minor_per_million:number;
 minimum_risk_grade:"standard"|"sensitive"|"regulated";
 supported_regions:string[];verified_at:string;status:"approved";evaluation_passed:boolean;
}
export interface AgentFactoryReservation{
 id:string;run_id:string;use_case_id:string;period_month:string;
 currency:string;reserved_minor:number;actual_minor:number|null;
 provider_key:string;model_key:string;rate_version:string;status:string;created_at:string;settled_at:string|null;
}
export interface AgentFactoryMcpRequest{
 id:string;tenant_id:string;product_key:string;registry_name:string;registry_version:string;
 reason:string;status:"requested"|"shortlisted"|"rejected"|"revoked";
 review_note:string|null;created_at:string;reviewed_at:string|null;
}
export type AgentMcpPlatformReview=AgentFactoryMcpRequest &{requested_by:string};
export interface AgentFactoryOperations{
 budgets:AgentFactoryBudget[];reservations:AgentFactoryReservation[];
 rates:AgentFactoryRate[];mcpRequests:AgentFactoryMcpRequest[];
}


export const getAgentFactoryOperations=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>)=>scope.parse(i)).handler(async({context,data}):Promise<AgentFactoryOperations>=>{
 await requireTenantMembership(context,data.tenantId);
 const db=context.supabase as any;
 const [budget,reservations,modelRates,requests]=await Promise.all([
  db.from("ai_spend_budgets")
    .select("tenant_id,product_key,period_month,currency,limit_minor,reserved_minor,spent_minor,updated_at")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .order("period_month",{ascending:false}).limit(9),
  db.from("ai_budgeted_run_reservations")
    .select("id,run_id,use_case_id,period_month,currency,reserved_minor,actual_minor,provider_key,model_key,rate_version,status,created_at,settled_at")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .order("created_at",{ascending:false}).limit(25),
  db.from("ai_reviewed_model_rates")
    .select("provider_key,model_key,rate_version,currency,input_minor_per_million,cached_input_minor_per_million,output_minor_per_million,minimum_risk_grade,supported_regions,verified_at,status,evaluation_passed")
    .eq("status","approved").eq("evaluation_passed",true)
    .gte("verified_at",new Date(Date.now()-30*86400000).toISOString())
    .order("verified_at",{ascending:false}).limit(100),
  db.from("mcp_setup_requests")
    .select("id,tenant_id,product_key,registry_name,registry_version,reason,status,review_note,created_at,reviewed_at")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .order("created_at",{ascending:false}).limit(80),
 ]);
 for(const result of [budget,reservations,modelRates,requests])if(result.error)throw new Error(result.error.message);
 // The schema's read policies prevent non-admins from viewing MCP requests.
 return{budgets:(budget.data??[]) as AgentFactoryBudget[],reservations:(reservations.data??[]) as AgentFactoryReservation[],rates:(modelRates.data??[]) as AgentFactoryRate[],mcpRequests:(requests.data??[]) as AgentFactoryMcpRequest[]};
});

export const setAgentFactoryBudget=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>scope.extend({
  currency,limitMinor:z.number().int().min(0).max(1_000_000_000),
}).parse(i)).handler(async({context,data})=>{
 const access=await requireTenantMembership(context,data.tenantId);requireAdminRole(access.role);
 const r=await(context.supabase as any).rpc("configure_ai_spend_budget",{
  _tenant:data.tenantId,_product:data.productKey,_currency:data.currency,_limit:data.limitMinor,
 });
 if(r.error)throw new Error(r.error.message);return r.data;
});

export const requestAgentMcpSetup=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>scope.extend({
  registryName:mcpServer,registryVersion:z.string().trim().min(1).max(80),
  reason:z.string().trim().min(10).max(500),
}).parse(i)).handler(async({context,data})=>{
 const access=await requireTenantMembership(context,data.tenantId);requireAdminRole(access.role);
 const r=await(context.supabase as any).rpc("request_mcp_setup",{
  _tenant:data.tenantId,_product:data.productKey,_name:data.registryName,
  _version:data.registryVersion,_reason:data.reason,
 });
 if(r.error)throw new Error(r.error.message);
 return r.data as {id:string;status:"requested"|"shortlisted"|"rejected"|"revoked";registry_name:string};
});

export const listAgentMcpPlatformReview=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>z.object({}).parse(i)).handler(async({context}):Promise<AgentMcpPlatformReview[]>=>{
 const db=context.supabase as any;
 const r=await db.rpc("is_platform_admin",{_user:context.userId});
 if(r.error||!r.data)throw new Error("Platform review permission required");
 const q=await db.from("mcp_setup_requests")
  .select("id,tenant_id,product_key,registry_name,registry_version,reason,requested_by,status,created_at,review_note")
  .in("status",["requested","shortlisted"]).order("created_at",{ascending:true}).limit(100);
 if(q.error)throw new Error(q.error.message);
 return (q.data??[]) as AgentMcpPlatformReview[];
});

export const reviewAgentMcpSetup=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>z.object({
  requestId:uuid,decision:z.enum(["shortlisted","rejected","revoked"]),
  reviewNote:z.string().trim().min(16).max(1500),
}).parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;
 const r=await db.rpc("is_platform_admin",{_user:context.userId});
 if(r.error||!r.data)throw new Error("Platform review permission required");
 const q=await db.rpc("review_mcp_setup",{
  _request:data.requestId,_decision:data.decision,_note:data.reviewNote,
 });
 if(q.error)throw new Error(q.error.message);
 return q.data;
});

export const queueBudgetedFactoryTask=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>scope.extend({
  useCaseId:uuid,
  profile:z.enum(["discovery","finance","technical","compliance","product","transaction","accounting","tax","operations"]),
  goal:z.string().trim().min(4).max(5000),
  providerKey:z.string().trim().min(2).max(120),
  modelKey:z.string().trim().min(1).max(160),
  currency,inputTokens:z.number().int().min(0).max(10_000_000),
  cachedInputTokens:z.number().int().min(0).max(10_000_000),
  outputTokens:z.number().int().min(0).max(10_000_000),
  toolCeilingMinor:z.number().int().min(0).max(100_000_000),
  maxSteps:z.number().int().min(1).max(32),
  idempotencyKey:uuid,
}).refine(x=>x.cachedInputTokens<=x.inputTokens,{message:"Cached tokens cannot exceed input tokens"}).parse(i))
.handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.intelligence-runtime");requireWriteRole(access.role);
 const r=await(context.supabase as any).rpc("queue_budgeted_ai_agent",{
  _tenant:data.tenantId,_product:data.productKey,_use_case:data.useCaseId,
  _profile:data.profile,_goal:data.goal,_provider:data.providerKey,_model:data.modelKey,
  _currency:data.currency,_input_tokens:data.inputTokens,
  _cached_tokens:data.cachedInputTokens,_output_tokens:data.outputTokens,
  _tool_ceiling:data.toolCeilingMinor,_max_steps:data.maxSteps,_idempotency:data.idempotencyKey,
 });
 if(r.error)throw new Error(r.error.message);
 return r.data as{runId:string;reservationId:string;jobId?:string;reservedMinor:number;currency:string;status:string;alreadyExists:boolean};
});
