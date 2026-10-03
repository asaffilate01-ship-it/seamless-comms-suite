import {createHash,randomBytes} from "node:crypto";
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid();
const product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product});

async function writeAccess(context:any,tenantId:string,serviceKey:string){
 const a=await requireService(context,tenantId,serviceKey);requireWriteRole(a.role);return a;
}
async function adminAccess(context:any,tenantId:string,serviceKey:string){
 const a=await requireService(context,tenantId,serviceKey);requireAdminRole(a.role);return a;
}

export const getContactCentreWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("contact_centres").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("name"),
  db.from("contact_queues").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("name"),
  db.from("contact_agent_profiles").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("display_name"),
  db.from("contact_interactions").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("started_at",{ascending:false}).limit(200),
  db.from("contact_callbacks").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("due_at").limit(100)
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 const now=new Date(),from=new Date(now.getTime()-30*86400000).toISOString();
 const metrics=await db.rpc("contact_centre_metrics",{_tenant:data.tenantId,_product:data.productKey,_from:from,_to:now.toISOString()});
 if(metrics.error)throw new Error(metrics.error.message);
 return{centres:rs[0].data??[],queues:rs[1].data??[],agents:rs[2].data??[],interactions:rs[3].data??[],callbacks:rs[4].data??[],metrics:metrics.data};
});

const centre=scope.extend({name:z.string().min(1).max(160),aiResolutionTarget:z.number().min(0).max(100).default(80)});
export const createContactCentre=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof centre>)=>centre.parse(i)).handler(async({context,data})=>{
 await adminAccess(context,data.tenantId,"omniqora.contact-centre");
 const{data:row,error}=await(context.supabase as any).from("contact_centres").insert({
  tenant_id:data.tenantId,product_key:data.productKey,name:data.name,ai_first:true,ai_resolution_target:data.aiResolutionTarget,
  recording_policy:"disabled",transcript_retention_days:30,status:"active"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const queue=scope.extend({centreId:uuid,name:z.string().min(1).max(160),skills:z.array(z.string().max(80)).max(100).default([])});
export const createContactQueue=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof queue>)=>queue.parse(i)).handler(async({context,data})=>{
 await adminAccess(context,data.tenantId,"omniqora.contact-centre");
 const{data:row,error}=await(context.supabase as any).from("contact_queues").insert({
  tenant_id:data.tenantId,product_key:data.productKey,centre_id:data.centreId,name:data.name,skills:data.skills,ai_first:true,
  callback_enabled:true,same_agent_enabled:true,status:"active"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const callbackSchema=scope.extend({interactionId:uuid.nullish(),personId:uuid.nullish(),queueId:uuid.nullish(),preferredAgentId:uuid.nullish(),dueAt:z.string().datetime(),reason:z.string().max(2000).nullish()});
export const createContactCallback=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof callbackSchema>)=>callbackSchema.parse(i)).handler(async({context,data})=>{
 await writeAccess(context,data.tenantId,"omniqora.contact-centre");
 const{data:row,error}=await(context.supabase as any).from("contact_callbacks").insert({
  tenant_id:data.tenantId,product_key:data.productKey,interaction_id:data.interactionId??null,person_id:data.personId??null,
  queue_id:data.queueId??null,preferred_agent_id:data.preferredAgentId??null,due_at:data.dueAt,reason:data.reason??null,status:"queued"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const getGrowthLabWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const productOrNull="product_key.eq."+data.productKey+",product_key.is.null";
 const rs=await Promise.all([
  db.from("growth_consent_topics").select("*").eq("tenant_id",data.tenantId).or(productOrNull).order("name"),
  db.from("growth_experiments").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}),
  db.from("growth_attribution_touches").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("occurred_at",{ascending:false}).limit(200),
  db.from("growth_referral_programmes").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("name"),
  db.from("growth_recovery_cases").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("feedback_requests").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100)
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{consentTopics:rs[0].data??[],experiments:rs[1].data??[],attribution:rs[2].data??[],referralProgrammes:rs[3].data??[],recovery:rs[4].data??[],feedbackRequests:rs[5].data??[]};
});

const experiment=scope.extend({name:z.string().min(1).max(200),hypothesis:z.string().min(5).max(4000),goalEvent:z.string().min(1).max(160)});
export const createGrowthExperiment=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof experiment>)=>experiment.parse(i)).handler(async({context,data})=>{
 await adminAccess(context,data.tenantId,"omniqora.growth-lab");const db=context.supabase as any;
 const{data:row,error}=await db.from("growth_experiments").insert({
  tenant_id:data.tenantId,product_key:data.productKey,name:data.name,hypothesis:data.hypothesis,experiment_type:"abn",goal_event:data.goalEvent,status:"draft",created_by:context.userId
 }).select("*").single();if(error)throw new Error(error.message);
 const vr=await db.from("growth_experiment_variants").insert([
  {tenant_id:data.tenantId,experiment_id:row.id,variant_key:"control",name:"Control",weight_bps:5000,config:{},active:true},
  {tenant_id:data.tenantId,experiment_id:row.id,variant_key:"variant",name:"Variant",weight_bps:5000,config:{},active:true}
 ]);if(vr.error)throw new Error(vr.error.message);return row;
});

const consentTopic=scope.extend({topicKey:z.string().regex(/^[a-z0-9_.-]{2,120}$/),name:z.string().min(1).max(160),purpose:z.string().min(1).max(1000)});
export const createConsentTopic=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof consentTopic>)=>consentTopic.parse(i)).handler(async({context,data})=>{
 await adminAccess(context,data.tenantId,"omniqora.growth-lab");
 const{data:row,error}=await(context.supabase as any).from("growth_consent_topics").upsert({
  tenant_id:data.tenantId,product_key:data.productKey,topic_key:data.topicKey,name:data.name,purpose:data.purpose,channels:[],default_state:"unknown"
 },{onConflict:"tenant_id,product_key,topic_key"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const feedbackRequest=z.object({tenantId:uuid,productKey:product,surveyId:uuid,personId:uuid.nullish(),validDays:z.number().int().min(1).max(90).default(14)});
export const createFeedbackRequestToken=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof feedbackRequest>)=>feedbackRequest.parse(i)).handler(async({context,data})=>{
 await writeAccess(context,data.tenantId,"omniqora.growth-lab");const db=context.supabase as any;
 const token=randomBytes(32).toString("base64url"),tokenHash=createHash("sha256").update(token).digest("hex");
 const{data:row,error}=await db.from("feedback_requests").insert({
  tenant_id:data.tenantId,product_key:data.productKey,survey_id:data.surveyId,person_id:data.personId??null,channel:"email",
  token_hash:tokenHash,delivery_status:"queued",expires_at:new Date(Date.now()+data.validDays*86400000).toISOString()
 }).select("id,delivery_status,expires_at").single();if(error)throw new Error(error.message);return{request:row,token};
});

export const getBillingWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("billing_plan_catalogue").select("*").eq("product_key",data.productKey).neq("status","retired").order("name"),
  db.from("billing_subscriptions").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}),
  db.from("usage_events").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("occurred_at",{ascending:false}).limit(250),
  db.from("billing_invoice_runs").select("*,lines:billing_invoice_lines(*)").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(50),
  db.from("billing_settlement_entries").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100)
 ]);for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{plans:rs[0].data??[],subscriptions:rs[1].data??[],usage:rs[2].data??[],invoices:rs[3].data??[],settlements:rs[4].data??[]};
});

const billingPlan=z.object({productKey:product,planKey:z.string().regex(/^[a-z0-9_.-]{2,100}$/),name:z.string().min(1).max(160),currency:z.string().regex(/^[A-Z]{3}$/),priceMinor:z.number().int().min(0)});
export const saveBillingPlan=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof billingPlan>)=>billingPlan.parse(i)).handler(async({context,data})=>{
 const check=await(context.supabase as any).rpc("is_platform_admin",{_user:context.userId});if(check.error||!check.data)throw new Error("Platform administrator required");
 const{data:row,error}=await(context.supabase as any).from("billing_plan_catalogue").upsert({
  plan_key:data.planKey,product_key:data.productKey,name:data.name,currency:data.currency,billing_interval:"monthly",price_minor:data.priceMinor,status:"active"
 },{onConflict:"plan_key"}).select("*").single();if(error)throw new Error(error.message);return row;
});

export const activateBillingSubscription=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey:string;planKey:string})=>z.object({tenantId:uuid,productKey:product,planKey:z.string().min(2).max(100)}).parse(i))
.handler(async({context,data})=>{
 const check=await(context.supabase as any).rpc("is_platform_admin",{_user:context.userId});if(check.error||!check.data)throw new Error("Platform administrator required");
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const r=await admin.rpc("billing_activate_subscription",{_tenant:data.tenantId,_product:data.productKey,_plan:data.planKey,_provider:null,_provider_ref:null,_actor:context.userId});
 if(r.error)throw new Error(r.error.message);return{subscriptionId:r.data as string};
});

export const getMobileFleetWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("mobile_app_profiles").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("name"),
  db.from("mobile_devices").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("last_seen_at",{ascending:false}).limit(100),
  db.from("mobile_offline_events").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("received_at",{ascending:false}).limit(100),
  db.from("dispatch_shifts").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("starts_at",{ascending:false}).limit(100),
  db.from("dispatch_agent_wallet_entries").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("dispatch_vehicle_maintenance").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("due_at").limit(100),
  db.from("telecom_lines").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(100)
 ]);for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{profiles:rs[0].data??[],devices:rs[1].data??[],offlineEvents:rs[2].data??[],shifts:rs[3].data??[],wallet:rs[4].data??[],maintenance:rs[5].data??[],telecomLines:rs[6].data??[]};
});

const mobileProfile=scope.extend({profileKey:z.string().regex(/^[a-z0-9_.-]{2,100}$/),name:z.string().min(1).max(160),capabilities:z.array(z.string().max(120)).max(200).default([])});
export const saveMobileProfile=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof mobileProfile>)=>mobileProfile.parse(i)).handler(async({context,data})=>{
 await adminAccess(context,data.tenantId,"omniqora.mobile-core");
 const{data:row,error}=await(context.supabase as any).from("mobile_app_profiles").upsert({
  tenant_id:data.tenantId,product_key:data.productKey,profile_key:data.profileKey,name:data.name,capabilities:data.capabilities,
  branding:{},offline_policy:{enabled:true},location_policy:{background:true},status:"active",updated_at:new Date().toISOString()
 },{onConflict:"tenant_id,product_key,profile_key"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const shift=scope.extend({agentId:uuid,startsAt:z.string().datetime(),endsAt:z.string().datetime()});
export const createDispatchShift=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof shift>)=>shift.parse(i)).handler(async({context,data})=>{
 await writeAccess(context,data.tenantId,"omniqora.fleet-ops");if(Date.parse(data.endsAt)<=Date.parse(data.startsAt))throw new Error("Shift end must be after start");
 const{data:row,error}=await(context.supabase as any).from("dispatch_shifts").insert({
  tenant_id:data.tenantId,product_key:data.productKey,agent_id:data.agentId,starts_at:data.startsAt,ends_at:data.endsAt,planned_status:"scheduled"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const getDecisionWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const productOrNull="product_key.eq."+data.productKey+",product_key.is.null";
 const rs=await Promise.all([
  db.from("decision_cases").select("*,options:decision_options(*),evidence:decision_evidence(*)").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("updated_at",{ascending:false}).limit(100),
  db.from("decision_records").select("*,outcomes:decision_outcomes(*)").eq("tenant_id",data.tenantId).order("decided_at",{ascending:false}).limit(100),
  db.from("decision_lessons").select("*").eq("tenant_id",data.tenantId).or(productOrNull).order("created_at",{ascending:false}).limit(100),
  db.from("decision_model_candidates").select("*,evaluations:decision_model_evaluations(*)").eq("tenant_id",data.tenantId).or(productOrNull).order("created_at",{ascending:false}).limit(100),
  db.from("advisory_engagements").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("updated_at",{ascending:false}).limit(100),
  db.from("advisory_templates").select("*").eq("status","active").order("name"),
  db.from("tax_scenario_runs").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100)
 ]);for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{cases:rs[0].data??[],decisions:rs[1].data??[],lessons:rs[2].data??[],models:rs[3].data??[],engagements:rs[4].data??[],templates:rs[5].data??[],taxScenarios:rs[6].data??[]};
});

const decisionCase=scope.extend({caseKey:z.string().regex(/^[a-z0-9_.-]{2,120}$/),title:z.string().min(1).max(240),question:z.string().min(5).max(5000),domain:z.string().min(1).max(120)});
export const createDecisionCase=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof decisionCase>)=>decisionCase.parse(i)).handler(async({context,data})=>{
 await writeAccess(context,data.tenantId,"omniqora.decision-intelligence");
 const{data:row,error}=await(context.supabase as any).from("decision_cases").insert({
  tenant_id:data.tenantId,product_key:data.productKey,case_key:data.caseKey,title:data.title,question:data.question,domain:data.domain,
  owner_user_id:context.userId,status:"open",assumptions:[],unknowns:[]
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const outcome=z.object({tenantId:uuid,decisionId:uuid,outcome:z.record(z.string(),z.unknown()),expectedVsActual:z.record(z.string(),z.unknown()).default({}),failurePatterns:z.array(z.unknown()).max(200).default([])});
export const recordDecisionOutcome=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof outcome>)=>outcome.parse(i)).handler(async({context,data})=>{
 await writeAccess(context,data.tenantId,"omniqora.decision-intelligence");
 const{data:row,error}=await(context.supabase as any).from("decision_outcomes").insert({
  tenant_id:data.tenantId,decision_id:data.decisionId,outcome:data.outcome,expected_vs_actual:data.expectedVsActual,
  failure_patterns:data.failurePatterns,reviewer_user_id:context.userId,evidence_refs:[]
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const engagement=scope.extend({templateKey:z.string().max(120).nullish(),title:z.string().min(1).max(240)});
export const createAdvisoryEngagement=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof engagement>)=>engagement.parse(i)).handler(async({context,data})=>{
 await writeAccess(context,data.tenantId,"omniqora.advisory");
 const{data:row,error}=await(context.supabase as any).from("advisory_engagements").insert({
  tenant_id:data.tenantId,product_key:data.productKey,template_key:data.templateKey??null,title:data.title,
  adviser_user_id:context.userId,delivery_team:[],branding:{},status:"discovery"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const getPlatformDepthWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("tenant_translation_overrides").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).limit(100),
  db.from("embedded_surfaces").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("name"),
  db.from("ai_agent_template_catalogue").select("*").eq("status","active").order("family").order("name"),
  db.from("tenant_agent_templates").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey),
  db.from("report_schedules").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("name"),
  db.from("analytics_sinks").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("name"),
  db.from("region_packs").select("*").eq("region_key","sa").maybeSingle()
 ]);for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{overrides:rs[0].data??[],embeds:rs[1].data??[],agentTemplates:rs[2].data??[],tenantTemplates:rs[3].data??[],reportSchedules:rs[4].data??[],analyticsSinks:rs[5].data??[],saudiRegion:rs[6].data??null};
});

const embed=scope.extend({surfaceKey:z.string().regex(/^[a-z0-9_.-]{2,120}$/),name:z.string().min(1).max(160)});
export const createEmbeddedSurface=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof embed>)=>embed.parse(i)).handler(async({context,data})=>{
 await adminAccess(context,data.tenantId,"omniqora.embeds");
 const{data:row,error}=await(context.supabase as any).from("embedded_surfaces").upsert({
  tenant_id:data.tenantId,product_key:data.productKey,surface_key:data.surfaceKey,surface_type:"widget",name:data.name,allowed_origins:[],
  theme:{},config:{},status:"active",updated_at:new Date().toISOString()
 },{onConflict:"tenant_id,product_key,surface_key"}).select("*").single();if(error)throw new Error(error.message);return row;
});
