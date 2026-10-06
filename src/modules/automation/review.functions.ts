import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireAdminTenantRole } from "@/modules/platform/module-access";

const review=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),
  actionId:z.string().uuid(),decision:z.enum(["approved","rejected"]),reason:z.string().max(2000).optional().nullable()
});

export const reviewAutomationAction=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof review>)=>review.parse(input))
.handler(async({context,data})=>{
  const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"automation.core"});
  requireAdminTenantRole(access.role);
  const db=context.supabase as any;
  const{data:action,error}=await db.from("automation_action_queue")
    .select("id,run_id,state,requires_approval").eq("id",data.actionId).eq("tenant_id",data.tenantId).maybeSingle();
  if(error||!action||action.state!=="approval"||!action.requires_approval)throw new Error("Pending automation approval not found");
  const state=data.decision==="approved"?"approved":"rejected";
  const{error:updateError}=await db.from("automation_action_queue").update({
    state,approved_by:context.userId,approved_at:new Date().toISOString(),
    error:data.decision==="rejected"?(data.reason??"Rejected by reviewer"):null
  }).eq("id",action.id);
  if(updateError)throw new Error(updateError.message);
  await db.from("automation_runs").update({
    status:data.decision==="approved"?"waiting":"failed",
    next_run_at:new Date().toISOString(),locked_at:null,
    last_error:data.decision==="rejected"?(data.reason??"Automation action rejected"):null
  }).eq("id",action.run_id);
  return{ok:true,state};
});

export const listAutomationApprovals=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string})=>z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()}).parse(input))
.handler(async({context,data})=>{
  const access=await requireModuleEntitlement(context,{...data,moduleKey:"automation.core"});
  requireAdminTenantRole(access.role);
  const db=context.supabase as any;
  const{data:rows,error}=await db.from("automation_action_queue")
    .select("id,run_id,workflow_id,node_id,module_key,action_key,risk,input,created_at")
    .eq("tenant_id",data.tenantId).eq("state","approval").order("created_at");
  if(error)throw new Error(error.message);return rows??[];
});
