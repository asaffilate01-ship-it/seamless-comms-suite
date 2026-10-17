import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const sourceFile=async path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
async function moduleFrom(path,dependencies={}){
  const code=await sourceFile(path);
  const compiled=ts.transpileModule(code,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const mod={exports:{}};
  vm.runInNewContext(compiled,{
    exports:mod.exports,module:mod,
    require(id){if(!(id in dependencies))throw new Error("Unapproved dependency: "+id);return dependencies[id];}
  });
  return mod.exports;
}
const engine=await moduleFrom("src/modules/treasury/engine.ts");
const adapters=await moduleFrom("src/modules/treasury/source-adapters.ts",{"./engine":engine});
const risk=await moduleFrom("src/modules/treasury/liquidity-risk.ts",{"./engine":engine});
const pack=await moduleFrom("src/modules/treasury/analyst-pack.ts",{"./engine":engine});
const TODAY="2026-10-17";
const getDemo=()=>engine.treasuryDemoInput(TODAY);

test("All four read-only adapter profiles are marked file-only and do not grant banking APIs",()=>{
  assert.equal(adapters.treasurySourceProfiles.length,4);
  const keys=adapters.treasurySourceProfiles.map(x=>x.key);
  assert.equal(keys.length,new Set(keys).size);
  assert.ok(adapters.treasurySourceProfiles.every(x=>x.connectionStatus==="file_import_only"));
  assert.ok(adapters.treasurySourceProfiles.every(x=>x.canonicalColumns.length>=6));
  assert.match(adapters.treasurySourceProfiles.find(x=>x.key==="ledger-cash-debit-credit-v1").explanation,/cash.*asset/i);
});

test("Synthetic bank debit/credit and cash GL split exports preserve the exact reconciled cash position",()=>{
  const demo=getDemo();
  const bank=adapters.normalizeTreasuryExport({
    profileKey:"bank-debit-credit-v1",
    csv:adapters.syntheticTreasuryExport("bank-debit-credit-v1",TODAY)
  });
  const gl=adapters.normalizeTreasuryExport({
    profileKey:"ledger-cash-debit-credit-v1",
    csv:adapters.syntheticTreasuryExport("ledger-cash-debit-credit-v1",TODAY)
  });
  assert.equal(bank.sourceRows,6);
  assert.equal(gl.sourceRows,6);
  assert.equal(bank.normalizedRows,6);
  assert.equal(bank.rows[0].sourceRow,"bank-debit-credit-v1.csv:row:2");
  assert.equal(bank.rows[0].outputRow,"transactions.csv:row:2");
  const original=engine.analyseTreasury(demo);
  const revised=engine.analyseTreasury({...demo,transactionsCSV:bank.canonicalCSV,ledgerCSV:gl.canonicalCSV});
  assert.equal(revised.status,"checked");
  assert.equal(revised.counts.reconciled,3);
  assert.equal(revised.counts.ledgerMatched,6);
  assert.deepEqual(JSON.parse(JSON.stringify(revised.currencyPositions)),JSON.parse(JSON.stringify(original.currencyPositions)));
});

test("Signed bank/ERP cash journal adapters yield independently matched entries",()=>{
  const demo=getDemo();
  const bank=adapters.normalizeTreasuryExport({
    profileKey:"bank-signed-v1",csv:adapters.syntheticTreasuryExport("bank-signed-v1",TODAY)
  });
  const gl=adapters.normalizeTreasuryExport({
    profileKey:"ledger-signed-v1",csv:adapters.syntheticTreasuryExport("ledger-signed-v1",TODAY)
  });
  const results=engine.analyseTreasury({...demo,transactionsCSV:bank.canonicalCSV,ledgerCSV:gl.canonicalCSV});
  assert.equal(results.status,"checked");
  assert.equal(results.counts.transactions,6);
  assert.equal(results.counts.reconciled,3);
  assert.equal(results.currencyPositions.find(x=>x.currency==="GBP").balanceMinor,20_000_000);
});

test("Debits/credits cannot be simultaneously populated or both missing",()=>{
  const csv=adapters.syntheticTreasuryExport("bank-debit-credit-v1",TODAY);
  assert.throws(()=>adapters.normalizeTreasuryExport({
    profileKey:"bank-debit-credit-v1",csv:csv.replace('"32000.00","","282000.00"','"32000.00","1.00","282000.00"')
  }),/exactly one/);
  assert.throws(()=>adapters.normalizeTreasuryExport({
    profileKey:"bank-debit-credit-v1",csv:csv.replace('"32000.00","","282000.00"','"","","282000.00"')
  }),/exactly one/);
});

test("Cash GL debits increase cash, credits decrease cash; negative split-side inputs are denied",()=>{
  const normalized=adapters.normalizeTreasuryExport({
    profileKey:"ledger-cash-debit-credit-v1",
    csv:adapters.syntheticTreasuryExport("ledger-cash-debit-credit-v1",TODAY)
  });
  assert.equal(normalized.rows[0].amount,"32000.00");
  assert.equal(normalized.rows[1].amount,"-58000.00");
  const bad=adapters.syntheticTreasuryExport("ledger-cash-debit-credit-v1",TODAY)
    .replace('"58000.00"','"-58000.00"');
  assert.throws(()=>adapters.normalizeTreasuryExport({
    profileKey:"ledger-cash-debit-credit-v1",csv:bad
  }),/strictly positive unsigned/);
});

test("Bank adapter requires a closing balance on every posted movement",()=>{
  const csv=adapters.syntheticTreasuryExport("bank-debit-credit-v1",TODAY)
    .replace('"282000.00"','""');
  assert.throws(()=>adapters.normalizeTreasuryExport({
    profileKey:"bank-debit-credit-v1",csv
  }),/closing balance is required/);
});

test("Duplicate account-scoped bank source transaction IDs fail, never silently double count",()=>{
  const csv=adapters.syntheticTreasuryExport("bank-signed-v1",TODAY);
  const repeated=csv+"\r\n"+csv.trim().split(/\r?\n/)[1];
  assert.throws(()=>adapters.normalizeTreasuryExport({profileKey:"bank-signed-v1",csv:repeated}),
    /duplicate source record ID/);
});

test("Unexpected and duplicate CSV columns and invalid dates fail closed",()=>{
  const csv=adapters.syntheticTreasuryExport("ledger-signed-v1",TODAY);
  assert.throws(()=>adapters.normalizeTreasuryExport({
    profileKey:"ledger-signed-v1",csv:csv.replace('"entry_ref"','"unknown_field"')
  }),/missing column/);
  assert.throws(()=>adapters.normalizeTreasuryExport({
    profileKey:"ledger-signed-v1",csv:csv.replace("2026-10-11","2026-02-30")
  }),/impossible calendar date/);
});

test("Bank/ledger sources do not silently convert unsupported currencies or lose small amounts",()=>{
  const csv=adapters.syntheticTreasuryExport("bank-signed-v1",TODAY);
  assert.throws(()=>adapters.normalizeTreasuryExport({profileKey:"bank-signed-v1",
    csv:csv.replace('"GBP"','"XYZ"')}),/unsupported currency/);
  const tiny=csv.replace('"32000.00"','"0.01"');
  const n=adapters.normalizeTreasuryExport({profileKey:"bank-signed-v1",csv:tiny});
  assert.equal(n.rows[0].amount,"0.01");
});

test("Formula-like descriptions/IDs cannot pass into user-facing spreadsheet exports",()=>{
  const csv=adapters.syntheticTreasuryExport("bank-signed-v1",TODAY);
  assert.throws(()=>adapters.normalizeTreasuryExport({profileKey:"bank-signed-v1",
    csv:csv.replace('"Customer receipt"','"=HYPERLINK(1)"')}),/formula trigger/);
  assert.throws(()=>adapters.normalizeTreasuryExport({profileKey:"bank-signed-v1",
    csv:csv.replace('"UK-01"','"+SUM(1,1)"')}),/formula trigger/);
});

test("No provider/network access is implied by source adapters or analyst pack",async()=>{
  const src=await sourceFile("src/modules/treasury/source-adapters.ts");
  const packSrc=await sourceFile("src/modules/treasury/analyst-pack.ts");
  for(const s of [src,packSrc]){
    assert.doesNotMatch(s,/\bfetch\s*\(|\.rpc\s*\(|service_role|process\.env|openUrl\s*\(/);
  }
  assert.ok(!adapters.treasurySourceProfiles.some(x=>x.connectionStatus!=="file_import_only"));
});

test("Automated daily working paper matches evidence-based cash/risk figures and mandates review",()=>{
  const cash=engine.analyseTreasury(getDemo());
  const stressed=risk.assessLiquidityRisk(cash,risk.syntheticLiquidityPolicy());
  const working=pack.makeTreasuryAnalystPack(cash,stressed);
  assert.equal(working.kind,"finvessa_treasury_analyst_working_paper");
  assert.equal(working.reportDate,TODAY);
  assert.equal(working.reviewRequired,true);
  assert.equal(working.decision,"independent_review_required");
  assert.equal(working.currencyPositions.length,3);
  const gb=working.currencyPositions.find(x=>x.currency==="GBP");
  assert.equal(gb.position,"GBP 200,000.00");
  assert.equal(gb.finalBaseline,"GBP 173,000.00");
  assert.equal(gb.firstBreachWeek,5);
  assert.ok(working.nextActions.some(x=>x.id==="assess-liquidity-gap"));
  assert.ok(working.nextActions.every(x=>x.automaticAction===false));
});

test("Missing policy and forecasts are never presented as positive liquidity conclusions",()=>{
  const cash=engine.analyseTreasury(getDemo());
  const working=pack.makeTreasuryAnalystPack(cash);
  assert.equal(working.decision,"independent_review_required");
  assert.ok(working.nextActions.some(x=>x.id==="complete-risk-policy-assessment"));
  const noForecast={...cash,weeks:[],status:"review_required"};
  const r=pack.makeTreasuryAnalystPack(noForecast);
  assert.equal(r.currencyPositions.find(x=>x.currency==="GBP").finalBaseline,null);
});

test("Any blocked cash data forces a HOLD regardless of risk narratives",()=>{
  const data=getDemo();
  data.transactionsCSV=data.transactionsCSV.replace("282000.00","282000.01");
  const cash=engine.analyseTreasury(data);
  const stressed=risk.assessLiquidityRisk(cash,risk.syntheticLiquidityPolicy());
  const p=pack.makeTreasuryAnalystPack(cash,stressed);
  assert.equal(p.decision,"hold_source_data");
  assert.ok(p.nextActions.some(x=>x.priority==="urgent"));
  assert.ok(p.keyFindings.some(x=>x.code==="BALANCE_MISMATCH"));
});

test("Cross-dated and mismatched source risk result cannot contaminate working papers",()=>{
  const cash=engine.analyseTreasury(getDemo());
  const stressed=risk.assessLiquidityRisk(cash,risk.syntheticLiquidityPolicy());
  assert.throws(()=>pack.makeTreasuryAnalystPack(cash,{...stressed,reportDate:"2026-10-16"}),/do not belong/);
  assert.throws(()=>pack.makeTreasuryAnalystPack(cash,{...stressed,sourceReportStatus:"blocked"}),/do not belong/);
});

test("Findings are bounded, explicitly disclose omissions and Markdown output escapes injected markup",()=>{
  const cash=engine.analyseTreasury(getDemo());
  cash.issues=Array.from({length:205},(_,i)=>({
    code:"TEST_"+i,severity:"warning",message:"<script>*BAD*</script>",
    evidence:"bank.csv:row:"+i
  }));
  const p=pack.makeTreasuryAnalystPack(cash);
  assert.equal(p.totalFindings,205);
  assert.equal(p.keyFindings.length,200);
  assert.equal(p.omittedFindings,5);
  const markdown=pack.treasuryPackMarkdown(p);
  assert.ok(markdown.includes("5 additional exception(s) omitted"));
  assert.ok(!markdown.includes("<script>"));
  assert.ok(markdown.includes("\\<script\\>"));
});

test("Report generation has currency-separated rows and no invented FX netting",()=>{
  const cash=engine.analyseTreasury(getDemo());
  const doc=pack.makeTreasuryAnalystPack(cash);
  const markdown=pack.treasuryPackMarkdown(doc);
  assert.match(markdown,/## Cash positions and liquidity by currency/);
  assert.match(markdown,/GBP 200,000.00/);
  assert.match(markdown,/EUR 158,000.00/);
  assert.match(markdown,/USD 130,000.00/);
  assert.doesNotMatch(markdown,/GBP-equivalent consolidated cash|FX rate 1\.|Total GBP equivalent/);
});
