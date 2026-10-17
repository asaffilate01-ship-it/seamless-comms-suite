import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(relative, dependencies = {}) {
  const source = await readFile(new URL("../../" + relative, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
  }).outputText;
  const mod = {exports: {}};
  vm.runInNewContext(js, {module: mod, exports: mod.exports,
    require: (path) => {
      if (!(path in dependencies)) throw new Error("Unexpected dependency " + path);
      return dependencies[path];
    }
  });
  return mod.exports;
}
const engine = await load("src/modules/treasury/engine.ts");
const risk = await load("src/modules/treasury/liquidity-risk.ts", {"./engine": engine});
const reportDate = "2026-10-17";
const demo = () => engine.analyseTreasury(engine.treasuryDemoInput(reportDate));
const policy = risk.syntheticLiquidityPolicy();

test("Treasury stress analysis consumes validated cash flows, not aggregate netflows", () => {
  const report = demo(), results = risk.assessLiquidityRisk(report, policy);
  assert.equal(results.weeks.length, 39);
  assert.equal(results.status, "breach");
  assert.equal(results.metrics.length, 3);
  const gb1 = results.weeks.find(x => x.currency === "GBP" && x.week === 1);
  assert.equal(gb1.stressedClosingMinor, 10_900_000);
  assert.equal(gb1.baselineClosingMinor, 13_500_000);
  assert.equal(gb1.downsideClosingMinor, 13_500_000);
  assert.deepEqual(JSON.parse(JSON.stringify(gb1.sources)), ["forecast.csv:row:2"]);
});

test("Expected inflows receive haircut but committed inflows do not", () => {
  const w2 = risk.assessLiquidityRisk(demo(), policy).weeks.find(x => x.currency === "GBP" && x.week === 2);
  assert.equal(w2.stressedClosingMinor, 14_500_000);
  assert.equal(w2.baselineClosingMinor, 22_500_000);
});

test("Policy buffers and financing gaps are checked without adding facilities to cash", () => {
  const result = risk.assessLiquidityRisk(demo(), policy);
  const gb5 = result.weeks.find(x => x.currency === "GBP" && x.week === 5);
  assert.equal(gb5.stressedClosingMinor, 7_220_000);
  assert.equal(gb5.bufferMinor, 7_500_000);
  assert.equal(gb5.bufferGapMinor, 280_000);
  assert.equal(gb5.facilityMinor, 10_000_000);
  assert.equal(gb5.uncoveredGapMinor, 0);
  assert.equal(result.metrics.find(x => x.currency === "GBP").firstBreachWeek, 5);
  assert.ok(result.issues.some(x => x.code === "STRESS_BUFFER_BREACH" && x.week === 5));
});

test("Unfunded gap is flagged distinctly from the liquidity buffer breach", () => {
  const strongerStress = policy.replace("GBP,75000.00,100000.00,40,60", "GBP,170000.00,5000.00,100,100");
  const r = risk.assessLiquidityRisk(demo(), strongerStress);
  assert.ok(r.issues.some(x => x.code === "UNFUNDED_STRESS_GAP"));
  assert.ok(r.weeks.some(x => x.currency === "GBP" && x.uncoveredGapMinor > 0));
});

test("Without a policy, a currency cannot be marked safe or assessed", () => {
  const partial = policy.split("\n").filter(line => !line.startsWith("GBP,")).join("\n");
  const r = risk.assessLiquidityRisk(demo(), partial);
  assert.equal(r.status, "review_required");
  assert.equal(r.metrics.find(x => x.currency === "GBP").assessed, false);
  assert.ok(r.issues.some(x => x.code === "MISSING_APPROVED_POLICY"));
  assert.ok(!r.weeks.some(x => x.currency === "GBP"));
});

test("Without any limits, the risk analysis is unassessed", () => {
  const r = risk.assessLiquidityRisk(demo(), "");
  assert.equal(r.status, "unassessed");
  assert.equal(r.weeks.length, 0);
});

test("Missing forecast data or suspicious source report cannot result in a clean risk conclusion", () => {
  const unverified = demo();
  unverified.weeks = [];
  const missing = risk.assessLiquidityRisk(unverified, policy);
  assert.equal(missing.status, "unassessed");
  assert.ok(missing.issues.some(x => x.code === "INCOMPLETE_FORECAST_EVIDENCE"));
  const bad = demo();
  bad.status = "blocked";
  assert.equal(risk.assessLiquidityRisk(bad, policy).status, "blocked");
});

test("Invalid percentages, negative liquidity floors and unsupported policy currencies fail closed", () => {
  const pct = policy.replace("GBP,75000.00,100000.00,40,60", "GBP,75000.00,100000.00,350,60");
  assert.throws(() => risk.assessLiquidityRisk(demo(), pct), /percentage outside permitted range/);
  const haircut = policy.replace("GBP,75000.00,100000.00,40,60", "GBP,75000.00,100000.00,40,101");
  assert.throws(() => risk.assessLiquidityRisk(demo(), haircut), /percentage outside permitted range/);
  const floor = policy.replace("GBP,75000.00,100000.00,40,60", "GBP,-1.00,100000.00,40,60");
  assert.throws(() => risk.assessLiquidityRisk(demo(), floor), /must be non-negative/);
  assert.throws(() => risk.assessLiquidityRisk(demo(), policy + "\nJPY,2,0,1,1"), /not in the source treasury report/);
});

test("Duplicate policies do not resolve arbitrarily", () => {
  const r = policy.split("\n");
  assert.throws(() => risk.assessLiquidityRisk(demo(), policy + "\n" + r[1]), /duplicate policy currency/);
});

test("Tiny stress amounts conservatively round UP in JPY and never become fractional", () => {
  const input = engine.treasuryDemoInput(reportDate);
  input.accountsCSV += "\nJP-OPS,JPY,2026-10-10,100";
  input.transactionsCSV += "\nJP-1,JP-OPS,JPY,2026-10-11,Clearing,0,100";
  input.ledgerCSV += "\nGL-JP-1,JP-OPS,JPY,2026-10-11,Clearing,0";
  input.forecastCSV += "\nJP-OPS,2026-10-21,Tiny outflow,-1,committed";
  const report = engine.analyseTreasury(input);
  const augmented = policy + "\nJPY,0,0,1,0";
  const result = risk.assessLiquidityRisk(report, augmented);
  const jp = result.weeks.find(x => x.currency === "JPY" && x.week === 1);
  assert.equal(jp.baselineClosingMinor, 99);
  assert.equal(jp.stressedClosingMinor, 98);
  assert.equal(jp.stressedClosingMinor % 1, 0);
});

test("The result clearly states monetary and regulatory limitations", () => {
  const r = risk.assessLiquidityRisk(demo(), policy);
  assert.match(r.methodology.join(" "), /No cross-currency netting/);
  assert.match(r.methodology.join(" "), /not validated bank regulatory LCR\/NSFR/);
  assert.match(r.methodology.join(" "), /never added to cash/);
});
