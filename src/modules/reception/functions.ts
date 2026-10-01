import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole, requireAdminTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});
const phone=z.string().regex(/^\+[1-9][0-9]{6,14}$/);

async function productKey(db:any,tenantId:string,tenantProductId:string){
  const{data:tp,error}=await db.from("tenant_products").select("product_key,status")
    .eq("id",tenantProductId).eq("tenant_id",tenantId).maybeSingle();
  if(error||!tp||tp.status!=="active")throw new Error("Active tenant product required");
  return String(tp.product_key);
}

async function emit(db:any,input:{
  tenantId:string;tenantProductId:string;productKey:string;type:string;
  requestId:string;payload:Record<string,unknown>;
}){
  const id=randomUUID();
  const{error}=await db.from("platform_events").insert({
    id,tenant_id:input.tenantId,tenant_product_id:input.tenantProductId,product_key:input.productKey,
    event_type:input.type,event_version:1,occurred_at:new Date().toISOString(),environment:"production",
    subject_type:"reception_request",subject_id:input.requestId,
    correlation_id:input.requestId,causation_id:null,idempotency_key:input.type+":"+input.requestId+":"+id,
    data_classification:"confidential",payload:input.payload
  });
  if(error)throw new Error(error.message);
}

const settingsSchema=scope.extend({
  locationId:z.string().uuid().optional().nullable(),enabled:z.boolean(),
  instructions:z.string().max(12000).default(""),businessHours:z.record(z.string(),z.unknown()).default({}),
  escalationUserId:z.string().uuid().optional().nullable(),escalationPhone:phone.optional().nullable(),
  defaultLocale:z.string().max(20).optional().nullable(),allowAiDrafting:z.boolean().default(true),
  allowOrderIntake:z.boolean().default(false),allowBookingIntake:z.boolean().default(false),
  config:z.record(z.string(),z.unknown()).default({})
});
export const upsertReceptionSettings=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof settingsSchema>)=>settingsSchema.parse(i))
.handler(async({context,data})=>{
  const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"reception.core"});
  requireAdminTenantRole(access.role);const db=context.supabase as any;
  if(data.locationId){
    const{data:loc}=await db.from("tenant_locations").select("id").eq("id",data.locationId)
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle();
    if(!loc)throw new Error("Location not found");
  }
  if(data.escalationUserId){
    const{data:m}=await db.from("tenant_members").select("user_id").eq("tenant_id",data.tenantId)
      .eq("user_id",data.escalationUserId).maybeSingle();
    if(!m)throw new Error("Escalation user must be a current tenant member");
  }
  const{data:existing}=await db.from("reception_settings").select("id")
    .eq("tenant_product_id",data.tenantProductId).eq("location_id",data.locationId??null).maybeSingle();
  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,location_id:data.locationId??null,
    enabled:data.enabled,instructions:data.instructions,business_hours:data.businessHours,
    escalation_user_id:data.escalationUserId??null,escalation_phone:data.escalationPhone??null,
    default_locale:data.defaultLocale??null,allow_ai_drafting:data.allowAiDrafting,
    allow_order_intake:data.allowOrderIntake,allow_booking_intake:data.allowBookingIntake,config:data.config
  };
  const result=existing?.id
    ?await db.from("reception_settings").update(values).eq("id",existing.id).select("*").single()
    :await db.from("reception_settings").insert(values).select("*").single();
  if(result.error||!result.data)throw new Error(result.error?.message??"Reception settings could not be saved");
  return result.data;
});

export const getReceptionWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{locationId?:string|null;status?:string|null;kind?:string|null})=>
  scope.extend({
    locationId:z.string().uuid().optional().nullable(),
    status:z.enum(["new","queued","accepted","confirmed","delivered","failed","handled","cancelled"]).optional().nullable(),
    kind:z.enum(["message","order","booking"]).optional().nullable()
  }).parse(i))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"reception.core"});
  const db=context.supabase as any;
  const[{data:settings,error:settingsError}]=await Promise.all([
    db.from("reception_settings").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .order("location_id",{ascending:true,nullsFirst:true})
  ]);
  if(settingsError)throw new Error(settingsError.message);
  let q=db.from("reception_requests").select("*").eq("tenant_id",data.tenantId)
    .eq("tenant_product_id",data.tenantProductId).order("created_at",{ascending:false}).limit(1000);
  if(data.locationId)q=q.eq("location_id",data.locationId);
  if(data.status)q=q.eq("status",data.status);
  if(data.kind)q=q.eq("kind",data.kind);
  const{data:requests,error}=await q;if(error)throw new Error(error.message);
  return{settings:settings??[],requests:requests??[]};
});

export const lookupReceptionCaller=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{phone:string})=>scope.extend({phone}).parse(i))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"reception.core"});
  const db=context.supabase as any;
  const{data:people,error}=await db.from("crm_people")
    .select("id,display_name,first_name,last_name,email,phone_e164,company_id,lifecycle_stage,source_product_key,external_ref")
    .eq("tenant_id",data.tenantId).eq("phone_e164",data.phone).limit(20);
  if(error)throw new Error(error.message);
  return{status:(people??[]).length===0?"unknown":(people??[]).length===1?"matched":"ambiguous",phone:data.phone,matches:people??[],identityVerified:false};
});

const receiveSchema=scope.extend({
  locationId:z.string().uuid().optional().nullable(),kind:z.enum(["message","order","booking"]),
  channel:z.enum(["phone","whatsapp","web","app","manual","api"]),
  crmPersonId:z.string().uuid().optional().nullable(),callerNumber:phone.optional().nullable(),
  customerName:z.string().trim().min(1).max(200),contact:z.string().max(300).optional().nullable(),
  summary:z.string().trim().min(1).max(12000),externalKey:z.string().min(8).max(160),
  humanHandlerId:z.string().uuid().optional().nullable(),preferredHandlerId:z.string().uuid().optional().nullable(),
  handoffNote:z.string().max(4000).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const createReceptionRequest=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof receiveSchema>)=>receiveSchema.parse(i))
.handler(async({context,data})=>{
  const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"reception.core"});
  requireWritableTenantRole(access.role);const db=context.supabase as any;
  const key=await productKey(db,data.tenantId,data.tenantProductId);
  const{data:setting}=await db.from("reception_settings").select("*")
    .eq("tenant_product_id",data.tenantProductId).eq("location_id",data.locationId??null).eq("enabled",true).maybeSingle();
  let effective=setting;
  if(!effective&&data.locationId){
    const{data:fallback}=await db.from("reception_settings").select("*")
      .eq("tenant_product_id",data.tenantProductId).is("location_id",null).eq("enabled",true).maybeSingle();
    effective=fallback;
  }
  if(!effective)throw new Error("Reception is not enabled for this product/location");
  if(data.kind==="order"&&!effective.allow_order_intake)throw new Error("Order intake is not enabled");
  if(data.kind==="booking"&&!effective.allow_booking_intake)throw new Error("Booking intake is not enabled");
  if(data.crmPersonId){
    const{data:p}=await db.from("crm_people").select("id,phone_e164,display_name").eq("id",data.crmPersonId).eq("tenant_id",data.tenantId).maybeSingle();
    if(!p)throw new Error("CRM customer not found");
    if(data.callerNumber&&p.phone_e164&&p.phone_e164!==data.callerNumber)throw new Error("Caller number does not match selected CRM customer");
  }
  for(const userId of [data.humanHandlerId,data.preferredHandlerId].filter(Boolean)){
    const{data:m}=await db.from("tenant_members").select("user_id").eq("tenant_id",data.tenantId).eq("user_id",userId).maybeSingle();
    if(!m)throw new Error("Reception handler must be a current tenant member");
  }
  const{data:existing}=await db.from("reception_requests").select("*").eq("tenant_id",data.tenantId)
    .eq("tenant_product_id",data.tenantProductId).eq("external_key",data.externalKey).maybeSingle();
  if(existing)return existing;
  const{data:row,error}=await db.from("reception_requests").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,location_id:data.locationId??null,
    kind:data.kind,channel:data.channel,crm_person_id:data.crmPersonId??null,caller_number:data.callerNumber??null,
    customer_name:data.customerName,contact:data.contact??null,summary:data.summary,status:"new",
    human_handler_id:data.humanHandlerId??context.userId,preferred_handler_id:data.preferredHandlerId??null,
    handoff_note:data.handoffNote??null,receipt:{},external_key:data.externalKey,metadata:data.metadata
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Reception request could not be created");
  await emit(db,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,productKey:key,type:"reception.received",requestId:row.id,payload:{kind:data.kind,channel:data.channel,locationId:data.locationId??null}});
  return row;
});

export const releaseReceptionRequest=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{requestId:string;revision:number})=>
  scope.extend({requestId:z.string().uuid(),revision:z.number().int().positive()}).parse(i))
.handler(async({context,data})=>{
  const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"reception.core"});
  requireWritableTenantRole(access.role);const db=context.supabase as any;
  const key=await productKey(db,data.tenantId,data.tenantProductId);
  const{data:row,error}=await db.from("reception_requests").update({
    status:"queued",revision:data.revision+1,human_handler_id:context.userId
  }).eq("id",data.requestId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("revision",data.revision).in("status",["new","failed"]).select("*").single();
  if(error||!row)throw new Error("Reception request changed or cannot be released");
  await emit(db,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,productKey:key,type:"reception.queued",requestId:row.id,payload:{kind:row.kind,locationId:row.location_id}});
  return row;
});

export const closeReceptionRequest=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{requestId:string;revision:number;action:"handled"|"cancelled";note?:string|null})=>
  scope.extend({requestId:z.string().uuid(),revision:z.number().int().positive(),action:z.enum(["handled","cancelled"]),note:z.string().max(4000).optional().nullable()}).parse(i))
.handler(async({context,data})=>{
  const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"reception.core"});
  requireWritableTenantRole(access.role);const db=context.supabase as any;
  const{data:current}=await db.from("reception_requests").select("id,kind,status").eq("id",data.requestId)
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle();
  if(!current)throw new Error("Reception request not found");
  if(data.action==="handled"&&current.kind!=="message")throw new Error("Orders/bookings require source-system confirmation");
  if(!["new","failed"].includes(current.status))throw new Error("Only new/failed requests can be closed manually");
  const{data:row,error}=await db.from("reception_requests").update({
    status:data.action,revision:data.revision+1,human_handler_id:context.userId,
    handoff_note:data.note??null
  }).eq("id",data.requestId).eq("revision",data.revision).select("*").single();
  if(error||!row)throw new Error("Reception request changed; refresh and retry");
  return row;
});
