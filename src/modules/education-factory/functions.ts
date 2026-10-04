import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid(),product=z.string().min(2).max(80);

export const getEducationFactory=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey:string})=>z.object({tenantId:uuid,productKey:product}).parse(i))
.handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("education_institutions").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("name"),
  db.from("education_programmes").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("name"),
  db.from("education_cohorts").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("starts_on",{ascending:false}),
  db.from("education_students").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("updated_at",{ascending:false}).limit(500),
  db.from("education_enrolments").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(500),
  db.from("education_interventions").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("education_knowledge_scopes").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("scope_type"),
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{institutions:rs[0].data??[],programmes:rs[1].data??[],cohorts:rs[2].data??[],students:rs[3].data??[],
  enrolments:rs[4].data??[],interventions:rs[5].data??[],knowledgeScopes:rs[6].data??[]};
});

const institution=z.object({tenantId:uuid,productKey:product,institutionRef:z.string().min(1).max(160),name:z.string().min(2).max(240),
 institutionType:z.string().min(1).max(100).default("provider"),countryCode:z.string().max(3).nullish(),
 regulatorRefs:z.array(z.unknown()).max(100).default([]),metadata:z.record(z.string(),z.unknown()).default({})});
export const createEducationInstitution=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof institution>)=>institution.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.education-factory");requireAdminRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("education_institutions").insert({
  tenant_id:data.tenantId,product_key:data.productKey,institution_ref:data.institutionRef,name:data.name,
  institution_type:data.institutionType,country_code:data.countryCode??null,regulator_refs:data.regulatorRefs,metadata:data.metadata,status:"active"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const programme=z.object({tenantId:uuid,productKey:product,institutionId:uuid.nullish(),programmeRef:z.string().min(1).max(160),
 name:z.string().min(2).max(240),level:z.string().max(100).nullish(),awardingBody:z.string().max(160).nullish(),
 deliveryMode:z.string().max(100).nullish(),duration:z.record(z.string(),z.unknown()).default({}),requirements:z.record(z.string(),z.unknown()).default({})});
export const createEducationProgramme=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof programme>)=>programme.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.education-factory");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("education_programmes").insert({
  tenant_id:data.tenantId,product_key:data.productKey,institution_id:data.institutionId??null,programme_ref:data.programmeRef,
  name:data.name,level:data.level??null,awarding_body:data.awardingBody??null,delivery_mode:data.deliveryMode??null,
  duration:data.duration,requirements:data.requirements,status:"active"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const cohort=z.object({tenantId:uuid,productKey:product,programmeId:uuid,cohortRef:z.string().min(1).max(160),
 name:z.string().min(2).max(240),startsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 endsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),capacity:z.number().int().nonnegative().nullish(),
 timetable:z.record(z.string(),z.unknown()).default({})});
export const createEducationCohort=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof cohort>)=>cohort.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.education-factory");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("education_cohorts").insert({
  tenant_id:data.tenantId,product_key:data.productKey,programme_id:data.programmeId,cohort_ref:data.cohortRef,name:data.name,
  starts_on:data.startsOn??null,ends_on:data.endsOn??null,capacity:data.capacity??null,timetable:data.timetable,status:"planned"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const student=z.object({tenantId:uuid,productKey:product,personId:uuid.nullish(),studentRef:z.string().min(1).max(160),
 status:z.enum(["applicant","onboarding","active","paused","completed","withdrawn"]).default("active"),
 profile:z.record(z.string(),z.unknown()).default({}),supportContext:z.record(z.string(),z.unknown()).default({})});
export const createEducationStudent=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof student>)=>student.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.education-factory");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("education_students").insert({
  tenant_id:data.tenantId,product_key:data.productKey,person_id:data.personId??null,student_ref:data.studentRef,status:data.status,
  profile:data.profile,support_context:data.supportContext
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const enrol=z.object({tenantId:uuid,productKey:product,studentId:uuid,programmeId:uuid,cohortId:uuid.nullish(),
 expectedCompletion:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish()});
export const enrolEducationStudent=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof enrol>)=>enrol.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.education-factory");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("education_enrolments").insert({
  tenant_id:data.tenantId,product_key:data.productKey,student_id:data.studentId,programme_id:data.programmeId,
  cohort_id:data.cohortId??null,expected_completion:data.expectedCompletion??null,status:"active"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const attendance=z.object({tenantId:uuid,productKey:product,studentId:uuid,cohortId:uuid.nullish(),sessionRef:z.string().min(1).max(200),
 occurredOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),status:z.enum(["present","late","authorised_absence","absence","remote_present"]),
 minutesAttended:z.number().int().nonnegative().nullish(),evidenceRefs:z.array(z.unknown()).max(100).default([])});
export const recordEducationAttendance=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof attendance>)=>attendance.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.education-factory");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("education_attendance_events").upsert({
  tenant_id:data.tenantId,product_key:data.productKey,student_id:data.studentId,cohort_id:data.cohortId??null,
  session_ref:data.sessionRef,occurred_on:data.occurredOn,status:data.status,minutes_attended:data.minutesAttended??null,
  evidence_refs:data.evidenceRefs
 },{onConflict:"tenant_id,student_id,session_ref"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const assessment=z.object({tenantId:uuid,productKey:product,studentId:uuid,programmeId:uuid,assessmentRef:z.string().min(1).max(200),
 assessmentType:z.string().max(100).nullish(),score:z.number().nullish(),grade:z.string().max(80).nullish(),maxScore:z.number().positive().nullish(),
 attempt:z.number().int().positive().default(1),status:z.enum(["provisional","moderation","confirmed","resit","void"]).default("provisional"),
 evidenceRefs:z.array(z.unknown()).max(100).default([])});
export const recordEducationAssessment=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof assessment>)=>assessment.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.education-factory");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("education_assessment_results").insert({
  tenant_id:data.tenantId,product_key:data.productKey,student_id:data.studentId,programme_id:data.programmeId,
  assessment_ref:data.assessmentRef,assessment_type:data.assessmentType??null,score:data.score??null,grade:data.grade??null,
  max_score:data.maxScore??null,attempt:data.attempt,status:data.status,evidence_refs:data.evidenceRefs,recorded_by:context.userId
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const intervention=z.object({tenantId:uuid,productKey:product,studentId:uuid,interventionType:z.string().min(1).max(120),
 reason:z.string().min(5).max(4000),evidenceRefs:z.array(z.unknown()).max(100).default([]),proposedBy:z.string().max(120).default("system")});
export const proposeEducationIntervention=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof intervention>)=>intervention.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.education-factory");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("education_interventions").insert({
  tenant_id:data.tenantId,product_key:data.productKey,student_id:data.studentId,intervention_type:data.interventionType,
  reason:data.reason,evidence_refs:data.evidenceRefs,proposed_by:data.proposedBy,status:"proposed"
 }).select("*").single();if(error)throw new Error(error.message);return{...row,humanApprovalRequired:true};
});

export const reviewEducationIntervention=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;interventionId:string;decision:"approved"|"rejected"})=>z.object({tenantId:uuid,interventionId:uuid,decision:z.enum(["approved","rejected"])}).parse(i))
.handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.education-factory");requireAdminRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("education_interventions").update({
  status:data.decision,reviewed_by:context.userId,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
 }).eq("tenant_id",data.tenantId).eq("id",data.interventionId).in("status",["proposed","review"]).select("*").single();
 if(error)throw new Error(error.message);return row;
});

export const getStudent360=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey:string;studentId:string})=>z.object({tenantId:uuid,productKey:product,studentId:uuid}).parse(i))
.handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);
 const r=await(context.supabase as any).rpc("education_student_360",{_tenant:data.tenantId,_product:data.productKey,_student:data.studentId});
 if(r.error)throw new Error(r.error.message);return r.data;
});

export const getFactoryLaunchReadiness=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey:string})=>z.object({tenantId:uuid,productKey:product}).parse(i))
.handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);
 const db=context.supabase as any;
 const [result,gates]=await Promise.all([
  db.rpc("saas_factory_readiness",{_tenant:data.tenantId,_product:data.productKey}),
  db.from("factory_launch_gates").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("category").order("gate_key")
 ]);
 if(result.error)throw new Error(result.error.message);if(gates.error)throw new Error(gates.error.message);
 return{readiness:result.data,gates:gates.data??[]};
});

const gate=z.object({tenantId:uuid,productKey:product,gateKey:z.string().regex(/^[a-z0-9_.-]{2,120}$/),category:z.string().min(1).max(100),
 title:z.string().min(2).max(240),required:z.boolean().default(true),status:z.enum(["pending","in_progress","passed","failed","waived","not_applicable"]),
 evidenceRefs:z.array(z.unknown()).max(100).default([]),blocker:z.string().max(2000).nullish(),metadata:z.record(z.string(),z.unknown()).default({})});
export const reviewFactoryLaunchGate=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof gate>)=>gate.parse(i)).handler(async({context,data})=>{
 const access=await requireTenantMembership(context,data.tenantId);requireAdminRole(access.role);
 const reviewed=["passed","failed","waived","not_applicable"].includes(data.status);
 const{data:row,error}=await(context.supabase as any).from("factory_launch_gates").upsert({
  tenant_id:data.tenantId,product_key:data.productKey,gate_key:data.gateKey,category:data.category,title:data.title,
  required:data.required,status:data.status,evidence_refs:data.evidenceRefs,blocker:data.blocker??null,metadata:data.metadata,
  reviewed_by:reviewed?context.userId:null,reviewed_at:reviewed?new Date().toISOString():null,updated_at:new Date().toISOString()
 },{onConflict:"tenant_id,product_key,gate_key"}).select("*").single();if(error)throw new Error(error.message);return row;
});
