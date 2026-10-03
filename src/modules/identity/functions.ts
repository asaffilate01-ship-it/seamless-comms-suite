import {createHash,randomBytes} from "node:crypto";
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership} from "@/modules/platform/access";

const uuid=z.string().uuid(),product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product});
const hash=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");

export const getIdentityWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const [policy,invitations,users]=await Promise.all([
  db.from("tenant_identity_policies").select("*").eq("tenant_id",data.tenantId).maybeSingle(),
  db.from("customer_portal_invitations").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("customer_portal_users").select("*,person:crm_people(*)").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200)
 ]);for(const r of[policy,invitations,users])if(r.error)throw new Error(r.error.message);
 return{policy:policy.data??null,invitations:invitations.data??[],users:users.data??[]};
});

const policy=scope.extend({allowedMethods:z.array(z.enum(["password","magic_link","passkey","whatsapp_otp","entra","google","apple"])).min(1).max(10),
 mfaRequired:z.boolean(),customerPortalEnabled:z.boolean(),passkeysEnabled:z.boolean(),whatsappOtpEnabled:z.boolean(),
 ssoConfig:z.record(z.string(),z.unknown()).default({}),sessionPolicy:z.record(z.string(),z.unknown()).default({})});
export const saveIdentityPolicy=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof policy>)=>policy.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.identity");requireAdminRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("tenant_identity_policies").upsert({tenant_id:data.tenantId,
  allowed_methods:data.allowedMethods,mfa_required:data.mfaRequired,customer_portal_enabled:data.customerPortalEnabled,
  passkeys_enabled:data.passkeysEnabled,whatsapp_otp_enabled:data.whatsappOtpEnabled,sso_config:data.ssoConfig,
  session_policy:data.sessionPolicy,updated_at:new Date().toISOString()},{onConflict:"tenant_id"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const invite=scope.extend({personId:uuid.nullish(),email:z.string().email().max(320).nullish(),phoneE164:z.string().regex(/^\+[1-9][0-9]{6,14}$/).nullish(),
 validHours:z.number().int().min(1).max(720).default(72)});
export const createCustomerPortalInvitation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof invite>)=>invite.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.identity");requireAdminRole(a.role);
 if(!data.email&&!data.phoneE164&&!data.personId)throw new Error("Invite target required");
 const token=randomBytes(32).toString("base64url"),tokenHash=hash(token);
 const expiresAt=new Date(Date.now()+data.validHours*3600000).toISOString();
 const {data:row,error}=await(context.supabase as any).from("customer_portal_invitations").insert({tenant_id:data.tenantId,product_key:data.productKey,
  person_id:data.personId??null,email:data.email??null,phone_e164:data.phoneE164??null,token_hash:tokenHash,status:"pending",expires_at:expiresAt,
  invited_by:context.userId}).select("id,tenant_id,product_key,person_id,email,phone_e164,status,expires_at,created_at").single();
 if(error)throw new Error(error.message);return{invitation:row,token};
});

export const acceptCustomerPortalInvitation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{token:string})=>z.object({token:z.string().min(32).max(200)}).parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;const tokenHash=hash(data.token);const invitation=await db.from("customer_portal_invitations").select("*")
  .eq("token_hash",tokenHash).eq("status","pending").gt("expires_at",new Date().toISOString()).maybeSingle();
 if(invitation.error||!invitation.data)throw new Error("Invitation invalid or expired");
 const policy=await db.from("tenant_identity_policies").select("customer_portal_enabled").eq("tenant_id",invitation.data.tenant_id).maybeSingle();
 if(policy.error||policy.data?.customer_portal_enabled===false)throw new Error("Customer portal is disabled");
 const {data:row,error}=await db.from("customer_portal_users").upsert({tenant_id:invitation.data.tenant_id,product_key:invitation.data.product_key,
  user_id:context.userId,person_id:invitation.data.person_id,status:"active",permissions:[]},{onConflict:"tenant_id,product_key,user_id"}).select("*").single();
 if(error)throw new Error(error.message);
 await db.from("customer_portal_invitations").update({status:"accepted"}).eq("id",invitation.data.id);
 return row;
});

export const revokeCustomerPortalAccess=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey:string;userId:string})=>z.object({tenantId:uuid,productKey:product,userId:uuid}).parse(i))
.handler(async({context,data})=>{const a=await requireService(context,data.tenantId,"omniqora.identity");requireAdminRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("customer_portal_users").update({status:"revoked",updated_at:new Date().toISOString()})
  .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).eq("user_id",data.userId).select("*").single();
 if(error)throw new Error(error.message);return row;});
