/**
 * Finvessa TreasuryOS Phase 4 — deterministic analyst working papers.
 * A generated pack is NOT a signed financial opinion, approved forecast,
 * verified bank statement or authorisation to execute any treasury transaction.
 */
import {formatMinor, type TreasuryIssue, type TreasuryReport} from "./engine";
import type {LiquidityRiskIssue, LiquidityRiskResult} from "./liquidity-risk";

export type TreasuryPackDecision = "hold_source_data" | "independent_review_required" | "built_in_checks_passed";
export interface TreasuryPackTask {
  id: string;
  priority: "urgent" | "high" | "normal";
  ownerRole: "cash_analyst" | "treasury_risk" | "treasury_controls";
  instruction: string;
  evidence: string[];
  automaticAction: false;
}
export interface TreasuryPackCurrency {
  currency: string;
  position: string;
  checkedAccounts: number;
  totalAccounts: number;
  thirteenWeekEvidence: boolean;
  finalBaseline: string | null;
  finalDownside: string | null;
  stressedLow: string | null;
  maximumCashBufferGap: string | null;
  firstBreachWeek: number | null;
}
export interface TreasuryPack {
  kind: "finvessa_treasury_analyst_working_paper";
  reportDate: string;
  sourceMode: TreasuryReport["mode"];
  createdAt: string;
  decision: TreasuryPackDecision;
  reviewRequired: true;
  disclosure: string;
  statusBasis: string[];
  currencyPositions: TreasuryPackCurrency[];
  keyFindings: Array<{
    severity: "blocking" | "warning" | "info";
    code: string;
    narrative: string;
    evidence: string;
  }>;
  totalFindings: number;
  omittedFindings: number;
  nextActions: TreasuryPackTask[];
  sourceInventory: TreasuryReport["sources"];
  controls: string[];
}
const MAX_FINDINGS = 200;
function rank(level: string): number {
  return level === "blocking" ? 0 : level === "warning" ? 1 : 2;
}
function details(issues: TreasuryIssue[], extra: LiquidityRiskIssue[]) {
  return [
    ...issues.map(x => ({
      severity:x.severity,code:x.code,narrative:x.message,evidence:x.evidence
    })),
    ...extra.map(x => ({
      severity:x.severity,code:x.code,narrative:x.currency+" — "+x.description,
      evidence:x.evidence
    }))
  ].sort((a,b)=>rank(a.severity)-rank(b.severity)||a.code.localeCompare(b.code));
}
function mkTask(id:string, priority:TreasuryPackTask["priority"],
  ownerRole:TreasuryPackTask["ownerRole"], instruction:string, evidence:string[]):TreasuryPackTask {
  return {id,priority,ownerRole,instruction,evidence:[...new Set(evidence)].slice(0,100),automaticAction:false};
}
function codes(report:TreasuryReport,risk?:LiquidityRiskResult|null) {
  return new Set([...report.issues.map(x=>x.code),...(risk?.issues??[]).map(x=>x.code)]);
}
function sourcesFor(
  codeSet:readonly string[],report:TreasuryReport,risk:LiquidityRiskResult|null
):string[] {
  return [
    ...report.issues.filter(x=>codeSet.includes(x.code)).map(x=>x.evidence),
    ...(risk?.issues??[]).filter(x=>codeSet.includes(x.code)).map(x=>x.evidence)
  ];
}
export function makeTreasuryAnalystPack(
  report:TreasuryReport,
  risk:LiquidityRiskResult|null = null
):TreasuryPack {
  if(!report || !report.currencyPositions || !report.positions || !report.issues || !report.sources)
    throw new Error("A complete treasury source analysis is required for a working paper.");
  if(risk && (risk.reportDate!==report.reportDate || risk.sourceReportStatus!==report.status))
    throw new Error("Risk results do not belong to the current treasury analysis.");
  const issues=details(report.issues,risk?.issues??[]);
  const refCodes=codes(report,risk);
  const tasks:TreasuryPackTask[]=[];
  const add=(task:TreasuryPackTask)=>tasks.push(task);
  if(report.status==="blocked" || risk?.status==="blocked")add(mkTask(
    "verify-source-blockers","urgent","treasury_controls",
    "Stop sign-off; investigate and independently verify every blocking source/controls exception.",
    report.issues.filter(x=>x.severity==="blocking").map(x=>x.evidence)));
  if(["LEDGER_NOT_PROVIDED","UNMATCHED_BANK_TRANSACTION","UNMATCHED_LEDGER_TRANSACTION",
      "AMBIGUOUS_LEDGER_MATCH","DUPLICATE_LEDGER_ID"].some(x=>refCodes.has(x)))add(mkTask(
    "resolve-bank-book-differences","high","cash_analyst",
    "Obtain authoritative cash-ledger evidence and resolve bank-to-book exceptions without inferred fuzzy matches.",
    sourcesFor(["LEDGER_NOT_PROVIDED","UNMATCHED_BANK_TRANSACTION","UNMATCHED_LEDGER_TRANSACTION",
      "AMBIGUOUS_LEDGER_MATCH","DUPLICATE_LEDGER_ID"],report,risk)));
  if(["BALANCE_MISMATCH","MISSING_CLOSING_BALANCE","CONFLICTING_TRANSACTION_ID"].some(x=>refCodes.has(x)))add(mkTask(
    "reverify-statement-balances","urgent","cash_analyst",
    "Validate statement running balances, transaction IDs and source completeness against bank-issued evidence.",
    sourcesFor(["BALANCE_MISMATCH","MISSING_CLOSING_BALANCE","CONFLICTING_TRANSACTION_ID"],report,risk)));
  if(refCodes.has("STALE_POSITION") || refCodes.has("NO_POSTED_ACTIVITY"))add(mkTask(
    "refresh-stale-evidence","high","cash_analyst",
    "Refresh stale accounts and confirm whether missing transaction activity reflects a complete bank statement.",
    sourcesFor(["STALE_POSITION","NO_POSTED_ACTIVITY"],report,risk)));
  if(["NO_VERIFIED_FORECAST_INPUT","CURRENCY_FORECAST_NOT_PROVIDED",
      "DUPLICATE_FORECAST","CONFLICTING_FORECAST_ENTRY"].some(x=>refCodes.has(x)))add(mkTask(
    "substantiate-cash-flow-forecast","high","cash_analyst",
    "Provide complete, non-duplicated dated commitments and expected cash-flow inputs for the 13-week forecast.",
    sourcesFor(["NO_VERIFIED_FORECAST_INPUT","CURRENCY_FORECAST_NOT_PROVIDED",
      "DUPLICATE_FORECAST","CONFLICTING_FORECAST_ENTRY"],report,risk)));
  if(!risk || ["unassessed","review_required"].includes(risk.status))add(mkTask(
    "complete-risk-policy-assessment","high","treasury_risk",
    "Supply and independently approve currency-specific liquidity floors, verified facilities and scenario assumptions.",
    risk?.issues?.filter(x=>x.severity==="blocking").map(x=>x.evidence)??["liquidity-policy.csv"]));
  if(["STRESS_BUFFER_BREACH","UNFUNDED_STRESS_GAP","CURRENT_BUFFER_BREACH"].some(x=>refCodes.has(x)))add(mkTask(
    "assess-liquidity-gap","urgent","treasury_risk",
    "Investigate scenario funding/buffer shortfalls, check funding capacity and present options to authorised treasury management.",
    sourcesFor(["STRESS_BUFFER_BREACH","UNFUNDED_STRESS_GAP","CURRENT_BUFFER_BREACH"],report,risk)));
  add(mkTask("qualified-analyst-review","normal","treasury_controls",
    "Validate all calculations and assumptions against independent source records. No payment, hedge, trading or regulatory submission is approved by this pack.",
    report.sources.map(x=>x.file)));

  const summary=report.currencyPositions.map(p=>{
    const accounts=report.positions.filter(x=>x.currency===p.currency);
    const weeks=report.weeks.filter(x=>x.currency===p.currency);
    const last=weeks.find(x=>x.week===13);
    const measurement=risk?.metrics.find(x=>x.currency===p.currency);
    return {
      currency:p.currency,
      position:formatMinor(p.balanceMinor,p.currency),
      checkedAccounts:accounts.filter(x=>x.reconciled).length,
      totalAccounts:accounts.length,
      thirteenWeekEvidence:weeks.length===13,
      finalBaseline:last?formatMinor(last.closingBaseMinor,p.currency):null,
      finalDownside:last?formatMinor(last.closingDownsideMinor,p.currency):null,
      stressedLow:measurement?.worstStressedCashMinor==null?null:formatMinor(measurement.worstStressedCashMinor,p.currency),
      maximumCashBufferGap:measurement?.maximumBufferGapMinor==null?null:formatMinor(measurement.maximumBufferGapMinor,p.currency),
      firstBreachWeek:measurement?.firstBreachWeek??null
    };
  });
  const decision:TreasuryPackDecision =
    report.status==="blocked"||risk?.status==="blocked"?"hold_source_data":
    report.status!=="checked"||!risk||risk.status!=="within_policy_assumptions"?
      "independent_review_required":"built_in_checks_passed";
  return {
    kind:"finvessa_treasury_analyst_working_paper",
    reportDate:report.reportDate,sourceMode:report.mode,createdAt:report.generatedAt,
    decision,reviewRequired:true,
    disclosure:"Automated source-based working paper, not a certified audit opinion, a bank-verified balance, a financing decision or a payment/trade instruction. Qualified human review required.",
    statusBasis:[
      "Source analysis: "+report.status,
      "Liquidity scenarios: "+(risk?.status??"not provided"),
      "Every currency is independent; no FX conversion or fabricated consolidated total.",
      "Risk floors, facilities and haircuts are operator-provided, not independent attestations.",
      "Findings are derived from validated source exceptions and deterministic calculations only."
    ],
    currencyPositions:summary,
    keyFindings:issues.slice(0,MAX_FINDINGS),
    totalFindings:issues.length,
    omittedFindings:Math.max(0,issues.length-MAX_FINDINGS),
    nextActions:tasks,
    sourceInventory:report.sources,
    controls:[
      "No external bank/ERP/SWIFT connection was invoked by the analysis or this report generator.",
      "Statement validation and bank-to-ledger matching use separate source evidence where supplied.",
      "Missing or stale sources remain explicit exceptions; forecast gaps do not imply zero future flows.",
      "Bank-GL and forecast source rows, review status and analysis methodology remain available in the report's evidence JSON.",
      "This pack cannot execute trades, payments, journals, credit facility drawdowns or regulatory submissions."
    ]
  };
}

function md(value:string):string {
  return value.replace(/[\x00-\x1f\x7f]/g," ").replace(/[\\|*_~\x60<>\[\]{}]/g,match=>"\\"+match).trim();
}
export function treasuryPackMarkdown(pack:TreasuryPack):string {
  const lines=[
    "# Finvessa TreasuryOS — Daily Analyst Working Paper",
    "",
    "Report date: "+pack.reportDate,
    "Prepared: "+pack.createdAt,
    "Input: "+pack.sourceMode.replaceAll("_"," "),
    "Control conclusion: **"+pack.decision.replaceAll("_"," ")+"**",
    "",
    "> "+md(pack.disclosure),
    "",
    "## Status and evidence",
    ...pack.statusBasis.map(x=>"- "+md(x)),
    "",
    "## Cash positions and liquidity by currency",
    "| Currency | Cash position | GL-checked accounts | 13-week baseline | Downside | Stressed low | Max buffer gap |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...pack.currencyPositions.map(x=>"| "+md(x.currency)+" | "+md(x.position)+" | "+
      x.checkedAccounts+"/"+x.totalAccounts+" | "+
      md(x.finalBaseline??"Not evidenced")+" | "+md(x.finalDownside??"Not evidenced")+" | "+
      md(x.stressedLow??"Not assessed")+" | "+md(x.maximumCashBufferGap??"Not assessed")+" |"),
    "",
    "## Exception review (priority order)"
  ];
  if(pack.keyFindings.length===0)lines.push(
    "No exceptions were raised by implemented checks. Independent source and policy assurance is still required."
  );
  else lines.push(...pack.keyFindings.map(x=>"- **"+md(x.severity.toUpperCase()+" "+x.code)+"** — "+
    md(x.narrative)+" (source: "+md(x.evidence)+")"));
  if(pack.omittedFindings)lines.push(
    "- **"+pack.omittedFindings+" additional exception(s) omitted from this summary. Inspect the full evidence JSON.**");
  lines.push("","## Analyst next actions");
  for(const x of pack.nextActions)lines.push(
    "- **"+md(x.priority.toUpperCase()+" / "+x.ownerRole)+"**: "+md(x.instruction)+
    " (evidence: "+(x.evidence.length?x.evidence.map(md).join("; "):"See full evidence pack")+")");
  lines.push("","## Input inventory");
  lines.push(...pack.sourceInventory.map(x=>"- "+md(x.file)+": "+x.rows+" row(s)"));
  lines.push("","## Controls and qualifications",...pack.controls.map(x=>"- "+md(x)));
  return lines.join("\n")+"\n";
}
