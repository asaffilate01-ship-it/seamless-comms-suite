import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {webcrypto} from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

const read=path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
async function loadTS(path,deps={}){
  const src=await read(path);
  const js=ts.transpileModule(src,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(js,{
    module:mod,exports:mod.exports,crypto:webcrypto,TextEncoder,
    require(id){if(!(id in deps))throw new Error("Unexpected dependency: "+id);return deps[id];}
  });
  return mod.exports;
}
const engine=await loadTS("src/modules/treasury/engine.ts");
const risk=await loadTS("src/modules/treasury/liquidity-risk.ts",{"./engine":engine});
const pack=await loadTS("src/modules/treasury/analyst-pack.ts",{"./engine":engine});
const sources=await loadTS("src/modules/treasury/trusted-sources.ts",{
  "./engine":engine,"./liquidity-risk":risk,"./analyst-pack":pack
});
const signed=await loadTS("src/modules/treasury/signed-ingestion.ts",{
  "./trusted-sources":sources
});
const sql=await read("supabase/migrations/20261018100000_finvessa_signed_source_receipts.sql");
const action=await read("src/modules/treasury/automation.functions.ts");
const ui=await read("src/modules/treasury/TreasuryAutomationPanel.tsx");
const TENANT="b631590f-7c4f-4763-82a9-120bc0e31ea6";
const OTHER="afee8ab8-5c64-4b7d-8be3-c2cab7fb74e2";
const NOW="2026-10-18T09:00:00Z";
const LAST="2026-10-18T08:00:00Z";
const EXPIRY="2026-10-20T10:00:00Z";
const REPORT_DATE="2026-10-18";
const sourceContents=()=>{
  const demo=engine.treasuryDemoInput(REPORT_DATE);
  return {
    bank_opening:demo.accountsCSV,
    bank_transactions:demo.transactionsCSV,
    cash_general_ledger:demo.ledgerCSV,
    cash_forecast:demo.forecastCSV,
    liquidity_policy:risk.syntheticLiquidityPolicy()
  };
};
async function fixtures(){
  const contents=sourceContents();
  const bindings=[],keys=[],envelopes=[];
  for(const kind of sources.REQUIRED_TREASURY_SOURCES){
    const providerKey="sandbox-"+kind.replaceAll("_","-");
    const keyId="signed-key-"+kind.replaceAll("_","-");
    const cryptoKey=await webcrypto.subtle.generateKey(
      {name:"HMAC",hash:"SHA-256",length:256},false,["sign","verify"]
    );
    bindings.push({
      tenantId:TENANT,productKey:"finvessa",sourceKind:kind,
      providerFamily:"managed_file",providerKey,connectionStatus:"sandbox_verified",
      readOnly:true,scopes:[sources.REQUIRED_READ_SCOPES[kind]],
      proofReference:"sandbox-receipt-"+kind,
      verifiedAt:LAST,lastSuccessfulReadAt:LAST,validUntil:EXPIRY
    });
    keys.push({
      tenantId:TENANT,sourceKind:kind,providerKey,keyId,
      cryptoKey,status:"sandbox_verified",validUntil:EXPIRY
    });
    envelopes.push(await signed.signSyntheticTreasurySnapshot({
      version:1,tenantId:TENANT,sourceKind:kind,providerKey,keyId,
      eventId:"sandbox-event-"+kind.replaceAll("_","-"),
      receivedAt:LAST,canonicalCsv:contents[kind]
    },cryptoKey));
  }
  return {tenantId:TENANT,now:NOW,reportDate:REPORT_DATE,bindings,keys,envelopes};
}

test("Cryptographically verified five-source fixtures produce source-linked treasury working paper",async()=>{
  const input=await fixtures();
  const result=await signed.runSignedTreasurySandbox(input);
  assert.equal(result.mode,"signed_synthetic_sandbox");
  assert.equal(result.executionEnabled,false);
  assert.equal(result.connectionsUsed,0);
  assert.equal(result.receipts.length,5);
  assert.equal(result.run.report.kind,"finvessa_treasury_analyst_working_paper");
  assert.equal(result.run.report.currencyPositions.length,3);
  assert.equal(result.run.report.currencyPositions.find(x=>x.currency==="GBP").position,"GBP 200,000.00");
  assert.equal(result.run.sourceStatus,"checked");
  assert.equal(result.run.riskStatus,"breach");
  assert.ok(result.receipts.every(x=>x.signatureValid===true && x.digestSha256.length===64 && x.bytes>0));
  assert.ok(!result.receipts.some(x=>"canonicalCsv" in x || "cryptoKey" in x));
});

test("Financial payload hash independently recomputed before HMAC and rejects tampering",async()=>{
  const x=await fixtures();
  x.envelopes[1].canonicalCsv=x.envelopes[1].canonicalCsv.replace("282000.00","282000.01");
  await assert.rejects(
    ()=>signed.runSignedTreasurySandbox(x),/digest mismatch/
  );
});

test("Signature mismatch and post-signing event metadata changes fail closed",async()=>{
  const x=await fixtures();
  const original=x.envelopes[0].signatureHex;
  x.envelopes[0].signatureHex=(original[0]==="a"?"b":"a")+original.slice(1);
  await assert.rejects(()=>signed.runSignedTreasurySandbox(x),/signature verification failed/);
  const y=await fixtures();
  y.envelopes[0].eventId="changed-source-event-01";
  await assert.rejects(()=>signed.runSignedTreasurySandbox(y),/signature verification failed/);
});

test("Tenant and provider are part of signature and source keys cannot cross tenants",async()=>{
  const x=await fixtures();
  x.envelopes[0].tenantId=OTHER;
  await assert.rejects(()=>signed.runSignedTreasurySandbox(x),/Foreign tenant/);
  const y=await fixtures();
  y.keys[0].tenantId=OTHER;
  await assert.rejects(()=>signed.runSignedTreasurySandbox(y),/No unique tenant-scoped signing key/);
  const z=await fixtures();
  z.envelopes[0].providerKey="other-supplier";
  await assert.rejects(()=>signed.runSignedTreasurySandbox(z),/No unique tenant-scoped signing key/);
});

test("Source events cannot be duplicated or replayed within one verified batch",async()=>{
  const x=await fixtures();
  x.envelopes[4].eventId=x.envelopes[0].eventId;
  x.envelopes[4].providerKey=x.envelopes[0].providerKey;
  await assert.rejects(()=>signed.runSignedTreasurySandbox(x),/Duplicate provider source event/);
  const y=await fixtures();
  y.envelopes[4].sourceKind=y.envelopes[0].sourceKind;
  await assert.rejects(()=>signed.runSignedTreasurySandbox(y),/Duplicate financial source kind/);
});

test("Missing, revoked, expired, or unsigned key identities cannot be used",async()=>{
  const missing=await fixtures();
  missing.keys.pop();
  await assert.rejects(()=>signed.runSignedTreasurySandbox(missing),/No unique tenant-scoped signing key/);
  const revoked=await fixtures();
  revoked.keys[0].status="revoked";
  await assert.rejects(()=>signed.runSignedTreasurySandbox(revoked),/expired or been revoked/);
  const expired=await fixtures();
  expired.keys[0].validUntil="2026-10-17T08:00:00Z";
  await assert.rejects(()=>signed.runSignedTreasurySandbox(expired),/expired or been revoked/);
  const dup=await fixtures();
  dup.keys.push(dup.keys[0]);
  await assert.rejects(()=>signed.runSignedTreasurySandbox(dup),/Duplicate trusted signing key/);
});

test("Stale, future-dated, missing and overly large sources cannot be admitted",async()=>{
  const stale=await fixtures();
  stale.envelopes[0].receivedAt="2026-10-15T09:00:00Z";
  await assert.rejects(()=>signed.runSignedTreasurySandbox(stale),/stale or future-dated/);
  const future=await fixtures();
  future.envelopes[0].receivedAt="2026-10-19T09:00:00Z";
  await assert.rejects(()=>signed.runSignedTreasurySandbox(future),/stale or future-dated/);
  const tooBig=await fixtures();
  tooBig.envelopes[0].canonicalCsv="x".repeat(2_000_001);
  await assert.rejects(()=>signed.runSignedTreasurySandbox(tooBig),/exceeds the approved 2 MB/);
  const dropped=await fixtures();
  dropped.envelopes.pop();
  await assert.rejects(()=>signed.runSignedTreasurySandbox(dropped),/All five/);
});

test("No source report can escape the previously implemented risk and review gates",async()=>{
  const x=await fixtures();
  const bank=x.envelopes.find(v=>v.sourceKind==="bank_transactions");
  bank.canonicalCsv=bank.canonicalCsv.replace("282000.00","282000.01");
  const key=x.keys.find(v=>v.sourceKind==="bank_transactions");
  const resigned=await signed.signSyntheticTreasurySnapshot({
    version:1,tenantId:bank.tenantId,sourceKind:bank.sourceKind,
    providerKey:bank.providerKey,keyId:bank.keyId,eventId:bank.eventId,
    receivedAt:bank.receivedAt,canonicalCsv:bank.canonicalCsv
  },key.cryptoKey);
  x.envelopes[x.envelopes.indexOf(bank)]=resigned;
  const run=await signed.runSignedTreasurySandbox(x);
  assert.equal(run.run.sourceStatus,"blocked");
  assert.equal(run.run.report.decision,"hold_source_data");
});

test("Read-only verified connector metadata is always necessary before running signed math",async()=>{
  const x=await fixtures();
  x.bindings[0].readOnly=false;
  await assert.rejects(()=>signed.runSignedTreasurySandbox(x),/connector capability admission failed/);
  const y=await fixtures();
  y.bindings[0].connectionStatus="unverified";
  await assert.rejects(()=>signed.runSignedTreasurySandbox(y),/connector capability admission failed/);
  const z=await fixtures();
  z.bindings[0].scopes.push("payments.write");
  await assert.rejects(()=>signed.runSignedTreasurySandbox(z),/connector capability admission failed/);
});

test("Database receipt ledger enforces replay uniqueness, cross-tenant foreign keys and no live execution",()=>{
  assert.match(sql,/CREATE TABLE public\.treasury_signed_source_receipts/);
  assert.match(sql,/CREATE TABLE public\.treasury_shadow_run_receipts/);
  assert.match(sql,/CREATE TABLE public\.treasury_shadow_run_sources/);
  assert.match(sql,/UNIQUE\(tenant_id,provider_key,event_id\)/);
  assert.match(sql,/FOREIGN KEY\(receipt_id,tenant_id\) REFERENCES public\.treasury_signed_source_receipts\(id,tenant_id\)/);
  assert.match(sql,/FOREIGN KEY\(run_id,tenant_id\) REFERENCES public\.treasury_shadow_run_receipts\(id,tenant_id\)/);
  assert.match(sql,/source_count integer NOT NULL DEFAULT 5 CHECK\(source_count=5\)/);
  assert.match(sql,/execution_enabled boolean NOT NULL DEFAULT false CHECK\(execution_enabled=false\)/);
  assert.match(sql,/signature_verified boolean NOT NULL CHECK\(signature_verified = true\)/);
  assert.doesNotMatch(sql,/CREATE TRIGGER.*enqueue|cron\.schedule|INSERT INTO public\.intelligence_jobs/);
});

test("Raw financial records, credentials and signing keys never enter metadata-only tables",()=>{
  assert.doesNotMatch(sql,/bank_account_number|raw_csv|bank_json|plain_text_key|access_token|refresh_token|api_secret|encrypted_source_bytes/);
  assert.match(sql,/REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/GRANT SELECT ON public\.%I TO authenticated/);
  assert.match(sql,/GRANT ALL ON public\.%I TO service_role/);
  assert.equal((sql.match(/CREATE POLICY/g)||[]).length,3);
  assert.match(sql,/public\.is_tenant_member\(tenant_id,auth\.uid\(\)\)/);
  assert.match(sql,/tp\.product_key='finvessa' AND tp\.status='active'/);
});

test("Authenticated Phase 6 synthetic endpoint never accepts caller bank content or signing keys",()=>{
  assert.match(action,/runTreasurySignedSyntheticPreview=createServerFn/);
  assert.match(action,/\.inputValidator\(\(i:unknown\)=>syntheticSchema\.parse\(i\)\)/);
  assert.match(action,/requireActiveFinvessa\(context,data\.tenantId\)/);
  assert.match(action,/treasuryDemoInput\(date\)/);
  assert.match(action,/generateKey\(/);
  assert.match(action,/signSyntheticTreasurySnapshot/);
  assert.match(action,/runSignedTreasurySandbox/);
  assert.doesNotMatch(action,/\bfetch\s*\(|process\.env\.(?:BANK|OPEN_BANKING|SWIFT)/);
  assert.match(ui,/Verify five signed sources and analyse/);
  assert.match(ui,/signed_synthetic_sandbox/);
  assert.match(ui,/No live bank connection/);
});

test("HMAC signing is only the synthetic fixture; no production gateway or external network",async()=>{
  const src=await read("src/modules/treasury/signed-ingestion.ts");
  assert.match(src,/signSyntheticTreasurySnapshot/);
  assert.match(src,/subtleEngine\(\)\.verify/);
  assert.match(src,/digestTreasuryPayload\(s\.canonicalCsv\)/);
  assert.doesNotMatch(src,/\bfetch\s*\(|WebSocket|service_role|process\.env|http:\/\//);
});
