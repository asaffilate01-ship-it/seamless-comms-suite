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