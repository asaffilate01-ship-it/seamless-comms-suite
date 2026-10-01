import { z } from "zod";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "@/modules/platform/service-identity";

function reply(body:unknown,status=200){
  return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
}

const serviceScope=z.object({
  tenantId:z.string().uuid(),productKey:z.string().min(1).max(80),tenantProductId:z.string().uuid()
});

const journalLine=z.object({
  accountCode:z.string().min(1).max(80),debitMinor:z.number().int().nonnegative(),
  creditMinor:z.number().int().nonnegative(),memo:z.string().max(500).optional().nullable()
});

const proposal=z.object({
  sourceRef:z.string().min(1).max(240),
  intakeItemId:z.string().uuid().optional().nullable(),
  sourceType:z.enum(["receipt","purchase_invoice","sales_invoice","bank_statement","credit_card_statement","opening_accounts","opening_trial_balance","journal","other"]),
  transactionDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  counterparty:z.string().max(240).optional().nullable(),
  description:z.string().min(1).max(2000),
  grossMinor:z.number().int().optional().nullable(),netMinor:z.number().int().optional().nullable(),
  taxMinor:z.number().int().optional().nullable(),currency:z.string().regex(/^[A-Z]{3}$/),
  proposedAccountCode:z.string().max(80).optional().nullable(),proposedTaxCode:z.string().max(80).optional().nullable(),
  treatment:z.enum(["income","revenue_expense","capital_expenditure","asset","liability","equity","private_nonbusiness","transfer","unknown"]),
  confidence:z.number().min(0).max(1),duplicateCandidate:z.boolean().default(false),
  journalLines:z.array(journalLine).max(100).default([]),
  evidenceRefs:z.array(z.string().max(500)).max(500).default([]),
  reviewReasons:z.array(z.enum([
    "low_confidence","capex_vs_revenue","missing_tax","duplicate","unmatched_bank","unknown_account","accounting_policy","other"
  ])).max(20).default([])
});

const taxPosition=z.object({
  title:z.string().min(2).max(500),positionType:z.string().min(1).max(160),
  proposedTreatment:z.string().min(5).max(12000),legalBasis:z.string().min(5).max(12000),
  sourceIds:z.array(z.string().uuid()).min(1).max(200),
  factDependencies:z.array(z.string().max(1000)).max(200).default([]),
  evidenceRefs:z.array(z.string().max(500)).max(500).default([]),
  estimatedTaxImpactMinor:z.number().int().optional().nullable(),currency:z.string().regex(/^[A-Z]{3}$/).optional().nullable(),
  confidence:z.number().min(0).max(1),
  risk:z.enum(["low","medium","high","specialist_review"])
});

const accountsPrepAdjustment=z.object({
  title:z.string().min(2).max(500),
  description:z.string().min(2).max(8000),
  reason:z.string().min(2).max(8000),
  journalDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency:z.string().regex(/^[A-Z]{3}$/),
  journalLines:z.array(journalLine).min(2).max(100),
  evidenceRefs:z.array(z.string().max(500)).max(500).default([]),
  confidence:z.number().min(0).max(1),
  risk:z.enum(["low","normal","high","specialist_review"]).default("normal")
});

const requestSchema=z.discriminatedUnion("operation",[
  serviceScope.extend({
    operation:z.literal("extraction.result"),practiceClientId:z.string().uuid(),batchId:z.string().uuid(),
    extractionRunId:z.string().uuid(),provider:z.string().min(1).max(120),model:z.string().max(160).optional().nullable(),
    modelRunId:z.string().max(240).optional().nullable(),proposals:z.array(proposal).max(5000)
  }),
  serviceScope.extend({
    operation:z.literal("extraction.failed"),practiceClientId:z.string().uuid(),batchId:z.string().uuid(),
    extractionRunId:z.string().uuid(),error:z.string().min(1).max(2000)
  }),
  serviceScope.extend({
    operation:z.literal("accounts_prep.result"),practiceClientId:z.string().uuid(),prepRunId:z.string().uuid(),
    modelRunId:z.string().max(240).optional().nullable(),
    result:z.record(z.string(),z.unknown()).default({}),
    outputDocumentRefs:z.array(z.string().max(500)).max(100).default([]),
    reviewNotes:z.string().max(12000).optional().nullable(),
    adjustments:z.array(accountsPrepAdjustment).max(500)
  }),
  serviceScope.extend({
    operation:z.literal("tax.research.result"),practiceClientId:z.string().uuid(),researchRunId:z.string().uuid(),
    answerDraft:z.string().min(1).max(50000),sourceIds:z.array(z.string().uuid()).max(500),
    uncertainties:z.array(z.string().max(2000)).max(200).default([]),
    contraryAuthorities:z.array(z.string().max(2000)).max(200).default([]),
    modelRunId:z.string().max(240).optional().nullable(),positions:z.array(taxPosition).max(100)
  })
]);

async function authenticate(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const scopes=z.array(z.object({
    tenantId:z.string().uuid(),productKey:z.string().min(1),tenantProductId:z.string().uuid().optional().nullable(),
    locationIds:z.array(z.string().uuid()).optional(),capabilities:z.array(z.string().min(1))
  })).parse(row.scopes);
  const credential:ServiceCredentialRecord={
    id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes
  };
  return{db,credential};
}

async function assertClientService(db:any,input:any,moduleKey:string){
  const[{data:tp},{data:client},{data:grant},{data:clientService}]=await Promise.all([
    db.from("tenant_products").select("id,status,product_key").eq("id",input.tenantProductId).eq("tenant_id",input.tenantId).maybeSingle(),
    db.from("practice_clients").select("id").eq("id",input.practiceClientId).eq("tenant_id",input.tenantId)
      .eq("tenant_product_id",input.tenantProductId).maybeSingle(),
    db.from("tenant_module_entitlements").select("enabled,starts_at,ends_at").eq("tenant_id",input.tenantId)
      .eq("tenant_product_id",input.tenantProductId).eq("module_key",moduleKey).eq("enabled",true).maybeSingle(),
    db.from("practice_client_services").select("enabled,starts_at,ends_at,config").eq("practice_client_id",input.practiceClientId)
      .eq("module_key",moduleKey).eq("enabled",true).maybeSingle()
  ]);
  if(!tp||tp.status!=="active"||tp.product_key!==input.productKey||!client)throw new Error("Active practice/client scope required");
  const now=Date.now();const active=(x:any)=>!!x?.enabled&&(!x.starts_at||Date.parse(x.starts_at)<=now)&&(!x.ends_at||Date.parse(x.ends_at)>now);
  if(!active(grant)||!active(clientService))throw new Error("Client add-on is not enabled");
  return{tp,clientService};
}

function reviewQuestion(reason:string){
  const map:Record<string,string>={
    low_confidence:"The extraction confidence is below the practice threshold. Confirm the accounting treatment and journal.",
    capex_vs_revenue:"Confirm whether this item is capital expenditure/an asset or a revenue expense.",
    missing_tax:"Confirm the tax/VAT/sales-tax treatment for this item.",
    duplicate:"This may duplicate another document or transaction. Confirm whether it should be kept, merged or excluded.",
    unmatched_bank:"This transaction is not confidently matched to a bank/statement entry.",
    unknown_account:"Confirm the nominal/account code for this item.",
    accounting_policy:"Confirm the accounting policy or journal treatment before posting.",
    other:"Review this item before it is posted."
  };
  return map[reason]??map.other;
}

function riskRank(risk:string){return{low:0,medium:1,high:2,specialist_review:3}[risk]??3;}
function rankRisk(rank:number){return(["low","medium","high","specialist_review"] as const)[Math.max(0,Math.min(3,rank))]!;}

export async function serveAccountingAiService(request:Request){
  try{
    const raw=await request.text();if(raw.length>2_000_000)return reply({error:"Payload too large"},413);
    let json:unknown;try{json=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
    const input=requestSchema.parse(json);
    const{db,credential}=await authenticate(request);

    const capability=input.operation==="tax.research.result"
      ?"tax_intelligence.research.write"
      :input.operation==="accounts_prep.result"
        ?"accounting_ai.accounts_prep.write"
        :"accounting_ai.extract.write";
    authoriseServiceScope(credential,{
      tenantId:input.tenantId,productKey:input.productKey,tenantProductId:input.tenantProductId,capability
    });

    if(input.operation==="extraction.failed"){
      await assertClientService(db,input,"accounting_ai.core");
      const{data:run}=await db.from("accounting_extraction_runs").select("id").eq("id",input.extractionRunId)
        .eq("tenant_id",input.tenantId).eq("batch_id",input.batchId).maybeSingle();
      if(!run)return reply({error:"Extraction run not found"},404);
      await db.from("accounting_extraction_runs").update({
        status:"failed",error:input.error,completed_at:new Date().toISOString()
      }).eq("id",input.extractionRunId);
      await db.from("accounting_intake_batches").update({status:"failed"}).eq("id",input.batchId);
      await db.from("accounting_intake_items").update({extraction_status:"failed"}).eq("batch_id",input.batchId)
        .in("extraction_status",["queued","processing"]);
      return reply({ok:true},202);
    }

    if(input.operation==="extraction.result"){
      const scope=await assertClientService(db,input,"accounting_ai.core");
      const{data:batch}=await db.from("accounting_intake_batches").select("id,practice_client_id,status")
        .eq("id",input.batchId).eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
        .eq("practice_client_id",input.practiceClientId).maybeSingle();
      const{data:run}=await db.from("accounting_extraction_runs").select("id,status").eq("id",input.extractionRunId)
        .eq("tenant_id",input.tenantId).eq("batch_id",input.batchId).maybeSingle();
      if(!batch||!run)return reply({error:"Accounting extraction scope not found"},404);
      const config=(scope.clientService.config&&typeof scope.clientService.config==="object")
        ?scope.clientService.config as Record<string,unknown>:{};
      const threshold=Number(config.confidenceThreshold??0.85);
      const requireCapitalReview=config.requireCapitalReview!==false;
      let created=0,reviewRequired=0;

      for(const p of input.proposals){
        const reasons=new Set<string>(p.reviewReasons);
        if(p.confidence<Math.max(0,Math.min(1,threshold)))reasons.add("low_confidence");
        if(requireCapitalReview&&["capital_expenditure","asset"].includes(p.treatment))reasons.add("capex_vs_revenue");
        if(p.duplicateCandidate)reasons.add("duplicate");
        if(!p.proposedAccountCode)reasons.add("unknown_account");
        const debit=p.journalLines.reduce((s,l)=>s+l.debitMinor,0);
        const credit=p.journalLines.reduce((s,l)=>s+l.creditMinor,0);
        if(p.journalLines.length<2||debit<=0||debit!==credit)reasons.add("accounting_policy");
        const reviewStatus=reasons.size?"needs_review":"proposed";

        const{data:existing}=await db.from("accounting_staging_entries").select("id,review_status")
          .eq("tenant_id",input.tenantId).eq("batch_id",input.batchId).eq("source_ref",p.sourceRef).maybeSingle();
        if(existing&&["approved","posted"].includes(existing.review_status))continue;

        const values={
          tenant_id:input.tenantId,batch_id:input.batchId,intake_item_id:p.intakeItemId??null,
          practice_client_id:input.practiceClientId,source_type:p.sourceType,source_ref:p.sourceRef,
          transaction_date:p.transactionDate??null,counterparty:p.counterparty??null,description:p.description,
          gross_minor:p.grossMinor??null,net_minor:p.netMinor??null,tax_minor:p.taxMinor??null,currency:p.currency,
          proposed_account_code:p.proposedAccountCode??null,proposed_tax_code:p.proposedTaxCode??null,
          treatment:p.treatment,confidence:p.confidence,duplicate_candidate:p.duplicateCandidate,
          proposed_journal_lines:p.journalLines,evidence_refs:p.evidenceRefs,model_run_id:input.modelRunId??null,
          review_status:reviewStatus,reviewed_by:null,reviewed_at:null
        };
        let result;
        if(existing?.id){
          result=await db.from("accounting_staging_entries").update(values).eq("id",existing.id).select("id").single();
          await db.from("accounting_review_items").delete().eq("proposal_id",existing.id).in("status",["open","answered"]);
        }else{
          result=await db.from("accounting_staging_entries").insert(values).select("id").single();
        }
        if(result.error||!result.data)throw new Error(result.error?.message??"Accounting proposal could not be saved");
        created+=1;
        const proposalId=result.data.id;
        if(reasons.size){
          reviewRequired+=1;
          const rows=[...reasons].map((reason)=>({
            tenant_id:input.tenantId,proposal_id:proposalId,issue_type:reason,question:reviewQuestion(reason),
            options:[],evidence_refs:p.evidenceRefs,status:"open"
          }));
          const{error:reviewError}=await db.from("accounting_review_items").insert(rows);
          if(reviewError)throw new Error(reviewError.message);
        }
        if(p.intakeItemId){
          await db.from("accounting_intake_items").update({
            extraction_status:reasons.size?"needs_review":"completed"
          }).eq("id",p.intakeItemId).eq("batch_id",input.batchId);
        }
      }
      await db.from("accounting_extraction_runs").update({
        provider:input.provider,model:input.model??null,model_run_id:input.modelRunId??null,
        status:"completed",completed_at:new Date().toISOString(),error:null
      }).eq("id",input.extractionRunId);
      await db.from("accounting_intake_batches").update({status:"review"}).eq("id",input.batchId);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({created,reviewRequired,status:"review"},202);
    }

    if(input.operation==="accounts_prep.result"){
      await assertClientService(db,input,"accounting_ai.core");
      const{data:run}=await db.from("accounting_accounts_prep_runs")
        .select("id,status,period_start,period_end,practice_client_id")
        .eq("id",input.prepRunId).eq("tenant_id",input.tenantId)
        .eq("practice_client_id",input.practiceClientId).maybeSingle();
      if(!run)return reply({error:"Accounts preparation run not found"},404);
      if(run.status!=="building")return reply({error:"Accounts preparation run is not awaiting an AI result"},409);

      const{data:locked}=await db.from("accounting_accounts_prep_adjustments").select("id")
        .eq("prep_run_id",run.id).in("status",["approved","posted"]).limit(1);
      if(locked?.length)return reply({error:"Accounts preparation run already has locked adjustments"},409);

      for(const adjustment of input.adjustments){
        const debit=adjustment.journalLines.reduce((sum,line)=>sum+line.debitMinor,0);
        const credit=adjustment.journalLines.reduce((sum,line)=>sum+line.creditMinor,0);
        if(debit<=0||debit!==credit)return reply({error:"Every accounts-prep adjustment must contain balanced journal lines"},422);
        if(adjustment.journalDate<run.period_start||adjustment.journalDate>run.period_end){
          return reply({error:"Accounts-prep adjustment date must fall within the preparation period"},422);
        }
      }

      await db.from("accounting_accounts_prep_adjustments").delete()
        .eq("prep_run_id",run.id).in("status",["proposed","rejected"]);
      if(input.adjustments.length){
        const rows=input.adjustments.map((adjustment)=>({
          tenant_id:input.tenantId,prep_run_id:run.id,practice_client_id:input.practiceClientId,
          title:adjustment.title,description:adjustment.description,reason:adjustment.reason,
          journal_date:adjustment.journalDate,currency:adjustment.currency,
          proposed_journal_lines:adjustment.journalLines,evidence_refs:adjustment.evidenceRefs,
          confidence:adjustment.confidence,risk:adjustment.risk,status:"proposed",
          model_run_id:input.modelRunId??null
        }));
        const{error:adjustmentError}=await db.from("accounting_accounts_prep_adjustments").insert(rows);
        if(adjustmentError)throw new Error(adjustmentError.message);
      }

      const{error:updateError}=await db.from("accounting_accounts_prep_runs").update({
        status:"review",result:input.result,adjustment_count:input.adjustments.length,
        output_document_refs:input.outputDocumentRefs,review_notes:input.reviewNotes??null,
        model_run_id:input.modelRunId??null,completed_at:new Date().toISOString()
      }).eq("id",run.id);
      if(updateError)throw new Error(updateError.message);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({status:"review",adjustments:input.adjustments.length},202);
    }

    await assertClientService(db,input,"tax_intelligence.core");
    const{data:run}=await db.from("tax_research_runs").select("id,research_issue_id,status")
      .eq("id",input.researchRunId).eq("tenant_id",input.tenantId).maybeSingle();
    if(!run)return reply({error:"Tax research run not found"},404);
    const{data:issue}=await db.from("tax_research_issues").select("id,jurisdiction,practice_client_id")
      .eq("id",run.research_issue_id).eq("tenant_id",input.tenantId)
      .eq("practice_client_id",input.practiceClientId).maybeSingle();
    if(!issue)return reply({error:"Tax research issue not found"},404);

    let sources:any[]=[];
    if(input.sourceIds.length){
      const{data:sourceRows,error:sourceError}=await db.from("tax_knowledge_sources")
        .select("id,jurisdiction,authority_level,title,citation,source_url,checked_at,effective_from,effective_until")
        .in("id",input.sourceIds);
      if(sourceError)throw new Error(sourceError.message);
      sources=sourceRows??[];
      if(sources.length!==new Set(input.sourceIds).size)return reply({error:"One or more tax sources were not found"},422);
      const mismatched=sources.filter((s:any)=>String(s.jurisdiction).toUpperCase()!==String(issue.jurisdiction).toUpperCase());
      if(mismatched.length)return reply({error:"Tax sources must match the research jurisdiction"},422);
    }

    await db.from("tax_position_proposals").delete().eq("research_issue_id",issue.id).eq("status","proposed");
    for(const p of input.positions){
      const used=sources.filter((s:any)=>p.sourceIds.includes(s.id));
      if(used.length!==new Set(p.sourceIds).size)return reply({error:"A tax position references an unverified source"},422);
      const levels=new Set(used.map((s:any)=>String(s.authority_level)));
      const strong=["legislation","regulation","binding_case_law","official_ruling"].some((l)=>levels.has(l));
      const moderate=["persuasive_case_law","official_guidance"].some((l)=>levels.has(l));
      let floor=0;
      if(!strong&&moderate)floor=1;
      if(!strong&&!moderate)floor=3;
      if(input.contraryAuthorities.length)floor=Math.max(floor,1);
      const risk=rankRisk(Math.max(riskRank(p.risk),floor));
      const{error}=await db.from("tax_position_proposals").insert({
        tenant_id:input.tenantId,research_issue_id:issue.id,title:p.title,position_type:p.positionType,
        proposed_treatment:p.proposedTreatment,legal_basis:p.legalBasis,source_ids:p.sourceIds,
        fact_dependencies:p.factDependencies,evidence_refs:p.evidenceRefs,
        estimated_tax_impact_minor:p.estimatedTaxImpactMinor??null,currency:p.currency??null,
        confidence:p.confidence,risk,status:"proposed",model_run_id:input.modelRunId??null
      });
      if(error)throw new Error(error.message);
    }
    const{error:runUpdateError}=await db.from("tax_research_runs").update({
      retrieved_source_ids:input.sourceIds,answer_draft:input.answerDraft,uncertainties:input.uncertainties,
      contrary_authorities:input.contraryAuthorities,model_run_id:input.modelRunId??null,status:"completed",
      completed_at:new Date().toISOString(),error:null
    }).eq("id",run.id);
    if(runUpdateError)throw new Error(runUpdateError.message);
    await db.from("tax_research_issues").update({status:"review"}).eq("id",issue.id);
    await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
    return reply({status:"review",positions:input.positions.length,sources:input.sourceIds.length},202);
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid Accounting AI contract"},422);
    const message=error instanceof Error?error.message:"Accounting AI service refused";
    if(/credential|scope|authorization|expired/i.test(message))return reply({error:message},403);
    return reply({error:message},503);
  }
}
