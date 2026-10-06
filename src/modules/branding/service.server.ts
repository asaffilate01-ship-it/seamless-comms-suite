import { z } from "zod";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "@/modules/platform/service-identity";

function reply(body:unknown,status=200){
  return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
}

const scopeSchema=z.array(z.object({
  tenantId:z.string().uuid(),productKey:z.string().min(1),
  tenantProductId:z.string().uuid().optional().nullable(),
  locationIds:z.array(z.string().uuid()).optional(),
  capabilities:z.array(z.string().min(1))
}));

const schema=z.object({
  tenantId:z.string().uuid(),
  productKey:z.string().min(1).max(80),
  tenantProductId:z.string().uuid(),
  identityId:z.string().uuid(),
  status:z.enum(["verified","failed"]),
  evidence:z.record(z.string(),z.union([
    z.string(),z.number(),z.boolean(),z.null(),z.array(z.string().max(240))
  ])).default({})
});

async function authenticate(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const credential:ServiceCredentialRecord={
    id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,
    expiresAt:row.expires_at,scopes:scopeSchema.parse(row.scopes)
  };
  return{db,credential};
}

export async function serveBrandIdentityVerification(request:Request){
  try{
    const raw=await request.text();if(raw.length>65536)return reply({error:"Payload too large"},413);
    let json:unknown;try{json=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
    const input=schema.parse(json);
    const{db,credential}=await authenticate(request);
    authoriseServiceScope(credential,{
      tenantId:input.tenantId,productKey:input.productKey,tenantProductId:input.tenantProductId,
      capability:"branding.identity.verify"
    });

    const{data:tp}=await db.from("tenant_products").select("id,status,product_key")
      .eq("id",input.tenantProductId).eq("tenant_id",input.tenantId).maybeSingle();
    if(!tp||tp.status!=="active"||tp.product_key!==input.productKey){
      return reply({error:"Active tenant product required"},403);
    }

    const{data:identity}=await db.from("tenant_communication_identities").select("*")
      .eq("id",input.identityId).eq("tenant_id",input.tenantId)
      .eq("tenant_product_id",input.tenantProductId).maybeSingle();
    if(!identity)return reply({error:"Communication identity not found"},404);

    if(identity.provider_binding_id){
      const{data:binding}=await db.from("tenant_integration_bindings")
        .select("id,status").eq("id",identity.provider_binding_id)
        .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId).maybeSingle();
      if(!binding||!["configured","active"].includes(binding.status)){
        return reply({error:"Configured provider binding required"},409);
      }
    }

    if(input.status==="verified"&&identity.channel==="email"){
      if(!identity.domain_id)return reply({error:"Verified email domain required"},409);
      const{data:domain}=await db.from("tenant_domains").select("id,hostname,purpose,verification_status")
        .eq("id",identity.domain_id).eq("tenant_id",input.tenantId)
        .eq("tenant_product_id",input.tenantProductId).maybeSingle();
      if(!domain||domain.verification_status!=="verified"||domain.purpose!=="email"){
        return reply({error:"Verified tenant email domain required"},409);
      }
      const emailDomain=String(identity.identity_value).split("@")[1]?.toLowerCase();
      if(emailDomain!==String(domain.hostname).toLowerCase()){
        return reply({error:"Sender email no longer matches verified email domain"},409);
      }
    }

    const metadata={
      ...(identity.metadata??{}),
      verificationEvidence:input.evidence,
      verifiedByWorkerKey:credential.keyId
    };
    const{data:row,error}=await db.from("tenant_communication_identities").update({
      verification_status:input.status,
      active:input.status==="verified"?identity.active:false,
      verified_at:input.status==="verified"?new Date().toISOString():null,
      verified_by:credential.keyId,
      metadata
    }).eq("id",identity.id).select("*").single();
    if(error||!row)throw new Error(error?.message??"Communication identity could not be verified");

    await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()})
      .eq("id",credential.id);
    return reply({identity:row},202);
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid branding verification contract"},422);
    const message=error instanceof Error?error.message:"Brand identity verification refused";
    if(/credential|scope|authorization|expired/i.test(message))return reply({error:message},403);
    return reply({error:message},503);
  }
}
