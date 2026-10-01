import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

export const listBookingServices=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>)=>scope.parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{...data,moduleKey:"bookings.core"});
 const db=context.supabase as any;const{data:rows,error}=await db.from("booking_services").select("*")
  .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).eq("active",true).order("name");
 if(error)throw new Error(error.message);return rows??[];
});

const serviceSchema=scope.extend({
 externalRef:z.string().max(200).optional().nullable(),name:z.string().min(1).max(200),
 durationMinutes:z.number().int().min(1).max(24*60),bufferBeforeMinutes:z.number().int().min(0).max(1440).default(0),
 bufferAfterMinutes:z.number().int().min(0).max(1440).default(0),capacity:z.number().int().min(1).max(100000).default(1),
 currency:z.string().regex(/^[A-Z]{3}$/).optional().nullable(),priceMinor:z.number().int().nonnegative().optional().nullable(),
 metadata:z.record(z.string(),z.unknown()).default({})
});
export const upsertBookingService=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof serviceSchema>)=>serviceSchema.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"bookings.core"});
 requireWritableTenantRole(access.role);const db=context.supabase as any;
 const values={tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,external_ref:data.externalRef??null,
  name:data.name,duration_minutes:data.durationMinutes,buffer_before_minutes:data.bufferBeforeMinutes,
  buffer_after_minutes:data.bufferAfterMinutes,capacity:data.capacity,currency:data.currency??null,
  price_minor:data.priceMinor??null,active:true,metadata:data.metadata};
 let result;
 if(data.externalRef){
  const{data:existing}=await db.from("booking_services").select("id").eq("tenant_id",data.tenantId)
   .eq("tenant_product_id",data.tenantProductId).eq("external_ref",data.externalRef).maybeSingle();
  result=existing?.id?await db.from("booking_services").update(values).eq("id",existing.id).select("*").single()
   :await db.from("booking_services").insert(values).select("*").single();
 }else result=await db.from("booking_services").insert(values).select("*").single();
 if(result.error||!result.data)throw new Error(result.error?.message??"Booking service could not be saved");return result.data;
});

const resourceSchema=scope.extend({
 locationId:z.string().uuid().optional().nullable(),externalRef:z.string().max(200).optional().nullable(),
 name:z.string().min(1).max(200),kind:z.enum(["person","room","table","vehicle","equipment","capacity_pool","virtual"]),
 capacity:z.number().int().min(1).max(100000).default(1),skills:z.array(z.string().max(120)).max(100).default([]),
 metadata:z.record(z.string(),z.unknown()).default({})
});
export const upsertBookingResource=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof resourceSchema>)=>resourceSchema.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"bookings.core"});
 requireWritableTenantRole(access.role);const db=context.supabase as any;
 const values={tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,location_id:data.locationId??null,
  external_ref:data.externalRef??null,name:data.name,resource_kind:data.kind,capacity:data.capacity,
  skills:data.skills,active:true,metadata:data.metadata};
 let result;
 if(data.externalRef){
  const{data:existing}=await db.from("booking_resources").select("id").eq("tenant_id",data.tenantId)
   .eq("tenant_product_id",data.tenantProductId).eq("external_ref",data.externalRef).maybeSingle();
  result=existing?.id?await db.from("booking_resources").update(values).eq("id",existing.id).select("*").single()
   :await db.from("booking_resources").insert(values).select("*").single();
 }else result=await db.from("booking_resources").insert(values).select("*").single();
 if(result.error||!result.data)throw new Error(result.error?.message??"Booking resource could not be saved");return result.data;
});

const bookingSchema=scope.extend({
 serviceId:z.string().uuid(),resourceId:z.string().uuid().optional().nullable(),locationId:z.string().uuid().optional().nullable(),
 customerRef:z.string().max(200).optional().nullable(),startsAt:z.string().datetime(),endsAt:z.string().datetime(),
 timezone:z.string().min(1).max(80),partySize:z.number().int().min(1).max(100000),
 channel:z.enum(["web","app","whatsapp","phone","staff","marketplace","api"]),
 idempotencyKey:z.string().min(8).max(160),status:z.enum(["hold","confirmed"]).default("hold"),
 holdExpiresAt:z.string().datetime().optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const createBooking=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof bookingSchema>)=>bookingSchema.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"bookings.core"});
 requireWritableTenantRole(access.role);const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:id,error}=await admin.rpc("create_booking_slot",{
  _tenant:data.tenantId,_tenant_product:data.tenantProductId,_service:data.serviceId,_resource:data.resourceId??null,
  _location:data.locationId??null,_customer_ref:data.customerRef??null,_starts_at:data.startsAt,_ends_at:data.endsAt,
  _timezone:data.timezone,_party_size:data.partySize,_channel:data.channel,_idempotency_key:data.idempotencyKey,
  _status:data.status,_hold_expires_at:data.holdExpiresAt??null,_metadata:data.metadata
 });
 if(error||!id)throw new Error(error?.message??"Booking could not be created");return{id};
});
