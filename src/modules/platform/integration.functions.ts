import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pluginDefinition } from "./plugins";

async function requireTenantProductManager(context:any,tenantProductId:string){
  const db=context.supabase as any;
  const{data:tp}=await db.from("tenant_products").select("tenant_id,product_key,region_key").eq("id",tenantProductId).maybeSingle();
  if(!tp)throw new Error("Tenant product not found");
  const{data:membership}=await db.from("tenant_members").select("role").eq("tenant_id",tp.tenant_id).eq("user_id",context.userId).maybeSingle();
  if(membership&&["owner","admin"].includes(membership.role))return tp;
  const{data:p}=await db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle();
  if(p?.status==="active"&&["platform_owner","platform_admin"].includes(p.role))return tp;
  const{data:o}=await db.from("product_operators").select("role,status,region_keys").eq("product_key",tp.product_key).eq("user_id",context.userId).maybeSingle();
  const regions=Array.isArray(o?.region_keys)?o.region_keys:[];
  if(!o||o.status!=="active"||!["landlord_owner","landlord_admin"].includes(o.role)||(regions.length&&!regions.includes(tp.region_key)))throw new Error("Tenant, landlord or platform admin access required");
  return tp;
}

const bindingSchema=z.object({
  tenantProductId:z.string().uuid(),
  moduleKey:z.string().min(1).max(160),
  pluginKey:z.string().min(1).max(160),
  integrationKind:z.string().min(1).max(80),
  environment:z.enum(["development","staging","production"]).default("production"),
  locationId:z.string().uuid().optional().nullable(),
  externalAccountRef:z.string().max(240).optional().nullable(),
  secretRefs:z.record(z.string(),z.string().max(200)).default({}),
  config:z.record(z.string(),z.unknown()).default({}),
});

export const upsertTenantIntegrationBinding=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof bindingSchema>)=>bindingSchema.parse(i))
.handler(async({context,data})=>{
  const tp=await requireTenantProductManager(context,data.tenantProductId);
  const plugin=pluginDefinition(data.pluginKey);
  if(!plugin)throw new Error("Unknown plugin");
  if(plugin.kind!==data.integrationKind&&!(data.integrationKind==="communications"&&plugin.kind==="communications"))throw new Error("Plugin kind does not match integration kind");
  const missing=plugin.secretNames.filter((name)=>!data.secretRefs[name]);
  for(const [name,ref] of Object.entries(data.secretRefs)){
    if(!/^env:[A-Z][A-Z0-9_]{2,127}$/.test(ref))throw new Error("Secret reference must use env:VARIABLE: "+name);
  }
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:existing}=await admin.from("tenant_integration_bindings").select("id")
    .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",data.tenantProductId)
    .eq("module_key",data.moduleKey).eq("plugin_key",data.pluginKey)
    .eq("environment",data.environment)
    .eq("location_id",data.locationId??null).maybeSingle();
  const values={
    tenant_id:tp.tenant_id,tenant_product_id:data.tenantProductId,location_id:data.locationId??null,
    module_key:data.moduleKey,provider:data.pluginKey.split(".").at(-1),plugin_key:data.pluginKey,
    integration_kind:data.integrationKind,environment:data.environment,secret_refs:data.secretRefs,
    external_account_ref:data.externalAccountRef??null,config:data.config,
    status:missing.length?"missing_credentials":"configured",last_verified_at:null
  };
  let result;
  if(existing?.id) result=await admin.from("tenant_integration_bindings").update(values).eq("id",existing.id).select("id,status").single();
  else result=await admin.from("tenant_integration_bindings").insert(values).select("id,status").single();
  if(result.error||!result.data)throw new Error(result.error?.message??"Integration binding could not be saved");
  await admin.from("audit_log").insert({tenant_id:tp.tenant_id,actor:context.userId,action:"platform.integration.configured",entity:"tenant_integration_binding",entity_id:result.data.id,payload:{pluginKey:data.pluginKey,moduleKey:data.moduleKey,environment:data.environment,missing}});
  return{binding:result.data,missingCredentials:missing};
});

export const listTenantIntegrations=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantProductId:string})=>z.object({tenantProductId:z.string().uuid()}).parse(i))
.handler(async({context,data})=>{
  await requireTenantProductManager(context,data.tenantProductId);
  const db=context.supabase as any;
  const{data,error}=await db.from("tenant_integration_bindings")
    .select("id,module_key,provider,plugin_key,integration_kind,environment,external_account_ref,config,status,last_verified_at,location_id,secret_refs")
    .eq("tenant_product_id",data.tenantProductId).order("module_key");
  if(error)throw new Error(error.message);
  return(data??[]).map((row:any)=>({...row,secret_refs:Object.fromEntries(Object.keys(row.secret_refs??{}).map((key)=>[key,"configured"]))}));
});

export const markIntegrationVerified=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{bindingId:string;tenantProductId:string;healthy:boolean})=>z.object({bindingId:z.string().uuid(),tenantProductId:z.string().uuid(),healthy:z.boolean()}).parse(i))
.handler(async({context,data})=>{
  const tp=await requireTenantProductManager(context,data.tenantProductId);
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{error}=await admin.from("tenant_integration_bindings").update({
    status:data.healthy?"active":"degraded",last_verified_at:new Date().toISOString()
  }).eq("id",data.bindingId).eq("tenant_id",tp.tenant_id).eq("tenant_product_id",data.tenantProductId);
  if(error)throw new Error(error.message);
  return{ok:true};
});
