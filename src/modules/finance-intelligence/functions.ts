import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid();
const product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product});

async function writable(context:any,tenantId:string,service?:string){
 const a=service?await requireService(context,tenantId,service):await requireTenantMembership(context,tenantId);
 requireWriteRole(a.role);return a;
}

export const getFinanceIntelligenceWorkspace=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i))
.handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);
 const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("practice_clients").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("display_name"),
  db.from("practice_engagements").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("practice_deadlines").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("due_at").limit(200),
  db.from("accounting_ingestion_jobs").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("accounting_accounts_prep_runs").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("accounting_assets").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("tax_research_cases").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("tax_position_proposals").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("payroll_runs").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("pay_date",{ascending:false}).limit(100),
  db.from("company_secretarial_entities").select("*,obligations:company_secretarial_obligations(*)").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("legal_name")
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{clients:rs[0].data??[],engagements:rs[1].data??[],deadlines:rs[2].data??[],ingestionJobs:rs[3].data??[],
  accountsPrep:rs[4].data??[],assets:rs[5].data??[],taxCases:rs[6].data??[],taxPositions:rs[7].data??[],
  payrollRuns:rs[8].data??[],companies:rs[9].data??[]};
});

const client=scope.extend({clientRef:z.string().min(1).max(120),displayName:z.string().min(1).max(240),
 personId:uuid.nullish(),companyId:uuid.nullish(),jurisdiction:z.string().max(40).nullish(),metadata:z.record(z.string(),z.unknown()).default({})});
export const createPracticeClient=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof client>)=>client.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.practice");const db=context.supabase as any;
 const {data:row,error}=await db.from("practice_clients").upsert({tenant_id:data.tenantId,product_key:data.productKey,client_ref:data.clientRef,
  display_name:data.displayName,person_id:data.personId??null,company_id:data.companyId??null,jurisdiction:data.jurisdiction??null,
  metadata:data.metadata,status:"active"},{onConflict:"tenant_id,product_key,client_ref"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const engagement=scope.extend({clientId:uuid,engagementType:z.string().min(1).max(120),periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),scope:z.record(z.string(),z.unknown()).default({})});
export const createPracticeEngagement=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof engagement>)=>engagement.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.practice");const {data:row,error}=await(context.supabase as any).from("practice_engagements").insert({
  tenant_id:data.tenantId,product_key:data.productKey,client_id:data.clientId,engagement_type:data.engagementType,
  period_start:data.periodStart??null,period_end:data.periodEnd??null,scope:data.scope,status:"active",owner_user_id:context.userId}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const deadline=scope.extend({clientId:uuid,engagementId:uuid.nullish(),deadlineType:z.string().min(1).max(120),dueAt:z.string().datetime(),
 authorityRef:z.string().max(240).nullish()});
export const createPracticeDeadline=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof deadline>)=>deadline.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.practice");const {data:row,error}=await(context.supabase as any).from("practice_deadlines").insert({
  tenant_id:data.tenantId,product_key:data.productKey,client_id:data.clientId,engagement_id:data.engagementId??null,
  deadline_type:data.deadlineType,due_at:data.dueAt,authority_ref:data.authorityRef??null,status:"due"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const nominal=scope.extend({clientRef:z.string().min(1).max(120),code:z.string().min(1).max(40),name:z.string().min(1).max(160),
 accountType:z.enum(["asset","liability","equity","income","expense","cost_of_sales","tax","control"])});
export const upsertNominalAccount=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof nominal>)=>nominal.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.accounting-ai");const {data:row,error}=await(context.supabase as any).from("accounting_nominal_accounts")
 .upsert({tenant_id:data.tenantId,product_key:data.productKey,client_ref:data.clientRef,code:data.code,name:data.name,account_type:data.accountType,active:true},
 {onConflict:"tenant_id,product_key,client_ref,code"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const intake=scope.extend({clientRef:z.string().min(1).max(120),sourceKind:z.enum(["receipt","invoice","statement","csv","pdf","scan","api"]),
 documentId:uuid.nullish()});
export const createAccountingIntake=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof intake>)=>intake.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.accounting-ai");const db=context.supabase as any;
 const {data:row,error}=await db.from("accounting_ingestion_jobs").insert({tenant_id:data.tenantId,product_key:data.productKey,client_ref:data.clientRef,
  source_kind:data.sourceKind,document_id:data.documentId??null,status:"queued",extracted:{},proposed_entries:[],exceptions:[]}).select("*").single();
 if(error)throw new Error(error.message);
 await db.from("intelligence_jobs").insert({tenant_id:data.tenantId,product_key:data.productKey,job_type:"accounting.extract",
  subject_type:"accounting_ingestion_job",subject_id:row.id,input:{documentId:data.documentId,sourceKind:data.sourceKind,clientRef:data.clientRef},
  requirements:{service:"omniqora.accounting-ai",reviewRequired:true}});
 return row;
});

const proposal=scope.extend({jobId:uuid,extracted:z.record(z.string(),z.unknown()).default({}),entries:z.array(z.record(z.string(),z.unknown())).max(500),
 exceptions:z.array(z.unknown()).max(500).default([])});
export const saveAccountingProposal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof proposal>)=>proposal.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.accounting-ai");const {data:row,error}=await(context.supabase as any).from("accounting_ingestion_jobs")
 .update({extracted:data.extracted,proposed_entries:data.entries,exceptions:data.exceptions,status:"review",updated_at:new Date().toISOString()})
 .eq("tenant_id",data.tenantId).eq("id",data.jobId).select("*").single();if(error)throw new Error(error.message);return row;
});

export const postAccountingProposal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;jobId:string})=>z.object({tenantId:uuid,jobId:uuid}).parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.accounting-ai");const r=await(context.supabase as any).rpc("accounting_post_ingestion_job",
  {_tenant:data.tenantId,_job:data.jobId,_actor:context.userId});if(r.error)throw new Error(r.error.message);return{journalId:r.data as string};
});

export const getTrialBalance=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey:string;clientRef:string;periodEnd:string})=>z.object({tenantId:uuid,productKey:product,
 clientRef:z.string().min(1).max(120),periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const r=await(context.supabase as any).rpc("accounting_trial_balance_v3",
  {_tenant:data.tenantId,_product:data.productKey,_client_ref:data.clientRef,_period_end:data.periodEnd});if(r.error)throw new Error(r.error.message);return r.data??[];
});

const asset=scope.extend({clientRef:z.string().min(1).max(120),assetRef:z.string().min(1).max(120),description:z.string().min(1).max(300),
 category:z.string().min(1).max(120),acquiredOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),costMinor:z.number().int().min(0),
 residualMinor:z.number().int().min(0).default(0),currency:z.string().regex(/^[A-Z]{3}$/),usefulLifeMonths:z.number().int().positive().nullish(),
 documentId:uuid.nullish()});
export const registerAccountingAsset=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof asset>)=>asset.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.accounting-ai");const {data:row,error}=await(context.supabase as any).from("accounting_assets")
 .upsert({tenant_id:data.tenantId,product_key:data.productKey,client_ref:data.clientRef,asset_ref:data.assetRef,description:data.description,
  category:data.category,acquired_on:data.acquiredOn??null,cost_minor:data.costMinor,residual_minor:data.residualMinor,currency:data.currency,
  useful_life_months:data.usefulLifeMonths??null,source_document_id:data.documentId??null,status:"active"},
 {onConflict:"tenant_id,product_key,client_ref,asset_ref"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const prep=scope.extend({clientRef:z.string().min(1).max(120),periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),priorPeriodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 inputRefs:z.record(z.string(),z.unknown()).default({})});
export const startAccountsPreparation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof prep>)=>prep.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.accounting-ai");const db=context.supabase as any;
 const {data:row,error}=await db.from("accounting_accounts_prep_runs").insert({tenant_id:data.tenantId,product_key:data.productKey,
  client_ref:data.clientRef,period_start:data.periodStart,period_end:data.periodEnd,prior_period_end:data.priorPeriodEnd??null,
  status:"queued",input_refs:data.inputRefs,created_by:context.userId}).select("*").single();if(error)throw new Error(error.message);
 await db.from("intelligence_jobs").insert({tenant_id:data.tenantId,product_key:data.productKey,job_type:"accounting.accounts_prep",
  subject_type:"accounts_prep_run",subject_id:row.id,input:{clientRef:data.clientRef,periodStart:data.periodStart,periodEnd:data.periodEnd,
  priorPeriodEnd:data.priorPeriodEnd,inputRefs:data.inputRefs},requirements:{service:"omniqora.accounting-ai",reviewRequired:true}});
 return row;
});

const taxCase=scope.extend({clientRef:z.string().min(1).max(120),jurisdiction:z.string().min(2).max(40),taxType:z.string().min(1).max(100),
 period:z.string().max(80).nullish(),question:z.string().min(4).max(5000)});
export const createTaxResearchCase=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof taxCase>)=>taxCase.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.tax-intelligence");const db=context.supabase as any;
 const {data:row,error}=await db.from("tax_research_cases").insert({tenant_id:data.tenantId,product_key:data.productKey,client_ref:data.clientRef,
  jurisdiction:data.jurisdiction,tax_type:data.taxType,period:data.period??null,question:data.question,status:"research",authority_sources:[],conclusions:{}})
  .select("*").single();if(error)throw new Error(error.message);
 const {data:run,error:runError}=await db.from("tax_research_runs").insert({tenant_id:data.tenantId,product_key:data.productKey,
  research_case_id:row.id,query:data.question,status:"queued"}).select("*").single();if(runError)throw new Error(runError.message);
 await db.from("intelligence_jobs").insert({tenant_id:data.tenantId,product_key:data.productKey,job_type:"tax.research",
  subject_type:"tax_research_run",subject_id:run.id,input:{caseId:row.id,query:data.question,jurisdiction:data.jurisdiction,taxType:data.taxType},
  requirements:{service:"omniqora.tax-intelligence",citationsRequired:true,humanReviewRequired:true}});
 return{case:row,run};
});

const taxPosition=scope.extend({caseId:uuid,title:z.string().min(1).max(240),positionType:z.string().min(1).max(100),
 proposedTreatment:z.string().min(1).max(6000),legalBasis:z.string().min(1).max(6000),sourceIds:z.array(uuid).max(100).default([]),
 factDependencies:z.array(z.string().max(500)).max(100).default([]),evidenceRefs:z.array(z.string().max(500)).max(100).default([]),
 estimatedTaxImpactMinor:z.number().int().nullish(),currency:z.string().regex(/^[A-Z]{3}$/).nullish(),
 confidence:z.number().min(0).max(1).nullish(),risk:z.enum(["low","medium","high","specialist_review"]).default("specialist_review")});
export const createTaxPosition=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof taxPosition>)=>taxPosition.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.tax-intelligence");const {data:row,error}=await(context.supabase as any).from("tax_position_proposals").insert({
  tenant_id:data.tenantId,product_key:data.productKey,research_case_id:data.caseId,title:data.title,position_type:data.positionType,
  proposed_treatment:data.proposedTreatment,legal_basis:data.legalBasis,source_ids:data.sourceIds,fact_dependencies:data.factDependencies,
  evidence_refs:data.evidenceRefs,estimated_tax_impact_minor:data.estimatedTaxImpactMinor??null,currency:data.currency??null,
  confidence:data.confidence??null,risk:data.risk,status:"proposed"}).select("*").single();if(error)throw new Error(error.message);return row;
});

export const reviewTaxPosition=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;positionId:string;decision:"approved"|"rejected"|"changes_required"})=>z.object({tenantId:uuid,positionId:uuid,
 decision:z.enum(["approved","rejected","changes_required"])}).parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.tax-intelligence");requireAdminRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("tax_position_proposals").update({status:data.decision,reviewed_by:context.userId,
  reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("tenant_id",data.tenantId).eq("id",data.positionId).select("*").single();
 if(error)throw new Error(error.message);return row;
});


const payrollEmployee=scope.extend({employerRef:z.string().min(1).max(160),employeeRef:z.string().min(1).max(160),
 personId:uuid.nullish(),payrollId:z.string().max(120).nullish(),taxCode:z.string().max(80).nullish(),
 payFrequency:z.enum(["weekly","fortnightly","four_weekly","monthly","quarterly","annual"]),config:z.record(z.string(),z.unknown()).default({})});
export const upsertPayrollEmployee=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof payrollEmployee>)=>payrollEmployee.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.payroll");
 const {data:row,error}=await(context.supabase as any).from("payroll_employees").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  employer_ref:data.employerRef,employee_ref:data.employeeRef,person_id:data.personId??null,payroll_id:data.payrollId??null,tax_code:data.taxCode??null,
  pay_frequency:data.payFrequency,status:"active",config:data.config,updated_at:new Date().toISOString()},
 {onConflict:"tenant_id,product_key,employer_ref,employee_ref"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const payrollRun=scope.extend({employerRef:z.string().min(1).max(160),periodKey:z.string().min(1).max(100),payDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)});
export const createPayrollRunV3=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof payrollRun>)=>payrollRun.parse(i)).handler(async({context,data})=>{
 await writable(context,data.tenantId,"omniqora.payroll");
 const {data:row,error}=await(context.supabase as any).from("payroll_runs").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  employer_ref:data.employerRef,period_key:data.periodKey,pay_date:data.payDate,status:"draft",totals:{}},
 {onConflict:"tenant_id,product_key,employer_ref,period_key"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const payrollLine=z.object({tenantId:uuid,runId:uuid,employeeId:uuid,grossMinor:z.number().int().min(0),
 deductionsMinor:z.number().int().min(0),employerCostMinor:z.number().int().min(0),netMinor:z.number().int().min(0),
 calculation:z.record(z.string(),z.unknown()).default({})});
export const savePayrollRunLine=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof payrollLine>)=>payrollLine.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.payroll");requireWriteRole(a.role);const db=context.supabase as any;
 const run=await db.from("payroll_runs").select("id,status").eq("tenant_id",data.tenantId).eq("id",data.runId).single();
 if(run.error)throw new Error(run.error.message);if(!["draft","calculated","review"].includes(run.data.status))throw new Error("Payroll run is locked");
 const {data:row,error}=await db.from("payroll_run_lines").upsert({tenant_id:data.tenantId,run_id:data.runId,employee_id:data.employeeId,
  gross_minor:data.grossMinor,deductions_minor:data.deductionsMinor,employer_cost_minor:data.employerCostMinor,net_minor:data.netMinor,
  calculation:data.calculation},{onConflict:"run_id,employee_id"}).select("*").single();if(error)throw new Error(error.message);
 const totals=await db.from("payroll_run_lines").select("gross_minor,deductions_minor,employer_cost_minor,net_minor").eq("run_id",data.runId);
 if(totals.error)throw new Error(totals.error.message);
 const sum=(key:string)=>(totals.data??[]).reduce((n:number,x:any)=>n+Number(x[key]??0),0);
 await db.from("payroll_runs").update({status:"review",totals:{grossMinor:sum("gross_minor"),deductionsMinor:sum("deductions_minor"),
  employerCostMinor:sum("employer_cost_minor"),netMinor:sum("net_minor")},updated_at:new Date().toISOString()}).eq("id",data.runId);
 return row;
});

export const reviewPayrollRun=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;runId:string;decision:"approved"|"cancelled"})=>z.object({tenantId:uuid,runId:uuid,decision:z.enum(["approved","cancelled"])}).parse(i))
.handler(async({context,data})=>{const a=await requireService(context,data.tenantId,"omniqora.payroll");requireAdminRole(a.role);const db=context.supabase as any;
 const current=await db.from("payroll_runs").select("id,status,totals").eq("tenant_id",data.tenantId).eq("id",data.runId).single();
 if(current.error)throw new Error(current.error.message);if(data.decision==="approved"&&current.data.status!=="review")throw new Error("Payroll run must be reviewed first");
 const {data:row,error}=await db.from("payroll_runs").update({status:data.decision,updated_at:new Date().toISOString()}).eq("id",data.runId).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const officer=z.object({tenantId:uuid,entityId:uuid,officerType:z.enum(["director","secretary","psc","member","shareholder"]),
 personRef:z.string().min(1).max(160),name:z.string().min(1).max(240),appointedOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 ceasedOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),verificationStatus:z.enum(["unverified","pending","verified","failed","expired"]).default("unverified"),
 verificationRef:z.string().max(240).nullish(),metadata:z.record(z.string(),z.unknown()).default({})});
export const createSecretarialOfficer=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof officer>)=>officer.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.company-secretarial");
 if(data.verificationStatus==="verified")requireAdminRole(a.role);else requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("company_secretarial_officers").insert({tenant_id:data.tenantId,entity_id:data.entityId,
  officer_type:data.officerType,person_ref:data.personRef,name:data.name,appointed_on:data.appointedOn??null,ceased_on:data.ceasedOn??null,
  verification_status:data.verificationStatus,verification_ref:data.verificationRef??null,metadata:data.metadata}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const filing=z.object({tenantId:uuid,entityId:uuid,filingType:z.string().min(1).max(160),periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 dueAt:z.string().datetime().nullish(),providerKey:z.string().max(120).nullish(),payload:z.record(z.string(),z.unknown()).default({}),
 evidenceDocumentId:uuid.nullish()});
export const createSecretarialFiling=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof filing>)=>filing.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.company-secretarial");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("company_secretarial_filings").insert({tenant_id:data.tenantId,entity_id:data.entityId,
  filing_type:data.filingType,period_end:data.periodEnd??null,due_at:data.dueAt??null,status:"review",provider_key:data.providerKey??null,
  payload:data.payload,evidence_document_id:data.evidenceDocumentId??null,prepared_by:context.userId}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

export const reviewSecretarialFiling=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;filingId:string;decision:"approved"|"cancelled"})=>z.object({tenantId:uuid,filingId:uuid,decision:z.enum(["approved","cancelled"])}).parse(i))
.handler(async({context,data})=>{const a=await requireService(context,data.tenantId,"omniqora.company-secretarial");requireAdminRole(a.role);const db=context.supabase as any;
 const current=await db.from("company_secretarial_filings").select("prepared_by,status").eq("tenant_id",data.tenantId).eq("id",data.filingId).single();
 if(current.error)throw new Error(current.error.message);
 if(data.decision==="approved"&&current.data.prepared_by===context.userId)throw new Error("Independent filing approval required");
 const {data:row,error}=await db.from("company_secretarial_filings").update({status:data.decision,approved_by:data.decision==="approved"?context.userId:null,
  updated_at:new Date().toISOString()}).eq("id",data.filingId).select("*").single();if(error)throw new Error(error.message);return row;
});
