import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

export const globalSearch=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{query:string;entityTypes?:string[];limit?:number;offset?:number})=>
 scope.extend({query:z.string().trim().min(1).max(500),entityTypes:z.array(z.string().max(120)).max(50).optional(),limit:z.number().int().min(1).max(100).default(25),offset:z.number().int().min(0).max(10000).default(0)}).parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{...data,moduleKey:"search.core"});
 const db=context.supabase as any;const{data:rows,error}=await db.rpc("search_platform_documents",{
  _tenant:data.tenantId,_query:data.query,_tenant_product:data.tenantProductId,
  _entity_types:data.entityTypes??null,_limit:data.limit,_offset:data.offset
 });
 if(error)throw new Error(error.message);return rows??[];
});

const index=z.object({
 tenantId:z.string().uuid(),tenantProductId:z.string().uuid().optional().nullable(),
 productKey:z.string().min(1).max(80),entityType:z.string().min(1).max(120),entityId:z.string().min(1).max(240),
 title:z.string().min(1).max(500),body:z.string().max(50000).optional().nullable(),
 keywords:z.array(z.string().max(100)).max(200).default([]),locale:z.string().max(20).optional().nullable(),
 sourceRevision:z.string().max(200).optional().nullable(),
 metadata:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).default({})
});
export const indexSearchDocument=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof index>)=>index.parse(i))
.handler(async({context,data})=>{
 const tenantProductId=data.tenantProductId;
 if(!tenantProductId)throw new Error("Tenant product scope required");
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId,moduleKey:"search.core"});
 requireWritableTenantRole(access.role);const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:row,error}=await admin.from("platform_search_documents").upsert({
  tenant_id:data.tenantId,tenant_product_id:tenantProductId,product_key:data.productKey,
  entity_type:data.entityType,entity_id:data.entityId,title:data.title,body:data.body??null,
  keywords:data.keywords,locale:data.locale??null,source_revision:data.sourceRevision??null,
  metadata:data.metadata,updated_at:new Date().toISOString()
 },{onConflict:"tenant_id,product_key,entity_type,entity_id"}).select("id").single();
 if(error||!row)throw new Error(error?.message??"Search document could not be indexed");return row;
});
