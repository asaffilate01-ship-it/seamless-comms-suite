import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assessTenantReadiness } from "./readiness";

const schema=z.object({tenantId:z.string().uuid(),productKey:z.string().min(1).max(80)});
export const getTenantPlatformReadiness=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof schema>)=>schema.parse(input))
 .handler(async({context,data})=>{
  const db=context.supabase as any;
  const{data:membership}=await db.from("tenant_members").select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
  if(!membership||!["owner","admin"].includes(membership.role))throw new Error("Tenant admin access required");
  const{data:tp,error:tpError}=await db.from("tenant_products").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).eq("status","active").maybeSingle();
  if(tpError||!tp)throw new Error("Active tenant product not found");
  const[entitlements,bindings,domains,locations]=await Promise.all([
   db.from("tenant_module_entitlements").select("module_key,enabled,starts_at,ends_at").eq("tenant_id",data.tenantId).eq("tenant_product_id",tp.id),
   db.from("tenant_integration_bindings").select("id,module_key,provider,plugin_key,integration_kind,environment,secret_ref,secret_refs,status,last_verified_at").eq("tenant_id",data.tenantId).eq("tenant_product_id",tp.id),
   db.from("tenant_domains").select("hostname,purpose,verification_status,is_primary").eq("tenant_id",data.tenantId).eq("tenant_product_id",tp.id),
   db.from("tenant_locations").select("id,name,status").eq("tenant_id",data.tenantId).eq("tenant_product_id",tp.id).eq("status","active"),
  ]);
  for(const result of[entitlements,bindings,domains,locations])if(result.error)throw new Error(result.error.message);
  const now=Date.now();const modules=(entitlements.data??[]).filter((e:any)=>e.enabled&&(!e.starts_at||Date.parse(e.starts_at)<=now)&&(!e.ends_at||Date.parse(e.ends_at)>now)).map((e:any)=>e.module_key);
  return{tenantProduct:tp,moduleKeys:modules,...assessTenantReadiness({moduleKeys:modules,bindings:bindings.data??[],domains:domains.data??[],locations:locations.data??[]}),integrations:(bindings.data??[]).map((b:any)=>({id:b.id,moduleKey:b.module_key,provider:b.provider,pluginKey:b.plugin_key,integrationKind:b.integration_kind,environment:b.environment,status:b.status,lastVerifiedAt:b.last_verified_at,missingCredentialNames:(pluginNames(b))}))};
 });

function pluginNames(binding:any){
 const refs={...(binding.secret_ref?{default:binding.secret_ref}:{}),...(binding.secret_refs??{})};
 // Return only logical credential names, never environment variable names or secret values.
 const map:Record<string,string[]>={"maps.google":["api_key"],"maps.mapbox":["access_token"],"payments.stripe":["secret_key","webhook_secret"],"payments.adyen":["api_key","hmac_key"],"payments.sumup":["access_token"],"communications.meta-whatsapp":["access_token","app_secret","verify_token"],"communications.twilio":["account_sid","auth_token"],"ai.openai":["api_key"],"ai.anthropic":["api_key"],"ai.gemini":["api_key"]};
 const key=binding.plugin_key??(binding.integration_kind+"."+binding.provider);return(map[key]??[]).filter((name)=>!refs[name]&&!refs.default);
}