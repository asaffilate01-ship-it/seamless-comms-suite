import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function operatorCanManage(context:any,productKey:string,regionKey:string){
 const db=context.supabase as any;
 const{data:p}=await db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle();
 if(p?.status==="active"&&["platform_owner","platform_admin"].includes(p.role))return true;
 const{data:o}=await db.from("product_operators").select("role,status,region_keys").eq("product_key",productKey).eq("user_id",context.userId).maybeSingle();
 if(!o||o.status!=="active"||!["landlord_owner","landlord_admin"].includes(o.role))return false;
 const regions=Array.isArray(o.region_keys)?o.region_keys:[];return !regions.length||regions.includes(regionKey);
}

export const getMyOperatorContext=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const db=context.supabase as any;const[platform,products,memberships]=await Promise.all([db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle(),db.from("product_operators").select("product_key,role,region_keys,status").eq("user_id",context.userId),db.from("tenant_members").select("tenant_id,role").eq("user_id",context.userId)]);
 return{platform:platform.data??null,products:products.data??[],memberships:memberships.data??[]};
});

export const listManagedTenants=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:{productKey?:string|null})=>z.object({productKey:z.string().max(80).optional().nullable()}).parse(input)).handler(async({context,data})=>{const db=context.supabase as any;const{data:rows,error}=await db.rpc("list_operator_tenants",{_product:data.productKey??null});if(error)throw new Error(error.message);return rows??[];});

const createTenantSchema=z.object({productKey:z.string().min(1).max(80),regionKey:z.string().min(2).max(16),name:z.string().trim().min(2).max(200),slug:z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/)});
export const createManagedTenant=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof createTenantSchema>)=>createTenantSchema.parse(input)).handler(async({context,data})=>{
 if(!await operatorCanManage(context,data.productKey,data.regionKey))throw new Error("Platform or landlord admin access required");
 const{ supabaseAdmin }=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:product}=await admin.from("platform_products").select("product_key,status").eq("product_key",data.productKey).eq("status","active").maybeSingle();if(!product)throw new Error("Active product not found");
 const{data:blueprint}=await admin.from("active_platform_product_blueprints").select("region_keys").eq("product_key",data.productKey).maybeSingle();if(blueprint?.region_keys?.length&&!blueprint.region_keys.includes(data.regionKey))throw new Error("Product region is not enabled");
 const{data:tenant,error}=await admin.from("tenants").insert({name:data.name,slug:data.slug}).select("id,name,slug").single();if(error||!tenant)throw new Error(error?.message??"Tenant could not be created");
 await admin.from("audit_log").insert({tenant_id:tenant.id,actor:context.userId,action:"platform.tenant.created_by_landlord",entity:"tenant",entity_id:tenant.id,payload:{productKey:data.productKey,regionKey:data.regionKey}});
 return tenant;
});

const inviteSchema=z.object({tenantId:z.string().uuid(),productKey:z.string().min(1).max(80),regionKey:z.string().min(2).max(16),email:z.string().email().max(320),role:z.enum(["owner","admin","agent","viewer"]).default("owner"),expiresInHours:z.number().int().min(1).max(720).default(168)});
export const createTenantInvitation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof inviteSchema>)=>inviteSchema.parse(input)).handler(async({context,data})=>{
 const db=context.supabase as any;const{data:membership}=await db.from("tenant_members").select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();const tenantAdmin=membership&&["owner","admin"].includes(membership.role);if(!tenantAdmin&&!await operatorCanManage(context,data.productKey,data.regionKey))throw new Error("Tenant or landlord admin access required");
 const token=randomBytes(32).toString("base64url");const tokenHash=createHash("sha256").update(token).digest("hex");const email=data.email.trim().toLowerCase();const expiresAt=new Date(Date.now()+data.expiresInHours*3600000).toISOString();
 const{ supabaseAdmin }=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:invite,error}=await admin.from("tenant_invitations").insert({tenant_id:data.tenantId,product_key:data.productKey,email,role:data.role,token_hash:tokenHash,expires_at:expiresAt,invited_by:context.userId}).select("id,tenant_id,email,role,expires_at").single();if(error||!invite)throw new Error(error?.message??"Invitation could not be created");
 return{invite,token};
});

export const acceptTenantInvitation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:{token:string})=>z.object({token:z.string().min(32).max(200)}).parse(input)).handler(async({context,data})=>{
 const email=String(context.claims.email??"").trim().toLowerCase();if(!email)throw new Error("Verified account email is required");const tokenHash=createHash("sha256").update(data.token).digest("hex");
 const{ supabaseAdmin }=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:invite,error}=await admin.from("tenant_invitations").select("*").eq("token_hash",tokenHash).is("accepted_at",null).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();if(error||!invite)throw new Error("Invitation is invalid or expired");if(invite.email!==email)throw new Error("Invitation email does not match the signed-in account");
 const{error:memberError}=await admin.from("tenant_members").upsert({tenant_id:invite.tenant_id,user_id:context.userId,role:invite.role},{onConflict:"tenant_id,user_id"});if(memberError)throw new Error(memberError.message);
 await admin.from("tenant_invitations").update({accepted_by:context.userId,accepted_at:new Date().toISOString()}).eq("id",invite.id);
 await admin.from("audit_log").insert({tenant_id:invite.tenant_id,actor:context.userId,action:"tenant.invitation.accepted",entity:"tenant_member",entity_id:context.userId,payload:{role:invite.role,productKey:invite.product_key}});
 return{tenantId:invite.tenant_id,role:invite.role};
});