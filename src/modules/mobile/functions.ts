import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const deviceSchema=z.object({
 tenantId:z.string().uuid(),appKey:z.string().min(2).max(120),platform:z.enum(["ios","android","web"]),
 deviceRef:z.string().min(8).max(240),appVersion:z.string().max(80).optional().nullable(),locale:z.string().max(20).optional().nullable(),
 timeZone:z.string().max(100).optional().nullable(),pushProvider:z.string().max(80).optional().nullable(),pushToken:z.string().max(1000).optional().nullable(),pushEnabled:z.boolean().default(true),
});

export const registerMobileDevice=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof deviceSchema>)=>deviceSchema.parse(input))
 .handler(async({context,data})=>{
  const db=context.supabase as any;
  const{data:membership}=await db.from("tenant_members").select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
  if(!membership)throw new Error("Tenant access required");
  const{data:profile,error:profileError}=await db.from("mobile_app_profiles").select("id,status").eq("app_key",data.appKey).eq("status","active").maybeSingle();
  if(profileError||!profile)throw new Error("Active mobile app profile not found");
  const values={tenant_id:data.tenantId,app_profile_id:profile.id,user_id:context.userId,platform:data.platform,device_ref:data.deviceRef,app_version:data.appVersion??null,locale:data.locale??null,time_zone:data.timeZone??null,push_provider:data.pushProvider??null,push_token:data.pushToken??null,push_enabled:data.pushEnabled,last_seen_at:new Date().toISOString()};
  const{data:row,error}=await db.from("mobile_devices").upsert(values,{onConflict:"app_profile_id,device_ref"}).select("id,app_profile_id,platform,app_version,locale,time_zone,push_enabled,last_seen_at").single();
  if(error||!row)throw new Error(error?.message??"Device could not be registered");return row;
 });

const profileScope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),productKey:z.string().min(1).max(80)});

export const listMobileAppProfiles=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof profileScope>)=>profileScope.parse(input))
.handler(async({context,data})=>{
  const db=context.supabase as any;
  const{data:membership}=await db.from("tenant_members").select("role")
    .eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
  if(!membership)throw new Error("Tenant access required");

  const{data:tenantProduct}=await db.from("tenant_products").select("id,status,product_key")
    .eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).eq("product_key",data.productKey).maybeSingle();
  if(!tenantProduct||tenantProduct.status!=="active")throw new Error("Active tenant product required");

  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:profiles,error}=await admin.from("mobile_app_profiles")
    .select("id,product_key,tenant_id,tenant_product_id,brand_key,app_key,display_name,ios_bundle_id,android_package,locales,region_keys,capabilities,modules,theme,status,updated_at")
    .eq("product_key",data.productKey)
    .or(`tenant_id.is.null,tenant_id.eq.${data.tenantId}`)
    .neq("status","retired")
    .order("display_name");
  if(error)throw new Error(error.message);

  const{data:devices,error:deviceError}=await db.from("mobile_devices")
    .select("id,app_profile_id,platform,app_version,locale,time_zone,push_enabled,last_seen_at")
    .eq("tenant_id",data.tenantId)
    .order("last_seen_at",{ascending:false});
  if(deviceError)throw new Error(deviceError.message);

  return{
    role:membership.role,
    profiles:(profiles??[]).map((profile:any)=>({
      ...profile,
      devices:(devices??[]).filter((device:any)=>device.app_profile_id===profile.id)
    }))
  };
});
