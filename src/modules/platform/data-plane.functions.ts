import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requirePlatformAdmin(context:any){
 const db=context.supabase as any;const{data:p}=await db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle();
 if(!p||p.status!=="active"||!["platform_owner","platform_admin"].includes(p.role))throw new Error("Platform admin access required");
}

const planeSchema=z.object({
 key:z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/),
 kind:z.enum(["shared_postgres","regional_postgres","dedicated_postgres","external"]),
 region:z.string().min(2).max(40),residencyCountries:z.array(z.string().length(2)).max(100),
 connectionSecretRef:z.string().min(5).max(160),storageSecretRef:z.string().max(160).optional().nullable(),
 vectorSecretRef:z.string().max(160).optional().nullable(),graphSecretRef:z.string().max(160).optional().nullable(),
 capacityClass:z.enum(["small","medium","large","dedicated"]).optional().nullable(),
});
export const upsertDataPlane=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof planeSchema>)=>planeSchema.parse(i))
.handler(async({context,data})=>{
 await requirePlatformAdmin(context);const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{error}=await admin.from("platform_data_planes").upsert({
  data_plane_key:data.key,kind:data.kind,region:data.region,residency_countries:data.residencyCountries,
  connection_secret_ref:data.connectionSecretRef,storage_secret_ref:data.storageSecretRef??null,
  vector_secret_ref:data.vectorSecretRef??null,graph_secret_ref:data.graphSecretRef??null,
  capacity_class:data.capacityClass??null,status:"active"
 },{onConflict:"data_plane_key"});if(error)throw new Error(error.message);return{ok:true};
});

export const bindTenantDataPlane=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;dataPlaneKey:string})=>z.object({tenantId:z.string().uuid(),dataPlaneKey:z.string().min(3).max(80)}).parse(i))
.handler(async({context,data})=>{
 await requirePlatformAdmin(context);const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:plane}=await admin.from("platform_data_planes").select("data_plane_key,status").eq("data_plane_key",data.dataPlaneKey).eq("status","active").maybeSingle();
 if(!plane)throw new Error("Active data plane not found");
 const{error}=await admin.from("tenant_data_plane_bindings").upsert({
  tenant_id:data.tenantId,data_plane_key:data.dataPlaneKey,status:"active",bound_at:new Date().toISOString()
 },{onConflict:"tenant_id"});if(error)throw new Error(error.message);
 await admin.from("audit_log").insert({tenant_id:data.tenantId,actor:context.userId,action:"platform.data_plane.bound",entity:"tenant",entity_id:data.tenantId,payload:{dataPlaneKey:data.dataPlaneKey}});
 return{ok:true};
});
