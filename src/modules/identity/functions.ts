import { createHash, randomBytes } from "node:crypto";
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


const customerInviteSchema=z.object({
 tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),crmPersonId:z.string().uuid(),
 email:z.string().email().max(320),
 role:z.enum(["customer_owner","customer_member","customer_viewer"]).default("customer_member"),
 expiresInHours:z.number().int().min(1).max(720).default(168)
});

export const inviteCustomerPortalUser=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof customerInviteSchema>)=>customerInviteSchema.parse(input))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:m}=await db.from("tenant_members").select("role")
  .eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
 if(!m||!["owner","admin"].includes(m.role))throw new Error("Tenant owner/admin access required");
 const[{data:tp},{data:person}]=await Promise.all([
  db.from("tenant_products").select("id,status").eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle(),
  db.from("crm_people").select("id,email").eq("id",data.crmPersonId).eq("tenant_id",data.tenantId).maybeSingle()
 ]);
 if(!tp||tp.status!=="active")throw new Error("Active tenant product required");
 if(!person)throw new Error("CRM customer not found");
 const email=data.email.trim().toLowerCase();
 if(person.email&&String(person.email).trim().toLowerCase()!==email){
  throw new Error("Invitation email must match the CRM customer email");
 }
 const token=randomBytes(32).toString("base64url");
 const tokenHash=createHash("sha256").update(token).digest("hex");
 const expiresAt=new Date(Date.now()+data.expiresInHours*3600000).toISOString();
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:invite,error}=await admin.from("customer_portal_invitations").insert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,crm_person_id:data.crmPersonId,
  email,role:data.role,token_hash:tokenHash,expires_at:expiresAt,invited_by:context.userId
 }).select("id,tenant_id,tenant_product_id,crm_person_id,email,role,expires_at").single();
 if(error||!invite)throw new Error(error?.message??"Customer portal invitation could not be created");
 return{invite,token};
});

export const acceptCustomerPortalInvitation=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{token:string})=>z.object({token:z.string().min(32).max(200)}).parse(input))
.handler(async({context,data})=>{
 const email=String(context.claims.email??"").trim().toLowerCase();
 if(!email)throw new Error("Verified account email is required");
 const tokenHash=createHash("sha256").update(data.token).digest("hex");
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:invite,error}=await admin.from("customer_portal_invitations").select("*")
  .eq("token_hash",tokenHash).is("accepted_at",null).is("revoked_at",null)
  .gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error||!invite)throw new Error("Customer portal invitation is invalid or expired");
 if(invite.email!==email)throw new Error("Customer portal invitation email does not match the signed-in account");
 const{data:person}=await admin.from("crm_people").select("id,email").eq("id",invite.crm_person_id)
  .eq("tenant_id",invite.tenant_id).maybeSingle();
 if(!person)throw new Error("CRM customer no longer exists");
 if(person.email&&String(person.email).trim().toLowerCase()!==email){
  throw new Error("Signed-in email no longer matches the CRM customer");
 }
 const{error:userError}=await admin.from("customer_portal_users").upsert({
  tenant_id:invite.tenant_id,tenant_product_id:invite.tenant_product_id,
  crm_person_id:invite.crm_person_id,user_id:context.userId,role:invite.role,status:"active"
 },{onConflict:"tenant_product_id,user_id"});
 if(userError)throw new Error(userError.message);
 await admin.from("customer_portal_invitations").update({
  accepted_by:context.userId,accepted_at:new Date().toISOString()
 }).eq("id",invite.id);
 return{
  tenantId:invite.tenant_id,tenantProductId:invite.tenant_product_id,
  crmPersonId:invite.crm_person_id,role:invite.role
 };
});

export const listMyCustomerPortals=createServerFn({method:"GET"})
.middleware([requireSupabaseAuth])
.handler(async({context})=>{
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:rows,error}=await admin.from("customer_portal_users")
  .select("id,tenant_id,tenant_product_id,crm_person_id,role,status,metadata")
  .eq("user_id",context.userId).eq("status","active");
 if(error)throw new Error(error.message);
 if(!(rows??[]).length)return[];
 const tenantIds=[...new Set((rows??[]).map((r:any)=>r.tenant_id))];
 const productIds=[...new Set((rows??[]).map((r:any)=>r.tenant_product_id))];
 const personIds=[...new Set((rows??[]).map((r:any)=>r.crm_person_id))];
 const[tenants,products,people]=await Promise.all([
  admin.from("tenants").select("id,name,slug").in("id",tenantIds),
  admin.from("tenant_products").select("id,product_key,region_key,brand_key,status").in("id",productIds),
  admin.from("crm_people").select("id,display_name,first_name,last_name,email,phone_e164,lifecycle_stage").in("id",personIds)
 ]);
 for(const result of[tenants,products,people])if(result.error)throw new Error(result.error.message);
 const tenantById=new Map((tenants.data??[]).map((x:any)=>[x.id,x]));
 const productById=new Map((products.data??[]).map((x:any)=>[x.id,x]));
 const personById=new Map((people.data??[]).map((x:any)=>[x.id,x]));
 return(rows??[]).map((row:any)=>({
  ...row,tenant:tenantById.get(row.tenant_id)??null,
  product:productById.get(row.tenant_product_id)??null,
  person:personById.get(row.crm_person_id)??null
 }));
});

export const revokeCustomerPortalUser=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;portalUserId:string})=>z.object({
 tenantId:z.string().uuid(),portalUserId:z.string().uuid()
}).parse(input))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:m}=await db.from("tenant_members").select("role")
  .eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
 if(!m||!["owner","admin"].includes(m.role))throw new Error("Tenant owner/admin access required");
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:row,error}=await admin.from("customer_portal_users").update({status:"revoked"})
  .eq("id",data.portalUserId).eq("tenant_id",data.tenantId)
  .select("id,status").single();
 if(error||!row)throw new Error(error?.message??"Customer portal access could not be revoked");
 return row;
});
