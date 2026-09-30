import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ScopeAccess={staff:boolean;client:boolean;tenantId:string;tenantProductId:string;practiceClientId:string};

async function accountingAccess(context:any,input:{
  tenantId:string;tenantProductId:string;practiceClientId:string;moduleKey:"accounting_ai.core"|"tax_intelligence.core";
  allowClient:boolean;
}):Promise<ScopeAccess>{
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:tp}=await admin.from("tenant_products").select("id,status").eq("id",input.tenantProductId)
    .eq("tenant_id",input.tenantId).maybeSingle();
  if(!tp||tp.status!=="active")throw new Error("Active practice product required");
  const{data:client}=await admin.from("practice_clients").select("id").eq("id",input.practiceClientId)
    .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId).maybeSingle();
  if(!client)throw new Error("Practice client not found");
  const{data:tenantGrant}=await admin.from("tenant_module_entitlements").select("enabled,starts_at,ends_at")
    .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
    .eq("module_key",input.moduleKey).eq("enabled",true).maybeSingle();
  const now=Date.now();
  const tenantEnabled=!!tenantGrant&&(!tenantGrant.starts_at||Date.parse(tenantGrant.starts_at)<=now)
    &&(!tenantGrant.ends_at||Date.parse(tenantGrant.ends_at)>now);
  if(!tenantEnabled)throw new Error("Practice add-on is not enabled");
  const{data:clientService}=await admin.from("practice_client_services")
    .select("enabled,starts_at,ends_at").eq("practice_client_id",input.practiceClientId)
    .eq("module_key",input.moduleKey).eq("enabled",true).maybeSingle();
  const clientEnabled=!!clientService&&(!clientService.starts_at||Date.parse(clientService.starts_at)<=now)
    &&(!clientService.ends_at||Date.parse(clientService.ends_at)>now);
  if(!clientEnabled)throw new Error("Client does not have this add-on enabled");

  const db=context.supabase as any;
  const{data:member}=await db.from("tenant_members").select("role")
    .eq("tenant_id",input.tenantId).eq("user_id",context.userId).maybeSingle();
  const staff=!!member;
  let clientPortal=false;
  if(!staff&&input.allowClient){
    const{data:mapped}=await admin.from("practice_client_users").select("id,status")
      .eq("practice_client_id",input.practiceClientId).eq("user_id",context.userId).eq("status","active").maybeSingle();
    clientPortal=!!mapped;
  }
  if(!staff&&!clientPortal)throw new Error("Practice/client access required");
  return{staff,client:clientPortal,tenantId:input.tenantId,tenantProductId:input.tenantProductId,practiceClientId:input.practiceClientId};
}

const intakeSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  engagementId:z.string().uuid().optional().nullable(),
  phase:z.enum(["opening_file","ongoing_file"]),
  source:z.enum(["mobile_camera","scanner","pdf","csv","email","upload","bank_feed","import"]),
  periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).default({})
});

export const createAccountingIntakeBatch=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof intakeSchema>)=>intakeSchema.parse(input))
.handler(async({context,data})=>{
  await accountingAccess(context,{...data,moduleKey:"accounting_ai.core",allowClient:true});
  if(data.periodStart&&data.periodEnd&&data.periodEnd<data.periodStart)throw new Error("Period end must not precede period start");
  const db=context.supabase as any;
  const{data:row,error}=await db.from("accounting_intake_batches").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,practice_client_id:data.practiceClientId,
    engagement_id:data.engagementId??null,phase:data.phase,source:data.source,status:"draft",
    period_start:data.periodStart??null,period_end:data.periodEnd??null,created_by:context.userId,metadata:data.metadata
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Accounting intake batch could not be created");
  return row;
});

const attachSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  batchId:z.string().uuid(),documentId:z.string().uuid(),
  sourceType:z.enum(["receipt","purchase_invoice","sales_invoice","bank_statement","credit_card_statement","opening_accounts","opening_trial_balance","journal","other"]),
  originalReference:z.string().max(300).optional().nullable()
});

export const attachAccountingDocument=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof attachSchema>)=>attachSchema.parse(input))
.handler(async({context,data})=>{
  await accountingAccess(context,{...data,moduleKey:"accounting_ai.core",allowClient:true});
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const[{data:batch},{data:doc}]=await Promise.all([
    admin.from("accounting_intake_batches").select("id,status").eq("id",data.batchId)
      .eq("tenant_id",data.tenantId).eq("practice_client_id",data.practiceClientId).maybeSingle(),
    admin.from("platform_documents").select("id").eq("id",data.documentId)
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle()
  ]);
  if(!batch||!["draft","uploaded"].includes(batch.status))throw new Error("Open accounting intake batch required");
  if(!doc)throw new Error("Document not found in this practice workspace");
  const db=context.supabase as any;
  const{data:item,error}=await db.from("accounting_intake_items").insert({
    tenant_id:data.tenantId,batch_id:data.batchId,document_id:data.documentId,
    source_type:data.sourceType,original_reference:data.originalReference??null,extraction_status:"not_started"
  }).select("*").single();
  if(error||!item)throw new Error(error?.message??"Accounting document could not be attached");
  await db.from("accounting_intake_batches").update({status:"uploaded"}).eq("id",data.batchId);
  return item;
});

export const listAccountingIntake=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;practiceClientId:string})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid()
}).parse(input))
.handler(async({context,data})=>{
  await accountingAccess(context,{...data,moduleKey:"accounting_ai.core",allowClient:true});
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:rows,error}=await admin.from("accounting_intake_batches")
    .select("*,items:accounting_intake_items(id,document_id,source_type,original_reference,extraction_status,created_at)")
    .eq("tenant_id",data.tenantId).eq("practice_client_id",data.practiceClientId)
    .order("created_at",{ascending:false}).limit(500);
  if(error)throw new Error(error.message);return rows??[];
});

export const queueAccountingExtraction=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;practiceClientId:string;batchId:string})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),batchId:z.string().uuid()
}).parse(input))
.handler(async({context,data})=>{
  await accountingAccess(context,{...data,moduleKey:"accounting_ai.core",allowClient:true});
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:batch}=await admin.from("accounting_intake_batches").select("id,status").eq("id",data.batchId)
    .eq("tenant_id",data.tenantId).eq("practice_client_id",data.practiceClientId).maybeSingle();
  if(!batch||!["uploaded","review","failed"].includes(batch.status))throw new Error("Uploaded accounting batch required");
  const{data:run,error}=await admin.from("accounting_extraction_runs").insert({
    tenant_id:data.tenantId,batch_id:data.batchId,status:"queued",metadata:{requestedBy:context.userId}
  }).select("id,status,created_at").single();
  if(error||!run)throw new Error(error?.message??"Extraction could not be queued");
  await admin.from("accounting_intake_batches").update({status:"extracting"}).eq("id",data.batchId);
  await admin.from("accounting_intake_items").update({extraction_status:"queued"})
    .eq("batch_id",data.batchId).in("extraction_status",["not_started","failed","needs_review"]);
  const{data:tp}=await admin.from("tenant_products").select("product_key").eq("id",data.tenantProductId).maybeSingle();
  const eventId=randomUUID();
  const{error:eventError}=await admin.from("platform_events").insert({
    id:eventId,tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,
    product_key:String(tp?.product_key??"unknown"),event_type:"accounting_ai.extraction.requested",
    event_version:1,occurred_at:new Date().toISOString(),environment:"production",
    subject_type:"accounting_extraction_run",subject_id:run.id,correlation_id:run.id,causation_id:null,
    idempotency_key:"accounting-extraction:"+run.id,data_classification:"confidential",
    payload:{practiceClientId:data.practiceClientId,batchId:data.batchId,extractionRunId:run.id}
  });
  if(eventError)throw new Error(eventError.message);
  return run;
});

export const listAccountingReviewQueue=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;practiceClientId:string})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid()
}).parse(input))
.handler(async({context,data})=>{
  const access=await accountingAccess(context,{...data,moduleKey:"accounting_ai.core",allowClient:false});
  if(!access.staff)throw new Error("Practice staff access required");
  const db=context.supabase as any;
  const{data:rows,error}=await db.from("accounting_staging_entries")
    .select("*,review_items:accounting_review_items(*)")
    .eq("tenant_id",data.tenantId).eq("practice_client_id",data.practiceClientId)
    .in("review_status",["proposed","needs_review"]).order("confidence",{ascending:true}).limit(2000);
  if(error)throw new Error(error.message);return rows??[];
});

const reviewSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  proposalId:z.string().uuid(),decision:z.enum(["approved","rejected","needs_review"]),
  accountCode:z.string().max(80).optional().nullable(),taxCode:z.string().max(80).optional().nullable(),
  treatment:z.enum(["income","revenue_expense","capital_expenditure","asset","liability","equity","private_nonbusiness","transfer","unknown"]).optional(),
  journalLines:z.array(z.object({
    accountCode:z.string().min(1).max(80),debitMinor:z.number().int().nonnegative(),
    creditMinor:z.number().int().nonnegative(),memo:z.string().max(500).optional().nullable()
  })).max(100).optional()
});

export const reviewAccountingProposal=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof reviewSchema>)=>reviewSchema.parse(input))
.handler(async({context,data})=>{
  const access=await accountingAccess(context,{...data,moduleKey:"accounting_ai.core",allowClient:false});
  if(!access.staff)throw new Error("Practice staff access required");
  if(data.decision==="approved"){
    if(!data.journalLines||data.journalLines.length<2)throw new Error("Approved proposal requires balanced journal lines");
    const debit=data.journalLines.reduce((s,l)=>s+l.debitMinor,0);
    const credit=data.journalLines.reduce((s,l)=>s+l.creditMinor,0);
    if(debit<=0||debit!==credit)throw new Error("Journal lines must balance");
  }
  const db=context.supabase as any;
  const patch:any={
    review_status:data.decision,reviewed_by:context.userId,reviewed_at:new Date().toISOString()
  };
  if(data.accountCode!==undefined)patch.proposed_account_code=data.accountCode;
  if(data.taxCode!==undefined)patch.proposed_tax_code=data.taxCode;
  if(data.treatment!==undefined)patch.treatment=data.treatment;
  if(data.journalLines!==undefined)patch.proposed_journal_lines=data.journalLines;
  const{data:row,error}=await db.from("accounting_staging_entries").update(patch)
    .eq("id",data.proposalId).eq("tenant_id",data.tenantId).eq("practice_client_id",data.practiceClientId)
    .select("*").single();
  if(error||!row)throw new Error(error?.message??"Accounting proposal could not be reviewed");
  return row;
});

export const postApprovedAccountingProposal=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;practiceClientId:string;proposalId:string})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),proposalId:z.string().uuid()
}).parse(input))
.handler(async({context,data})=>{
  const access=await accountingAccess(context,{...data,moduleKey:"accounting_ai.core",allowClient:false});
  if(!access.staff)throw new Error("Practice staff access required");
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:id,error}=await admin.rpc("post_accounting_proposal",{
    _tenant:data.tenantId,_proposal:data.proposalId,_actor:context.userId
  });
  if(error||!id)throw new Error(error?.message??"Accounting proposal could not be posted");
  return{journalId:id};
});

export const getAccountingTrialBalance=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;practiceClientId:string;periodStart:string;periodEnd:string})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).parse(input))
.handler(async({context,data})=>{
  const access=await accountingAccess(context,{...data,moduleKey:"accounting_ai.core",allowClient:false});
  if(!access.staff)throw new Error("Practice staff access required");
  const db=context.supabase as any;
  const{data:rows,error}=await db.rpc("accounting_trial_balance",{
    _tenant:data.tenantId,_client:data.practiceClientId,_period_start:data.periodStart,_period_end:data.periodEnd
  });
  if(error)throw new Error(error.message);return rows??[];
});

export const listAccountingAssets=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;practiceClientId:string})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid()
}).parse(input))
.handler(async({context,data})=>{
  const access=await accountingAccess(context,{...data,moduleKey:"accounting_ai.core",allowClient:false});
  if(!access.staff)throw new Error("Practice staff access required");
  const db=context.supabase as any;
  const{data:rows,error}=await db.from("accounting_assets").select("*")
    .eq("tenant_id",data.tenantId).eq("practice_client_id",data.practiceClientId)
    .order("acquisition_date",{ascending:false});
  if(error)throw new Error(error.message);return rows??[];
});

const prepSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  engagementId:z.string().uuid().optional().nullable(),
  periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  frameworkKey:z.string().min(1).max(120),openingTrialBalanceRef:z.string().max(240).optional().nullable(),
  priorAccountsDocumentId:z.string().uuid().optional().nullable()
});

export const createAccountsPreparationRun=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof prepSchema>)=>prepSchema.parse(input))
.handler(async({context,data})=>{
  const access=await accountingAccess(context,{...data,moduleKey:"accounting_ai.core",allowClient:false});
  if(!access.staff)throw new Error("Practice staff access required");
  const db=context.supabase as any;
  const{data:row,error}=await db.from("accounting_accounts_prep_runs").insert({
    tenant_id:data.tenantId,practice_client_id:data.practiceClientId,engagement_id:data.engagementId??null,
    period_start:data.periodStart,period_end:data.periodEnd,framework_key:data.frameworkKey,
    opening_trial_balance_ref:data.openingTrialBalanceRef??null,prior_accounts_document_id:data.priorAccountsDocumentId??null,
    status:"draft",created_by:context.userId
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Accounts preparation run could not be created");
  return row;
});
