import { createHash, randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const hostname=z.string().trim().toLowerCase().regex(/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);

async function requireAdmin(context:any,tenantId:string){
 const db=context.supabase as any;const{data:m}=await db.from("tenant_members").select("role")
  .eq("tenant_id",tenantId).eq("user_id",context.userId).maybeSingle();
 if(!m||!["owner","admin"].includes(m.role))throw new Error("Tenant owner/admin access required");
}

const begin=z.object({
 tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),locationId:z.string().uuid().optional().nullable(),
 hostname,purpose:z.enum(["marketing","app","api","tracking","assets","auth","other"]),primary:z.boolean().default(false)
});
export const beginDomainVerification=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof begin>)=>begin.parse(i))
.handler(async({context,data})=>{
 await requireAdmin(context,data.tenantId);const db=context.supabase as any;
 const{data:tp}=await db.from("tenant_products").select("id").eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle();
 if(!tp)throw new Error("Tenant product not found");
 const token=randomBytes(24).toString("base64url");
 const txtValue="omniqora-verification="+token;
 const tokenHash=createHash("sha256").update(txtValue).digest("hex");
 const recordName="_omniqora."+data.hostname;
 const{data:existing}=await db.from("tenant_domains").select("id").eq("hostname",data.hostname).maybeSingle();
 if(existing){
  const{data:owned}=await db.from("tenant_domains").select("id").eq("id",existing.id).eq("tenant_id",data.tenantId).maybeSingle();
  if(!owned)throw new Error("Domain is already registered to another tenant");
 }
 const values={
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,location_id:data.locationId??null,
  hostname:data.hostname,purpose:data.purpose,verification_status:"pending",is_primary:data.primary,
  verification_token_hash:tokenHash,verification_record_name:recordName,verified_at:null
 };
 const result=existing
  ?await db.from("tenant_domains").update(values).eq("id",existing.id).select("id,hostname,purpose,verification_status").single()
  :await db.from("tenant_domains").insert(values).select("id,hostname,purpose,verification_status").single();
 if(result.error||!result.data)throw new Error(result.error?.message??"Domain verification could not start");
 return{domain:result.data,dns:{type:"TXT",name:recordName,value:txtValue}};
});

export const verifyTenantDomain=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;domainId:string})=>z.object({tenantId:z.string().uuid(),domainId:z.string().uuid()}).parse(i))
.handler(async({context,data})=>{
 await requireAdmin(context,data.tenantId);const db=context.supabase as any;
 const{data:domain,error}=await db.from("tenant_domains")
  .select("id,hostname,verification_token_hash,verification_record_name")
  .eq("id",data.domainId).eq("tenant_id",data.tenantId).maybeSingle();
 if(error||!domain||!domain.verification_token_hash||!domain.verification_record_name)throw new Error("Pending domain verification not found");
 let records:string[][]=[];
 try{records=await resolveTxt(domain.verification_record_name);}catch{
  return{verified:false,reason:"dns_record_not_found"};
 }
 const matched=records.some((parts)=>createHash("sha256").update(parts.join("")).digest("hex")===domain.verification_token_hash);
 if(!matched)return{verified:false,reason:"dns_value_not_matched"};
 const{error:updateError}=await db.from("tenant_domains").update({
  verification_status:"verified",verified_at:new Date().toISOString(),verification_token_hash:null
 }).eq("id",domain.id);
 if(updateError)throw new Error(updateError.message);
 return{verified:true,hostname:domain.hostname};
});
