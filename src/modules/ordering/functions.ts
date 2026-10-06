import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});
const line=z.object({itemRef:z.string().min(1).max(200),quantity:z.number().positive().max(1000),optionRefs:z.array(z.string().max(200)).max(100).default([]),notes:z.string().max(1000).optional().nullable()});

const createSchema=scope.extend({
  productKey:z.string().min(1).max(80),
  locationId:z.string().uuid().optional().nullable(),
  channel:z.enum(["web","app","whatsapp","phone","kiosk","pos","marketplace","api"]),
  customerRef:z.string().max(200).optional().nullable(),
  currency:z.string().regex(/^[A-Z]{3}$/),
  lines:z.array(line).min(1).max(200),
  fulfilment:z.enum(["collection","delivery","dine_in","service"]),
  requestedAt:z.string().datetime().optional().nullable(),
  deliveryAddress:z.record(z.string(),z.unknown()).optional().nullable(),
  tableRef:z.string().max(160).optional().nullable(),
  idempotencyKey:z.string().min(8).max(160),
  metadata:z.record(z.string(),z.unknown()).default({}),
});

export const createOrderIntent=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof createSchema>)=>createSchema.parse(input))
.handler(async({context,data})=>{
  const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"ordering.core"});
  requireWritableTenantRole(access.role);
  const db=context.supabase as any;
  const{data:tp}=await db.from("tenant_products").select("id,product_key,status")
    .eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle();
  if(!tp||tp.status!=="active"||tp.product_key!==data.productKey)throw new Error("Active tenant product mismatch");
  if(data.locationId){
    const{data:location}=await db.from("tenant_locations").select("id").eq("id",data.locationId)
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).eq("status","active").maybeSingle();
    if(!location)throw new Error("Active location not found");
  }
  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,location_id:data.locationId??null,
    product_key:data.productKey,channel:data.channel,customer_ref:data.customerRef??null,currency:data.currency,
    lines:data.lines,fulfilment:data.fulfilment,requested_at:data.requestedAt??null,
    delivery_address:data.deliveryAddress??null,table_ref:data.tableRef??null,status:"draft",
    idempotency_key:data.idempotencyKey,metadata:data.metadata
  };
  const{data:existing}=await db.from("ordering_intents").select("*")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).eq("idempotency_key",data.idempotencyKey).maybeSingle();
  if(existing)return existing;
  const{data:row,error}=await db.from("ordering_intents").insert(values).select("*").single();
  if(error||!row)throw new Error(error?.message??"Order intent could not be created");
  return row;
});

export const listOrderIntents=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>&{locationId?:string|null;status?:string|null})=>scope.extend({locationId:z.string().uuid().optional().nullable(),status:z.string().max(40).optional().nullable()}).parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"ordering.core"});
  const db=context.supabase as any;let q=db.from("ordering_intents").select("*")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .order("created_at",{ascending:false}).limit(500);
  if(data.locationId)q=q.eq("location_id",data.locationId);
  if(data.status)q=q.eq("status",data.status);
  const{data:rows,error}=await q;if(error)throw new Error(error.message);return rows??[];
});
