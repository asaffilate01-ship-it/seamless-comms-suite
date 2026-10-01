import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "@/modules/platform/module-access";

const scopeSchema = z.object({
  tenantId: z.string().uuid(),
  tenantProductId: z.string().uuid(),
});

async function crmScope(context: any, scope: z.infer<typeof scopeSchema>, write = false) {
  const access = await requireModuleEntitlement(context, { ...scope, moduleKey: "crm.core" });
  if (write) requireWritableTenantRole(access.role);
  return access;
}

const personSchema = scopeSchema.extend({
  id: z.string().uuid().optional(),
  companyId: z.string().uuid().optional().nullable(),
  whatsappContactId: z.string().uuid().optional().nullable(),
  displayName: z.string().trim().min(1).max(200),
  firstName: z.string().trim().max(120).optional().nullable(),
  lastName: z.string().trim().max(120).optional().nullable(),
  email: z.string().email().max(320).optional().nullable(),
  phoneE164: z.string().regex(/^\+[1-9][0-9]{6,14}$/).optional().nullable(),
  locale: z.string().max(20).optional().nullable(),
  lifecycleStage: z.enum(["subscriber","lead","contact","prospect","customer","former_customer","partner","supplier"]).default("contact"),
  marketingConsent: z.boolean().default(false),
  sourceProductKey: z.string().max(80).optional().nullable(),
  externalRef: z.string().max(200).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const listCrmPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof scopeSchema>) => scopeSchema.parse(input))
  .handler(async ({ context, data }) => {
    await crmScope(context, data);
    const db = context.supabase as any;
    const { data: rows, error } = await db.from("crm_people")
      .select("id,company_id,whatsapp_contact_id,display_name,first_name,last_name,email,phone_e164,locale,lifecycle_stage,marketing_consent,owner_user_id,source_product_key,external_ref,metadata,created_at,updated_at")
      .eq("tenant_id", data.tenantId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveCrmPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof personSchema>) => personSchema.parse(input))
  .handler(async ({ context, data }) => {
    await crmScope(context, data, true);
    const db = context.supabase as any;
    const values = {
      tenant_id: data.tenantId,
      company_id: data.companyId ?? null,
      whatsapp_contact_id: data.whatsappContactId ?? null,
      display_name: data.displayName,
      first_name: data.firstName ?? null,
      last_name: data.lastName ?? null,
      email: data.email ?? null,
      phone_e164: data.phoneE164 ?? null,
      locale: data.locale ?? null,
      lifecycle_stage: data.lifecycleStage,
      marketing_consent: data.marketingConsent,
      source_product_key: data.sourceProductKey ?? null,
      external_ref: data.externalRef ?? null,
      metadata: data.metadata,
    };
    const query = data.id
      ? db.from("crm_people").update(values).eq("id", data.id).eq("tenant_id", data.tenantId)
      : db.from("crm_people").insert({ ...values, owner_user_id: context.userId });
    const { data: row, error } = await query.select("*").single();
    if (error || !row) throw new Error(error?.message ?? "CRM person could not be saved");
    await db.from("crm_activities").insert({
      tenant_id: data.tenantId, activity_type: "system_event",
      summary: data.id ? "CRM person updated" : "CRM person created",
      person_id: row.id, actor_user_id: context.userId, metadata: {},
    });
    return row;
  });

const companySchema = scopeSchema.extend({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(240),
  legalName: z.string().trim().max(240).optional().nullable(),
  website: z.string().url().max(500).optional().nullable(),
  industry: z.string().max(160).optional().nullable(),
  status: z.enum(["active","inactive","prospect","customer","partner","supplier"]).default("active"),
  sourceProductKey: z.string().max(80).optional().nullable(),
  externalRef: z.string().max(200).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const listCrmCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof scopeSchema>) => scopeSchema.parse(input))
  .handler(async ({ context, data }) => {
    await crmScope(context, data);
    const db = context.supabase as any;
    const { data: rows, error } = await db.from("crm_companies")
      .select("*").eq("tenant_id", data.tenantId).order("updated_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveCrmCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof companySchema>) => companySchema.parse(input))
  .handler(async ({ context, data }) => {
    await crmScope(context, data, true);
    const db = context.supabase as any;
    const values = { tenant_id:data.tenantId,name:data.name,legal_name:data.legalName ?? null,website:data.website ?? null,industry:data.industry ?? null,status:data.status,source_product_key:data.sourceProductKey ?? null,external_ref:data.externalRef ?? null,metadata:data.metadata };
    const query = data.id ? db.from("crm_companies").update(values).eq("id",data.id).eq("tenant_id",data.tenantId) : db.from("crm_companies").insert({ ...values, owner_user_id:context.userId });
    const { data: row, error } = await query.select("*").single();
    if (error || !row) throw new Error(error?.message ?? "CRM company could not be saved");
    await db.from("crm_activities").insert({ tenant_id:data.tenantId,activity_type:"system_event",summary:data.id ? "CRM company updated" : "CRM company created",company_id:row.id,actor_user_id:context.userId,metadata:{} });
    return row;
  });

const leadSchema = scopeSchema.extend({
  id: z.string().uuid().optional(),
  personId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(240),
  source: z.string().max(120).optional().nullable(),
  status: z.enum(["new","working","qualified","unqualified","converted","closed"]).default("new"),
  score: z.number().min(0).max(1000).optional().nullable(),
  sourceProductKey: z.string().max(80).optional().nullable(),
  externalRef: z.string().max(200).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const listCrmLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof scopeSchema>) => scopeSchema.parse(input))
  .handler(async ({ context, data }) => {
    await crmScope(context, data);
    const db = context.supabase as any;
    const { data: rows, error } = await db.from("crm_leads").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(500);
    if (error) throw new Error(error.message); return rows ?? [];
  });

export const saveCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof leadSchema>) => leadSchema.parse(input))
  .handler(async ({ context, data }) => {
    await crmScope(context, data, true);
    const db = context.supabase as any;
    const values={tenant_id:data.tenantId,person_id:data.personId ?? null,company_id:data.companyId ?? null,title:data.title,source:data.source ?? null,status:data.status,score:data.score ?? null,source_product_key:data.sourceProductKey ?? null,external_ref:data.externalRef ?? null,metadata:data.metadata};
    const query=data.id ? db.from("crm_leads").update(values).eq("id",data.id).eq("tenant_id",data.tenantId) : db.from("crm_leads").insert({...values,owner_user_id:context.userId});
    const {data:row,error}=await query.select("*").single();
    if(error||!row) throw new Error(error?.message ?? "CRM lead could not be saved");
    await db.from("crm_activities").insert({tenant_id:data.tenantId,activity_type:"lead_event",summary:data.id ? "Lead updated" : "Lead created",lead_id:row.id,person_id:row.person_id,company_id:row.company_id,actor_user_id:context.userId,metadata:{status:row.status}});
    return row;
  });

export const listCrmPipelines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof scopeSchema>) => scopeSchema.parse(input))
  .handler(async ({ context, data }) => {
    await crmScope(context,data); const db=context.supabase as any;
    const {data:pipelines,error}=await db.from("crm_pipelines").select("*").eq("tenant_id",data.tenantId).eq("is_active",true).order("name");
    if(error) throw new Error(error.message);
    const ids=(pipelines ?? []).map((p:any)=>p.id);
    let stages:any[]=[];
    if(ids.length){ const res=await db.from("crm_pipeline_stages").select("*").eq("tenant_id",data.tenantId).in("pipeline_id",ids).order("position"); stages=res.data ?? []; if(res.error) throw new Error(res.error.message); }
    return (pipelines ?? []).map((p:any)=>({...p,stages:stages.filter((s:any)=>s.pipeline_id===p.id)}));
  });

const opportunitySchema=scopeSchema.extend({
  id:z.string().uuid().optional(), pipelineId:z.string().uuid(), stageId:z.string().uuid(),
  personId:z.string().uuid().optional().nullable(), companyId:z.string().uuid().optional().nullable(),
  title:z.string().trim().min(1).max(240), amount:z.number().nonnegative().optional().nullable(),
  currency:z.string().regex(/^[A-Z]{3}$/).optional().nullable(), probabilityPercent:z.number().int().min(0).max(100).optional().nullable(),
  expectedCloseAt:z.string().datetime().optional().nullable(), status:z.enum(["open","won","lost","cancelled"]).default("open"),
  sourceProductKey:z.string().max(80).optional().nullable(), externalRef:z.string().max(200).optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).default({}),
});

export const listCrmOpportunities=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((input:z.input<typeof scopeSchema>)=>scopeSchema.parse(input))
  .handler(async({context,data})=>{await crmScope(context,data);const db=context.supabase as any;const{data:rows,error}=await db.from("crm_opportunities").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(500);if(error)throw new Error(error.message);return rows??[];});

export const saveCrmOpportunity=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((input:z.input<typeof opportunitySchema>)=>opportunitySchema.parse(input))
  .handler(async({context,data})=>{
    await crmScope(context,data,true); const db=context.supabase as any;
    const values={tenant_id:data.tenantId,pipeline_id:data.pipelineId,stage_id:data.stageId,person_id:data.personId??null,company_id:data.companyId??null,title:data.title,amount:data.amount??null,currency:data.currency??null,probability_percent:data.probabilityPercent??null,expected_close_at:data.expectedCloseAt??null,status:data.status,source_product_key:data.sourceProductKey??null,external_ref:data.externalRef??null,metadata:data.metadata};
    const query=data.id?db.from("crm_opportunities").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):db.from("crm_opportunities").insert({...values,owner_user_id:context.userId});
    const{data:row,error}=await query.select("*").single();if(error||!row)throw new Error(error?.message??"Opportunity could not be saved");
    await db.from("crm_activities").insert({tenant_id:data.tenantId,activity_type:"opportunity_event",summary:data.id?"Opportunity updated":"Opportunity created",opportunity_id:row.id,person_id:row.person_id,company_id:row.company_id,actor_user_id:context.userId,metadata:{status:row.status,stage_id:row.stage_id}});
    return row;
  });

const taskSchema=scopeSchema.extend({
  id:z.string().uuid().optional(),title:z.string().trim().min(1).max(240),description:z.string().max(5000).optional().nullable(),
  status:z.enum(["open","in_progress","completed","cancelled"]).default("open"),priority:z.enum(["low","normal","high","urgent"]).default("normal"),
  dueAt:z.string().datetime().optional().nullable(),assigneeUserId:z.string().uuid().optional().nullable(),
  relatedType:z.enum(["person","company","lead","opportunity","case","conversation","external"]).optional().nullable(),relatedId:z.string().max(200).optional().nullable(),
  sourceProductKey:z.string().max(80).optional().nullable(),externalRef:z.string().max(200).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({}),
});

export const listCrmTasks=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scopeSchema>)=>scopeSchema.parse(input)).handler(async({context,data})=>{await crmScope(context,data);const db=context.supabase as any;const{data:rows,error}=await db.from("crm_tasks").select("*").eq("tenant_id",data.tenantId).order("due_at",{ascending:true,nullsFirst:false}).limit(500);if(error)throw new Error(error.message);return rows??[];});

export const saveCrmTask=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof taskSchema>)=>taskSchema.parse(input)).handler(async({context,data})=>{
  await crmScope(context,data,true);const db=context.supabase as any;const values={tenant_id:data.tenantId,title:data.title,description:data.description??null,status:data.status,priority:data.priority,due_at:data.dueAt??null,assignee_user_id:data.assigneeUserId??context.userId,related_type:data.relatedType??null,related_id:data.relatedId??null,source_product_key:data.sourceProductKey??null,external_ref:data.externalRef??null,metadata:data.metadata};
  const query=data.id?db.from("crm_tasks").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):db.from("crm_tasks").insert({...values,created_by:context.userId});const{data:row,error}=await query.select("*").single();if(error||!row)throw new Error(error?.message??"CRM task could not be saved");return row;});

const timelineSchema=scopeSchema.extend({personId:z.string().uuid().optional(),companyId:z.string().uuid().optional(),limit:z.number().int().min(1).max(500).default(100)}).refine((v)=>v.personId||v.companyId,{message:"personId or companyId required"});
export const getCrmTimeline=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof timelineSchema>)=>timelineSchema.parse(input)).handler(async({context,data})=>{
  await crmScope(context,data);const db=context.supabase as any;let query=db.from("crm_activities").select("*").eq("tenant_id",data.tenantId);if(data.personId)query=query.eq("person_id",data.personId);if(data.companyId)query=query.eq("company_id",data.companyId);const{data:rows,error}=await query.order("occurred_at",{ascending:false}).limit(data.limit);if(error)throw new Error(error.message);return rows??[];});