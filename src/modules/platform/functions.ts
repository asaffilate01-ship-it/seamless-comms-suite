import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BUILTIN_PLUGIN_DEFINITIONS } from "./plugins";
import { buildProvisioningPlanFromDatabase } from "./saas-factory.server";

export const getPlatformCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db=context.supabase as any;
    const[products,modules,regions,locales]=await Promise.all([
      db.from("platform_products").select("*").neq("status","retired").order("name"),
      db.from("platform_modules").select("*").neq("status","retired").order("name"),
      db.from("platform_region_packs").select("*").order("country_code"),
      db.from("platform_locale_packs").select("*").neq("status","retired").order("locale_key"),
    ]);
    for(const result of[products,modules,regions,locales])if(result.error)throw new Error(result.error.message);
    return{products:products.data??[],modules:modules.data??[],regions:regions.data??[],locales:locales.data??[],plugins:BUILTIN_PLUGIN_DEFINITIONS};
  });

const planSchema=z.object({
 tenantId:z.string().uuid(),productKey:z.string().min(1).max(80),regionPackKey:z.string().min(2).max(16),locale:z.string().min(2).max(20),
 planKey:z.string().max(80).optional().nullable(),requestedModules:z.array(z.string().min(1).max(160)).max(100).optional(),
 locations:z.array(z.object({key:z.string().min(1).max(120),name:z.string().min(1).max(200),countryCode:z.string().max(3).optional().nullable(),locale:z.string().max(20).optional().nullable(),timeZone:z.string().max(80).optional().nullable()})).max(500).optional(),
 domains:z.array(z.object({hostname:z.string().min(3).max(253),purpose:z.enum(["marketing","app","api","tracking","assets","auth","other"]),primary:z.boolean().optional()})).max(50).optional(),
});

export const planTenantProduct=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof planSchema>)=>planSchema.parse(input))
 .handler(async({context,data})=>{
   const db=context.supabase as any;
   const{data:membership,error}=await db.from("tenant_members").select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
   if(error||!membership||!["owner","admin"].includes(membership.role))throw new Error("Owner or admin tenant access is required");
   return buildProvisioningPlanFromDatabase(db,data);
 });