import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership} from "@/modules/platform/access";

const uuid=z.string().uuid();
const scope=z.object({
 tenantId:uuid,productKey:z.string().regex(/^[a-z0-9][a-z0-9.-]{1,80}$/),
}).strict();
export interface RufloPilotRequest{
 id:string;tenant_id:string;product_key:string;data_region:string;
 reason:string;status:"requested"|"shortlisted"|"rejected"|"revoked";
 requested_by:string;created_at:string;
}
export interface RufloTenantBinding{
 status:"disabled"|"sandbox_verified"|"suspended";
 upstream_version:string|null;data_region:string|null;
 allowed_probe_tools:string[];verified_at:string|null;
 evidence_reference:string|null;
}
export interface RufloProbeReceipt{
 id:string;probe_key:string;result_status:"passed"|"failed"|"timed_out"|"denied";
 recorded_at:string;
}

export interface RufloProbeTask{
 id:string;probe_key:"swarm_health"|"swarm_status"|"agent_list";
 status:"queued"|"processing"|"passed"|"failed"|"timed_out"|"denied"|"cancelled";
 created_at:string;started_at:string|null;completed_at:string|null;
 attempts:number;error_code:string|null;
}

export const getRufloPilotStatus=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);
 const db=context.supabase as any;
 const [request,binding,receipts,probes]=await Promise.all([
  db.from("ai_ruflo_pilot_requests")
    .select("id,tenant_id,product_key,data_region,reason,status,requested_by,created_at")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).maybeSingle(),
  db.from("ai_ruflo_tenant_bindings")
    .select("status,upstream_version,data_region,allowed_probe_tools,verified_at,evidence_reference")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).maybeSingle(),
  db.from("ai_ruflo_probe_receipts")
    .select("id,probe_key,result_status,recorded_at")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .order("recorded_at",{ascending:false}).limit(10),
  db.from("ai_ruflo_probe_tasks")
   .select("id,probe_key,status,created_at,started_at,completed_at,attempts,error_code")
   .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
   .order("created_at",{ascending:false}).limit(15),
 ]);
 if(request.error||binding.error||receipts.error||probes.error)
  throw new Error("Ruflo pilot schema or tenant permissions unavailable");
 return{
  pilot:(request.data??null) as RufloPilotRequest|null,
  binding:(binding.data??null) as RufloTenantBinding|null,
  receipts:(receipts.data??[]) as RufloProbeReceipt[],
  probes:(probes.data??[]) as RufloProbeTask[],
  customerAgentExecutionReady:false as const,
  notice:"Sandbox probes only. Shortlisting is not a connection, credential grant, or customer agent execution.",
 };
});

export const requestRufloPilot=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>scope.extend({
 reason:z.string().trim().min(16).max(500),
}).parse(i))
.handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.intelligence-runtime");
 requireAdminRole(access.role);
 const db=context.supabase as any;
 const tenant=await db.from("tenants").select("country_code").eq("id",data.tenantId).maybeSingle();
 if(tenant.error||!tenant.data?.country_code)throw new Error("Tenant country is not verified");
 const result=await db.rpc("request_ruflo_pilot",{
  _tenant:data.tenantId,_product:data.productKey,_region:tenant.data.country_code,_reason:data.reason,
 });
 if(result.error)throw new Error(result.error.message);
 return{requestId:result.data.id as string,status:result.data.status as string};
});

export const listRufloPilotReviews=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>z.object({}).strict().parse(i))
.handler(async({context}):Promise<RufloPilotRequest[]>=>{
 const db=context.supabase as any;
 const allowed=await db.rpc("is_platform_admin",{_user:context.userId});
 if(allowed.error||!allowed.data)throw new Error("Platform reviewer permission required");
 const result=await db.from("ai_ruflo_pilot_requests")
  .select("id,tenant_id,product_key,data_region,reason,status,requested_by,created_at")
  .in("status",["requested","shortlisted"]).order("created_at",{ascending:true}).limit(100);
 if(result.error)throw new Error("Ruflo pilot review list unavailable");
 return (result.data??[]) as RufloPilotRequest[];
});

export const reviewRufloPilot=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>z.object({
 requestId:uuid,decision:z.enum(["shortlisted","rejected","revoked"]),
 reviewNote:z.string().trim().min(16).max(1500),
}).strict().parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const allowed=await db.rpc("is_platform_admin",{_user:context.userId});
 if(allowed.error||!allowed.data)throw new Error("Platform reviewer permission required");
 const result=await db.rpc("review_ruflo_pilot",{
  _request:data.requestId,_decision:data.decision,_note:data.reviewNote,
 });
 if(result.error)throw new Error(result.error.message);
 return{requestId:result.data.id as string,status:result.data.status as string};
});


/** Request a no-prompt, no-cost MCP health probe; the browser cannot claim it. */
export const queueRufloHealthProbe=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>scope.extend({
 probeName:z.enum(["swarm_health","swarm_status","agent_list"]),
 idempotencyKey:uuid,
}).parse(i))
.handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.intelligence-runtime");
 requireAdminRole(access.role);
 const result=await(context.supabase as any).rpc("request_ruflo_probe",{
  _tenant:data.tenantId,_product:data.productKey,
  _probe:data.probeName,_idempotency:data.idempotencyKey,
 });
 if(result.error)throw new Error(result.error.message);
 return {taskId:result.data.id as string,status:result.data.status as string};
});
