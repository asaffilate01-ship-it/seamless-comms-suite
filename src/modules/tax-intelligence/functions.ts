import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function taxStaffAccess(context:any,input:{
  tenantId:string;tenantProductId:string;practiceClientId:string;
}){
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const[{data:tp},{data:client},{data:tenantGrant},{data:clientService}]=await Promise.all([
    admin.from("tenant_products").select("id,status").eq("id",input.tenantProductId).eq("tenant_id",input.tenantId).maybeSingle(),
    admin.from("practice_clients").select("id").eq("id",input.practiceClientId).eq("tenant_id",input.tenantId)
      .eq("tenant_product_id",input.tenantProductId).maybeSingle(),
    admin.from("tenant_module_entitlements").select("enabled,starts_at,ends_at").eq("tenant_id",input.tenantId)
      .eq("tenant_product_id",input.tenantProductId).eq("module_key","tax_intelligence.core").eq("enabled",true).maybeSingle(),
    admin.from("practice_client_services").select("enabled,starts_at,ends_at").eq("practice_client_id",input.practiceClientId)
      .eq("module_key","tax_intelligence.core").eq("enabled",true).maybeSingle()
  ]);
  if(!tp||tp.status!=="active"||!client)throw new Error("Active practice/client scope required");
  const now=Date.now();
  const active=(x:any)=>!!x?.enabled&&(!x.starts_at||Date.parse(x.starts_at)<=now)&&(!x.ends_at||Date.parse(x.ends_at)>now);
  if(!active(tenantGrant)||!active(clientService))throw new Error("Tax Intelligence is not enabled for this client");
  const db=context.supabase as any;
  const{data:member}=await db.from("tenant_members").select("role").eq("tenant_id",input.tenantId)
    .eq("user_id",context.userId).maybeSingle();
  if(!member||!["owner","admin","agent"].includes(member.role))throw new Error("Practice staff access required");
  return{role:String(member.role)};
}

const issueSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  engagementId:z.string().uuid().optional().nullable(),
  jurisdiction:z.string().min(2).max(80),taxType:z.string().min(1).max(120),periodKey:z.string().min(1).max(80),
  issue:z.string().min(5).max(4000),factualBasis:z.string().min(5).max(12000),
  factEvidenceRefs:z.array(z.string().max(500)).max(500).default([])
});

export const createTaxResearchIssue=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof issueSchema>)=>issueSchema.parse(input))
.handler(async({context,data})=>{
  await taxStaffAccess(context,data);
  const db=context.supabase as any;
  const{data:row,error}=await db.from("tax_research_issues").insert({
    tenant_id:data.tenantId,practice_client_id:data.practiceClientId,engagement_id:data.engagementId??null,
    jurisdiction:data.jurisdiction,tax_type:data.taxType,period_key:data.periodKey,issue:data.issue,
    factual_basis:data.factualBasis,fact_evidence_refs:data.factEvidenceRefs,status:"draft",created_by:context.userId
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Tax research issue could not be created");
  return row;
});

export const queueTaxResearch=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;practiceClientId:string;researchIssueId:string;query?:string})=>
 z.object({
   tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
   researchIssueId:z.string().uuid(),query:z.string().max(8000).optional()
 }).parse(input))
.handler(async({context,data})=>{
  await taxStaffAccess(context,data);
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:issue}=await admin.from("tax_research_issues").select("id,jurisdiction,tax_type,period_key,issue,factual_basis")
    .eq("id",data.researchIssueId).eq("tenant_id",data.tenantId).eq("practice_client_id",data.practiceClientId).maybeSingle();
  if(!issue)throw new Error("Tax research issue not found");
  const hierarchy=issue.jurisdiction.toUpperCase()==="GB"||issue.jurisdiction.toUpperCase()==="UK"
    ?["legislation","binding_case_law","persuasive_case_law","official_ruling","official_guidance","administrative_manual","secondary"]
    :issue.jurisdiction.toUpperCase()==="US"
      ?["legislation","regulation","binding_case_law","official_ruling","persuasive_case_law","official_guidance","secondary"]
      :["legislation","regulation","binding_case_law","official_ruling","official_guidance","secondary"];
  const query=data.query??[
    "Research the lowest lawful tax treatment supported by the verified facts and current authority.",
    "Jurisdiction: "+issue.jurisdiction,
    "Tax type: "+issue.tax_type,
    "Period: "+issue.period_key,
    "Issue: "+issue.issue,
    "Facts: "+issue.factual_basis,
    "Identify contrary authority and uncertainty. Do not invent facts or deductions."
  ].join("\n");
  const{data:run,error}=await admin.from("tax_research_runs").insert({
    tenant_id:data.tenantId,research_issue_id:issue.id,query,source_hierarchy:hierarchy,
    retrieved_source_ids:[],answer_draft:"",uncertainties:[],contrary_authorities:[],status:"running"
  }).select("id,status,created_at,source_hierarchy").single();
  if(error||!run)throw new Error(error?.message??"Tax research could not be queued");
  await admin.from("tax_research_issues").update({status:"researching"}).eq("id",issue.id);
  const{data:tp}=await admin.from("tenant_products").select("product_key").eq("id",data.tenantProductId).maybeSingle();
  const eventId=randomUUID();
  const{error:eventError}=await admin.from("platform_events").insert({
    id:eventId,tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,
    product_key:String(tp?.product_key??"unknown"),event_type:"tax_intelligence.research.requested",
    event_version:1,occurred_at:new Date().toISOString(),environment:"production",
    subject_type:"tax_research_run",subject_id:run.id,correlation_id:run.id,causation_id:null,
    idempotency_key:"tax-research:"+run.id,data_classification:"confidential",
    payload:{practiceClientId:data.practiceClientId,researchIssueId:issue.id,researchRunId:run.id,jurisdiction:issue.jurisdiction,taxType:issue.tax_type,periodKey:issue.period_key}
  });
  if(eventError)throw new Error(eventError.message);
  return run;
});

export const listTaxResearchIssues=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;practiceClientId:string})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid()
}).parse(input))
.handler(async({context,data})=>{
  await taxStaffAccess(context,data);
  const db=context.supabase as any;
  const{data:rows,error}=await db.from("tax_research_issues")
    .select("*,runs:tax_research_runs(*),positions:tax_position_proposals(*)")
    .eq("tenant_id",data.tenantId).eq("practice_client_id",data.practiceClientId)
    .order("created_at",{ascending:false}).limit(500);
  if(error)throw new Error(error.message);return rows??[];
});

export const listTaxKnowledgeSources=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{jurisdiction:string;effectiveOn?:string|null;authorityLevels?:string[]})=>z.object({
  jurisdiction:z.string().min(2).max(80),
  effectiveOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  authorityLevels:z.array(z.enum([
    "legislation","regulation","binding_case_law","persuasive_case_law","official_ruling",
    "official_guidance","administrative_manual","secondary"
  ])).max(8).optional()
}).parse(input))
.handler(async({context,data})=>{
  // Authenticated users only; sources are shared metadata, not client data.
  const db=context.supabase as any;
  let q=db.from("tax_knowledge_sources").select("*").eq("jurisdiction",data.jurisdiction)
    .order("checked_at",{ascending:false}).limit(1000);
  if(data.authorityLevels?.length)q=q.in("authority_level",data.authorityLevels);
  const{data:rows,error}=await q;if(error)throw new Error(error.message);
  if(!data.effectiveOn)return rows??[];
  const d=data.effectiveOn;
  return(rows??[]).filter((row:any)=>
    (!row.effective_from||row.effective_from<=d)&&(!row.effective_until||row.effective_until>=d)
  );
});

const reviewSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  positionId:z.string().uuid(),decision:z.enum(["approved","changes_required","rejected"])
});

export const reviewTaxPosition=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof reviewSchema>)=>reviewSchema.parse(input))
.handler(async({context,data})=>{
  const access=await taxStaffAccess(context,data);
  const db=context.supabase as any;
  const{data:position,error:positionError}=await db.from("tax_position_proposals")
    .select("id,risk,research_issue_id").eq("id",data.positionId).eq("tenant_id",data.tenantId).maybeSingle();
  if(positionError||!position)throw new Error("Tax position not found");
  if(data.decision==="approved"&&["high","specialist_review"].includes(position.risk)&&!["owner","admin"].includes(access.role)){
    throw new Error("High-risk tax positions require owner/admin or specialist review");
  }
  const{data:issue}=await db.from("tax_research_issues").select("id,practice_client_id")
    .eq("id",position.research_issue_id).eq("practice_client_id",data.practiceClientId).maybeSingle();
  if(!issue)throw new Error("Tax position does not belong to this client");
  const{data:row,error}=await db.from("tax_position_proposals").update({
    status:data.decision,reviewed_by:context.userId,reviewed_at:new Date().toISOString()
  }).eq("id",position.id).select("*").single();
  if(error||!row)throw new Error(error?.message??"Tax position could not be reviewed");
  if(data.decision==="approved"){
    await db.from("tax_research_issues").update({status:"approved"}).eq("id",issue.id);
  }else if(data.decision==="rejected"){
    await db.from("tax_research_issues").update({status:"rejected"}).eq("id",issue.id);
  }else{
    await db.from("tax_research_issues").update({status:"review"}).eq("id",issue.id);
  }
  return row;
});
