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

const moduleCatalogueSchema=z.object({
  productKey:z.string().min(1).max(80),
  tenantProductId:z.string().uuid().optional().nullable(),
});

export const listProductModuleCatalogue=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof moduleCatalogueSchema>)=>moduleCatalogueSchema.parse(input))
.handler(async({context,data})=>{
  const db=context.supabase as any;
  const[{data:product,error:productError},{data:modules,error:moduleError}]=await Promise.all([
    db.from("platform_products").select("product_key,parent_product_key,kind").eq("product_key",data.productKey).maybeSingle(),
    db.from("platform_modules").select("module_key,name,module_kind,version,status,ui_mode,dependencies,capabilities").neq("status","retired"),
  ]);
  if(productError||!product)throw new Error("Product not found");
  if(moduleError)throw new Error(moduleError.message);

  const keys=[product.parent_product_key,data.productKey].filter(Boolean) as string[];
  const{data:availability,error:availabilityError}=await db.from("product_module_defaults")
    .select("product_key,module_key,enabled_by_default,config").in("product_key",keys);
  if(availabilityError)throw new Error(availabilityError.message);

  const byKey=new Map<string,any>();
  for(const row of availability??[]){
    const prior=byKey.get(row.module_key);
    if(!prior||row.product_key===data.productKey){
      byKey.set(row.module_key,{
        module_key:row.module_key,
        enabled_by_default:!!row.enabled_by_default,
        config:row.config??{},
        sourceProductKey:row.product_key,
        inherited:row.product_key!==data.productKey,
      });
    }else if(prior&&row.enabled_by_default){
      prior.enabled_by_default=true;
    }
  }

  const moduleByKey=new Map((modules??[]).map((row:any)=>[row.module_key,row]));
  let grants:any[]=[];

  if(data.tenantProductId){
    const{data:tp,error:tpError}=await db.from("tenant_products")
      .select("tenant_id,product_key,region_key").eq("id",data.tenantProductId).maybeSingle();
    if(tpError||!tp||tp.product_key!==data.productKey)throw new Error("Tenant product not found");

    const{data:membership}=await db.from("tenant_members").select("role")
      .eq("tenant_id",tp.tenant_id).eq("user_id",context.userId).maybeSingle();
    const{data:platformOperator}=await db.from("platform_operators").select("role,status")
      .eq("user_id",context.userId).maybeSingle();
    const{data:familyOperator,error:familyOperatorError}=await db.rpc("is_product_operator",{
      _product:data.productKey,_user:context.userId,_roles:null,_region:tp.region_key
    });
    if(familyOperatorError)throw new Error(familyOperatorError.message);

    const platformAllowed=platformOperator?.status==="active";
    if(!membership&&!platformAllowed&&familyOperator!==true)throw new Error("Tenant/product access required");

    const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
    const{data:grantRows,error:grantError}=await admin.from("tenant_module_entitlements")
      .select("module_key,enabled,limits,config,starts_at,ends_at,source")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",data.tenantProductId);
    if(grantError)throw new Error(grantError.message);
    grants=grantRows??[];
  }

  const grantByKey=new Map(grants.map((row:any)=>[row.module_key,row]));
  return[...byKey.values()].map((row:any)=>{
    const module=moduleByKey.get(row.module_key) as Record<string,unknown>|undefined;
    if(!module)return null;
    return{
      ...module,
      available:true,
      defaultOn:!!row.enabled_by_default,
      defaultConfig:row.config??{},
      inherited:!!row.inherited,
      sourceProductKey:row.sourceProductKey,
      entitlement:grantByKey.get(row.module_key)??null,
    };
  }).filter((row:any)=>row!==null).sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name)));
});
