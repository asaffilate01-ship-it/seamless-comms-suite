import {createHash} from "node:crypto";
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid();
const product=z.string().min(2).max(80);
const tenant=z.object({tenantId:uuid});

export const getSharedEngagementWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey?:string|null})=>z.object({tenantId:uuid,productKey:product.nullish()}).parse(i))
.handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);
 const db=context.supabase as any;
 const scope=(q:any)=>data.productKey?q.eq("product_key",data.productKey):q;
 const rs=await Promise.all([
  scope(db.from("contact_sessions").select("*").eq("tenant_id",data.tenantId)).order("created_at",{ascending:false}).limit(100),
  scope(db.from("contact_callbacks").select("*").eq("tenant_id",data.tenantId)).order("scheduled_for").limit(100),
  db.from("contact_escalations").select("*").eq("tenant_id",data.tenantId).order("requested_at",{ascending:false}).limit(100),
  scope(db.from("call_masking_sessions").select("*").eq("tenant_id",data.tenantId)).order("starts_at",{ascending:false}).limit(100),
  scope(db.from("media_analysis_jobs").select("*").eq("tenant_id",data.tenantId)).order("created_at",{ascending:false}).limit(100),
  scope(db.from("mobile_devices").select("*").eq("tenant_id",data.tenantId)).order("updated_at",{ascending:false}).limit(100),
  scope(db.from("sales_prospect_profiles").select("*").eq("tenant_id",data.tenantId)).order("updated_at",{ascending:false}).limit(100),
  scope(db.from("sales_proposals").select("*").eq("tenant_id",data.tenantId)).order("created_at",{ascending:false}).limit(100),
  scope(db.from("cross_sell_recommendations").select("*").eq("tenant_id",data.tenantId)).order("created_at",{ascending:false}).limit(100),
  scope(db.from("ai_outcome_reviews").select("*").eq("tenant_id",data.tenantId)).order("reviewed_at",{ascending:false}).limit(100),
  scope(db.from("ai_reviewed_lessons").select("*").eq("tenant_id",data.tenantId)).order("created_at",{ascending:false}).limit(100),
  scope(db.from("ai_candidate_model_tests").select("*").eq("tenant_id",data.tenantId)).order("created_at",{ascending:false}).limit(100),
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{sessions:rs[0].data??[],callbacks:rs[1].data??[],escalations:rs[2].data??[],masking:rs[3].data??[],
  mediaJobs:rs[4].data??[],devices:rs[5].data??[],prospects:rs[6].data??[],proposals:rs[7].data??[],
  crossSell:rs[8].data??[],outcomeReviews:rs[9].data??[],lessons:rs[10].data??[],candidateModels:rs[11].data??[]};
});

const contact=z.object({tenantId:uuid,productKey:product.nullish(),channel:z.enum(["voice","whatsapp","sms","email","video","webchat","other"]),
 direction:z.enum(["inbound","outbound"]),externalRef:z.string().max(300).nullish(),personId:uuid.nullish(),
 aiEnabled:z.boolean().default(true),aiProfile:z.string().max(120).nullish(),language:z.string().max(40).nullish(),
 priority:z.enum(["low","normal","high","urgent"]).default("normal"),slaTargetSeconds:z.number().int().nonnegative().nullish(),
 metadata:z.record(z.string(),z.unknown()).default({})});
export const createContactSession=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof contact>)=>contact.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.contact");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("contact_sessions").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,channel:data.channel,direction:data.direction,
  external_ref:data.externalRef??null,person_id:data.personId??null,ai_enabled:data.aiEnabled,ai_profile:data.aiProfile??null,
  language:data.language??null,priority:data.priority,sla_target_seconds:data.slaTargetSeconds??null,status:"queued",metadata:data.metadata
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const escalation=z.object({tenantId:uuid,sessionId:uuid,type:z.enum(["warm_transfer","supervisor_takeover","failed_verification","complaint","priority","payment","safety","other"]),
 reason:z.string().min(2).max(3000)});
export const requestContactEscalation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof escalation>)=>escalation.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.contact");requireWriteRole(a.role);
 const db=context.supabase as any;
 const {data:session,error:se}=await db.from("contact_sessions").select("id").eq("tenant_id",data.tenantId).eq("id",data.sessionId).maybeSingle();
 if(se||!session)throw new Error("Contact session not found");
 const {data:row,error}=await db.from("contact_escalations").insert({tenant_id:data.tenantId,session_id:data.sessionId,
  escalation_type:data.type,reason:data.reason,requested_by:context.userId,status:"requested"}).select("*").single();
 if(error)throw new Error(error.message);
 await db.from("contact_sessions").update({status:"active_human",updated_at:new Date().toISOString()}).eq("id",data.sessionId);
 return row;
});

export const acceptSupervisorTakeover=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;escalationId:string})=>z.object({tenantId:uuid,escalationId:uuid}).parse(i))
.handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.contact");requireWriteRole(a.role);
 const db=context.supabase as any;
 const {data:row,error}=await db.from("contact_escalations").update({status:"accepted",assigned_user_id:context.userId,accepted_at:new Date().toISOString()})
  .eq("tenant_id",data.tenantId).eq("id",data.escalationId).eq("status","requested").select("*").single();
 if(error)throw new Error(error.message);
 await db.from("contact_sessions").update({status:"active_human",updated_at:new Date().toISOString()}).eq("id",row.session_id);
 return row;
});

const callback=z.object({tenantId:uuid,productKey:product.nullish(),sessionId:uuid.nullish(),personId:uuid.nullish(),
 channel:z.string().min(2).max(40).default("voice"),destination:z.string().min(3).max(320),scheduledFor:z.string().datetime(),
 timezone:z.string().max(80).nullish(),priority:z.enum(["low","normal","high","urgent"]).default("normal")});
export const scheduleContactCallback=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof callback>)=>callback.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.contact");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("contact_callbacks").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,session_id:data.sessionId??null,person_id:data.personId??null,
  channel:data.channel,destination:data.destination,scheduled_for:data.scheduledFor,timezone:data.timezone??null,
  priority:data.priority,status:"scheduled"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const mask=z.object({tenantId:uuid,productKey:product.nullish(),providerKey:z.string().max(120).nullish(),
 subjectType:z.string().min(1).max(100),subjectId:z.string().min(1).max(200),partyARef:z.string().min(1).max(200),
 partyBRef:z.string().min(1).max(200),maskedNumber:z.string().min(3).max(80),expiresAt:z.string().datetime(),providerRef:z.string().max(300).nullish()});
export const createCallMaskingSession=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof mask>)=>mask.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.contact");requireWriteRole(a.role);
 if(!data.productKey)throw new Error("Product key required for call masking");
 if(Date.parse(data.expiresAt)<=Date.now())throw new Error("Masking expiry must be in the future");
 const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
 const {data:row,error}=await(context.supabase as any).from("contact_masking_sessions").insert({
  tenant_id:data.tenantId,product_key:data.productKey,provider_key:data.providerKey??null,
  proxy_number:data.maskedNumber,caller_hash:hash(data.partyARef),recipient_hash:hash(data.partyBRef),
  context_type:data.subjectType,context_id:data.subjectId,recording_policy:"disabled",state:"active",
  expires_at:data.expiresAt,started_at:new Date().toISOString(),
  metadata:{providerRef:data.providerRef??null}
 }).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const media=z.object({tenantId:uuid,productKey:product.nullish(),documentId:uuid.nullish(),mediaType:z.enum(["image","pdf","audio","video","scan","other"]),
 storageRef:z.string().min(1).max(1200),purpose:z.string().min(2).max(500),providerKey:z.string().max(120).nullish(),model:z.string().max(200).nullish()});
export const queueMediaAnalysis=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof media>)=>media.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.media-intelligence");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("media_analysis_jobs").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,document_id:data.documentId??null,media_type:data.mediaType,
  storage_ref:data.storageRef,purpose:data.purpose,provider_key:data.providerKey??null,model:data.model??null,status:"queued",created_by:context.userId
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const device=z.object({tenantId:uuid,productKey:product.nullish(),deviceRef:z.string().min(2).max(240),
 platform:z.enum(["ios","android","web","other"]),appVersion:z.string().max(80).nullish(),deviceModel:z.string().max(160).nullish(),
 locale:z.string().max(40).nullish(),timezone:z.string().max(80).nullish(),pushEnabled:z.boolean().default(false),
 locationPermission:z.enum(["unknown","denied","foreground","background"]).default("unknown")});
export const registerMobileDevice=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof device>)=>device.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.mobile");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("mobile_devices").upsert({
  tenant_id:data.tenantId,product_key:data.productKey,user_id:context.userId,device_ref:data.deviceRef,platform:data.platform,
  app_version:data.appVersion??null,device_model:data.deviceModel??null,locale:data.locale??null,timezone:data.timezone??null,
  push_enabled:data.pushEnabled,location_permission:data.locationPermission,status:"active",last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()
 },{onConflict:"tenant_id,product_key,device_ref"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const location=z.object({tenantId:uuid,deviceId:uuid,subjectType:z.string().max(100).nullish(),subjectId:z.string().max(200).nullish(),
 latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),accuracyM:z.number().nonnegative().nullish(),
 heading:z.number().nullish(),speedMps:z.number().nullish(),capturedAt:z.string().datetime(),purpose:z.string().min(2).max(300),
 retentionUntil:z.string().datetime().nullish()});
export const recordMobileLocation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof location>)=>location.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.mobile");requireWriteRole(a.role);
 const db=context.supabase as any;
 const {data:device,error:de}=await db.from("mobile_devices").select("location_permission,status").eq("tenant_id",data.tenantId).eq("id",data.deviceId).maybeSingle();
 if(de||!device||device.status!=="active")throw new Error("Active mobile device required");
 if(!["foreground","background"].includes(device.location_permission))throw new Error("Location permission not granted");
 const {data:row,error}=await db.from("mobile_location_events").insert({tenant_id:data.tenantId,device_id:data.deviceId,
  subject_type:data.subjectType??null,subject_id:data.subjectId??null,latitude:data.latitude,longitude:data.longitude,
  accuracy_m:data.accuracyM??null,heading:data.heading??null,speed_mps:data.speedMps??null,captured_at:data.capturedAt,
  purpose:data.purpose,retention_until:data.retentionUntil??null}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const prospect=z.object({tenantId:uuid,productKey:product.nullish(),personId:uuid.nullish(),companyId:uuid.nullish(),
 prospectRef:z.string().min(1).max(200),score:z.number().min(0).max(100).nullish(),stage:z.string().min(1).max(80).default("prospect"),
 intentSignals:z.array(z.unknown()).max(200).default([]),fitSignals:z.array(z.unknown()).max(200).default([]),
 riskSignals:z.array(z.unknown()).max(200).default([]),nextBestActions:z.array(z.unknown()).max(200).default([]),modelRef:z.string().max(200).nullish()});
export const upsertProspectIntelligence=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof prospect>)=>prospect.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.sales-engagement");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("sales_prospect_profiles").upsert({
  tenant_id:data.tenantId,product_key:data.productKey??null,person_id:data.personId??null,company_id:data.companyId??null,
  prospect_ref:data.prospectRef,score:data.score??null,stage:data.stage,intent_signals:data.intentSignals,fit_signals:data.fitSignals,
  risk_signals:data.riskSignals,next_best_actions:data.nextBestActions,model_ref:data.modelRef??null,updated_at:new Date().toISOString()
 },{onConflict:"tenant_id,product_key,prospect_ref"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const proposal=z.object({tenantId:uuid,productKey:product.nullish(),opportunityId:uuid.nullish(),personId:uuid.nullish(),companyId:uuid.nullish(),
 proposalRef:z.string().min(1).max(200),title:z.string().min(2).max(300),currency:z.string().regex(/^[A-Z]{3}$/).nullish(),
 totalMinor:z.number().int().nullish(),terms:z.record(z.string(),z.unknown()).default({}),documentId:uuid.nullish(),validUntil:z.string().datetime().nullish()});
export const createSalesProposal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof proposal>)=>proposal.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.sales-engagement");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("sales_proposals").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,opportunity_id:data.opportunityId??null,person_id:data.personId??null,
  company_id:data.companyId??null,proposal_ref:data.proposalRef,title:data.title,currency:data.currency??null,total_minor:data.totalMinor??null,
  terms:data.terms,document_id:data.documentId??null,status:"draft",valid_until:data.validUntil??null,created_by:context.userId
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const approveSalesProposal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;proposalId:string})=>z.object({tenantId:uuid,proposalId:uuid}).parse(i))
.handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.sales-engagement");requireAdminRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("sales_proposals").update({status:"approved",approved_by:context.userId,
  approved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("tenant_id",data.tenantId).eq("id",data.proposalId)
  .in("status",["draft","review"]).select("*").single();if(error)throw new Error(error.message);return row;
});

const outcome=z.object({tenantId:uuid,productKey:product.nullish(),runId:uuid.nullish(),useCaseId:uuid.nullish(),decisionRef:z.string().max(300).nullish(),
 expectedOutcome:z.record(z.string(),z.unknown()).default({}),observedOutcome:z.record(z.string(),z.unknown()).default({}),
 outcomeScore:z.number().nullish(),reviewSummary:z.string().min(5).max(8000),evidenceRefs:z.array(z.unknown()).max(200).default([])});
export const recordAiOutcomeReview=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof outcome>)=>outcome.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.decision-learning");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("ai_outcome_reviews").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,run_id:data.runId??null,use_case_id:data.useCaseId??null,
  decision_ref:data.decisionRef??null,expected_outcome:data.expectedOutcome,observed_outcome:data.observedOutcome,
  outcome_score:data.outcomeScore??null,review_summary:data.reviewSummary,evidence_refs:data.evidenceRefs,
  reviewed_by:context.userId,reviewed_at:new Date().toISOString()
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const lesson=z.object({tenantId:uuid,productKey:product.nullish(),useCaseId:uuid.nullish(),outcomeReviewId:uuid,
 lessonType:z.enum(["prompt","routing","policy","tool","data","human_process","model_candidate","other"]),
 title:z.string().min(2).max(300),lesson:z.string().min(5).max(8000),proposedChange:z.record(z.string(),z.unknown()).default({})});
export const proposeReviewedLesson=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof lesson>)=>lesson.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.decision-learning");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("ai_reviewed_lessons").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,use_case_id:data.useCaseId??null,outcome_review_id:data.outcomeReviewId,
  lesson_type:data.lessonType,title:data.title,lesson:data.lesson,proposed_change:data.proposedChange,status:"candidate"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const approveReviewedLesson=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;lessonId:string})=>z.object({tenantId:uuid,lessonId:uuid}).parse(i))
.handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.decision-learning");requireAdminRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("ai_reviewed_lessons").update({
  status:"approved",approved_by:context.userId,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()
 }).eq("tenant_id",data.tenantId).eq("id",data.lessonId).in("status",["candidate","review"]).select("*").single();
 if(error)throw new Error(error.message);return row;
});
