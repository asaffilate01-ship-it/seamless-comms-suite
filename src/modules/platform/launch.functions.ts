import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "./module-access";

async function requireTenantAdmin(context:any,tenantId:string){
 const db=context.supabase as any;const{data:m}=await db.from("tenant_members").select("role").eq("tenant_id",tenantId).eq("user_id",context.userId).maybeSingle();
 if(!m||!["owner","admin"].includes(m.role))throw new Error("Tenant owner/admin access required");
 return m.role as string;
}

const brand=z.object({
 tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),brandKey:z.string().min(1).max(120),
 name:z.string().min(1).max(200),logoUrl:z.string().url().optional().nullable(),iconUrl:z.string().url().optional().nullable(),
 splashUrl:z.string().url().optional().nullable(),primaryColour:z.string().max(32).optional().nullable(),
 secondaryColour:z.string().max(32).optional().nullable(),accentColour:z.string().max(32).optional().nullable(),
 fontFamily:z.string().max(160).optional().nullable(),supportEmail:z.string().email().optional().nullable(),
 supportPhone:z.string().max(40).optional().nullable(),appName:z.string().max(160).optional().nullable(),
 legalName:z.string().max(240).optional().nullable(),websiteUrl:z.string().url().optional().nullable(),
 locale:z.string().max(20).optional().nullable(),terminology:z.record(z.string(),z.string()).default({}),
 theme:z.record(z.string(),z.unknown()).default({})
});
export const upsertTenantBrandProfile=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof brand>)=>brand.parse(i))
.handler(async({context,data})=>{
 await requireTenantAdmin(context,data.tenantId);const db=context.supabase as any;
 const{data:tp}=await db.from("tenant_products").select("id").eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle();
 if(!tp)throw new Error("Tenant product not found");
 const{data:row,error}=await db.from("tenant_brand_profiles").upsert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,brand_key:data.brandKey,name:data.name,
  logo_url:data.logoUrl??null,icon_url:data.iconUrl??null,splash_url:data.splashUrl??null,
  primary_colour:data.primaryColour??null,secondary_colour:data.secondaryColour??null,accent_colour:data.accentColour??null,
  font_family:data.fontFamily??null,support_email:data.supportEmail??null,support_phone:data.supportPhone??null,
  app_name:data.appName??null,legal_name:data.legalName??null,website_url:data.websiteUrl??null,
  locale:data.locale??null,terminology:data.terminology,theme:data.theme,status:"active"
 },{onConflict:"tenant_id,brand_key"}).select("*").single();
 if(error||!row)throw new Error(error?.message??"Brand profile could not be saved");return row;
});

const config=z.object({
 tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),locationId:z.string().uuid().optional().nullable(),
 configKey:z.string().regex(/^[a-z0-9][a-z0-9._-]{1,159}$/),value:z.unknown(),enabled:z.boolean().default(true)
});
export const setTenantRuntimeConfig=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof config>)=>config.parse(i))
.handler(async({context,data})=>{
 await requireTenantAdmin(context,data.tenantId);const db=context.supabase as any;
 const{data:existing}=await db.from("tenant_runtime_config").select("id,revision")
  .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
  .eq("location_id",data.locationId??null).eq("config_key",data.configKey).maybeSingle();
 const values={tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,location_id:data.locationId??null,
  config_key:data.configKey,value:data.value,enabled:data.enabled,source:"tenant",revision:(existing?.revision??0)+1};
 const result=existing?.id
  ? await db.from("tenant_runtime_config").update(values).eq("id",existing.id).select("*").single()
  : await db.from("tenant_runtime_config").insert(values).select("*").single();
 if(result.error||!result.data)throw new Error(result.error?.message??"Runtime config could not be saved");return result.data;
});

const tracking=z.object({
 tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),subjectType:z.string().min(1).max(80),
 subjectId:z.string().min(1).max(200),publicFields:z.array(z.string().min(1).max(120)).max(100),
 expiresInHours:z.number().int().min(1).max(24*30).default(72)
});
export const createPublicTrackingToken=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof tracking>)=>tracking.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"dispatch.core"});
 requireWritableTenantRole(access.role);
 const token=randomBytes(32).toString("base64url");const hash=createHash("sha256").update(token).digest("hex");
 const db=context.supabase as any;const expiresAt=new Date(Date.now()+data.expiresInHours*3600000).toISOString();
 const{data:row,error}=await db.from("public_tracking_tokens").insert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,token_hash:hash,
  subject_type:data.subjectType,subject_id:data.subjectId,public_fields:data.publicFields,
  expires_at:expiresAt,created_by:context.userId
 }).select("id,subject_type,subject_id,expires_at").single();
 if(error||!row)throw new Error(error?.message??"Tracking token could not be created");
 return{tracking:row,token};
});

export const createDataJob=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;tenantProductId?:string|null;kind:"import"|"export";resourceType:string;format:"csv"|"json"|"xlsx"|"pdf"|"zip";storageRef?:string|null;options?:Record<string,unknown>})=>
 z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid().optional().nullable(),kind:z.enum(["import","export"]),
 resourceType:z.string().min(1).max(120),format:z.enum(["csv","json","xlsx","pdf","zip"]),
 storageRef:z.string().max(500).optional().nullable(),options:z.record(z.string(),z.unknown()).optional()}).parse(i))
.handler(async({context,data})=>{
 await requireTenantAdmin(context,data.tenantId);const db=context.supabase as any;
 const{data:row,error}=await db.from("platform_data_jobs").insert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId??null,job_kind:data.kind,
  resource_type:data.resourceType,format:data.format,storage_ref:data.storageRef??null,
  requested_by:context.userId,status:"queued",options:data.options??{}
 }).select("id,status,created_at").single();
 if(error||!row)throw new Error(error?.message??"Data job could not be created");return row;
});
