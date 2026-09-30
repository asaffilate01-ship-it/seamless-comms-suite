import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const scopeSchema=z.object({
  tenantId:z.string().uuid(),
  productKey:z.string().min(1).max(80),
  tenantProductId:z.string().uuid().optional().nullable(),
  locationIds:z.array(z.string().uuid()).max(500).optional(),
  capabilities:z.array(z.string().min(1).max(120)).min(1).max(100),
});
const issueSchema=z.object({
  name:z.string().trim().min(3).max(160),
  scopes:z.array(scopeSchema).min(1).max(100),
  expiresAt:z.string().datetime().optional().nullable(),
});

async function canManageScope(context:any,scope:z.infer<typeof scopeSchema>){
  const db=context.supabase as any;
  const{data:p}=await db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle();
  if(p?.status==="active"&&["platform_owner","platform_admin"].includes(p.role))return true;
  const{data:tp}=scope.tenantProductId
    ? await db.from("tenant_products").select("region_key,product_key").eq("id",scope.tenantProductId).eq("tenant_id",scope.tenantId).maybeSingle()
    : {data:null};
  const productKey=tp?.product_key??scope.productKey;
  const regionKey=tp?.region_key??null;
  const{data:o}=await db.from("product_operators").select("role,status,region_keys").eq("product_key",productKey).eq("user_id",context.userId).maybeSingle();
  if(!o||o.status!=="active"||!["landlord_owner","landlord_admin"].includes(o.role))return false;
  const regions=Array.isArray(o.region_keys)?o.region_keys:[];
  return !regionKey||!regions.length||regions.includes(regionKey);
}

export const issuePlatformServiceCredential=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof issueSchema>)=>issueSchema.parse(input))
.handler(async({context,data})=>{
  for(const scope of data.scopes){
    if(!await canManageScope(context,scope))throw new Error("Platform or landlord admin access required for all requested scopes");
  }
  const keyId="oq_"+randomBytes(9).toString("base64url");
  const secret=randomBytes(32).toString("base64url");
  const secretHash=createHash("sha256").update(secret,"utf8").digest("hex");
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:row,error}=await admin.from("platform_service_credentials").insert({
    key_id:keyId,secret_hash:secretHash,name:data.name,status:"active",scopes:data.scopes,
    expires_at:data.expiresAt??null,created_by:context.userId
  }).select("id,key_id,name,status,scopes,expires_at,created_at").single();
  if(error||!row)throw new Error(error?.message??"Service credential could not be created");
  await admin.from("audit_log").insert({
    tenant_id:data.scopes.length===1?data.scopes[0]!.tenantId:null,actor:context.userId,
    action:"platform.service_credential.created",entity:"platform_service_credential",entity_id:row.id,
    payload:{keyId,scopeCount:data.scopes.length}
  });
  return{credential:row,token:keyId+"."+secret};
});

export const listPlatformServiceCredentials=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId?:string|null;productKey?:string|null})=>z.object({
  tenantId:z.string().uuid().optional().nullable(),productKey:z.string().max(80).optional().nullable()
}).parse(input))
.handler(async({context,data})=>{
  const db=context.supabase as any;
  const{data:p}=await db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle();
  const platform=!!(p?.status==="active"&&["platform_owner","platform_admin","platform_auditor"].includes(p.role));
  const{data:rows,error}=await (await import("@/integrations/supabase/client.server")).supabaseAdmin
    .from("platform_service_credentials").select("id,key_id,name,status,scopes,expires_at,last_used_at,created_at").order("created_at",{ascending:false}).limit(500);
  if(error)throw new Error(error.message);
  return(rows??[]).filter((row:any)=>{
    if(platform)return true;
    const scopes=Array.isArray(row.scopes)?row.scopes:[];
    return scopes.some((scope:any)=>{
      if(data.tenantId&&scope.tenantId!==data.tenantId)return false;
      if(data.productKey&&scope.productKey!==data.productKey)return false;
      return true;
    });
  });
});

export const disablePlatformServiceCredential=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{credentialId:string})=>z.object({credentialId:z.string().uuid()}).parse(input))
.handler(async({context,data})=>{
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:row}=await admin.from("platform_service_credentials").select("id,scopes,status").eq("id",data.credentialId).maybeSingle();
  if(!row)throw new Error("Credential not found");
  for(const scope of Array.isArray(row.scopes)?row.scopes:[]){
    if(!await canManageScope(context,scope))throw new Error("Platform or landlord admin access required");
  }
  const{error}=await admin.from("platform_service_credentials").update({status:"disabled"}).eq("id",data.credentialId);
  if(error)throw new Error(error.message);
  return{ok:true};
});
