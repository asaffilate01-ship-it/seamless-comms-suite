import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement } from "@/modules/platform/module-access";
import { tenantGeocode,tenantReverseGeocode,tenantRoute } from "./runtime.server";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});
async function region(context:any,data:z.infer<typeof scope>){await requireModuleEntitlement(context,{...data,moduleKey:"geo.core"});const db=context.supabase as any;const{data:tp,error}=await db.from("tenant_products").select("region_key").eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).eq("status","active").single();if(error||!tp)throw new Error("Tenant product scope not found");return tp.region_key as string;}

const address=z.object({line1:z.string().max(240).optional().nullable(),line2:z.string().max(240).optional().nullable(),city:z.string().max(160).optional().nullable(),region:z.string().max(160).optional().nullable(),postalCode:z.string().max(40).optional().nullable(),countryCode:z.string().length(2)});
export const geocodeAddress=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>&{address:z.input<typeof address>})=>scope.extend({address}).parse(input)).handler(async({context,data})=>tenantGeocode({tenantId:data.tenantId,tenantProductId:data.tenantProductId,regionKey:await region(context,data),address:data.address}));

const point=z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)});
export const reverseGeocode=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>&{point:z.input<typeof point>})=>scope.extend({point}).parse(input)).handler(async({context,data})=>tenantReverseGeocode({tenantId:data.tenantId,tenantProductId:data.tenantProductId,regionKey:await region(context,data),point:data.point}));

const routeSchema=scope.extend({origin:point,destination:point,waypoints:z.array(point).max(23).optional(),mode:z.enum(["driving","walking","cycling","truck"]),departAt:z.string().datetime().optional().nullable(),avoid:z.array(z.enum(["tolls","motorways","ferries"])).max(3).optional()});
export const calculateRoute=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof routeSchema>)=>routeSchema.parse(input)).handler(async({context,data})=>tenantRoute({tenantId:data.tenantId,tenantProductId:data.tenantProductId,regionKey:await region(context,data),request:{tenantId:data.tenantId,origin:data.origin,destination:data.destination,waypoints:data.waypoints,mode:data.mode,departAt:data.departAt,avoid:data.avoid}}));