/**
 * TreasuryOS Phase 5 authenticated control plane.
 * Source requests & schedule DRAFTS are metadata-only; no data transfer,
 * bank network call, background cron, API token, LLM or payment execution.
 */
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireTenantMembership,requireWriteRole,requireAdminRole} from "@/modules/platform/access";
import {analyseTreasury,isoDate,treasuryDemoInput} from "./engine";
import {assessLiquidityRisk,syntheticLiquidityPolicy} from "./liquidity-risk";
import {makeTreasuryAnalystPack} from "./analyst-pack";
import {runSignedTreasurySandbox,signSyntheticTreasurySnapshot,
  type SignedTreasurySnapshot,type TreasuryPinnedKey} from "./signed-ingestion";
import {performTreasuryReadOnlyPilot,TREASURY_PILOT_PROVIDER_NOTES,type TreasuryPilotProvider} from "./provider-pilots";
import {REQUIRED_TREASURY_SOURCES,REQUIRED_READ_SCOPES,
  type TreasurySourceBinding,type TreasurySourceKind} from "./trusted-sources";

const tenantId=z.string().uuid();
const scope=z.object({tenantId}).strict();
const sourceKind=z.enum([
  "bank_opening","bank_transactions","cash_general_ledger",
  "cash_forecast","liquidity_policy"
]);
const providerFamily=z.enum(["bank_api","erp_api","managed_sftp","managed_file"]);
const providerKey=z.string().regex(/^[a-z][a-z0-9.-]{1,79}$/);
const timezone=z.enum([
  "UTC","Europe/London","Europe/Berlin","America/New_York","America/Chicago","Asia/Karachi"
]);
const frequency=z.enum(["daily","business_days"]);
const runTime=z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
type SourceRequest={
 id:string;source_kind:string;provider_family:string;provider_key:string;
 status:string;requested_by:string;created_at:string;
};
type VerifiedSource={
 tenant_id:string;product_key:"finvessa";source_kind:string;provider_family:string;provider_key:string;
 status:string;read_only:boolean;verified_scopes:string[];proof_reference:string|null;
 verified_at:string|null;valid_until:string|null;last_successful_read_at:string|null;
};
type ScheduleDraft={
 id:string;frequency:string;timezone:string;proposed_at:string;
 activation_status:"draft"|"paused";run_mode:"simulation_only";delivery_mode:"dashboard_only";
 created_at:string;updated_at:string;
};

async function requireActiveFinvessa(context:any,tid:string) {
  const access=await requireTenantMembership(context,tid);
  const {data,error}=await (context.supabase as any).from("tenant_products")
    .select("status").eq("tenant_id",tid).eq("product_key","finvessa").maybeSingle();
  if(error||!data||data.status!=="active")throw new Error("An active Finvessa tenant entitlement is required.");
  return access;
}
export const getTreasuryAutomationWorkspace=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>scope.parse(i))
  .handler(async({context,data}):Promise<{
    sourceRequests:SourceRequest[];verifiedSources:VerifiedSource[];
    scheduleDraft:ScheduleDraft|null;executionEnabled:false;
  }>=>{
    await requireActiveFinvessa(context,data.tenantId);
    const db=context.supabase as any;
    const [requests,bindings,draft]=await Promise.all([
      db.from("treasury_source_requests")
        .select("id,source_kind,provider_family,provider_key,status,requested_by,created_at")
        .eq("tenant_id",data.tenantId).eq("product_key","finvessa")
        .order("created_at",{ascending:false}).limit(100),
      db.from("treasury_verified_sources")
        .select("tenant_id,product_key,source_kind,provider_family,provider_key,status,read_only,verified_scopes,proof_reference,verified_at,valid_until,last_successful_read_at")
        .eq("tenant_id",data.tenantId).eq("product_key","finvessa")
        .order("source_kind"),
      db.from("treasury_schedule_drafts")
        .select("id,frequency,timezone,proposed_at,activation_status,run_mode,delivery_mode,created_at,updated_at")
        .eq("tenant_id",data.tenantId).eq("product_key","finvessa").maybeSingle()
    ]);
    for(const x of [requests,bindings,draft])if(x.error)throw new Error(x.error.message);
    return {
      sourceRequests:requests.data??[],verifiedSources:bindings.data??[],
      scheduleDraft:draft.data??null,executionEnabled:false
    };
  });

const requestSchema=scope.extend({
  sourceKind,providerFamily,providerKey,
  reason:z.string().trim().min(12).max(500)
}).strict();
export const requestTreasurySourceSetup=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>requestSchema.parse(i))
  .handler(async({context,data})=>{
    const access=await requireActiveFinvessa(context,data.tenantId);
    requireAdminRole(access.role);
    const res=await (context.supabase as any).rpc("request_treasury_readonly_source",{
      _tenant:data.tenantId,_kind:data.sourceKind,
      _family:data.providerFamily,_provider:data.providerKey,
      _rationale:data.reason
    });
    if(res.error)throw new Error(res.error.message);
    return res.data as {requestId:string;status:string;alreadyExists:boolean};
  });

const scheduleSchema=scope.extend({
  frequency,timezone,runTime
}).strict();
export const saveTreasuryDraftSchedule=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>scheduleSchema.parse(i))
  .handler(async({context,data})=>{
    const access=await requireActiveFinvessa(context,data.tenantId);
    requireAdminRole(access.role);
    const res=await (context.supabase as any).rpc("save_treasury_schedule_draft",{
      _tenant:data.tenantId,_frequency:data.frequency,
      _timezone:data.timezone,_run_time:data.runTime
    });
    if(res.error)throw new Error(res.error.message);
    return res.data as {draftId:string;status:"draft";executionEnabled:false};
  });

const syntheticSchema=scope.extend({
  reportDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).strict();
export const runTreasuryServerSyntheticPreview=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>syntheticSchema.parse(i))
  .handler(async({context,data})=>{
    const access=await requireActiveFinvessa(context,data.tenantId);
    requireWriteRole(access.role);
    const date=isoDate(data.reportDate,"Synthetic preview date");
    const now=new Date().toISOString().slice(0,10);
    if(date>now || date<"2020-01-01")throw new Error("Use a date between 2020 and today.");
    // Synthetic fixture created on the trusted server, not supplied by
    // browser or fetched from external bank systems.
    const input=treasuryDemoInput(date);
    const report=analyseTreasury(input);
    const risk=assessLiquidityRisk(report,syntheticLiquidityPolicy());
    const workingPaper=makeTreasuryAnalystPack(report,risk);
    return {
      mode:"synthetic_server_preview" as const,
      executionEnabled:false as const,
      externalConnectionsUsed:0 as const,
      previewDate:date,
      workingPaper
    };
  });


/**
 * Manual end-to-end sandbox flow. Signed fixtures and NON-EXPORTABLE keys are
 * generated on the authenticated server, never supplied from the browser.
 * The key pairs are ephemeral and not registered as approved bank providers.
 * Nothing is stored and no external network/provider is contacted.
 */
export const runTreasurySignedSyntheticPreview=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>syntheticSchema.parse(i))
  .handler(async({context,data})=>{
    const access=await requireActiveFinvessa(context,data.tenantId);
    requireWriteRole(access.role);
    const date=isoDate(data.reportDate,"Signed synthetic preview date");
    const now=new Date();
    const nowString=now.toISOString();
    const today=nowString.slice(0,10);
    if(date>today || date<"2020-01-01")
      throw new Error("Use a date between 2020 and today.");
    if(!globalThis.crypto?.subtle)
      throw new Error("Secure server cryptographic engine unavailable.");
    const sample=treasuryDemoInput(date);
    const sources:Record<TreasurySourceKind,string>={
      bank_opening:sample.accountsCSV,
      bank_transactions:sample.transactionsCSV,
      cash_general_ledger:sample.ledgerCSV??"",
      cash_forecast:sample.forecastCSV,
      liquidity_policy:syntheticLiquidityPolicy()
    };
    const expires=new Date(now.getTime()+7*86400_000).toISOString();
    const keys:TreasuryPinnedKey[]=[];
    const bindings:TreasurySourceBinding[]=[];
    const envelopes:SignedTreasurySnapshot[]=[];
    for(const kind of REQUIRED_TREASURY_SOURCES){
      const providerKey="synthetic-"+kind.replaceAll("_","-");
      const keyId="sandbox-key-"+kind.replaceAll("_","-");
      const key=await crypto.subtle.generateKey(
        {name:"HMAC",hash:"SHA-256",length:256},false,["sign","verify"]
      );
      keys.push({
        tenantId:data.tenantId,sourceKind:kind,providerKey,keyId,
        cryptoKey:key,status:"sandbox_verified",validUntil:expires
      });
      bindings.push({
        tenantId:data.tenantId,productKey:"finvessa",sourceKind:kind,
        providerFamily:"managed_file",providerKey,
        connectionStatus:"sandbox_verified",readOnly:true,
        scopes:[REQUIRED_READ_SCOPES[kind]],
        proofReference:"synthetic-shadow-proof-"+kind.replaceAll("_","-"),
        verifiedAt:nowString,validUntil:expires,lastSuccessfulReadAt:nowString
      });
      envelopes.push(await signSyntheticTreasurySnapshot({
        version:1,tenantId:data.tenantId,sourceKind:kind,
        providerKey,keyId,eventId:"synthetic-event-"+kind.replaceAll("_","-"),
        receivedAt:nowString,canonicalCsv:sources[kind]
      },key));
    }
    const checked=await runSignedTreasurySandbox({
      tenantId:data.tenantId,reportDate:date,now:nowString,
      bindings,keys,envelopes
    });
    return {
      mode:"signed_synthetic_sandbox" as const,
      executionEnabled:false as const,
      externalConnectionsUsed:0 as const,
      reportDate:date,workingPaper:checked.run.report,
      receipts:checked.receipts,signatureCount:checked.receipts.length,
      sourceStatus:checked.run.sourceStatus,riskStatus:checked.run.riskStatus
    };
  });


/**
 * Phase 7 fixed-provider CONTRACT DEMO. No credentials, OAuth flow, live
 * supplier network or arbitrary URL from the user. Synthetic provider objects
 * and a deliberately fake in-process HTTP transport exercise the production
 * parser and request-safety invariants.
 *
 * The verified-approval object in this isolated example is an EPHEMERAL
 * FIXTURE, not a real connection proof for any bank or Xero organisation.
 */
const previewProviderInput=scope.extend({
  provider:z.enum(["truelayer_data_v3","xero_accounting"])
}).strict();

export const runTreasuryProviderContractPreview=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>previewProviderInput.parse(i))
  .handler(async({context,data})=>{
    const access=await requireActiveFinvessa(context,data.tenantId);
    requireWriteRole(access.role);
    const provider:TreasuryPilotProvider=data.provider;
    const truelayerAccountId="56c7b029e0f8ec5a2334fb0ffc2fface";
    const xeroAccountId="6f7594f2-f059-4d56-9e67-47ac9733bfe9";
    const fixture=provider==="truelayer_data_v3"
      ?{
        items:[
          {id:truelayerAccountId,account_type:"current",customer_segment:"business",currency:"GBP"},
          {id:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",account_type:"savings",customer_segment:"retail",currency:"GBP"}
        ],pagination:{}
       }
      :{
        pagination:{page:1,pageSize:100,pageCount:1,itemCount:2},
        BankTransactions:[
          {BankTransactionID:"db54aab0-ad40-4ced-bcff-0940ba20db2c",
            BankAccount:{AccountID:xeroAccountId},Status:"AUTHORISED",Type:"RECEIVE",
            IsReconciled:true,DateString:"2026-10-16T00:00:00",
            CurrencyCode:"GBP",Total:125.40,Reference:"Synthetic sample collection"},
          {BankTransactionID:"29a69c45-64ca-4805-a1cc-34990de837b3",
            BankAccount:{AccountID:xeroAccountId},Status:"DRAFT",Type:"SPEND",
            IsReconciled:false,DateString:"2026-10-16T00:00:00",
            CurrencyCode:"GBP",Total:22.00,Reference:"Unapproved synthetic example"}
        ]
       };
    const now=new Date();
    const expiry=new Date(now.getTime()+60_000).toISOString();
    const expectedOrigin=provider==="truelayer_data_v3"
      ?"https://api.truelayer-sandbox.com/v3/connected-accounts"
      :"https://api.xero.com/api.xro/2.0/BankTransactions?page=1&pageSize=100";
    // transport returns an in-memory fixture, NOT an HTTP request
    const mockTransport=async(url:RequestInfo|URL,options?:RequestInit):Promise<Response>=>{
      if(String(url)!==expectedOrigin || options?.method!=="GET" || options?.redirect!=="error")
        throw new Error("The sandbox provider request contract was not respected.");
      return new Response(JSON.stringify(fixture),{
        status:200,headers:{"content-type":"application/json"}
      });
    };
    const observed=await performTreasuryReadOnlyPilot({
      authenticatedTenantId:data.tenantId,
      pilot:{
        tenantId:data.tenantId,productKey:"finvessa",provider,
        environment:"sandbox_test_only",approvalState:"independently_verified",
        approvalReference:"fixture-only-demo-approval-01",
        approvedReadScopes:provider==="truelayer_data_v3"?["accounts"]:["accounting.transactions.read"],
        consentValidUntil:expiry,connectorProofValidUntil:expiry,
        accountAllowlist:provider==="truelayer_data_v3"?[truelayerAccountId]:[xeroAccountId],
        externalConnectionId:provider==="truelayer_data_v3"
          ?"e6e7d29d-7318-4f77-8c95-3d7422358572"
          :"5a9ce10e-1496-4c34-bd02-2b01f858e884"
      },
      secret:{bearerToken:"synthetic_in_process_access_1234567890"},
      now:now.toISOString(),transport:mockTransport
    });
    return {
      mode:"synthetic_fixture_no_external_network" as const,
      externalConnectionsUsed:0 as const,
      observed,
      providerSpec:TREASURY_PILOT_PROVIDER_NOTES.find(x=>x.key===provider)!
    };
  });
