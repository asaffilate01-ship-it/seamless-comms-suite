import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid=z.string().uuid();
const tenantScope=z.object({tenantId:uuid});

export const getOmniqoraCoreCompletion=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof tenantScope>)=>tenantScope.parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const results=await Promise.all([
  db.from("accounting_ingestion_jobs").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100),
  db.from("accounting_review_items").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100),
  db.from("accounting_journals").select("*,lines:accounting_journal_lines(*)").eq("tenant_id",data.tenantId).order("journal_date",{ascending:false}).limit(100),
  db.from("accounting_assets").select("*").eq("tenant_id",data.tenantId).order("acquisition_date",{ascending:false}).limit(100),
  db.from("accounting_accounts_prep_runs").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100),
  db.from("tax_research_cases").select("*,positions:tax_positions(*)").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100),
  db.from("ai_agent_runs").select("*,steps:ai_agent_steps(*),approvals:ai_action_approvals(*)").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100),
  db.from("knowledge_enrichment_runs").select("*,entities:knowledge_entity_candidates(*),edges:knowledge_edge_candidates(*)").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100),
  db.from("transaction_programmes").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(100),
 ]);
 for(const r of results)if(r.error)throw new Error(r.error.message);
 return{
  accounting:{ingestion:results[0].data??[],reviews:results[1].data??[],journals:results[2].data??[],assets:results[3].data??[],accountsPrep:results[4].data??[]},
  tax:{cases:results[5].data??[]},
  agents:results[6].data??[],
  knowledge:results[7].data??[],
  transactions:results[8].data??[],
 };
});

const ingestion=z.object({
 tenantId:uuid,productKey:z.string().min(2).max(80),clientRef:z.string().min(1).max(200),
 sourceKind:z.enum(["receipt","invoice","statement","csv","pdf","scan","api"]),
 documentId:uuid.nullish()
});
export const createAccountingIngestion=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof ingestion>)=>ingestion.parse(i))
.handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("accounting_ingestion_jobs").insert({
  tenant_id:data.tenantId,product_key:data.productKey,client_ref:data.clientRef,source_kind:data.sourceKind,
  document_id:data.documentId??null,status:"queued",extracted:{},proposed_entries:[],exceptions:[]
 }).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const review=z.object({
 tenantId:uuid,productKey:z.string().min(2).max(80),clientRef:z.string().min(1).max(200),
 ingestionJobId:uuid.nullish(),
 issueType:z.enum(["low_confidence","capex_vs_revenue","missing_tax","duplicate","unmatched_bank","unknown_account","accounting_policy","other"]),
 question:z.string().min(1).max(4000),proposedEntry:z.record(z.string(),z.unknown()),
 evidenceRefs:z.array(z.string().max(1000)).max(200).default([]),
 confidence:z.number().min(0).max(1).nullish()
});
export const createAccountingReviewItem=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof review>)=>review.parse(i))
.handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("accounting_review_items").insert({
  tenant_id:data.tenantId,product_key:data.productKey,client_ref:data.clientRef,
  ingestion_job_id:data.ingestionJobId??null,issue_type:data.issueType,question:data.question,
  proposed_entry:data.proposedEntry,evidence_refs:data.evidenceRefs,confidence:data.confidence??null,status:"open"
 }).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const reviewDecision=z.object({
 tenantId:uuid,reviewId:uuid,decision:z.enum(["approved","rejected"]),answer:z.record(z.string(),z.unknown()).default({})
});
export const reviewAccountingItem=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof reviewDecision>)=>reviewDecision.parse(i))
.handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("accounting_review_items").update({
  status:data.decision,answer:data.answer,reviewed_by:context.userId,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
 }).eq("id",data.reviewId).eq("tenant_id",data.tenantId).in("status",["open","answered"]).select("*").single();
 if(error)throw new Error(error.message);return row;
});

export const postAccountingReview=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;reviewId:string})=>z.object({tenantId:uuid,reviewId:uuid}).parse(i))
.handler(async({context,data})=>{
 const r=await(context.supabase as any).rpc("accounting_post_reviewed_entry",{
  _tenant:data.tenantId,_review:data.reviewId,_actor:context.userId
 });
 if(r.error)throw new Error(r.error.message);return{journalId:r.data as string};
});

const taxSource=z.object({
 jurisdiction:z.string().min(2).max(80),authority:z.string().min(2).max(200),
 sourceType:z.string().min(1).max(120),
 authorityLevel:z.enum(["legislation","regulation","binding_case_law","persuasive_case_law","official_ruling","official_guidance","administrative_manual","secondary"]),
 title:z.string().min(2).max(1000),citation:z.string().max(500).nullish(),
 sourceUrl:z.string().url().refine(v=>v.startsWith("https://")),
 effectiveFrom:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 effectiveUntil:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 publishedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 checkedAt:z.string().datetime(),contentHash:z.string().regex(/^[0-9a-f]{64}$/).nullish(),
 metadata:z.record(z.string(),z.unknown()).default({})
});
export const upsertTaxKnowledgeSource=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof taxSource>)=>taxSource.parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 if(data.effectiveFrom&&data.effectiveUntil&&data.effectiveUntil<data.effectiveFrom)throw new Error("Tax source effective date range is invalid");
 const values={
  jurisdiction:data.jurisdiction,authority:data.authority,source_type:data.sourceType,authority_level:data.authorityLevel,
  title:data.title,citation:data.citation??null,source_url:data.sourceUrl,effective_from:data.effectiveFrom??null,
  effective_until:data.effectiveUntil??null,published_at:data.publishedAt??null,checked_at:data.checkedAt,
  content_hash:data.contentHash??null,metadata:data.metadata,updated_at:new Date().toISOString()
 };
 let q=db.from("tax_knowledge_sources").select("id").eq("jurisdiction",data.jurisdiction).eq("source_url",data.sourceUrl);
 q=data.contentHash?q.eq("content_hash",data.contentHash):q.is("content_hash",null);
 const existing=await q.maybeSingle();if(existing.error)throw new Error(existing.error.message);
 const result=existing.data
  ?await db.from("tax_knowledge_sources").update(values).eq("id",existing.data.id).select("*").single()
  :await db.from("tax_knowledge_sources").insert(values).select("*").single();
 if(result.error)throw new Error(result.error.message);return result.data;
});

const agent=z.object({
 tenantId:uuid,productKey:z.string().max(80).nullish(),profileKey:z.string().min(2).max(80),
 goal:z.string().min(5).max(4000),modelProvider:z.string().max(100).nullish(),modelId:z.string().max(200).nullish(),
 policyRevision:z.string().max(120).nullish(),inputVersion:z.string().max(120).nullish(),maxSteps:z.number().int().min(1).max(50).default(8)
});
export const createGovernedAgentRun=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof agent>)=>agent.parse(i))
.handler(async({context,data})=>{
 const{data:profile,error:profileError}=await(context.supabase as any).from("ai_agent_profiles").select("*").eq("profile_key",data.profileKey).eq("status","active").maybeSingle();
 if(profileError||!profile)throw new Error("Active AI agent profile required");
 const{data:row,error}=await(context.supabase as any).from("ai_agent_runs").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,profile_key:data.profileKey,goal:data.goal,status:"queued",
  model_provider:data.modelProvider??null,model_id:data.modelId??null,policy_revision:data.policyRevision??null,input_version:data.inputVersion??null,
  max_steps:data.maxSteps,created_by:context.userId
 }).select("*").single();
 if(error)throw new Error(error.message);return{run:row,profile};
});

const step=z.object({
 tenantId:uuid,runId:uuid,stepNo:z.number().int().positive(),stepType:z.enum(["model","tool","proposal","approval","final","error"]),
 toolKey:z.string().max(160).nullish(),input:z.record(z.string(),z.unknown()).default({}),output:z.record(z.string(),z.unknown()).default({}),
 evidenceRefs:z.array(z.string().max(1000)).max(200).default([]),status:z.enum(["queued","running","completed","failed","cancelled"]).default("completed")
});
export const recordAgentStep=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof step>)=>step.parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:run,error:runError}=await db.from("ai_agent_runs").select("id,max_steps,current_step,status").eq("id",data.runId).eq("tenant_id",data.tenantId).single();
 if(runError||!run)throw new Error("AI run not found");
 if(data.stepNo>run.max_steps)throw new Error("AI run step limit exceeded");
 const{data:row,error}=await db.from("ai_agent_steps").insert({
  tenant_id:data.tenantId,run_id:data.runId,step_no:data.stepNo,step_type:data.stepType,tool_key:data.toolKey??null,
  input:data.input,output:data.output,evidence_refs:data.evidenceRefs,status:data.status
 }).select("*").single();
 if(error)throw new Error(error.message);
 await db.from("ai_agent_runs").update({current_step:Math.max(run.current_step,data.stepNo),status:data.stepType==="final"?"completed":run.status==="queued"?"running":run.status,updated_at:new Date().toISOString(),completed_at:data.stepType==="final"?new Date().toISOString():null}).eq("id",run.id);
 return row;
});

const approval=z.object({
 tenantId:uuid,runId:uuid,stepId:uuid.nullish(),actionKey:z.string().min(2).max(160),targetRef:z.string().max(500).nullish(),
 proposal:z.record(z.string(),z.unknown())
});
export const proposeAgentAction=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof approval>)=>approval.parse(i))
.handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("ai_action_approvals").insert({
  tenant_id:data.tenantId,run_id:data.runId,step_id:data.stepId??null,action_key:data.actionKey,target_ref:data.targetRef??null,
  proposal:data.proposal,status:"pending",proposed_by:context.userId
 }).select("*").single();
 if(error)throw new Error(error.message);
 await(context.supabase as any).from("ai_agent_runs").update({status:"waiting_approval",updated_at:new Date().toISOString()}).eq("id",data.runId).eq("tenant_id",data.tenantId);
 return row;
});

const approvalDecision=z.object({tenantId:uuid,approvalId:uuid,decision:z.enum(["approved","rejected"])});
export const reviewAgentAction=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof approvalDecision>)=>approvalDecision.parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:row,error}=await db.from("ai_action_approvals").update({
  status:data.decision,reviewed_by:context.userId,reviewed_at:new Date().toISOString()
 }).eq("id",data.approvalId).eq("tenant_id",data.tenantId).eq("status","pending").select("*").single();
 if(error)throw new Error(error.message);
 await db.from("ai_agent_runs").update({status:data.decision==="approved"?"running":"cancelled",updated_at:new Date().toISOString()}).eq("id",row.run_id);
 return row;
});

const enrich=z.object({
 tenantId:uuid,productKey:z.string().max(80).nullish(),collectionKey:z.string().min(1).max(160),
 documentRef:z.string().min(1).max(500),documentRevision:z.number().int().positive(),
 provider:z.string().max(120).nullish(),modelId:z.string().max(200).nullish(),
 entities:z.array(z.object({entityKey:z.string().min(1).max(200),label:z.string().min(1).max(300),entityType:z.string().max(120).default("entity"),aliases:z.array(z.string().max(300)).max(50).default([]),evidenceQuote:z.string().max(1000).nullish(),confidence:z.number().min(0).max(1)})).max(500),
 edges:z.array(z.object({sourceKey:z.string().min(1).max(200),relation:z.string().min(1).max(100),targetKey:z.string().min(1).max(200),supportingQuote:z.string().min(1).max(1000),confidence:z.number().min(0).max(1)})).max(1000)
});
export const saveKnowledgeEnrichmentProposal=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof enrich>)=>enrich.parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:run,error}=await db.from("knowledge_enrichment_runs").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,collection_key:data.collectionKey,document_ref:data.documentRef,
  document_revision:data.documentRevision,status:"review",provider:data.provider??null,model_id:data.modelId??null,
  entity_count:data.entities.length,edge_count:data.edges.length,created_by:context.userId
 }).select("*").single();
 if(error)throw new Error(error.message);
 if(data.entities.length){
  const r=await db.from("knowledge_entity_candidates").insert(data.entities.map(e=>({
   tenant_id:data.tenantId,run_id:run.id,entity_key:e.entityKey,label:e.label,entity_type:e.entityType,
   aliases:e.aliases,evidence_quote:e.evidenceQuote??null,confidence:e.confidence,status:"pending"
  })));if(r.error)throw new Error(r.error.message);
 }
 if(data.edges.length){
  const r=await db.from("knowledge_edge_candidates").insert(data.edges.map(e=>({
   tenant_id:data.tenantId,run_id:run.id,source_key:e.sourceKey,relation:e.relation,target_key:e.targetKey,
   supporting_quote:e.supportingQuote,confidence:e.confidence,status:"pending"
  })));if(r.error)throw new Error(r.error.message);
 }
 return run;
});

const programme=z.object({
 tenantId:uuid,productKey:z.string().max(80).nullish(),name:z.string().min(2).max(240),
 programmeType:z.enum(["acquisition","disposal","merger","carve_out","integration","separation","due_diligence","transformation"]),
 targetName:z.string().max(240).nullish(),currency:z.string().regex(/^[A-Z]{3}$/).default("GBP"),
 dayOneDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),assumptions:z.array(z.unknown()).max(200).default([])
});
export const createTransactionProgramme=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof programme>)=>programme.parse(i))
.handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("transaction_programmes").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,name:data.name,programme_type:data.programmeType,
  target_name:data.targetName??null,owner_user_id:context.userId,currency:data.currency,day_one_date:data.dayOneDate??null,
  status:"discovery",assumptions:data.assumptions
 }).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const finding=z.object({
 tenantId:uuid,programmeId:uuid,workstream:z.string().min(1).max(160),title:z.string().min(2).max(500),
 findingType:z.enum(["risk","gap","dependency","opportunity","assumption","decision"]),
 severity:z.enum(["low","medium","high","critical"]).default("medium"),description:z.string().min(1).max(12000),
 evidenceRefs:z.array(z.string().max(1000)).max(200).default([]),owner:z.string().max(240).nullish(),dueAt:z.string().datetime().nullish()
});
export const createDiligenceFinding=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof finding>)=>finding.parse(i))
.handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("transaction_diligence_findings").insert({
  tenant_id:data.tenantId,programme_id:data.programmeId,workstream:data.workstream,title:data.title,
  finding_type:data.findingType,severity:data.severity,description:data.description,evidence_refs:data.evidenceRefs,
  owner:data.owner??null,due_at:data.dueAt??null,status:"open"
 }).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const gate=z.object({
 tenantId:uuid,programmeId:uuid,domain:z.string().min(1).max(120),gateKey:z.string().regex(/^[a-z0-9_.-]{2,120}$/),
 title:z.string().min(2).max(500),critical:z.boolean().default(true)
});
export const createDayOneGate=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof gate>)=>gate.parse(i))
.handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("transaction_day1_gates").upsert({
  tenant_id:data.tenantId,programme_id:data.programmeId,domain:data.domain,gate_key:data.gateKey,title:data.title,
  critical:data.critical,status:"not_started"
 },{onConflict:"programme_id,gate_key"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

export const getTransactionReadiness=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{programmeId:string})=>z.object({programmeId:uuid}).parse(i))
.handler(async({context,data})=>{
 const r=await(context.supabase as any).rpc("transaction_readiness",{_programme:data.programmeId});
 if(r.error)throw new Error(r.error.message);return r.data;
});
