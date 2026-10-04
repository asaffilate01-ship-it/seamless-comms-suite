import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid();
const product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product});

async function write(context:any,tenantId:string){
 const access=await requireService(context,tenantId,"omniqora.practice-delivery");requireWriteRole(access.role);return access;
}
async function admin(context:any,tenantId:string){
 const access=await requireService(context,tenantId,"omniqora.practice-delivery");requireAdminRole(access.role);return access;
}

export const getPracticeDeliveryWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("practice_clients").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("display_name"),
  db.from("practice_service_templates").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("name"),
  db.from("practice_engagements").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("updated_at",{ascending:false}).limit(300),
  db.from("practice_job_phases").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("position"),
  db.from("practice_document_requests").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("due_at"),
  db.from("practice_time_entries").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("work_date",{ascending:false}).limit(500),
  db.from("practice_fee_items").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(300),
  db.from("practice_proposals").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("practice_signature_requests").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("practice_submissions").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("practice_recurring_work").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("next_period_start").limit(200)
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{clients:rs[0].data??[],templates:rs[1].data??[],engagements:rs[2].data??[],phases:rs[3].data??[],
  requests:rs[4].data??[],time:rs[5].data??[],fees:rs[6].data??[],proposals:rs[7].data??[],
  signatures:rs[8].data??[],submissions:rs[9].data??[],recurring:rs[10].data??[]};
});

const template=scope.extend({
 templateKey:z.string().regex(/^[a-z0-9_.-]{2,100}$/),name:z.string().min(1).max(240),serviceFamily:z.string().min(1).max(120).default("general"),
 currency:z.string().regex(/^[A-Z]{3}$/).default("GBP"),baseFeeMinor:z.number().int().min(0).default(0),unitFeeMinor:z.number().int().min(0).default(0),
 recurrence:z.enum(["none","monthly","quarterly","annual"]).default("none"),
 phases:z.array(z.object({title:z.string().min(1).max(240),budgetMinutes:z.number().int().min(0).max(100000).default(0)})).min(1).max(50),
 terms:z.string().max(20000).nullish()
});
export const savePracticeTemplate=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof template>)=>template.parse(i)).handler(async({context,data})=>{
 await admin(context,data.tenantId);const db=context.supabase as any;
 const existing=await db.from("practice_service_templates").select("id,version").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).eq("template_key",data.templateKey).maybeSingle();
 if(existing.error)throw new Error(existing.error.message);
 const values={tenant_id:data.tenantId,product_key:data.productKey,template_key:data.templateKey,name:data.name,service_family:data.serviceFamily,
  currency:data.currency,base_fee_minor:data.baseFeeMinor,unit_fee_minor:data.unitFeeMinor,recurrence:data.recurrence,phases:data.phases,
  terms:data.terms??null,status:"active",updated_at:new Date().toISOString(),created_by:context.userId};
 const r=existing.data
  ?await db.from("practice_service_templates").update({...values,version:existing.data.version+1}).eq("id",existing.data.id).select("*").single()
  :await db.from("practice_service_templates").insert(values).select("*").single();
 if(r.error)throw new Error(r.error.message);return r.data;
});

const managed=scope.extend({
 clientId:uuid,templateId:uuid,periodKey:z.string().min(1).max(120),
 periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 internalDueAt:z.string().datetime().nullish(),externalDueAt:z.string().datetime().nullish(),ownerUserId:uuid.nullish()
});
export const createManagedPracticeEngagement=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof managed>)=>managed.parse(i)).handler(async({context,data})=>{
 await write(context,data.tenantId);
 const r=await(context.supabase as any).rpc("practice_create_managed_engagement",{
  _tenant:data.tenantId,_product:data.productKey,_client:data.clientId,_template:data.templateId,_period_key:data.periodKey,
  _period_start:data.periodStart??null,_period_end:data.periodEnd??null,_owner:data.ownerUserId??null,
  _internal_due:data.internalDueAt??null,_external_due:data.externalDueAt??null
 });if(r.error)throw new Error(r.error.message);return{engagementId:r.data as string};
});

const request=scope.extend({clientId:uuid,engagementId:uuid.nullish(),requestKey:z.string().regex(/^[a-z0-9_.-]{2,120}$/),
 title:z.string().min(1).max(240),description:z.string().max(5000).nullish(),dueAt:z.string().datetime().nullish()});
export const createPracticeDocumentRequest=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof request>)=>request.parse(i)).handler(async({context,data})=>{
 await write(context,data.tenantId);
 const{data:row,error}=await(context.supabase as any).from("practice_document_requests").insert({
  tenant_id:data.tenantId,product_key:data.productKey,client_id:data.clientId,engagement_id:data.engagementId??null,
  request_key:data.requestKey,title:data.title,description:data.description??null,due_at:data.dueAt??null,status:"outstanding"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const reviewPracticeDocumentRequest=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;requestId:string;decision:"accepted"|"rejected"|"waived"})=>
 z.object({tenantId:uuid,requestId:uuid,decision:z.enum(["accepted","rejected","waived"])}).parse(i))
.handler(async({context,data})=>{
 await write(context,data.tenantId);
 const{data:row,error}=await(context.supabase as any).from("practice_document_requests").update({
  status:data.decision,reviewed_by:context.userId,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
 }).eq("tenant_id",data.tenantId).eq("id",data.requestId).in("status",["submitted","outstanding","rejected"]).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const time=scope.extend({engagementId:uuid,workDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),minutes:z.number().int().min(1).max(1440),
 costRateMinor:z.number().int().min(0),chargeRateMinor:z.number().int().min(0),description:z.string().min(1).max(2000),billable:z.boolean().default(true)});
export const recordPracticeTime=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof time>)=>time.parse(i)).handler(async({context,data})=>{
 await write(context,data.tenantId);
 const{data:row,error}=await(context.supabase as any).from("practice_time_entries").insert({
  tenant_id:data.tenantId,product_key:data.productKey,engagement_id:data.engagementId,user_id:context.userId,
  work_date:data.workDate,minutes:data.minutes,cost_rate_minor:data.costRateMinor,charge_rate_minor:data.chargeRateMinor,
  description:data.description,billable:data.billable,status:"posted"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const getPracticeWip=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{engagementId:string})=>z.object({engagementId:uuid}).parse(i)).handler(async({context,data})=>{
 const r=await(context.supabase as any).rpc("practice_wip_summary",{_engagement:data.engagementId});
 if(r.error)throw new Error(r.error.message);return r.data;
});

const proposal=scope.extend({clientId:uuid,engagementId:uuid.nullish(),templateId:uuid.nullish(),proposalRef:z.string().min(2).max(120),
 totalMinor:z.number().int().min(0),currency:z.string().regex(/^[A-Z]{3}$/),terms:z.string().min(1).max(20000),
 validUntil:z.string().datetime().nullish(),serviceSnapshot:z.record(z.string(),z.unknown()),feeSnapshot:z.array(z.unknown()).max(500).default([])});
export const createPracticeProposal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof proposal>)=>proposal.parse(i)).handler(async({context,data})=>{
 await write(context,data.tenantId);
 const{data:row,error}=await(context.supabase as any).from("practice_proposals").insert({
  tenant_id:data.tenantId,product_key:data.productKey,client_id:data.clientId,engagement_id:data.engagementId??null,
  template_id:data.templateId??null,proposal_ref:data.proposalRef,service_snapshot:data.serviceSnapshot,fee_snapshot:data.feeSnapshot,
  total_minor:data.totalMinor,currency:data.currency,terms:data.terms,valid_until:data.validUntil??null,status:"draft",created_by:context.userId
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const issuePracticeProposal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;proposalId:string})=>z.object({tenantId:uuid,proposalId:uuid}).parse(i)).handler(async({context,data})=>{
 await admin(context,data.tenantId);
 const r=await(context.supabase as any).rpc("practice_issue_proposal",{_proposal:data.proposalId});
 if(r.error)throw new Error(r.error.message);return{ok:true};
});

const signature=scope.extend({clientId:uuid,proposalId:uuid.nullish(),documentId:uuid.nullish(),signerRef:z.string().min(1).max(200),
 signerName:z.string().max(240).nullish(),signerEmail:z.string().email().max(320).nullish(),providerKey:z.string().max(120).nullish()});
export const createPracticeSignatureRequest=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof signature>)=>signature.parse(i)).handler(async({context,data})=>{
 await admin(context,data.tenantId);
 const{data:row,error}=await(context.supabase as any).from("practice_signature_requests").insert({
  tenant_id:data.tenantId,product_key:data.productKey,client_id:data.clientId,proposal_id:data.proposalId??null,
  document_id:data.documentId??null,signer_ref:data.signerRef,signer_name:data.signerName??null,signer_email:data.signerEmail??null,
  provider_key:data.providerKey??null,status:"approved",approved_by:context.userId,approved_at:new Date().toISOString()
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const submission=scope.extend({clientId:uuid,engagementId:uuid.nullish(),deadlineId:uuid.nullish(),submissionType:z.string().min(1).max(160),
 authority:z.string().min(1).max(200),providerKey:z.string().max(120).nullish(),payloadRef:z.string().max(1000).nullish()});
export const createPracticeSubmission=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof submission>)=>submission.parse(i)).handler(async({context,data})=>{
 await write(context,data.tenantId);
 const{data:row,error}=await(context.supabase as any).from("practice_submissions").insert({
  tenant_id:data.tenantId,product_key:data.productKey,client_id:data.clientId,engagement_id:data.engagementId??null,
  deadline_id:data.deadlineId??null,submission_type:data.submissionType,authority:data.authority,provider_key:data.providerKey??null,
  payload_ref:data.payloadRef??null,status:"review"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const approvePracticeSubmission=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;submissionId:string})=>z.object({tenantId:uuid,submissionId:uuid}).parse(i)).handler(async({context,data})=>{
 await admin(context,data.tenantId);
 const{data:row,error}=await(context.supabase as any).from("practice_submissions").update({
  status:"approved",approved_by:context.userId,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()
 }).eq("tenant_id",data.tenantId).eq("id",data.submissionId).eq("status","review").select("*").single();
 if(error)throw new Error(error.message);return row;
});

const recurring=scope.extend({clientId:uuid,templateId:uuid,recurrence:z.enum(["monthly","quarterly","annual"]),
 nextPeriodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),internalDueOffsetDays:z.number().int().min(0).max(366).default(0),
 externalDueOffsetDays:z.number().int().min(0).max(366).default(0)});
export const savePracticeRecurringWork=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof recurring>)=>recurring.parse(i)).handler(async({context,data})=>{
 await admin(context,data.tenantId);
 const{data:row,error}=await(context.supabase as any).from("practice_recurring_work").upsert({
  tenant_id:data.tenantId,product_key:data.productKey,client_id:data.clientId,template_id:data.templateId,recurrence:data.recurrence,
  next_period_start:data.nextPeriodStart,internal_due_offset_days:data.internalDueOffsetDays,external_due_offset_days:data.externalDueOffsetDays,
  status:"active",updated_at:new Date().toISOString()
 },{onConflict:"tenant_id,product_key,client_id,template_id"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

export const completePracticePhase=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;phaseId:string;expectedVersion:number})=>z.object({tenantId:uuid,phaseId:uuid,expectedVersion:z.number().int().positive()}).parse(i))
.handler(async({context,data})=>{
 await write(context,data.tenantId);
 const r=await(context.supabase as any).rpc("practice_complete_phase",{_phase:data.phaseId,_expected_version:data.expectedVersion});
 if(r.error)throw new Error(r.error.message);return{workVersion:r.data as number};
});

export const getMyPracticePortal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{clientId:string})=>z.object({clientId:uuid}).parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;
 const access=await db.from("practice_client_portal_access").select("*").eq("client_id",data.clientId).eq("user_id",context.userId).eq("status","active").maybeSingle();
 if(access.error||!access.data)throw new Error("Client portal membership required");
 const [client,jobs,requests,proposals,signatures]=await Promise.all([
  db.from("practice_clients").select("id,display_name,status,jurisdiction").eq("id",data.clientId).single(),
  db.from("practice_engagements").select("id,engagement_type,period_start,period_end,status,external_due_at,work_version").eq("client_id",data.clientId).order("updated_at",{ascending:false}),
  db.from("practice_document_requests").select("*").eq("client_id",data.clientId).order("due_at"),
  db.from("practice_proposals").select("id,proposal_ref,total_minor,currency,terms,status,valid_until,issued_at,accepted_at").eq("client_id",data.clientId).in("status",["issued","accepted","declined","expired"]).order("created_at",{ascending:false}),
  db.from("practice_signature_requests").select("id,proposal_id,status,signed_at,signer_name").eq("client_id",data.clientId).order("created_at",{ascending:false})
 ]);
 for(const r of[client,jobs,requests,proposals,signatures])if(r.error)throw new Error(r.error.message);
 return{access:access.data,client:client.data,jobs:jobs.data??[],requests:requests.data??[],proposals:proposals.data??[],signatures:signatures.data??[]};
});

export const respondPracticeRequestPortal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{requestId:string;response:string;documentId?:string|null})=>z.object({requestId:uuid,response:z.string().max(10000),documentId:uuid.nullish()}).parse(i))
.handler(async({context,data})=>{
 const r=await(context.supabase as any).rpc("practice_portal_respond_request",{_request:data.requestId,_response:data.response,_document:data.documentId??null});
 if(r.error)throw new Error(r.error.message);return{ok:true};
});

export const acceptPracticeProposalPortal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{proposalId:string;accept:boolean})=>z.object({proposalId:uuid,accept:z.boolean()}).parse(i))
.handler(async({context,data})=>{
 const r=await(context.supabase as any).rpc("practice_portal_accept_proposal",{_proposal:data.proposalId,_accept:data.accept});
 if(r.error)throw new Error(r.error.message);return{ok:true};
});


const portalGrant=scope.extend({clientId:uuid,userId:uuid,portalRole:z.enum(["client_owner","client_contributor","client_viewer"]).default("client_viewer")});
export const grantPracticePortalAccess=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof portalGrant>)=>portalGrant.parse(i)).handler(async({context,data})=>{
 await admin(context,data.tenantId);const db=context.supabase as any;
 const portal=await db.from("customer_portal_users").select("user_id,status").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).eq("user_id",data.userId).eq("status","active").maybeSingle();
 if(portal.error||!portal.data)throw new Error("Active Omniqora customer portal user required");
 const client=await db.from("practice_clients").select("id").eq("id",data.clientId).eq("tenant_id",data.tenantId).eq("product_key",data.productKey).maybeSingle();
 if(client.error||!client.data)throw new Error("Practice client scope mismatch");
 const{data:row,error}=await db.from("practice_client_portal_access").upsert({
  tenant_id:data.tenantId,product_key:data.productKey,client_id:data.clientId,user_id:data.userId,portal_role:data.portalRole,status:"active",updated_at:new Date().toISOString()
 },{onConflict:"client_id,user_id"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

export const listMyPracticePortals=createServerFn({method:"GET"}).middleware([requireSupabaseAuth])
.handler(async({context})=>{
 const{data,error}=await(context.supabase as any).from("practice_client_portal_access").select("client_id,tenant_id,product_key,portal_role,status").eq("user_id",context.userId).eq("status","active");
 if(error)throw new Error(error.message);return data??[];
});
