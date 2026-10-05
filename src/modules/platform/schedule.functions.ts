import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireAdminTenantRole } from "./module-access";

const schema=z.object({
 tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),moduleKey:z.string().min(1).max(160),
 scheduleKey:z.string().regex(/^[a-z0-9][a-z0-9._-]{1,119}$/),
 timezone:z.string().min(1).max(80),intervalMinutes:z.number().int().min(60).max(525600),
 eventType:z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/),
 eventPayload:z.record(z.string(),z.unknown()).default({}),firstRunAt:z.string().datetime()
});

export const createEventSchedule=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof schema>)=>schema.parse(input))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:data.moduleKey});
 requireAdminTenantRole(access.role);
 const db=context.supabase as any;
 const{data:row,error}=await db.from("platform_schedules").upsert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,module_key:data.moduleKey,
  schedule_key:data.scheduleKey,timezone:data.timezone,cron_expression:null,interval_minutes:data.intervalMinutes,
  action_key:"event.emit",action_payload:{eventType:data.eventType,payload:data.eventPayload},
  next_run_at:data.firstRunAt,enabled:true,last_error:null
 },{onConflict:"tenant_id,tenant_product_id,schedule_key"}).select("*").single();
 if(error||!row)throw new Error(error?.message??"Schedule could not be saved");return row;
});

export const listTenantSchedules=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string})=>z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()}).parse(input))
.handler(async({context,data})=>{
 const db=context.supabase as any;const{data:m}=await db.from("tenant_members").select("role")
  .eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
 if(!m)throw new Error("Tenant access required");
 const{data:rows,error}=await db.from("platform_schedules").select("*")
  .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("next_run_at");
 if(error)throw new Error(error.message);return rows??[];
});

export const setScheduleEnabled=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;scheduleId:string;enabled:boolean})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),scheduleId:z.string().uuid(),enabled:z.boolean()
 }).parse(input))
.handler(async({context,data})=>{
 const db=context.supabase as any;const{data:m}=await db.from("tenant_members").select("role")
  .eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
 if(!m||!["owner","admin"].includes(m.role))throw new Error("Tenant owner/admin access required");
 const{error}=await db.from("platform_schedules").update({enabled:data.enabled,locked_at:null})
  .eq("id",data.scheduleId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId);
 if(error)throw new Error(error.message);return{ok:true};
});
