import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole, requireService, requireTenantMembership, requireWriteRole } from "@/modules/platform/access";

const uuid=z.string().uuid();
const product=z.string().min(2).max(80);

export const getSharedEnginesWorkspace=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey?:string|null})=>z.object({tenantId:uuid,productKey:product.nullish()}).parse(i))
.handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);
 const db=context.supabase as any;
 const pf=(q:any)=>data.productKey?q.eq("product_key",data.productKey):q;
 const rs=await Promise.all([
  pf(db.from("sales_prospect_lists").select("*").eq("tenant_id",data.tenantId)).order("updated_at",{ascending:false}).limit(100),
  pf(db.from("sales_callbacks").select("*").eq("tenant_id",data.tenantId)).order("scheduled_for").limit(100),
  pf(db.from("sales_meetings").select("*").eq("tenant_id",data.tenantId)).order("starts_at").limit(100),
  pf(db.from("sales_proposals").select("*").eq("tenant_id",data.tenantId)).order("updated_at",{ascending:false}).limit(100),
  pf(db.from("contact_centre_queues").select("*").eq("tenant_id",data.tenantId)).order("priority").limit(100),
  pf(db.from("contact_centre_sessions").select("*").eq("tenant_id",data.tenantId)).order("started_at",{ascending:false}).limit(100),
  db.from("tenant_agent_templates").select("*,template:agent_template_catalogue(*)").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}),
  pf(db.from("marketing_attribution_touchpoints").select("*").eq("tenant_id",data.tenantId)).order("occurred_at",{ascending:false}).limit(100),
  pf(db.from("company_memory_facts").select("*").eq("tenant_id",data.tenantId)).order("updated_at",{ascending:false}).limit(100),
  db.from("relationship_intelligence").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(100),
  pf(db.from("research_enrichment_jobs").select("*").eq("tenant_id",data.tenantId)).order("created_at",{ascending:false}).limit(100),
  pf(db.from("analytics_datasets").select("*").eq("tenant_id",data.tenantId)).order("name").limit(100),
  db.from("education_students").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(100),
  db.from("education_interventions").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100),
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{
  sales:{lists:rs[0].data??[],callbacks:rs[1].data??[],meetings:rs[2].data??[],proposals:rs[3].data??[]},
  contactCentre:{queues:rs[4].data??[],sessions:rs[5].data??[]},
  agents:rs[6].data??[],
  attribution:rs[7].data??[],
  memory:rs[8].data??[],
  relationships:rs[9].data??[],
  enrichment:rs[10].data??[],
  bi:{datasets:rs[11].data??[]},
  education:{students:rs[12].data??[],interventions:rs[13].data??[]},
 };
});

const prospectList=z.object({tenantId:uuid,productKey:product.nullish(),name:z.string().min(1).max(200),description:z.string().max(2000).nullish(),
 sourceType:z.enum(["manual","import","segment","enrichment","campaign","event","api"]).default("manual"),
 criteria:z.record(z.string(),z.unknown()).default({})});
export const createProspectList=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof prospectList>)=>prospectList.parse(i))
.handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.sales-engagement");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("sales_prospect_lists").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,name:data.name,description:data.description??null,
  source_type:data.sourceType,criteria:data.criteria,status:"active",owner_user_id:context.userId
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const score=z.object({tenantId:uuid,listId:uuid,leadId:uuid.nullish(),personId:uuid.nullish(),companyId:uuid.nullish(),
 fitScore:z.number().min(0).max(100).nullish(),intentScore:z.number().min(0).max(100).nullish(),engagementScore:z.number().min(0).max(100).nullish(),
 reasons:z.array(z.unknown()).max(100).default([]),nextActionAt:z.string().datetime().nullish()});
export const upsertProspectScore=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof score>)=>score.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.sales-engagement");requireWriteRole(a.role);
 if(!data.leadId&&!data.personId&&!data.companyId)throw new Error("Lead, person or company required");
 const parts=[data.fitScore,data.intentScore,data.engagementScore].filter((v):v is number=>typeof v==="number");
 const total=parts.length?parts.reduce((s,v)=>s+v,0)/parts.length:null;
 const{data:row,error}=await(context.supabase as any).from("sales_prospect_members").insert({
  tenant_id:data.tenantId,list_id:data.listId,lead_id:data.leadId??null,person_id:data.personId??null,company_id:data.companyId??null,
  fit_score:data.fitScore??null,intent_score:data.intentScore??null,engagement_score:data.engagementScore??null,total_score:total,
  score_reasons:data.reasons,status:"active",next_action_at:data.nextActionAt??null
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const proposal=z.object({tenantId:uuid,productKey:product.nullish(),opportunityId:uuid.nullish(),personId:uuid.nullish(),companyId:uuid.nullish(),
 proposalRef:z.string().min(1).max(160),title:z.string().min(1).max(300),currency:z.string().regex(/^[A-Z]{3}$/).default("GBP"),
 amountMinor:z.number().int().min(0).default(0),validUntil:z.string().datetime().nullish(),content:z.record(z.string(),z.unknown()).default({})});
export const createSalesProposal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof proposal>)=>proposal.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.sales-engagement");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("sales_proposals").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,opportunity_id:data.opportunityId??null,person_id:data.personId??null,
  company_id:data.companyId??null,proposal_ref:data.proposalRef,title:data.title,currency:data.currency,amount_minor:data.amountMinor,
  valid_until:data.validUntil??null,content:data.content,status:"draft",created_by:context.userId
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const queue=z.object({tenantId:uuid,productKey:product.nullish(),queueKey:z.string().regex(/^[a-z0-9.-]{2,120}$/),
 name:z.string().min(1).max(200),channels:z.array(z.enum(["voice","whatsapp","web_chat","sms","email","video"])).min(1).max(10),
 aiFirst:z.boolean().default(true),humanOverflow:z.boolean().default(true),maxWaitSeconds:z.number().int().min(1).max(86400).nullish(),
 businessHours:z.record(z.string(),z.unknown()).default({}),knowledgeCollectionRef:z.string().max(240).nullish()});
export const upsertContactCentreQueue=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof queue>)=>queue.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.contact-centre");requireAdminRole(a.role);
 const db=context.supabase as any;
 const values={tenant_id:data.tenantId,product_key:data.productKey??null,queue_key:data.queueKey,name:data.name,channels:data.channels,
  ai_first:data.aiFirst,human_overflow:data.humanOverflow,max_wait_seconds:data.maxWaitSeconds??null,business_hours:data.businessHours,
  knowledge_collection_ref:data.knowledgeCollectionRef??null,status:"active"};
 const existing=await db.from("contact_centre_queues").select("id").eq("tenant_id",data.tenantId).eq("queue_key",data.queueKey).maybeSingle();
 if(existing.error)throw new Error(existing.error.message);
 const r=existing.data?await db.from("contact_centre_queues").update(values).eq("id",existing.data.id).select("*").single():
  await db.from("contact_centre_queues").insert(values).select("*").single();
 if(r.error)throw new Error(r.error.message);return r.data;
});

const agentTemplate=z.object({tenantId:uuid,productKey:product.nullish(),templateKey:z.string().min(2).max(160),
 enabled:z.boolean(),autonomy:z.enum(["observe","assist","bounded_auto"]).default("assist"),
 schedule:z.record(z.string(),z.unknown()).default({}),config:z.record(z.string(),z.unknown()).default({})});
export const configureTenantAgentTemplate=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof agentTemplate>)=>agentTemplate.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.agent-library");requireAdminRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("tenant_agent_templates").upsert({
  tenant_id:data.tenantId,product_key:data.productKey??null,template_key:data.templateKey,enabled:data.enabled,autonomy:data.autonomy,
  schedule:data.schedule,config:data.config,approved_by:context.userId,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()
 },{onConflict:"tenant_id,template_key"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const memory=z.object({tenantId:uuid,productKey:product.nullish(),subjectType:z.string().min(1).max(100),subjectRef:z.string().min(1).max(240),
 factKey:z.string().min(1).max(160),factValue:z.unknown(),evidenceRefs:z.array(z.string().max(1000)).max(100).default([]),
 confidence:z.number().min(0).max(1).nullish(),status:z.enum(["proposed","reviewed"]).default("reviewed")});
export const saveCompanyMemoryFact=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof memory>)=>memory.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.company-memory");requireWriteRole(a.role);
 if(data.status==="reviewed")requireAdminRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("company_memory_facts").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,subject_type:data.subjectType,subject_ref:data.subjectRef,
  fact_key:data.factKey,fact_value:data.factValue,evidence_refs:data.evidenceRefs,confidence:data.confidence??null,
  status:data.status,reviewed_by:data.status==="reviewed"?context.userId:null
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const enrichment=z.object({tenantId:uuid,productKey:product.nullish(),subjectType:z.string().min(1).max(100),subjectRef:z.string().min(1).max(240),
 requestedFields:z.array(z.string().min(1).max(120)).max(100).default([]),providerKey:z.string().max(160).nullish()});
export const createResearchEnrichmentJob=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof enrichment>)=>enrichment.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.company-memory");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("research_enrichment_jobs").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,subject_type:data.subjectType,subject_ref:data.subjectRef,
  requested_fields:data.requestedFields,provider_key:data.providerKey??null,status:"queued",requested_by:context.userId
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const student=z.object({tenantId:uuid,productKey:product.default("unipathway"),studentRef:z.string().min(1).max(160),
 personId:uuid.nullish(),programmeRef:z.string().max(200).nullish(),status:z.enum(["applicant","offer","enrolled","active","paused","completed","withdrawn","alumni"]).default("applicant"),
 profile:z.record(z.string(),z.unknown()).default({})});
export const upsertEducationStudent=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof student>)=>student.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.education");requireWriteRole(a.role);
 const db=context.supabase as any;
 const values={tenant_id:data.tenantId,product_key:data.productKey,student_ref:data.studentRef,person_id:data.personId??null,
  programme_ref:data.programmeRef??null,status:data.status,profile:data.profile,updated_at:new Date().toISOString()};
 const existing=await db.from("education_students").select("id").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).eq("student_ref",data.studentRef).maybeSingle();
 if(existing.error)throw new Error(existing.error.message);
 const r=existing.data?await db.from("education_students").update(values).eq("id",existing.data.id).select("*").single():
  await db.from("education_students").insert(values).select("*").single();
 if(r.error)throw new Error(r.error.message);return r.data;
});
