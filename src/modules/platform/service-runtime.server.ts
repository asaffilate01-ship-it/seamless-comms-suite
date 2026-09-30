import { z } from "zod";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "./service-identity";

const scopeSchema=z.array(z.object({
  tenantId:z.string().uuid(),productKey:z.string().min(1),
  tenantProductId:z.string().uuid().optional().nullable(),
  locationIds:z.array(z.string().uuid()).optional(),
  capabilities:z.array(z.string().min(1)),
}));

function reply(body:unknown,status=200){
  return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
}

async function authenticate(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const credential:ServiceCredentialRecord={
    id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,
    expiresAt:row.expires_at,scopes:scopeSchema.parse(row.scopes),
  };
  return{db,credential};
}

const base=z.object({
  tenantId:z.string().uuid(),
  productKey:z.string().min(1).max(80),
  tenantProductId:z.string().uuid().optional().nullable(),
  locationId:z.string().uuid().optional().nullable(),
});
const requestSchema=z.discriminatedUnion("operation",[
  base.extend({operation:z.literal("context.get")}),
  base.extend({operation:z.literal("entitlement.check"),moduleKey:z.string().min(1).max(160)}),
  base.extend({
    operation:z.literal("usage.record"),moduleKey:z.string().min(1).max(160),
    metricKey:z.string().min(1).max(160),quantity:z.number().nonnegative(),
    unit:z.string().min(1).max(80),sourceEventId:z.string().min(1).max(160),
    occurredAt:z.string().datetime(),metadata:z.record(z.string(),z.unknown()).optional(),
  }),
]);

export async function servePlatformRuntime(request:Request){
  try{
    const raw=await request.text();if(raw.length>131072)return reply({error:"Payload too large"},413);
    let json:unknown;try{json=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
    const input=requestSchema.parse(json);
    const{db,credential}=await authenticate(request);
    const capability=input.operation==="context.get"?"context.read":
      input.operation==="entitlement.check"?"entitlements.read":"usage.write";
    authoriseServiceScope(credential,{
      tenantId:input.tenantId,productKey:input.productKey,tenantProductId:input.tenantProductId,
      locationId:input.locationId,capability
    });

    const{data:tp,error:tpError}=await db.from("tenant_products")
      .select("id,tenant_id,product_key,region_key,plan_key,status,brand_key,settings")
      .eq("tenant_id",input.tenantId).eq("product_key",input.productKey)
      .eq("id",input.tenantProductId??"00000000-0000-0000-0000-000000000000").maybeSingle();
    if(tpError||!tp||tp.status!=="active")return reply({error:"Active tenant product required"},403);

    if(input.operation==="context.get"){
      const[{data:modules},{data:region},{data:locations}]=await Promise.all([
        db.from("tenant_module_entitlements").select("module_key,enabled,limits,config,starts_at,ends_at")
          .eq("tenant_id",input.tenantId).eq("tenant_product_id",tp.id).eq("enabled",true),
        db.from("platform_region_packs").select("region_key,country_code,default_locale,supported_locales,currency,time_zones,data_region,tax_profile,legal_profile,regulatory_packs,provider_preferences")
          .eq("region_key",tp.region_key).maybeSingle(),
        db.from("tenant_locations").select("id,location_key,name,country_code,locale,time_zone,currency,status")
          .eq("tenant_id",input.tenantId).eq("tenant_product_id",tp.id).eq("status","active"),
      ]);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({tenantProduct:tp,modules:modules??[],region:region??null,locations:locations??[]});
    }

    if(input.operation==="entitlement.check"){
      const{data:grant}=await db.from("tenant_module_entitlements")
        .select("module_key,enabled,limits,config,starts_at,ends_at")
        .eq("tenant_id",input.tenantId).eq("tenant_product_id",tp.id).eq("module_key",input.moduleKey).maybeSingle();
      const now=Date.now();
      const allowed=!!grant?.enabled&&(!grant.starts_at||Date.parse(grant.starts_at)<=now)&&(!grant.ends_at||Date.parse(grant.ends_at)>now);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({allowed,grant:allowed?grant:null});
    }

    const{data:grant}=await db.from("tenant_module_entitlements")
      .select("enabled,starts_at,ends_at").eq("tenant_id",input.tenantId).eq("tenant_product_id",tp.id).eq("module_key",input.moduleKey).maybeSingle();
    const now=Date.now();
    const allowed=!!grant?.enabled&&(!grant.starts_at||Date.parse(grant.starts_at)<=now)&&(!grant.ends_at||Date.parse(grant.ends_at)>now);
    if(!allowed)return reply({error:"Module entitlement required"},403);
    const{data:existing}=await db.from("platform_usage_events").select("id")
      .eq("tenant_id",input.tenantId).eq("module_key",input.moduleKey).eq("metric_key",input.metricKey).eq("source_event_id",input.sourceEventId).maybeSingle();
    if(existing?.id)return reply({id:existing.id,status:"recorded",idempotent:true});
    const{data:usage,error}=await db.from("platform_usage_events").insert({
      tenant_id:input.tenantId,tenant_product_id:tp.id,module_key:input.moduleKey,metric_key:input.metricKey,
      quantity:input.quantity,unit:input.unit,source_event_id:input.sourceEventId,
      occurred_at:input.occurredAt,metadata:input.metadata??{}
    }).select("id").single();
    if(error||!usage)return reply({error:"Usage could not be recorded"},503);
    await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
    return reply({id:usage.id,status:"recorded"},202);
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid runtime contract"},422);
    const message=error instanceof Error?error.message:"Runtime refused";
    if(/credential|scope|authorization|expired/i.test(message))return reply({error:message},403);
    return reply({error:"Platform runtime unavailable"},503);
  }
}
