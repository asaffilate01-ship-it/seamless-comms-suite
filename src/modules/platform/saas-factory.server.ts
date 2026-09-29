import { z } from "zod";

const requestSchema=z.object({tenantId:z.string().uuid(),productKey:z.string().min(1).max(80),regionPackKey:z.string().min(2).max(16),locale:z.string().min(2).max(20),planKey:z.string().max(80).optional().nullable(),requestedModules:z.array(z.string().max(160)).max(100).optional(),locations:z.array(z.object({key:z.string().min(1).max(120),name:z.string().min(1).max(200),countryCode:z.string().max(3).optional().nullable(),locale:z.string().max(20).optional().nullable(),timeZone:z.string().max(80).optional().nullable()})).max(500).optional(),domains:z.array(z.object({hostname:z.string().min(3).max(253),purpose:z.enum(["marketing","app","api","tracking","assets","auth","other"]),primary:z.boolean().optional()})).max(50).optional()});
export type DatabaseProvisionRequest=z.infer<typeof requestSchema>;

export async function buildProvisioningPlanFromDatabase(db:any,input:unknown){
 const request=requestSchema.parse(input);
 const [productRes,blueprintRes,regionRes,modulesRes]=await Promise.all([
  db.from("platform_products").select("product_key,name,status").eq("product_key",request.productKey).eq("status","active").maybeSingle(),
  db.from("active_platform_product_blueprints").select("*").eq("product_key",request.productKey).maybeSingle(),
  db.from("platform_region_packs").select("*").eq("region_key",request.regionPackKey).maybeSingle(),
  db.from("platform_modules").select("module_key,dependencies,status"),
 ]);
 if(productRes.error||!productRes.data)throw new Error("Active product not found");
 if(regionRes.error||!regionRes.data)throw new Error("Region pack not found");
 if(modulesRes.error)throw new Error(modulesRes.error.message);
 const blueprint=blueprintRes.data;
 const defaults=blueprint?.module_keys??(await db.from("product_module_defaults").select("module_key").eq("product_key",request.productKey).eq("enabled_by_default",true)).data?.map((x:any)=>x.module_key)??[];
 const regions=blueprint?.region_keys??[];const locales=blueprint?.locale_keys??regionRes.data.supported_locales??[];
 if(regions.length&&!regions.includes(request.regionPackKey))throw new Error("Product does not support the selected region");
 if(locales.length&&!locales.includes(request.locale))throw new Error("Product does not support the selected locale");
 const catalogue=new Map<string,{module_key:string;dependencies:string[];status:string}>((modulesRes.data??[]).map((m:any)=>[m.module_key,{module_key:m.module_key,dependencies:Array.isArray(m.dependencies)?m.dependencies:[],status:String(m.status)}]));const resolved=new Set<string>();const visiting=new Set<string>();
 function add(key:string){if(resolved.has(key))return;if(visiting.has(key))throw new Error("Circular module dependency: "+key);const mod=catalogue.get(key);if(!mod||mod.status==="retired")throw new Error("Unavailable module: "+key);visiting.add(key);for(const dep of mod.dependencies??[])add(dep);visiting.delete(key);resolved.add(key);}
 for(const key of [...defaults,...(request.requestedModules??[])])add(key);
 const steps:any[]=[{kind:"tenant_product",productKey:request.productKey,regionPackKey:request.regionPackKey,planKey:request.planKey??null},...[...resolved].map((moduleKey)=>({kind:"module",moduleKey}))];
 const tz=regionRes.data.time_zones?.[0]??"UTC";for(const l of request.locations??[])steps.push({kind:"location",key:l.key,name:l.name,countryCode:l.countryCode??regionRes.data.country_code,locale:l.locale??request.locale,timeZone:l.timeZone??tz});for(const d of request.domains??[])steps.push({kind:"domain",hostname:d.hostname.toLowerCase(),purpose:d.purpose,primary:d.primary??false});
 return{tenantId:request.tenantId,productKey:request.productKey,regionPackKey:request.regionPackKey,locale:request.locale,planKey:request.planKey??null,blueprintVersion:blueprint?.version??null,modules:[...resolved],steps,warnings:[...(request.locations?.length?[]:["No locations requested; verify this is intentional."]),...(request.domains?.length?[]:["No custom domain requested; platform domain can be used initially."])]};
}