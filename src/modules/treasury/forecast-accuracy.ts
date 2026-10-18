/**
 * Finvessa TreasuryOS Phase 8 — historical forecast accuracy and quality.
 *
 * Operator-supplied, unverified historical snapshots and actual cash values.
 * All money and error aggregations use integer minor units / bigint.
 * No synthetic backdated record can establish genuine ex-ante performance.
 * The output NEVER approves trades, bank reports, or financial statements.
 */
import {formatMinor,isoDate,parseMinor,parseTable,safeAdd,addDays} from "./engine";

export interface TreasuryForecastAccuracyInputs {
  forecastHistoryCsv:string;
  actualHistoryCsv:string;
  evaluationDate:string;
  maximumWapeBasisPoints:number;
  minimumComparableWeeks:number;
  synthetic?:boolean;
}
export interface TreasuryForecastAccuracyFinding {
  code:
    "UNVERIFIED_SNAPSHOT_PROVENANCE"|"MISSING_ACTUAL"|"UNMATCHED_ACTUAL"|
    "UNASSESSED_CURRENCY"|"ZERO_ACTUAL_DENOMINATOR"|"WAPE_ABOVE_TOLERANCE"|
    "FORECAST_CASH_OVERESTIMATED"|"FORECAST_CASH_UNDERESTIMATED";
  severity:"warning"|"info";
  currency:string;
  evidence:string;
  explanation:string;
}
export interface TreasuryBacktestObservation {
  currency:string;
  weekEnd:string;
  baselineMinor:number;
  downsideMinor:number;
  actualMinor:number;
  absoluteErrorMinor:number;
  signedErrorMinor:number;
  withinScenarioRange:boolean;
  forecastEvidence:string;
  actualEvidence:string;
}
export interface TreasuryCurrencyAccuracy {
  currency:string;
  forecastWeeks:number;
  matchedWeeks:number;
  missingActualWeeks:number;
  coverageBasisPoints:number;
  meanAbsoluteErrorMinor:number|null;
  signedMeanErrorMinor:number|null;
  worstAbsoluteMissMinor:number|null;
  weightedAbsolutePercentageErrorBasisPoints:number|null;
  scenarioBandHits:number;
  scenarioBandEvaluated:number;
  tolerancePassed:boolean|null;
}
export interface TreasuryForecastAccuracyReport {
  mode:"illustrative_synthetic"|"operator_asserted_unverified";
  status:"insufficient_evidence"|"review_required"|"within_operator_tolerance";
  independentHistoricSnapshotVerified:false;
  evaluationDate:string;
  snapshotId:string;
  freezeDate:string;
  tolerances:{maximumWapeBasisPoints:number;minimumComparableWeeks:number};
  currencies:TreasuryCurrencyAccuracy[];
  observations:TreasuryBacktestObservation[];
  findings:TreasuryForecastAccuracyFinding[];
  methodology:string[];
}
const MAX_SAFE=BigInt(Number.MAX_SAFE_INTEGER);
function safeNum(n:bigint,label:string):number{
  if(n>MAX_SAFE||n< -MAX_SAFE)throw new Error(label+" exceeds safe integer money precision.");
  return Number(n);
}
function unsignedAmount(a:number):bigint{
  const b=BigInt(a);return b<0n?-b:b;
}
function integerPercent(n:bigint,denom:bigint,basis:bigint):number|null{
  if(denom===0n)return null;
  return safeNum((n*basis+denom-1n)/denom,"Ratio");
}
function amountDifference(a:number,b:number):number{
  return safeNum(BigInt(a)-BigInt(b),"Currency forecast deviation");
}
function evidenceIssue(code:TreasuryForecastAccuracyFinding["code"],
  severity:TreasuryForecastAccuracyFinding["severity"],currency:string,
  evidence:string,explanation:string):TreasuryForecastAccuracyFinding{
  return {code,severity,currency,evidence,explanation};
}
function id(v:string,evidence:string,label:string):string{
  const value=v.trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{4,119}$/.test(value))
    throw new Error(evidence+": invalid "+label+" reference.");
  return value;
}
export function analyseTreasuryForecastAccuracy(input:TreasuryForecastAccuracyInputs):TreasuryForecastAccuracyReport{
  const evaluationDate=isoDate(input.evaluationDate,"Backtest evaluation date");
  if(!Number.isInteger(input.maximumWapeBasisPoints)||
     input.maximumWapeBasisPoints<0||input.maximumWapeBasisPoints>10000)
    throw new Error("Choose an explicit WAPE tolerance of 0–10000 basis points.");
  if(!Number.isInteger(input.minimumComparableWeeks)||
     input.minimumComparableWeeks<2||input.minimumComparableWeeks>13)
    throw new Error("Minimum comparable weeks must be between 2 and 13.");
  const forecasts=parseTable(input.forecastHistoryCsv,"historical-forecast.csv",[
    "snapshot_id","forecast_frozen_on","currency","week_end",
    "baseline_closing","downside_closing"
  ]);
  const actuals=parseTable(input.actualHistoryCsv,"actual-cash.csv",[
    "actual_id","currency","week_end","closing_balance","evidence_as_of"
  ]);
  if(!forecasts.length||!actuals.length)
    throw new Error("Provide historical forecast and actual cash evidence; no missing inputs are invented.");
  const first=forecasts[0];
  const snapshotId=id(first.data.snapshot_id,first.evidence,"snapshot");
  const freezeDate=isoDate(first.data.forecast_frozen_on,first.evidence);
  if(freezeDate>=evaluationDate)
    throw new Error("Forecast freeze date must precede the evaluation date.");
  const forecastsByKey=new Map<string,{
    currency:string;weekEnd:string;baselineMinor:number;downsideMinor:number;evidence:string
  }>();
  const weekCounts=new Map<string,number>();
  const currencies=new Set<string>();
  for(const row of forecasts){
    const {data,evidence}=row;
    if(id(data.snapshot_id,evidence,"snapshot")!==snapshotId ||
       isoDate(data.forecast_frozen_on,evidence)!==freezeDate)
      throw new Error(evidence+": mixed snapshot identity or freeze dates cannot be backtested.");
    const currency=data.currency.toUpperCase();
    const weekEnd=isoDate(data.week_end,evidence);
    if(weekEnd<=freezeDate||weekEnd>addDays(freezeDate,91))
      throw new Error(evidence+": forecast is outside the 13-week frozen horizon.");
    if(weekEnd>evaluationDate)
      throw new Error(evidence+": future forecast observation is not yet eligible for backtesting.");
    const base=parseMinor(data.baseline_closing,currency,evidence);
    const downside=parseMinor(data.downside_closing,currency,evidence);
    const key=currency+"\u0000"+weekEnd;
    if(forecastsByKey.has(key))
      throw new Error(evidence+": duplicate historical forecast for currency and week.");
    forecastsByKey.set(key,{currency,weekEnd,baselineMinor:base,downsideMinor:downside,evidence});
    const count=(weekCounts.get(currency)??0)+1;
    if(count>13)throw new Error(evidence+": no more than 13 forecast weeks per currency.");
    weekCounts.set(currency,count);currencies.add(currency);
  }
  const actualByKey=new Map<string,{currency:string;weekEnd:string;actualMinor:number;evidence:string}>();
  const ids=new Set<string>();
  for(const row of actuals){
    const {data,evidence}=row;
    const actualId=id(data.actual_id,evidence,"actual evidence");
    if(ids.has(actualId))throw new Error(evidence+": duplicate actual cash evidence identifier.");
    ids.add(actualId);
    const currency=data.currency.toUpperCase();
    const weekEnd=isoDate(data.week_end,evidence);
    const evidenceDate=isoDate(data.evidence_as_of,evidence);
    if(weekEnd>evaluationDate||evidenceDate>evaluationDate||evidenceDate<weekEnd)
      throw new Error(evidence+": actual cash evidence predates the week or is future-dated.");
    const actualMinor=parseMinor(data.closing_balance,currency,evidence);
    const key=currency+"\u0000"+weekEnd;
    if(actualByKey.has(key))
      throw new Error(evidence+": ambiguous actual cash balances for the same currency/week.");
    actualByKey.set(key,{currency,weekEnd,actualMinor,evidence});
  }
  const findings:TreasuryForecastAccuracyFinding[]=[];
  findings.push(evidenceIssue("UNVERIFIED_SNAPSHOT_PROVENANCE","warning","ALL",
    "historical-forecast.csv","User-provided freeze dates, historic forecast files and bank actuals are not independently notarised or verified. These figures cannot establish ex-ante performance."));
  const observations:TreasuryBacktestObservation[]=[];
  const results:TreasuryCurrencyAccuracy[]=[];
  for(const currency of [...currencies].sort()){
    const group=[...forecastsByKey.values()].filter(x=>x.currency===currency).sort((a,b)=>a.weekEnd.localeCompare(b.weekEnd));
    const compared:TreasuryBacktestObservation[]=[];
    let missing=0;
    for(const projected of group){
      const actual=actualByKey.get(currency+"\u0000"+projected.weekEnd);
      if(!actual){
        missing++;
        findings.push(evidenceIssue("MISSING_ACTUAL","warning",currency,projected.evidence,
          "Independent end-of-week actual cash position was not supplied; this week is excluded from error metrics."));
        continue;
      }
      const signedError=amountDifference(projected.baselineMinor,actual.actualMinor);
      const absoluteError=safeNum(unsignedAmount(signedError),"Absolute cash forecast error");
      compared.push({
        currency,weekEnd:projected.weekEnd,baselineMinor:projected.baselineMinor,
        downsideMinor:projected.downsideMinor,actualMinor:actual.actualMinor,
        signedErrorMinor:signedError,absoluteErrorMinor:absoluteError,
        withinScenarioRange:actual.actualMinor>=Math.min(projected.baselineMinor,projected.downsideMinor)&&
          actual.actualMinor<=Math.max(projected.baselineMinor,projected.downsideMinor),
        forecastEvidence:projected.evidence,actualEvidence:actual.evidence
      });
    }
    observations.push(...compared);
    const n=BigInt(compared.length);
    let sumAbs=0n,sumActualAbs=0n,sumSigned=0n,maxAbs=0n,scenarioBandHits=0;
    for(const row of compared){
      const err=unsignedAmount(row.signedErrorMinor);
      sumAbs+=err;sumSigned+=BigInt(row.signedErrorMinor);
      sumActualAbs+=unsignedAmount(row.actualMinor);
      if(err>maxAbs)maxAbs=err;
      if(row.withinScenarioRange)scenarioBandHits++;
    }
    const mae=n? safeNum((sumAbs+n-1n)/n,"MAE"):null;
    const bias=n?safeNum(sumSigned/n,"Signed mean error"):null;
    const wape=integerPercent(sumAbs,sumActualAbs,10000n);
    const enough=compared.length>=input.minimumComparableWeeks && missing===0;
    const passed=enough && wape!==null ? wape<=input.maximumWapeBasisPoints:null;
    if(!n||!enough){
      findings.push(evidenceIssue("UNASSESSED_CURRENCY","warning",currency,
        "historical-forecast.csv:"+currency,"Missing actuals or insufficient comparable weeks prevent a reliable threshold assessment."));
    }
    if(n && wape===null){
      findings.push(evidenceIssue("ZERO_ACTUAL_DENOMINATOR","warning",currency,
        "actual-cash.csv:"+currency,"Actual balances have no non-zero absolute denominator; WAPE cannot be calculated."));
    }
    if(passed===false){
      findings.push(evidenceIssue("WAPE_ABOVE_TOLERANCE","warning",currency,
        "historical-forecast.csv:"+currency,"Observed weighted absolute percentage error exceeds the operator's chosen tolerance."));
    }
    if(bias!==null && bias!==0 && n>=BigInt(input.minimumComparableWeeks)){
      findings.push(evidenceIssue(bias>0?"FORECAST_CASH_OVERESTIMATED":"FORECAST_CASH_UNDERESTIMATED","info",
        currency,"historical-forecast.csv:"+currency,
        "Directional signed mean error is descriptive only; it does not establish statistical bias from a small sample."));
    }
    results.push({
      currency,forecastWeeks:group.length,matchedWeeks:compared.length,
      missingActualWeeks:missing,
      coverageBasisPoints:safeNum(BigInt(compared.length)*10000n/BigInt(group.length),"Coverage"),
      meanAbsoluteErrorMinor:mae,signedMeanErrorMinor:bias,
      worstAbsoluteMissMinor:n?safeNum(maxAbs,"Worst cash miss"):null,
      weightedAbsolutePercentageErrorBasisPoints:wape,
      scenarioBandHits,scenarioBandEvaluated:compared.length,tolerancePassed:passed
    });
  }
  for(const [key,actual] of actualByKey){
    if(!forecastsByKey.has(key))
      findings.push(evidenceIssue("UNMATCHED_ACTUAL","info",actual.currency,
        actual.evidence,"An actual bank cash record has no frozen forecast comparison and is excluded."));
  }
  const status:TreasuryForecastAccuracyReport["status"]=
    results.some(x=>x.tolerancePassed===null)?"insufficient_evidence":
    results.some(x=>x.tolerancePassed===false)?"review_required":"within_operator_tolerance";
  return{
    mode:input.synthetic?"illustrative_synthetic":"operator_asserted_unverified",
    status,independentHistoricSnapshotVerified:false,evaluationDate,
    snapshotId,freezeDate,
    tolerances:{maximumWapeBasisPoints:input.maximumWapeBasisPoints,
      minimumComparableWeeks:input.minimumComparableWeeks},
    currencies:results,observations,findings,
    methodology:[
      "Original historical forecast snapshot date and actual evidence dates are operator-asserted, not independently verified or cryptographically notarised.",
      "All cash positions and absolute errors use ISO currency minor units and bigint-safe aggregation; GBP, EUR and other currencies never mix.",
      "Forecast signed error = projected baseline closing cash minus actual closing cash. Positive error means cash was overestimated.",
      "MAE is mean absolute cash error, rounded conservatively up by one minor unit where necessary.",
      "WAPE basis points = ceil(sum absolute forecast errors / sum absolute actual closing cash × 10000); null when denominator is zero.",
      "Scenario-band coverage is the share of actual cash values falling between baseline and downside scenarios; it is NOT a statistical confidence interval.",
      "Missing weeks are excluded from numerical error metrics but prevent passing any quality threshold; unmatched actuals are reported separately.",
      "Operator tolerance and minimum-week threshold are not regulatory limits or proof of superior performance.",
      "This is an analyst review working paper, not a certified quantitative model, bank balance confirmation, payment, trade or regulatory report."
    ]
  };
}
export function syntheticForecastAccuracyInput():TreasuryForecastAccuracyInputs{
  const weeks=["2026-07-08","2026-07-15","2026-07-22","2026-07-29",
    "2026-08-05","2026-08-12","2026-08-19","2026-08-26"];
  const gbpForecast=[120000,124000,121000,138000,141000,149000,132000,136000];
  const gbpActual=[118000,127000,119000,130000,140000,144000,134000,130000];
  const eurForecast=[78000,80000,81000,75000,72000,76000,80000,83000];
  const eurActual=[78000,81500,79000,77000,73000,75000,82500,81000];
  const currencyEntries=[["GBP",gbpForecast,gbpActual],["EUR",eurForecast,eurActual]] as const;
  const history=["snapshot_id,forecast_frozen_on,currency,week_end,baseline_closing,downside_closing"];
  const actual=["actual_id,currency,week_end,closing_balance,evidence_as_of"];
  const asDecimal=(n:number)=>n.toFixed(2);
  currencyEntries.forEach(([currency,forecast,actuals])=>weeks.forEach((date,i)=>{
    history.push(["pilot-snapshot-20260701","2026-07-01",currency,date,asDecimal(forecast[i]),asDecimal(forecast[i]-10000)].join(","));
    actual.push(["actual-"+currency+"-"+(i+1),currency,date,asDecimal(actuals[i]),date].join(","));
  }));
  return {forecastHistoryCsv:history.join("\n"),actualHistoryCsv:actual.join("\n"),
    evaluationDate:"2026-09-01",maximumWapeBasisPoints:500,minimumComparableWeeks:6,synthetic:true};
}
export function forecastAccuracyMarkdown(report:TreasuryForecastAccuracyReport):string{
  const s=[
    "# Finvessa TreasuryOS — Forecast Accuracy Working Paper",
    "",
    "Evidence mode: "+report.mode,
    "Evaluation: "+report.evaluationDate,
    "Snapshot: "+report.snapshotId+" (operator-asserted freeze "+report.freezeDate+")",
    "Assessment: "+report.status,
    "",
    "> This is an operator-supplied historic comparison. The freeze-date and bank data authenticity are NOT independently verified.",
    "",
    "| Currency | Compared / forecast | MAE | WAPE | Signed mean error | Scenario band | Tolerance |",
    "|---|---:|---:|---:|---:|---:|---|"
  ];
  for(const x of report.currencies){
    const fmt=(v:number|null)=>v===null?"Not assessed":formatMinor(v,x.currency);
    s.push("| "+x.currency+" | "+x.matchedWeeks+"/"+x.forecastWeeks+
      " | "+fmt(x.meanAbsoluteErrorMinor)+
      " | "+(x.weightedAbsolutePercentageErrorBasisPoints===null?"Not assessed":
        (x.weightedAbsolutePercentageErrorBasisPoints/100).toFixed(2)+"%")+
      " | "+fmt(x.signedMeanErrorMinor)+
      " | "+x.scenarioBandHits+"/"+x.scenarioBandEvaluated+
      " | "+(x.tolerancePassed===null?"Unassessed":x.tolerancePassed?"Within operator threshold":"Review required")+" |");
  }
  s.push("","## Quality findings");
  for(const f of report.findings){
    // Only controlled generated codes and static explanatory strings are used.
    s.push("- "+f.currency+" "+f.code+": "+f.explanation+" ("+f.evidence+")");
  }
  s.push("","## Source-paired observations");
  s.push("| Currency | Week | Baseline | Actual | Signed error | Frozen forecast source | Actual cash source |");
  s.push("|---|---|---:|---:|---:|---|---|");
  for(const o of report.observations.slice(0,100)){
    s.push("| "+o.currency+" | "+o.weekEnd+
      " | "+formatMinor(o.baselineMinor,o.currency)+
      " | "+formatMinor(o.actualMinor,o.currency)+
      " | "+formatMinor(o.signedErrorMinor,o.currency)+
      " | "+o.forecastEvidence+" | "+o.actualEvidence+" |");
  }
  if(report.observations.length>100) s.push(
    "Additional source pairs omitted from this concise working paper: "+
      (report.observations.length-100)+". Consult the source-linked JSON report."
  );
  s.push("","## Methodology",...report.methodology.map(x=>"- "+x));
  return s.join("\n")+"\n";
}
