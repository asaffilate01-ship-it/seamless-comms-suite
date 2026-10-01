import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requirePracticeAdmin(context:any,tenantId:string){
  const db=context.supabase as any;
  const{data:m}=await db.from("tenant_members").select("role")
    .eq("tenant_id",tenantId).eq("user_id",context.userId).maybeSingle();
  if(!m||!["owner","admin"].includes(m.role))throw new Error("Practice owner/admin access required");
}

const serviceSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  moduleKey:z.enum(["accounting_ai.core","tax_intelligence.core"]),
  enabled:z.boolean(),commercialMode:z.enum(["included","free","fixed_monthly","fixed_annual","usage","custom"]),
  priceMinor:z.number().int().nonnegative().optional().nullable(),
  currency:z.string().regex(/^[A-Z]{3}$/).optional().nullable(),
  billingReference:z.string().max(200).optional().nullable(),
  startsAt:z.string().datetime().optional(),endsAt:z.string().datetime().optional().nullable(),
  config:z.record(z.string(),z.unknown()).default({})
});

export const setPracticeClientService=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof serviceSchema>)=>serviceSchema.parse(i))
.handler(async({context,data})=>{
  await requirePracticeAdmin(context,data.tenantId);
  if(["fixed_monthly","fixed_annual","usage"].includes(data.commercialMode)&&data.priceMinor===null){
    throw new Error("A price is required for the selected charging mode");
  }
  if(data.priceMinor!==null&&data.priceMinor!==undefined&&!data.currency)throw new Error("Currency is required when a price is set");
  const db=context.supabase as any;
  const{data:client}=await db.from("practice_clients").select("id").eq("id",data.practiceClientId)
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle();
  if(!client)throw new Error("Practice client not found");
  const{data:grant}=await db.from("tenant_module_entitlements").select("enabled")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("module_key",data.moduleKey).eq("enabled",true).maybeSingle();
  if(data.enabled&&!grant)throw new Error("Practice tenant must enable this Omniqora add-on first");
  const{data:row,error}=await db.from("practice_client_services").upsert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,practice_client_id:data.practiceClientId,
    module_key:data.moduleKey,enabled:data.enabled,commercial_mode:data.commercialMode,
    price_minor:data.priceMinor??null,currency:data.currency??null,billing_reference:data.billingReference??null,
    starts_at:data.startsAt??new Date().toISOString(),ends_at:data.endsAt??null,config:data.config
  },{onConflict:"practice_client_id,module_key"}).select("*").single();
  if(error||!row)throw new Error(error?.message??"Client service could not be saved");
  return row;
});

export const listPracticeClientServices=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;practiceClientId:string})=>z.object({
  tenantId:z.string().uuid(),practiceClientId:z.string().uuid()
}).parse(i))
.handler(async({context,data})=>{
  const db=context.supabase as any;
  const{data:m}=await db.from("tenant_members").select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
  if(!m)throw new Error("Practice access required");
  const{data:rows,error}=await db.from("practice_client_services").select("*")
    .eq("tenant_id",data.tenantId).eq("practice_client_id",data.practiceClientId).order("module_key");
  if(error)throw new Error(error.message);return rows??[];
});

export const addPracticeClientPortalUser=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;practiceClientId:string;userId:string;role:"client_owner"|"client_user"|"client_viewer"})=>
  z.object({tenantId:z.string().uuid(),practiceClientId:z.string().uuid(),userId:z.string().uuid(),
    role:z.enum(["client_owner","client_user","client_viewer"])}).parse(i))
.handler(async({context,data})=>{
  await requirePracticeAdmin(context,data.tenantId);
  const db=context.supabase as any;
  const{data:client}=await db.from("practice_clients").select("id").eq("id",data.practiceClientId).eq("tenant_id",data.tenantId).maybeSingle();
  if(!client)throw new Error("Practice client not found");
  const{data:row,error}=await db.from("practice_client_users").upsert({
    tenant_id:data.tenantId,practice_client_id:data.practiceClientId,user_id:data.userId,
    portal_role:data.role,status:"active"
  },{onConflict:"practice_client_id,user_id"}).select("*").single();
  if(error||!row)throw new Error(error?.message??"Client portal user could not be added");return row;
});


const chargeSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  serviceId:z.string().uuid(),periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity:z.number().nonnegative().default(1),customTotalMinor:z.number().int().nonnegative().optional().nullable()
});

export const generatePracticeClientServiceCharge=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof chargeSchema>)=>chargeSchema.parse(i))
.handler(async({context,data})=>{
  await requirePracticeAdmin(context,data.tenantId);
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:service}=await admin.from("practice_client_services")
    .select("id,tenant_product_id,practice_client_id,enabled")
    .eq("id",data.serviceId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("practice_client_id",data.practiceClientId).maybeSingle();
  if(!service||!service.enabled)throw new Error("Active client add-on service not found");
  const{data:id,error}=await admin.rpc("create_practice_client_service_charge",{
    _tenant:data.tenantId,_service:data.serviceId,_period_start:data.periodStart,_period_end:data.periodEnd,
    _quantity:data.quantity,_custom_total:data.customTotalMinor??null,_actor:context.userId
  });
  if(error||!id)throw new Error(error?.message??"Client service charge could not be generated");
  const{data:row}=await admin.from("practice_client_service_charges").select("*").eq("id",id).maybeSingle();
  return row??{id};
});

export const listPracticeClientServiceCharges=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;tenantProductId:string;practiceClientId:string;status?:string|null})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  status:z.enum(["pending","waived","invoiced","paid","cancelled"]).optional().nullable()
}).parse(i))
.handler(async({context,data})=>{
  await requirePracticeAdmin(context,data.tenantId);
  const db=context.supabase as any;
  let q=db.from("practice_client_service_charges")
    .select("*,service:practice_client_services(id,module_key,commercial_mode,price_minor,currency,billing_reference)")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("practice_client_id",data.practiceClientId).order("period_start",{ascending:false}).limit(1000);
  if(data.status)q=q.eq("status",data.status);
  const{data:rows,error}=await q;if(error)throw new Error(error.message);return rows??[];
});

export const updatePracticeClientServiceCharge=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;tenantProductId:string;practiceClientId:string;chargeId:string;status:"waived"|"invoiced"|"paid"|"cancelled";invoiceRef?:string|null})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  chargeId:z.string().uuid(),status:z.enum(["waived","invoiced","paid","cancelled"]),
  invoiceRef:z.string().max(240).optional().nullable()
}).parse(i))
.handler(async({context,data})=>{
  await requirePracticeAdmin(context,data.tenantId);
  if(data.status==="invoiced"&&!data.invoiceRef)throw new Error("Invoice reference is required when marking a charge invoiced");
  const db=context.supabase as any;
  const{data:row,error}=await db.from("practice_client_service_charges").update({
    status:data.status,invoice_ref:data.invoiceRef??null
  }).eq("id",data.chargeId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("practice_client_id",data.practiceClientId).select("*").single();
  if(error||!row)throw new Error(error?.message??"Client service charge could not be updated");
  return row;
});
