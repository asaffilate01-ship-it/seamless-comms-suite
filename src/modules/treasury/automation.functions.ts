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
