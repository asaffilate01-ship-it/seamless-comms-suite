import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

export const listPracticeClients=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{...data,moduleKey:"practice.core"});
  const db=context.supabase as any;
  const{data:rows,error}=await db.from("practice_clients")
    .select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .order("legal_name").limit(1000);
  if(error)throw new Error(error.message);
  return rows??[];
});

const createClientSchema=scope.extend({
  legalName:z.string().trim().min(2).max(240),
  clientKind:z.enum(["individual","sole_trader","partnership","company","trust","charity","other"]),
  countryCode:z.string().length(2),
  crmPersonId:z.string().uuid().optional().nullable(),
  crmCompanyId:z.string().uuid().optional().nullable(),
  primaryContactRef:z.string().max(200).optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).default({}),
});

export const createPracticeClient=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof createClientSchema>)=>createClientSchema.parse(input))
.handler(async({context,data})=>{
  const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"practice.core"});
  requireWritableTenantRole(access.role);
  const db=context.supabase as any;
  for (const [table,id] of [["crm_companies",data.crmCompanyId],["crm_people",data.crmPersonId]] as const) {
    if (!id) continue;
    const {data:linked,error:linkedError}=await db.from(table).select("id").eq("id",id).eq("tenant_id",data.tenantId).maybeSingle();
    if(linkedError||!linked)throw new Error("CRM record outside workspace");
  }
  const{data:row,error}=await db.from("practice_clients").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,
    crm_person_id:data.crmPersonId??null,crm_company_id:data.crmCompanyId??null,
    legal_name:data.legalName,client_kind:data.clientKind,country_code:data.countryCode.toUpperCase(),
    status:"onboarding",primary_contact_ref:data.primaryContactRef??null,owner_user_id:context.userId,
    metadata:data.metadata
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Practice client could not be created");
  return row;
});

const engagementSchema=scope.extend({
  clientId:z.string().uuid(),
  serviceKey:z.string().min(1).max(160),
  periodKey:z.string().max(80).optional().nullable(),
  dueAt:z.string().datetime().optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).default({}),
});

export const createPracticeEngagement=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof engagementSchema>)=>engagementSchema.parse(input))
.handler(async({context,data})=>{
  const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"practice.core"});
  requireWritableTenantRole(access.role);
  const db=context.supabase as any;
  const{data:client}=await db.from("practice_clients").select("id")
    .eq("id",data.clientId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle();
  if(!client)throw new Error("Practice client not found");
  const{data:row,error}=await db.from("practice_engagements").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,client_id:data.clientId,
    service_key:data.serviceKey,period_key:data.periodKey??null,status:"collecting",
    assigned_user_ids:[context.userId],reviewer_user_ids:[],due_at:data.dueAt??null,progress:5,metadata:data.metadata
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Engagement could not be created");
  return row;
});

export const listPracticeDeadlines=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>&{until?:string})=>scope.extend({until:z.string().datetime().optional()}).parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"practice.core"});
  const db=context.supabase as any;
  let q=db.from("practice_deadlines").select("*,client:practice_clients(legal_name),engagement:practice_engagements(service_key,period_key)")
    .eq("tenant_id",data.tenantId).neq("status","completed").order("due_at").limit(1000);
  if(data.until)q=q.lte("due_at",data.until);
  const{data:rows,error}=await q;if(error)throw new Error(error.message);return rows??[];
});
