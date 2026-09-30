import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function operatorCanManage(context:any,tenantProductId:string){
  const db=context.supabase as any;
  const{data:tp}=await db.from("tenant_products").select("tenant_id,product_key,region_key").eq("id",tenantProductId).maybeSingle();
  if(!tp)throw new Error("Tenant product not found");
  const{data:p}=await db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle();
  if(p?.status==="active"&&["platform_owner","platform_admin"].includes(p.role))return tp;
  const{data:o}=await db.from("product_operators").select("role,status,region_keys").eq("product_key",tp.product_key).eq("user_id",context.userId).maybeSingle();
  const regions=Array.isArray(o?.region_keys)?o.region_keys:[];
  if(!o||o.status!=="active"||!["landlord_owner","landlord_admin"].includes(o.role)||(regions.length&&!regions.includes(tp.region_key)))throw new Error("Platform or landlord admin access required");
  return tp;
}

export const requestTenantModule=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantProductId:string;moduleKey:string;reason?:string|null})=>z.object({
  tenantProductId:z.string().uuid(),moduleKey:z.string().min(1).max(160),reason:z.string().max(2000).optional().nullable()
}).parse(i))
.handler(async({context,data})=>{
  const db=context.supabase as any;
  const{data:tp}=await db.from("tenant_products").select("tenant_id,status").eq("id",data.tenantProductId).maybeSingle();
  if(!tp||tp.status!=="active")throw new Error("Active tenant product required");
  const{data:m}=await db.from("tenant_members").select("role").eq("tenant_id",tp.tenant_id).eq("user_id",context.userId).maybeSingle();
  if(!m||!["owner","admin"].includes(m.role))throw new Error("Tenant owner/admin access required");
  const{data:row,error}=await db.from("tenant_module_requests").insert({
    tenant_id:tp.tenant_id,tenant_product_id:data.tenantProductId,module_key:data.moduleKey,
    requested_by:context.userId,reason:data.reason??null,status:"requested"
  }).select("id,status,created_at").single();
  if(error||!row)throw new Error(error?.message??"Module request could not be created");
  return row;
});

export const decideTenantModuleRequest=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{requestId:string;decision:"approved"|"rejected";note?:string|null})=>z.object({
  requestId:z.string().uuid(),decision:z.enum(["approved","rejected"]),note:z.string().max(2000).optional().nullable()
}).parse(i))
.handler(async({context,data})=>{
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:req}=await admin.from("tenant_module_requests").select("*").eq("id",data.requestId).eq("status","requested").maybeSingle();
  if(!req)throw new Error("Open module request not found");
  await operatorCanManage(context,req.tenant_product_id);
  await admin.from("tenant_module_requests").update({
    status:data.decision,decided_by:context.userId,decided_at:new Date().toISOString(),decision_note:data.note??null
  }).eq("id",req.id);
  if(data.decision==="approved"){
    const{error}=await admin.from("tenant_module_entitlements").upsert({
      tenant_id:req.tenant_id,tenant_product_id:req.tenant_product_id,module_key:req.module_key,
      enabled:true,source:"manual_addon"
    },{onConflict:"tenant_id,tenant_product_id,module_key"});
    if(error)throw new Error(error.message);
    await admin.from("tenant_module_requests").update({status:"completed"}).eq("id",req.id);
  }
  return{ok:true,status:data.decision==="approved"?"completed":"rejected"};
});

export const setTenantModuleEntitlement=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantProductId:string;moduleKey:string;enabled:boolean;limits?:Record<string,unknown>;config?:Record<string,unknown>})=>z.object({
  tenantProductId:z.string().uuid(),moduleKey:z.string().min(1).max(160),enabled:z.boolean(),
  limits:z.record(z.string(),z.unknown()).optional(),config:z.record(z.string(),z.unknown()).optional()
}).parse(i))
.handler(async({context,data})=>{
  const tp=await operatorCanManage(context,data.tenantProductId);
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{error}=await admin.from("tenant_module_entitlements").upsert({
    tenant_id:tp.tenant_id,tenant_product_id:data.tenantProductId,module_key:data.moduleKey,
    enabled:data.enabled,limits:data.limits??{},config:data.config??{},source:"operator"
  },{onConflict:"tenant_id,tenant_product_id,module_key"});
  if(error)throw new Error(error.message);
  await admin.from("audit_log").insert({
    tenant_id:tp.tenant_id,actor:context.userId,
    action:data.enabled?"platform.module.enabled":"platform.module.disabled",
    entity:"tenant_module_entitlement",entity_id:data.moduleKey,payload:{tenantProductId:data.tenantProductId}
  });
  return{ok:true};
});
