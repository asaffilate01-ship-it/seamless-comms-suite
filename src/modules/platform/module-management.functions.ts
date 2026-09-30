import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function operatorCanManage(context:any,tenantProductId:string){
  const db=context.supabase as any;
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:tp}=await admin.from("tenant_products").select("tenant_id,product_key,region_key").eq("id",tenantProductId).maybeSingle();
  if(!tp)throw new Error("Tenant product not found");
  const{data:p}=await db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle();
  if(p?.status==="active"&&["platform_owner","platform_admin"].includes(p.role))return{...tp,admin};
  const{data:allowed,error}=await db.rpc("is_product_operator",{
    _product:tp.product_key,_user:context.userId,_roles:["landlord_owner","landlord_admin"],_region:tp.region_key
  });
  if(error)throw new Error(error.message);
  if(allowed!==true)throw new Error("Platform or landlord admin access required");
  return{...tp,admin};
}

async function writeEntitlement(admin:any,input:{
  tenantId:string;tenantProductId:string;moduleKey:string;enabled:boolean;
  limits?:Record<string,unknown>;config?:Record<string,unknown>;source:string;
}){
  const{data:existing,error:readError}=await admin.from("tenant_module_entitlements").select("id")
    .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
    .eq("module_key",input.moduleKey).maybeSingle();
  if(readError)throw new Error(readError.message);
  const values={
    tenant_id:input.tenantId,tenant_product_id:input.tenantProductId,module_key:input.moduleKey,
    enabled:input.enabled,limits:input.limits??{},config:input.config??{},source:input.source
  };
  const result=existing?.id
    ?await admin.from("tenant_module_entitlements").update(values).eq("id",existing.id)
    :await admin.from("tenant_module_entitlements").insert(values);
  if(result.error)throw new Error(result.error.message);
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
  const access=await operatorCanManage(context,req.tenant_product_id);
  await admin.from("tenant_module_requests").update({
    status:data.decision,decided_by:context.userId,decided_at:new Date().toISOString(),decision_note:data.note??null
  }).eq("id",req.id);
  if(data.decision==="approved"){
    await writeEntitlement(access.admin,{
      tenantId:req.tenant_id,tenantProductId:req.tenant_product_id,moduleKey:req.module_key,
      enabled:true,source:"manual_addon"
    });
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
  const admin=tp.admin;
  await writeEntitlement(admin,{
    tenantId:tp.tenant_id,tenantProductId:data.tenantProductId,moduleKey:data.moduleKey,
    enabled:data.enabled,limits:data.limits,config:data.config,source:"operator"
  });
  await admin.from("audit_log").insert({
    tenant_id:tp.tenant_id,actor:context.userId,
    action:data.enabled?"platform.module.enabled":"platform.module.disabled",
    entity:"tenant_module_entitlement",entity_id:data.moduleKey,payload:{tenantProductId:data.tenantProductId}
  });
  return{ok:true};
});
