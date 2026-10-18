import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function transpile(relative,deps={}){
  const content=await readFile(new URL("../../"+relative,import.meta.url),"utf8");
  const js=ts.transpileModule(content,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(js,{
    module:mod,exports:mod.exports,
    require(k){if(!(k in deps))throw Error("Unapproved dependency "+k);return deps[k];}
  });
  return mod.exports;
}
const engine=await transpile("src/modules/treasury/engine.ts");
const accuracy=await transpile("src/modules/treasury/forecast-accuracy.ts",{"./engine":engine});
const demo=()=>accuracy.syntheticForecastAccuracyInput();
const run=(input=demo())=>accuracy.analyseTreasuryForecastAccuracy(input);

test("Synthetic historical sample has two separately assessed currency results and only unverified provenance",()=>{
  const r=run();
  assert.equal(r.mode,"illustrative_synthetic");
  assert.equal(r.independentHistoricSnapshotVerified,false);
  assert.equal(r.evaluationDate,"2026-09-01");
  assert.equal(r.snapshotId,"pilot-snapshot-20260701");
  assert.equal(r.status,"within_operator_tolerance");
  assert.deepEqual(JSON.parse(JSON.stringify(r.currencies.map(c=>c.currency))),["EUR","GBP"]);
  assert.equal(r.observations.length,16);
  assert.ok(r.findings.some(x=>x.code==="UNVERIFIED_SNAPSHOT_PROVENANCE"));
});

test("GBP cash forecast error uses exact minor units, signed bias and independent WAPE basis points",()=>{
  const g=run().currencies.find(x=>x.currency==="GBP");
  assert.equal(g.forecastWeeks,8);
  assert.equal(g.matchedWeeks,8);
  assert.equal(g.meanAbsoluteErrorMinor,362500);
  assert.equal(g.signedMeanErrorMinor,237500);
  assert.equal(g.worstAbsoluteMissMinor,800000);
  assert.equal(g.weightedAbsolutePercentageErrorBasisPoints,279);
  assert.equal(g.coverageBasisPoints,10000);
  assert.equal(g.tolerancePassed,true);
  assert.equal(g.scenarioBandHits,6);
  assert.equal(g.scenarioBandEvaluated,8);
});

test("EUR is separately assessed, not converted to GBP or included in a combined KPI",()=>{
  const r=run();
  const e=r.currencies.find(x=>x.currency==="EUR");
  assert.equal(e.matchedWeeks,8);
  assert.equal(e.meanAbsoluteErrorMinor,150000);
  assert.equal(e.weightedAbsolutePercentageErrorBasisPoints,192);
  assert.ok(!Object.hasOwn(r,"consolidatedMaE"));
  assert.ok(r.observations.every(x=>x.currency==="GBP"||x.currency==="EUR"));
});

test("Operator threshold breaches require review instead of being described as accurate",()=>{
  const d=demo();
  d.maximumWapeBasisPoints=100;
  const r=run(d);
  assert.equal(r.status,"review_required");
  assert.ok(r.currencies.every(x=>x.tolerancePassed===false));
  assert.ok(r.findings.some(x=>x.code==="WAPE_ABOVE_TOLERANCE"));
});

test("Missing weekly actuals exclude error math and prevent a pass even with low WAPE",()=>{
  const d=demo();
  d.actualHistoryCsv=d.actualHistoryCsv.split("\n").filter(x=>!x.startsWith("actual-GBP-3,")).join("\n");
  const r=run(d),gbp=r.currencies.find(x=>x.currency==="GBP");
  assert.equal(gbp.matchedWeeks,7);
  assert.equal(gbp.forecastWeeks,8);
  assert.equal(gbp.missingActualWeeks,1);
  assert.equal(gbp.tolerancePassed,null);
  assert.equal(r.status,"insufficient_evidence");
  assert.ok(r.findings.some(x=>x.code==="MISSING_ACTUAL"&&x.currency==="GBP"));
});

test("Observed actuals without a matching frozen forecast do not alter error metrics",()=>{
  const d=demo();
  d.actualHistoryCsv+="\nactual-GBP-99,GBP,2026-09-01,100000.00,2026-09-01";
  const r=run(d),gbp=r.currencies.find(x=>x.currency==="GBP");
  assert.equal(gbp.matchedWeeks,8);
  assert.equal(gbp.meanAbsoluteErrorMinor,362500);
  assert.ok(r.findings.some(x=>x.code==="UNMATCHED_ACTUAL"));
});

test("Mixed historic snapshot IDs, duplicate week forecasts and duplicate actuals are refused",()=>{
  const d=demo();
  d.forecastHistoryCsv=d.forecastHistoryCsv.replace("pilot-snapshot-20260701,2026-07-01,GBP,2026-07-08","another-snapshot,2026-07-01,GBP,2026-07-08");
  assert.throws(()=>run(d),/mixed snapshot/);
  const dup=demo();dup.forecastHistoryCsv+="\n"+dup.forecastHistoryCsv.split("\n")[1];
  assert.throws(()=>run(dup),/duplicate historical forecast/);
  const actual=demo();actual.actualHistoryCsv+="\n"+actual.actualHistoryCsv.split("\n")[1];
  assert.throws(()=>run(actual),/duplicate actual cash evidence/);
});

test("Backdated actual sources, future actual evidence and impossible dates are rejected",()=>{
  const d=demo();
  d.actualHistoryCsv=d.actualHistoryCsv.replace("actual-GBP-1,GBP,2026-07-08,118000.00,2026-07-08","actual-GBP-1,GBP,2026-07-08,118000.00,2026-07-07");
  assert.throws(()=>run(d),/predates the week/);
  const future=demo();future.actualHistoryCsv=future.actualHistoryCsv.replace("actual-GBP-1,GBP,2026-07-08,118000.00,2026-07-08","actual-GBP-1,GBP,2026-07-08,118000.00,2026-10-01");
  assert.throws(()=>run(future),/future-dated/);
  const impossible=demo();impossible.forecastHistoryCsv=impossible.forecastHistoryCsv.replace("2026-07-08","2026-02-30");
  assert.throws(()=>run(impossible),/impossible calendar date/);
});

test("Forecasts observed after the purported forecast freeze or after evaluation cannot be backtested",()=>{
  const d=demo();
  d.forecastHistoryCsv=d.forecastHistoryCsv.replaceAll("2026-07-01","2026-08-30");
  assert.throws(()=>run(d),/outside the 13-week frozen horizon|freeze date/);
  const future=demo();future.forecastHistoryCsv=future.forecastHistoryCsv.replace("2026-07-08","2026-09-22");
  assert.throws(()=>run(future),/future forecast observation|outside the 13-week/);
});

test("Near-zero or zero actual balances do not generate fabricated percentage accuracy",()=>{
  const d={
    forecastHistoryCsv:[
      "snapshot_id,forecast_frozen_on,currency,week_end,baseline_closing,downside_closing",
      "test-snap-01,2026-07-01,GBP,2026-07-08,10.00,0.00",
      "test-snap-01,2026-07-01,GBP,2026-07-15,20.00,0.00"
    ].join("\n"),
    actualHistoryCsv:[
      "actual_id,currency,week_end,closing_balance,evidence_as_of",
      "bank-actual-01,GBP,2026-07-08,0.00,2026-07-08",
      "bank-actual-02,GBP,2026-07-15,0.00,2026-07-15"
    ].join("\n"),
    evaluationDate:"2026-07-20",maximumWapeBasisPoints:2000,minimumComparableWeeks:2
  };
  const r=run(d),gbp=r.currencies[0];
  assert.equal(gbp.weightedAbsolutePercentageErrorBasisPoints,null);
  assert.equal(gbp.tolerancePassed,null);
  assert.equal(r.status,"insufficient_evidence");
  assert.ok(r.findings.some(x=>x.code==="ZERO_ACTUAL_DENOMINATOR"));
});

test("Money input precision and operator thresholds must be safe and explicit",()=>{
  const d=demo();d.maximumWapeBasisPoints=-1;
  assert.throws(()=>run(d),/explicit WAPE tolerance/);
  const e=demo();e.minimumComparableWeeks=1;
  assert.throws(()=>run(e),/Minimum comparable weeks/);
  const f=demo();f.actualHistoryCsv=f.actualHistoryCsv.replace("118000.00","118000.001");
  assert.throws(()=>run(f),/invalid GBP amount/);
  const huge=demo();huge.actualHistoryCsv=huge.actualHistoryCsv.replace("118000.00","90071992547409.92");
  assert.throws(()=>run(huge),/safe numeric range/);
});

test("Skipped historic forecast weeks block tolerance assessment instead of overstating coverage",()=>{
  const d=demo();
  d.forecastHistoryCsv=d.forecastHistoryCsv.split("\n")
    .filter(x=>!x.includes(",GBP,2026-07-22,")).join("\n");
  const report=run(d),gbp=report.currencies.find(x=>x.currency==="GBP");
  assert.equal(gbp.forecastWeeks,7);
  assert.equal(gbp.matchedWeeks,7);
  assert.equal(gbp.tolerancePassed,null);
  assert.equal(report.status,"insufficient_evidence");
  assert.ok(report.findings.some(f=>f.code==="IRREGULAR_FORECAST_WEEK_INTERVAL"));
});

test("Explicit tolerance breach outranks other currencies with missing evidence",()=>{
  const d=demo();
  d.maximumWapeBasisPoints=100;
  d.actualHistoryCsv=d.actualHistoryCsv.split("\n")
    .filter(x=>!x.startsWith("actual-EUR-3,")).join("\n");
  const r=run(d);
  assert.equal(r.currencies.find(x=>x.currency==="GBP").tolerancePassed,false);
  assert.equal(r.currencies.find(x=>x.currency==="EUR").tolerancePassed,null);
  assert.equal(r.status,"review_required");
});

test("An evaluation date later than today can never be called an historical backtest",()=>{
  const d=demo();
  d.evaluationDate="2040-01-01";
  assert.throws(()=>run(d),/Future evaluation dates/);
});

test("Source row evidence and limitations appear in human-readable working paper",()=>{
  const report=run();
  const md=accuracy.forecastAccuracyMarkdown(report);
  assert.match(md,/Forecast Accuracy Working Paper/);
  assert.match(md,/GBP 3,625.00/);
  assert.match(md,/2.79%/);
  assert.match(md,/independently verified/i);
  assert.match(md,/historical-forecast.csv:row:/);
  assert.match(md,/actual-cash.csv:row:/);
  assert.match(md,/NOT a statistical confidence interval/);
});

test("No financial source uploaded, external network or money movement from accuracy engine",async()=>{
  const src=await readFile(new URL("../../src/modules/treasury/forecast-accuracy.ts",import.meta.url),"utf8");
  assert.doesNotMatch(src,/\bfetch\s*\(|service_role|\.rpc\s*\(|writeTransfer|createTrade|sendPayment/);
  assert.match(src,/independentHistoricSnapshotVerified:false/);
  const panel=await readFile(new URL("../../src/modules/treasury/TreasuryAccuracyPanel.tsx",import.meta.url),"utf8");
  assert.match(panel,/Treasury Analyst Accuracy & Forecast Backtesting/);
  assert.match(panel,/Active Finvessa entitlement required/);
  assert.doesNotMatch(panel,/\bfetch\s*\(|localStorage\.setItem|sessionStorage\.setItem/);
});
