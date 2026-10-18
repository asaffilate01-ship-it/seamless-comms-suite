/**
 * Treasury review register RPC gateway — metadata only.
 * The browser never uploads bank/GL transactions or policy records here.
 * All RLS and maker-checker constraints are re-enforced in SQL functions.
 */
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole, requireTenantMembership, requireWriteRole} from "@/modules/platform/access";

const uuid = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const scope = z.object({tenantId: uuid}).strict();
const source = z.enum(["checked","review_required","blocked"]);
const risk = z.enum(["blocked","unassessed","breach","review_required","within_policy_assumptions"]);
const integerCount = z.number().int().min(0).max(20000);
export interface TreasuryReviewCase {
  id: string; tenant_id: string; report_date: string;
  report_mode: "synthetic_demo"|"local_import";
  source_status: "blocked"|"review_required"|"checked";
  risk_status: "blocked"|"unassessed"|"breach"|"review_required"|"within_policy_assumptions";
  report_digest: string; policy_digest: string;
  account_count: number; reconciled_count: number; blocking_count: number;
  warning_count: number; breach_count: number;
  status: "submitted"|"acknowledged"|"correction_requested";
  created_by: string; reviewed_by: string|null; reviewer_note: string|null;
  created_at: string; reviewed_at: string|null;
}
export interface TreasuryReviewEvent {
  id: string; tenant_id: string; case_id: string; event_type: string;
  actor_id: string; note: string|null; created_at: string;
}
async function entitled(context: any, tenantId: string) {
  const access = await requireTenantMembership(context, tenantId);
  const db = context.supabase as any;
  const {data, error} = await db.from("tenant_products")
    .select("status").eq("tenant_id", tenantId).eq("product_key", "finvessa").maybeSingle();
  if (error || !data || data.status !== "active")
    throw new Error("Active Finvessa tenant product required");
  return access;
}
export const getTreasuryReviewCases = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown) => scope.parse(i))
  .handler(async({context,data}):Promise<{cases:TreasuryReviewCase[];events:TreasuryReviewEvent[]}>=>{
    await entitled(context,data.tenantId);
    const db=context.supabase as any;
    const [cases,events]=await Promise.all([
      db.from("treasury_review_cases")
        .select("id,tenant_id,report_date,report_mode,source_status,risk_status,report_digest,policy_digest,account_count,reconciled_count,blocking_count,warning_count,breach_count,status,created_by,reviewed_by,reviewer_note,created_at,reviewed_at")
        .eq("tenant_id",data.tenantId).eq("product_key","finvessa")
        .order("created_at",{ascending:false}).limit(60),
      db.from("treasury_review_events")
        .select("id,tenant_id,case_id,event_type,actor_id,note,created_at")
        .eq("tenant_id",data.tenantId)
        .order("created_at",{ascending:false}).limit(120)
    ]);
    if(cases.error)throw new Error(cases.error.message);
    if(events.error)throw new Error(events.error.message);
    const visible=new Set((cases.data??[]).map((x:any)=>x.id));
    return {cases:cases.data??[],events:(events.data??[]).filter((x:any)=>visible.has(x.case_id))};
  });

const submitSchema=scope.extend({
  reportDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reportMode:z.enum(["synthetic_demo","local_import"]),
  sourceStatus:source,riskStatus:risk,
  reportDigest:digest,policyDigest:digest,
  accountCount:integerCount,reconciledCount:integerCount,
  blockingCount:integerCount,warningCount:integerCount,breachCount:integerCount
}).strict().refine(d=>d.reconciledCount<=d.accountCount,{message:"Invalid reconciliation count"});
export const submitTreasuryReview = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>submitSchema.parse(i))
  .handler(async({context,data})=>{
    const access=await entitled(context,data.tenantId);requireWriteRole(access.role);
    const result=await (context.supabase as any).rpc("submit_treasury_review",{
      _tenant:data.tenantId,_report_date:data.reportDate,
      _mode:data.reportMode,_source_status:data.sourceStatus,_risk_status:data.riskStatus,
      _report_digest:data.reportDigest,_policy_digest:data.policyDigest,
      _accounts:data.accountCount,_reconciled:data.reconciledCount,
      _blocking:data.blockingCount,_warnings:data.warningCount,
      _breaches:data.breachCount
    });
    if(result.error)throw new Error(result.error.message);
    return result.data as {caseId:string;status:string;alreadyExists:boolean};
  });
const reviewSchema=scope.extend({
  caseId:uuid,decision:z.enum(["acknowledged","correction_requested"]),
  note:z.string().trim().min(12).max(1200)
}).strict();
export const reviewTreasuryCase = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>reviewSchema.parse(i))
  .handler(async({context,data})=>{
    const access=await entitled(context,data.tenantId);requireAdminRole(access.role);
    const result=await (context.supabase as any).rpc("review_treasury_case",{
      _tenant:data.tenantId,_case:data.caseId,_decision:data.decision,_note:data.note
    });
    if(result.error)throw new Error(result.error.message);
    return result.data as {caseId:string;status:string;reviewed:boolean};
  });
