import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { practiceMutation,practiceScope } from "./contracts";

export const getPracticeWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.infer<typeof practiceScope>)=>practiceScope.parse(input))
.handler(async({context,data})=>{
 const db=context.supabase as any;const access=await db.rpc("practice_access",{_tenant:data.tenantId,_product:data.productKey,_write:false});
 if(access.error)throw new Error(access.error.message);if(!access.data)throw new Error("Practice is not enabled for this product.");
 const tables=["practice_clients","practice_service_templates","practice_engagements","practice_job_phases","practice_work_requests","practice_work_time","practice_proposals","practice_recurring_work","practice_work_audit"] as const;
 const results=await Promise.all(tables.map(name=>db.from(name).select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).limit(1000)));
 for(const r of results)if(r.error)throw new Error(r.error.message);
 const [crm,members]=await Promise.all([
  db.from("crm_companies").select("id,name").eq("tenant_id",data.tenantId).order("name").limit(1000),
  db.from("tenant_members").select("user_id,role").eq("tenant_id",data.tenantId)
 ]);
 if(crm.error)throw new Error(crm.error.message);if(members.error)throw new Error(members.error.message);
 return{clients:results[0].data??[],services:results[1].data??[],jobs:results[2].data??[],phases:results[3].data??[],
  requests:results[4].data??[],time:results[5].data??[],proposals:results[6].data??[],schedules:results[7].data??[],
  audit:results[8].data??[],crmCompanies:crm.data??[],members:members.data??[],userId:context.userId,
  truncated:results.some(r=>r.data?.length===1000)};
});

export const mutatePracticeWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof practiceMutation>)=>practiceMutation.parse(input))
.handler(async({context,data})=>{
 const{data:result,error}=await (context.supabase as any).rpc("practice_workspace_command",{_tenant:data.tenantId,_product:data.productKey,_command:data.command});
 if(error)throw new Error(error.message);return result as {id:string;existing?:boolean};
});

const grant=z.object({tenantId:z.string().uuid(),productKey:z.string().min(2).max(80),clientId:z.string().uuid(),userId:z.string().uuid(),role:z.enum(["client_owner","client_viewer"]).default("client_viewer")});
export const grantPracticePortalUser=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof grant>)=>grant.parse(input))
.handler(async({context,data})=>{
 const{error}=await (context.supabase as any).rpc("practice_grant_client_user",{_tenant:data.tenantId,_product:data.productKey,_client:data.clientId,_user:data.userId,_role:data.role});
 if(error)throw new Error(error.message);return{ok:true};
});

export const listMyPracticePortals=createServerFn({method:"GET"}).middleware([requireSupabaseAuth])
.handler(async({context})=>{
 const{data,error}=await (context.supabase as any).from("practice_client_users").select("practice_client_id,tenant_id,product_key,portal_role").eq("user_id",context.userId).eq("status","active");
 if(error)throw new Error(error.message);return data??[];
});
const portal=z.object({clientId:z.string().uuid(),action:z.enum(["read","respond","accept","decline"]).default("read"),entityId:z.string().uuid().optional(),response:z.string().trim().min(1).max(10000).optional()});
export const accessPracticePortal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof portal>)=>portal.parse(input))
.handler(async({context,data})=>{
 const{data:result,error}=await (context.supabase as any).rpc("practice_portal_workspace",{_client:data.clientId,_action:data.action,_entity:data.entityId??null,_response:data.response??null});
 if(error)throw new Error(error.message);return result;
});
