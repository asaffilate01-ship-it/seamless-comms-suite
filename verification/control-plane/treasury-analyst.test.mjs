import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../../src/modules/treasury/engine.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
});
const mod = {exports: {}};
vm.runInNewContext(compiled.outputText, {
  exports: mod.exports, module: mod
});
const engine = mod.exports;
const reportDate = "2026-10-17";
const demo = () => engine.treasuryDemoInput(reportDate);

test("demo analyses exact, reconciled cash per currency with 13 weekly projections", () => {
  const report = engine.analyseTreasury(demo());
  assert.equal(report.status, "checked");
  assert.equal(report.counts.accounts, 3);
  assert.equal(report.counts.transactions, 6);
  assert.equal(report.counts.ledgerMatched, 6);
  assert.equal(report.counts.forecasts, 6);
  assert.equal(report.counts.reconciled, 3);
  assert.equal(report.weeks.length, 39);
  assert.equal(report.currencyPositions.find(p => p.currency === "GBP").balanceMinor, 20_000_000);
  assert.equal(report.currencyPositions.find(p => p.currency === "EUR").balanceMinor, 15_800_000);
  assert.equal(report.currencyPositions.find(p => p.currency === "USD").balanceMinor, 13_000_000);
  assert.ok(!report.currencyPositions.some(p => p.currency === "TOTAL"));
});

test("committed outflows affect both scenarios, expected inflows only baseline", () => {
  const report = engine.analyseTreasury(demo());
  const gbWeek1 = report.weeks.find(x => x.currency === "GBP" && x.week === 1);
  const gbWeek2 = report.weeks.find(x => x.currency === "GBP" && x.week === 2);
  assert.equal(gbWeek1.closingBaseMinor, 13_500_000);
  assert.equal(gbWeek1.closingDownsideMinor, 13_500_000);
  assert.equal(gbWeek2.closingBaseMinor, 22_500_000);
  assert.equal(gbWeek2.closingDownsideMinor, 13_500_000);
  assert.ok(gbWeek2.sourceRows.includes("forecast.csv:row:3"));
});

test("every currency amount uses exact integer minor units, not floating arithmetic", () => {
  assert.equal(engine.parseMinor("0.01", "GBP", "test"), 1);
  assert.equal(engine.parseMinor("-12345.67", "GBP", "test"), -1_234_567);
  assert.equal(engine.parseMinor("123", "JPY", "test"), 123);
  assert.equal(engine.parseMinor("3.145", "KWD", "test"), 3145);
  assert.equal(engine.formatMinor(-1234567, "GBP"), "-GBP 12,345.67");
  assert.throws(() => engine.parseMinor("1.001", "GBP", "test"), /invalid GBP amount/);
  assert.throws(() => engine.parseMinor("123.2", "JPY", "test"), /invalid JPY amount/);
  assert.throws(() => engine.parseMinor("1e5", "GBP", "test"), /invalid GBP amount/);
  assert.throws(() => engine.parseMinor("90071992547409.92", "GBP", "test"), /safe numeric range/);
});

test("reported bank closing balance mismatches block a sign-off even if cash can be calculated", () => {
  const data = demo();
  data.transactionsCSV = data.transactionsCSV.replace("282000.00", "282000.01");
  const report = engine.analyseTreasury(data);
  assert.equal(report.status, "blocked");
  assert.ok(report.issues.some(i => i.code === "BALANCE_MISMATCH" && i.evidence === "transactions.csv:row:2"));
  assert.equal(report.positions.find(p => p.accountId === "UK-OPERATING").reconciled, false);
});

test("exact duplicate transaction IDs are excluded rather than double-counted", () => {
  const data = demo();
  data.transactionsCSV += "\n" + data.transactionsCSV.split("\n")[1];
  const report = engine.analyseTreasury(data);
  assert.equal(report.status, "review_required");
  assert.equal(report.counts.transactions, 6);
  assert.equal(report.currencyPositions.find(p => p.currency === "GBP").balanceMinor, 20_000_000);
  assert.ok(report.issues.some(i => i.code === "DUPLICATE_TRANSACTION"));
});

test("conflicting duplicate IDs cause blocking exception and excluded duplicate", () => {
  const data = demo();
  const altered = data.transactionsCSV.split("\n")[1].replace("32000.00", "32001.00");
  data.transactionsCSV += "\n" + altered;
  const report = engine.analyseTreasury(data);
  assert.equal(report.status, "blocked");
  assert.ok(report.issues.some(i => i.code === "CONFLICTING_TRANSACTION_ID"));
  assert.equal(report.counts.transactions, 6);
});

test("bank-to-book reconciliation requires a distinct ledger source", () => {
  const data = demo();
  data.ledgerCSV = "";
  const report = engine.analyseTreasury(data);
  assert.equal(report.counts.ledgerMatched, 0);
  assert.equal(report.counts.reconciled, 0);
  assert.equal(report.status, "review_required");
  assert.ok(report.issues.some(i => i.code === "LEDGER_NOT_PROVIDED"));
  assert.ok(report.issues.some(i => i.code === "UNMATCHED_BANK_TRANSACTION"));
});

test("general-ledger amount discrepancy is exposed as unmatched on both sources", () => {
  const data = demo();
  data.ledgerCSV = data.ledgerCSV.replace("GL-UK01,UK-OPERATING,GBP,2026-10-11,Customer receipt,32000.00",
    "GL-UK01,UK-OPERATING,GBP,2026-10-11,Customer receipt,32000.01");
  const report = engine.analyseTreasury(data);
  assert.equal(report.counts.ledgerMatched, 5);
  assert.equal(report.counts.reconciled, 2);
  assert.ok(report.issues.some(i => i.code === "UNMATCHED_BANK_TRANSACTION"));
  assert.ok(report.issues.some(i => i.code === "UNMATCHED_LEDGER_TRANSACTION"));
});

test("ambiguous ledger matches never choose a candidate automatically", () => {
  const data = demo();
  data.ledgerCSV += "\n" + data.ledgerCSV.split("\n")[1].replace("GL-UK01", "GL-UK99");
  const report = engine.analyseTreasury(data);
  assert.equal(report.status, "blocked");
  assert.equal(report.counts.ledgerMatched, 5);
  assert.ok(report.issues.some(i => i.code === "AMBIGUOUS_LEDGER_MATCH"));
});

test("duplicate general-ledger IDs trigger a blocking control exception", () => {
  const data = demo();
  data.ledgerCSV += "\n" + data.ledgerCSV.split("\n")[1];
  const report = engine.analyseTreasury(data);
  assert.equal(report.status, "blocked");
  assert.ok(report.issues.some(i => i.code === "DUPLICATE_LEDGER_ID"));
});

test("future-dated posted transaction cannot inflate an as-of cash balance", () => {
  const data = demo();
  data.transactionsCSV += "\nUK-FUT,UK-OPERATING,GBP,2026-10-18,Future payment,5000.00,205000.00";
  const report = engine.analyseTreasury(data);
  assert.equal(report.status, "blocked");
  assert.ok(report.issues.some(i => i.code === "FUTURE_POSTED_TRANSACTION"));
  assert.equal(report.currencyPositions.find(p => p.currency === "GBP").balanceMinor, 20_000_000);
});

test("missing forecast input is disclosed, not presented as a 13-week forecast", () => {
  const data = demo();
  data.forecastCSV = "";
  const report = engine.analyseTreasury(data);
  assert.equal(report.weeks.length, 0);
  assert.ok(report.issues.some(i => i.code === "NO_VERIFIED_FORECAST_INPUT"));
});

test("stale financial data is labelled and review is required", () => {
  const data = demo();
  data.reportDate = "2026-12-20";
  data.forecastCSV = "";
  const report = engine.analyseTreasury(data);
  assert.ok(report.issues.filter(i => i.code === "STALE_POSITION").length >= 3);
  assert.equal(report.status, "review_required");
});

test("missing or inconsistent account and currency information fails closed", () => {
  const data = demo();
  data.transactionsCSV = data.transactionsCSV.replace("UK-OPERATING,GBP", "UNKNOWN-ACCOUNT,GBP");
  assert.throws(() => engine.analyseTreasury(data), /unknown account/);
  const mismatch = demo();
  mismatch.transactionsCSV = mismatch.transactionsCSV.replace("UK-OPERATING,GBP", "UK-OPERATING,EUR");
  assert.throws(() => engine.analyseTreasury(mismatch), /does not match/);
});

test("malformed CSV, duplicate account IDs and invalid dates are rejected", () => {
  const invalid = demo();
  invalid.accountsCSV += "\nUK-OPERATING,GBP,2026-10-12,1.00";
  assert.throws(() => engine.analyseTreasury(invalid), /duplicate account ID/);
  const wrongDate = demo();
  wrongDate.accountsCSV = wrongDate.accountsCSV.replace("2026-10-10", "2026-02-30");
  assert.throws(() => engine.analyseTreasury(wrongDate), /impossible calendar date/);
  const badQuote = demo();
  badQuote.accountsCSV += "\n\"unclosed";
  assert.throws(() => engine.analyseTreasury(badQuote), /unclosed CSV quotation/);
});

test("unknown currencies are not silently converted or assigned false precision", () => {
  const data = demo();
  data.accountsCSV = data.accountsCSV.replace("UK-OPERATING,GBP", "UK-OPERATING,XYZ");
  assert.throws(() => engine.analyseTreasury(data), /unsupported currency/);
});

test("imported CSV references cannot produce spreadsheet formula injection in evidence export", () => {
  const r = engine.analyseTreasury(demo());
  r.issues.push({code: "TEST", severity: "warning", message: "=HYPERLINK(\"https://example.test\", \"click\")", evidence: "+SUM(1,1)"});
  const csv = engine.treasuryEvidenceCSV(r);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'+SUM(1,1)"));
  assert.ok(csv.includes("currency"));
});

test("all statements have source rows and zero access to a bank, AI provider or payment tool", () => {
  const report = engine.analyseTreasury(demo());
  assert.ok(report.sources.every(x => x.rows > 0));
  assert.ok(report.weeks.every(x => Array.isArray(x.sourceRows)));
  assert.match(report.methodology.join(" "), /no model, bank or payment service/);
  assert.doesNotMatch(source, /from\s+["']@\/modules\/integrations|fetch\s*\(|\.rpc\s*\(|service_role|createActionProposal/);
});
