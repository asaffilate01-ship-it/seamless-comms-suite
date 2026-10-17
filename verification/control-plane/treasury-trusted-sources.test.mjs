import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const read=path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
async function loadTS(path,deps={}){
  const source=await read(path);
  const js=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(js,{module:mod,exports:mod.exports,
    require(key){if(!(key in deps))throw new Error("Unapproved dependency: "+key);return deps[key];}});
  return mod.exports;
}
const engine=await loadTS("src/modules/treasury/engine.ts");
const risk=await loadTS("src/modules/treasury/liquidity-risk.ts",{"./engine":engine});
const pack=await loadTS("src/modules/treasury/analyst-pack.ts",{"./engine":engine});
const sources=await loadTS("src/modules/treasury/trusted-sources.ts",{
  "./engine":engine,"./liquidity-risk":risk,"./analyst-pack":pack
});
const migration=await read("supabase/migrations/20261017213000_finvessa_treasury_source_readiness.sql");
const server=await read("src/modules/treasury/automation.functions.ts");
const ui=await read("src/modules/treasury/TreasuryAutomationPanel.tsx");
const integration=await read("src/routes/_authenticated/app.treasury-analyst.tsx");
const TENANT="6cc33f3e-c07d-4a76-ae08-e442c3fb5521";
const OTHER="a237d917-5437-4336-8c99-12bec6cd2c79";
const NOW="2026-10-17T20:00:00Z";
const SOON="2026-11-17T20:00:00Z";
const VERIFIED="2026-10-17T19:00:00Z";
const validBindings=(status="sandbox_verified")=>sources.REQUIRED_TREASURY_SOURCES.map((kind,index)=>({
  tenantId:TENANT,productKey:"finvessa",sourceKind:kind,providerFamily:"managed_file",
  providerKey:"test-fixture-"+index,connectionStatus:status,readOnly:true,
  scopes:[sources.REQUIRED_READ_SCOPES[kind]],proofReference:"sandbox-receipt-"+index,
  verifiedAt:VERIFIED,lastSuccessfulReadAt:VERIFIED,validUntil:SOON
}));
const envelopes=(tenantId=TENANT)=>{
  const demo=engine.treasuryDemoInput("2026-10-17");
  const csv={
    bank_opening:demo.accountsCSV,
    bank_transactions:demo.transactionsCSV,
    cash_general_ledger:demo.ledgerCSV,
    cash_forecast:demo.forecastCSV,
    liquidity_policy:risk.syntheticLiquidityPolicy()
  };
  return sources.REQUIRED_TREASURY_SOURCES.map((kind,index)=>({
    tenantId,sourceKind:kind,providerKey:"test-fixture-"+index,
    receivedAt:VERIFIED,sourceDigest:"a".repeat(63)+String(index),
    canonicalCsv:csv[kind]
  }));
};

test("Five contractually distinct source kinds are compulsory",()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(sources.REQUIRED_TREASURY_SOURCES)),[
    "bank_opening","bank_transactions","cash_general_ledger","cash_forecast","liquidity_policy"
  ]);
  assert.equal(Object.keys(sources.REQUIRED_READ_SCOPES).length,5);
});

test("Empty, partial and unverified source bindings fail closed",()=>{
  const empty=sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:[],at:NOW});
  assert.equal(empty.status,"blocked");
  assert.equal(empty.covered.length,0);
  assert.equal(empty.missing.length,5);
  assert.equal(empty.productionExecutionAllowed,false);
  const one=sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:validBindings().slice(0,1),at:NOW});
  assert.equal(one.status,"blocked");
  assert.equal(one.covered.length,1);
  const neverVerified=sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:validBindings("unverified"),at:NOW});
  assert.equal(neverVerified.status,"blocked");
});

test("Complete sandbox metadata never grants production access",()=>{
  const ready=sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:validBindings(),at:NOW});
  assert.equal(ready.status,"sandbox_shadow_only");
  assert.equal(ready.missing.length,0);
  assert.equal(ready.blockers.length,0);
  assert.equal(ready.productionExecutionAllowed,false);
  const prod=sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:validBindings("production_verified"),at:NOW});
  assert.equal(prod.status,"sandbox_shadow_only");
  assert.equal(prod.productionExecutionAllowed,false);
});

test("Foreign tenant, wrong product and extra duplicate source bindings cannot pass",()=>{
  const foreign=validBindings();
  foreign[0].tenantId=OTHER;
  assert.equal(sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:foreign,at:NOW}).status,"blocked");
  const mixed=validBindings();
  mixed[2].productKey="another-product";
  assert.equal(sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:mixed,at:NOW}).status,"blocked");
  assert.equal(sources.evaluateTreasurySourceReadiness({
    tenantId:TENANT,bindings:[...validBindings(),validBindings()[0]],at:NOW
  }).status,"blocked");
});

test("Write scopes, stale proof, stale data and unapproved providers prevent admission",()=>{
  const write=validBindings();write[0].scopes.push("payments.write");
  assert.equal(sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:write,at:NOW}).status,"blocked");
  const stale=validBindings();stale[0].lastSuccessfulReadAt="2026-10-15T11:00:00Z";
  assert.equal(sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:stale,at:NOW}).status,"blocked");
  const expired=validBindings();expired[0].validUntil="2026-10-16T20:00:00Z";
  assert.equal(sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:expired,at:NOW}).status,"blocked");
  const noProof=validBindings();noProof[0].proofReference=null;
  assert.equal(sources.evaluateTreasurySourceReadiness({tenantId:TENANT,bindings:noProof,at:NOW}).status,"blocked");
});

test("A complete synthetic shadow input produces a reviewed working paper without external execution",()=>{
  const output=sources.runTreasuryShadowAnalysis({
    tenantId:TENANT,bindings:validBindings(),envelopes:envelopes(),
    reportDate:"2026-10-17",now:NOW
  });
  assert.equal(output.status,"shadow_only");
  assert.equal(output.productionExecutionAllowed,false);
  assert.equal(output.report.kind,"finvessa_treasury_analyst_working_paper");
  assert.equal(output.report.currencyPositions.length,3);
  assert.equal(output.report.currencyPositions.find(x=>x.currency==="GBP").position,"GBP 200,000.00");
  assert.equal(Object.keys(output.sourceDigests).length,5);
  assert.equal(output.sourceStatus,"checked");
  assert.equal(output.riskStatus,"breach");
});

test("Unverified and mismatched source envelopes are never accepted by the shadow runner",()=>{
  const base={tenantId:TENANT,bindings:validBindings(),reportDate:"2026-10-17",now:NOW};
  assert.throws(()=>sources.runTreasuryShadowAnalysis({...base,envelopes:envelopes().slice(0,4)}),/All five/);
  assert.throws(()=>sources.runTreasuryShadowAnalysis({...base,envelopes:[...envelopes(),envelopes()[0]]}),/Duplicate financial source/);
  const foreign=envelopes();foreign[0].tenantId=OTHER;
  assert.throws(()=>sources.runTreasuryShadowAnalysis({...base,envelopes:foreign}),/Foreign tenant/);
  const wrong=envelopes();wrong[1].providerKey="different-provider";
  assert.throws(()=>sources.runTreasuryShadowAnalysis({...base,envelopes:wrong}),/does not match/);
  const missingDigest=envelopes();missingDigest[0].sourceDigest="INVALID";
  assert.throws(()=>sources.runTreasuryShadowAnalysis({...base,envelopes:missingDigest}),/SHA-256/);
  const stale=envelopes();stale[0].receivedAt="2026-10-15T14:00:00Z";
  assert.throws(()=>sources.runTreasuryShadowAnalysis({...base,envelopes:stale}),/stale/);
});

test("A bank source mismatch in the shadow flow forces HOLD, never a clean report",()=>{
  const changed=envelopes();
  const bank=changed.find(x=>x.sourceKind==="bank_transactions");
  bank.canonicalCsv=bank.canonicalCsv.replace("282000.00","282000.01");
  const out=sources.runTreasuryShadowAnalysis({
    tenantId:TENANT,bindings:validBindings(),envelopes:changed,
    reportDate:"2026-10-17",now:NOW
  });
  assert.equal(out.sourceStatus,"blocked");
  assert.equal(out.report.decision,"hold_source_data");
});

test("Future-dated report periods cannot be processed and current-date snapshots are accepted",()=>{
  const base={tenantId:TENANT,bindings:validBindings(),envelopes:envelopes(),now:NOW};
  assert.throws(()=>sources.runTreasuryShadowAnalysis({...base,reportDate:"2026-10-18"}),/Future report dates/);
  assert.equal(sources.runTreasuryShadowAnalysis({...base,reportDate:"2026-10-17"}).status,"shadow_only");
});

test("Every new treasury metadata table is tenant-scoped, RLS protected and refuses browser writes",()=>{
  for(const name of ["treasury_source_requests","treasury_verified_sources","treasury_schedule_drafts"]){
    assert.match(migration,new RegExp("CREATE TABLE public\\."+name));
    assert.match(migration,new RegExp("ALTER TABLE public\\.%I ENABLE ROW LEVEL SECURITY"));
    assert.match(migration,new RegExp("tenant_id uuid NOT NULL"));
  }
  assert.match(migration,/REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated/);
  assert.match(migration,/GRANT SELECT ON public\.%I TO authenticated/);
  assert.match(migration,/public\.is_tenant_member\(tenant_id,auth\.uid\(\)\)/);
  assert.match(migration,/tp\.product_key='finvessa' AND tp\.status='active'/);
  assert.equal((migration.match(/CREATE POLICY/g)||[]).length,3);
  assert.doesNotMatch(migration,/GRANT (?:ALL|INSERT|UPDATE|DELETE) ON public\.treasury_[^\s]+ TO authenticated/);
});

test("No bank token, connector URL, financial record or active job can be stored in Phase 5 tables",()=>{
  assert.doesNotMatch(migration,/raw_csv|bank_account_number|encrypted_token|access_token|client_secret|private_key|credential_reference|bank_statement_json/);
  assert.match(migration,/run_mode text NOT NULL DEFAULT 'simulation_only' CHECK\(run_mode='simulation_only'\)/);
  assert.match(migration,/activation_status text NOT NULL DEFAULT 'draft' CHECK\(activation_status IN\('draft','paused'\)\)/);
  assert.match(migration,/read_only boolean NOT NULL DEFAULT true CHECK\(read_only\)/);
  assert.doesNotMatch(migration,/pg_cron|cron\.schedule|net\.http|call_http|INSERT INTO public\.intelligence_jobs/);
});

test("Source request and schedule draft require DB-enforced owner/admin product entitlement",()=>{
  assert.match(migration,/FUNCTION public\.request_treasury_readonly_source/);
  assert.match(migration,/FUNCTION public\.save_treasury_schedule_draft/);
  assert.ok((migration.match(/auth\.uid\(\) IS NULL/g)||[]).length>=2);
  assert.ok((migration.match(/FROM public\.tenant_products tp/g)||[]).length>=5);
  assert.ok((migration.match(/COALESCE\(member_role,''\) NOT IN\('owner','admin'\)/g)||[]).length>=2);
  assert.match(migration,/ON CONFLICT\(tenant_id,source_kind,provider_key\) DO NOTHING/);
  assert.match(migration,/ON CONFLICT\(tenant_id\) DO UPDATE SET/);
});

test("Authenticated backend uses original member identity and never includes vendor credentials",()=>{
  assert.match(server,/requireSupabaseAuth/);
  assert.match(server,/requireTenantMembership/);
  assert.match(server,/requireAdminRole/);
  assert.match(server,/requireWriteRole/);
  assert.match(server,/data\.status!=="active"/);
  assert.match(server,/request_treasury_readonly_source/);
  assert.match(server,/save_treasury_schedule_draft/);
  assert.match(server,/treasuryDemoInput\(date\)/);
  assert.match(server,/assessLiquidityRisk\(report,syntheticLiquidityPolicy\(\)\)/);
  assert.doesNotMatch(server,/\bfetch\s*\(|\bservice_role\b|process\.env|http:\/\//);
});

test("Operator UI cannot activate a schedule, real bank API or an unreviewed AI agent",()=>{
  assert.match(ui,/No live bank connection/);
  assert.match(ui,/Never active/);
  assert.match(ui,/executionEnabled/);
  assert.match(ui,/runTreasuryServerSyntheticPreview/);
  assert.match(ui,/Request independent provider setup/);
  assert.match(integration,/TreasuryAutomationPanel/);
  assert.doesNotMatch(ui,/\bfetch\s*\(|new WebSocket|bankLogin|createTransfer|startTrade/);
});
