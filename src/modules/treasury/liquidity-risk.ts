/**
 * Finvessa Liquidity Risk & Stress Analysis (Phase 2)
 * Deterministic analyst calculations over Phase 1 validated source evidence.
 * No market feeds, LCR/NSFR certification, credit facility drawdown or payment instructions.
 */
import {
  addDays, parseMinor, parseTable, safeAdd, type TreasuryReport,
  type TreasuryForecastFlow
} from "./engine";

export type LiquidityRiskStatus = "blocked" | "unassessed" | "breach" | "review_required" | "within_policy_assumptions";
export interface LiquidityPolicy {
  currency: string;
  minimumCashMinor: number;
  undrawnFacilityMinor: number;
  outflowStressPct: number;
  expectedInflowHaircutPct: number;
  evidence: string;
}
export interface LiquidityRiskWeek {
  currency: string;
  week: number;
  weekEnd: string;
  stressedOpeningMinor: number;
  stressedClosingMinor: number;
  baselineClosingMinor: number;
  downsideClosingMinor: number;
  bufferMinor: number;
  bufferGapMinor: number;
  facilityMinor: number;
  uncoveredGapMinor: number;
  sources: string[];
}
export interface LiquidityRiskIssue {
  code: string;
  severity: "blocking" | "warning" | "info";
  currency: string;
  week: number | null;
  description: string;
  evidence: string;
}
export interface LiquidityRiskResult {
  status: LiquidityRiskStatus;
  reportDate: string;
  sourceReportStatus: TreasuryReport["status"];
  policies: LiquidityPolicy[];
  weeks: LiquidityRiskWeek[];
  issues: LiquidityRiskIssue[];
  metrics: Array<{
    currency: string;
    assessed: boolean;
    startingCashMinor: number;
    minimumCashMinor: number | null;
    worstStressedCashMinor: number | null;
    maximumBufferGapMinor: number | null;
    firstBreachWeek: number | null;
    undrawnFacilityMinor: number | null;
  }>;
  methodology: string[];
}
function boundedPercent(raw: string, maximum: number, evidence: string): number {
  if (!/^\d+$/.test(raw)) throw new Error(evidence + ": percentages must be whole non-negative numbers.");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum)
    throw new Error(evidence + ": percentage outside permitted range (0–" + maximum + ").");
  return value;
}
function scaledCeil(amount: number, percent: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(percent) || percent < 0)
    throw new Error("Unsafe stress calculation inputs.");
  const result = (BigInt(amount) * BigInt(percent) + 99n) / 100n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Stress calculation exceeds safe monetary precision.");
  return Number(result);
}
function gapToBuffer(minimum: number, cash: number): number {
  return cash >= minimum ? 0 : safeAdd(minimum, -cash);
}
function reportIssue(code: string, severity: LiquidityRiskIssue["severity"], currency: string,
  week: number | null, description: string, evidence: string): LiquidityRiskIssue {
  return {code, severity, currency, week, description, evidence};
}
export function assessLiquidityRisk(report: TreasuryReport, policyCSV: string): LiquidityRiskResult {
  if (!report?.reportDate || !report.currencyPositions || !report.weeks || !report.forecastFlows)
    throw new Error("A completed Phase 1 treasury analysis with validated cash-flow evidence is required.");
  const rows = parseTable(policyCSV, "liquidity-policy.csv", [
    "currency", "minimum_cash", "undrawn_facility",
    "outflow_stress_pct", "expected_inflow_haircut_pct"
  ], true);
  const policies: LiquidityPolicy[] = [];
  const seen = new Set<string>();
  for (const {data, evidence} of rows) {
    const currency = data.currency.toUpperCase();
    if (!report.currencyPositions.some(p => p.currency === currency))
      throw new Error(evidence + ": policy currency is not in the source treasury report.");
    if (seen.has(currency)) throw new Error(evidence + ": duplicate policy currency " + currency + ".");
    seen.add(currency);
    const minimumCashMinor = parseMinor(data.minimum_cash, currency, evidence);
    const undrawnFacilityMinor = parseMinor(data.undrawn_facility, currency, evidence);
    if (minimumCashMinor < 0 || undrawnFacilityMinor < 0)
      throw new Error(evidence + ": minimum liquidity and undrawn facilities must be non-negative.");
    policies.push({
      currency, minimumCashMinor, undrawnFacilityMinor,
      outflowStressPct: boundedPercent(data.outflow_stress_pct, 300, evidence),
      expectedInflowHaircutPct: boundedPercent(data.expected_inflow_haircut_pct, 100, evidence),
      evidence
    });
  }
  const issues: LiquidityRiskIssue[] = [], weeks: LiquidityRiskWeek[] = [];
  const metrics: LiquidityRiskResult["metrics"] = [];
  const policyMap = new Map(policies.map(p => [p.currency, p]));
  const forecastMap = new Map<string, TreasuryForecastFlow[]>();
  for (const flow of report.forecastFlows) {
    if (!Number.isSafeInteger(flow.amountMinor)) throw new Error("Unsafe forecast amount in source report.");
    forecastMap.set(flow.currency, [...(forecastMap.get(flow.currency) ?? []), flow]);
  }
  for (const position of report.currencyPositions) {
    const policy = policyMap.get(position.currency);
    const flows = forecastMap.get(position.currency) ?? [];
    const baseWeeks = report.weeks.filter(w => w.currency === position.currency);
    if (!policy || !flows.length || baseWeeks.length !== 13) {
      issues.push(reportIssue(!policy ? "MISSING_APPROVED_POLICY" : "INCOMPLETE_FORECAST_EVIDENCE",
        "blocking", position.currency, null,
        !policy ? "No currency risk limits supplied; risk cannot be assessed." :
          "A complete 13-week evidenced forecast is unavailable for this currency.",
        !policy ? "liquidity-policy.csv" : "forecast.csv:" + position.currency));
      metrics.push({
        currency: position.currency, assessed: false, startingCashMinor: position.balanceMinor,
        minimumCashMinor: policy?.minimumCashMinor ?? null, worstStressedCashMinor: null,
        maximumBufferGapMinor: null, firstBreachWeek: null, undrawnFacilityMinor: policy?.undrawnFacilityMinor ?? null
      });
      continue;
    }
    if (position.balanceMinor < policy.minimumCashMinor)
      issues.push(reportIssue("CURRENT_BUFFER_BREACH", "warning", position.currency, 0,
        "Current cash position is below the treasury minimum cash buffer.", policy.evidence));
    let stressed = position.balanceMinor, worst = stressed, maximumGap = 0, firstBreach: number | null = null;
    for (let week = 1; week <= 13; week++) {
      const sourceWeek = baseWeeks.find(w => w.week === week);
      if (!sourceWeek) throw new Error("Forecast week " + week + " absent for " + position.currency + ".");
      const weekEnd = addDays(report.reportDate, week * 7);
      const previousEnd = addDays(report.reportDate, (week - 1) * 7);
      const due = flows.filter(x => x.date > previousEnd && x.date <= weekEnd);
      let movement = 0;
      for (const flow of due) {
        let stressedAmount = flow.amountMinor;
        if (flow.amountMinor < 0) {
          const extra = scaledCeil(-flow.amountMinor, policy.outflowStressPct);
          stressedAmount = safeAdd(stressedAmount, -extra);
        } else if (flow.amountMinor > 0 && flow.certainty === "expected") {
          const haircut = scaledCeil(flow.amountMinor, policy.expectedInflowHaircutPct);
          stressedAmount = safeAdd(stressedAmount, -haircut);
        }
        movement = safeAdd(movement, stressedAmount);
      }
      const stressedOpeningMinor = stressed;
      stressed = safeAdd(stressed, movement);
      worst = Math.min(worst, stressed);
      const gap = gapToBuffer(policy.minimumCashMinor, stressed);
      maximumGap = Math.max(maximumGap, gap);
      const uncoveredGap = Math.max(0, safeAdd(gap, -policy.undrawnFacilityMinor));
      weeks.push({
        currency: position.currency, week, weekEnd, stressedOpeningMinor,
        stressedClosingMinor: stressed, baselineClosingMinor: sourceWeek.closingBaseMinor,
        downsideClosingMinor: sourceWeek.closingDownsideMinor, bufferMinor: policy.minimumCashMinor,
        bufferGapMinor: gap, facilityMinor: policy.undrawnFacilityMinor,
        uncoveredGapMinor: uncoveredGap, sources: due.map(x => x.evidence)
      });
      if (gap > 0) {
        if (firstBreach === null) firstBreach = week;
        issues.push(reportIssue("STRESS_BUFFER_BREACH", "warning", position.currency, week,
          "Stressed closing cash is below the defined treasury liquidity floor.", policy.evidence + "; " + due.map(x=>x.evidence).join("; ")));
        if (uncoveredGap > 0)
          issues.push(reportIssue("UNFUNDED_STRESS_GAP", "warning", position.currency, week,
            "Shortfall is larger than the undrawn facility recorded in the policy. No facility has been assumed drawn.", policy.evidence));
      }
      if (stressed < 0)
        issues.push(reportIssue("STRESS_NEGATIVE_CASH", "warning", position.currency, week,
          "Stress scenario projects a negative cash balance.", policy.evidence));
    }
    metrics.push({
      currency: position.currency, assessed: true, startingCashMinor: position.balanceMinor,
      minimumCashMinor: policy.minimumCashMinor, worstStressedCashMinor: worst,
      maximumBufferGapMinor: maximumGap, firstBreachWeek: firstBreach,
      undrawnFacilityMinor: policy.undrawnFacilityMinor
    });
  }
  const status: LiquidityRiskStatus = report.status === "blocked" ? "blocked" :
    !metrics.some(x => x.assessed) ? "unassessed" :
    issues.some(x => x.code === "MISSING_APPROVED_POLICY" || x.code === "INCOMPLETE_FORECAST_EVIDENCE") ? "review_required" :
    issues.some(x => x.code === "STRESS_BUFFER_BREACH" || x.code === "CURRENT_BUFFER_BREACH") ? "breach" :
    report.status === "review_required" ? "review_required" : "within_policy_assumptions";
  return {
    status, reportDate: report.reportDate, sourceReportStatus: report.status,
    policies, weeks, issues, metrics,
    methodology: [
      "Currency-by-currency stress analysis. No cross-currency netting or derived FX rates.",
      "Extra stressed outflows apply as a percentage of every committed or expected negative cash flow.",
      "Only expected positive cash flows receive the policy-defined inflow haircut. Committed inflows remain unchanged.",
      "Fractional stress adjustments round conservatively up in ISO currency minor units, using integer arithmetic.",
      "Liquidity floors and undrawn facilities are external policy inputs, not assumed limits or cash already available.",
      "Available facilities are disclosed separately and are never added to cash or automatically drawn.",
      "Missing policies or forecast evidence are labelled unassessed; risk tolerances are not invented.",
      "Scenario outputs are decision-support estimates, not validated bank regulatory LCR/NSFR calculations.",
      "A blocked or unreconciled source report cannot gain a clean approval through stress testing."
    ]
  };
}
export function syntheticLiquidityPolicy(): string {
  return [
    "currency,minimum_cash,undrawn_facility,outflow_stress_pct,expected_inflow_haircut_pct",
    "GBP,75000.00,100000.00,40,60",
    "EUR,45000.00,40000.00,35,50",
    "USD,35000.00,25000.00,30,50"
  ].join("\n");
}
