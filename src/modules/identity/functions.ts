import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const methods=z.enum(["password","magic_link","sms_otp","whatsapp_otp","google","apple","microsoft","passkey"]);
const policy=z.object({
 tenantId:z.string().uuid(),tenantProductId:z.string().uuid().optional().nullable(),
 enabledMethods:z.array(methods).min(1).max(8),primaryMethod:methods,requireMfa:z.boolean(),
 allowedMfaMethods:z.array(z.enum(["totp","sms_otp","whatsapp_otp","passkey"])).max(4),
 sessionMinutes:z.number().int().min(5).max(10080),rememberDeviceDays:z.number().int().min(0).max(365),
 allowedEmailDomains:z.array(z.string().min(1).max(255)).max(100),blockDisposableEmail:z.boolean(),
 inviteOnly:z.boolean(),config:z.record(z.string(),z.unknown()).default({})
});

export const upsertTenantIdentityPolicy=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof policy>)=>policy.parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:m}=await db.from("tenant_members").select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
 if(!m||!["owner","admin"].includes(m.role))throw new Error("Tenant owner/admin access required");
 if(!data.enabledMethods.includes(data.primaryMethod))throw new Error("Primary identity method must be enabled");
 const{data:existing}=await db.from("tenant_identity_policies").select("id")
  .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId??null).maybeSingle();
 const values={
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId??null,enabled_methods:data.enabledMethods,
  primary_method:data.primaryMethod,require_mfa:data.requireMfa,allowed_mfa_methods:data.allowedMfaMethods,
  session_minutes:data.sessionMinutes,remember_device_days:data.rememberDeviceDays,
  allowed_email_domains:data.allowedEmailDomains.map(v=>v.toLowerCase()),block_disposable_email:data.blockDisposableEmail,
  invite_only:data.inviteOnly,config:data.config
 };
 const result=existing?.id
  ? await db.from("tenant_identity_policies").update(values).eq("id",existing.id).select("*").single()
  : await db.from("tenant_identity_policies").insert(values).select("*").single();
 if(result.error||!result.data)throw new Error(result.error?.message??"Identity policy could not be saved");
 return result.data;
});

export const getTenantIdentityPolicy=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;tenantProductId?:string|null})=>z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid().optional().nullable()}).parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:m}=await db.from("tenant_members").select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
 if(!m)throw new Error("Tenant access required");
 const{data:row,error}=await db.from("tenant_identity_policies").select("*")
  .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId??null).maybeSingle();
 if(error)throw new Error(error.message);
 return row??null;
});
