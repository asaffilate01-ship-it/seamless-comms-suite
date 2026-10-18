import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const read = path => readFile(new URL("../../" + path, import.meta.url), "utf8");
const migration = await read("supabase/migrations/20261017193000_finvessa_treasury_review_register.sql");
const gateway = await read("src/modules/treasury/review.functions.ts");
const ui = await read("src/modules/treasury/TreasuryRiskAndReviewPanel.tsx");
const source = await read("src/modules/agent-factory/catalogue.ts");
const compiled = ts.transpileModule(source, {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const module = {exports:{}};
vm.runInNewContext(compiled, {module,exports:module.exports});
const catalogue = module.exports;
const plannerSource = await read("src/modules/agent-factory/planner.ts");
const plannerJs = ts.transpileModule(plannerSource, {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const plannerMod={exports:{}};
vm.runInNewContext(plannerJs,{module:plannerMod,exports:plannerMod.exports,
  require(k){assert.equal(k,"./catalogue");return catalogue;}});

test("Treasury analyst blueprint coverage extends existing factory without auto-enabling tools",()=>{
  const available=catalogue.agentsForProduct("finvessa").filter(x=>x.key.startsWith("finvessa.treasury-"));
  assert.equal(available.length,10);
  assert.ok(available.every(x=>x.mode==="draft"&&x.risk==="regulated"&&x.productKeys.length===1));
  assert.ok(available.every(x=>x.requiredCapabilities.length>=2));
  const keys=available.map(x=>x.key);
  assert.ok(keys.some(x=>x.endsWith("cash-analyst")));
  assert.ok(keys.some(x=>x.endsWith("systems-analyst")));
  for(const blueprint of available){
    const result=plannerMod.exports.planAgentActivation({
      productKey:"finvessa",blueprintKey:blueprint.key,
      verifiedCapabilities:[],approvedCapabilities:blueprint.requiredCapabilities
    });
    assert.equal(result.status,"design_only");
    assert.ok(result.unavailableCapabilities.length>0);
    assert.equal(result.requiresHumanReview,true);
  }
});

test("Treasury reviewer cases hold only fingerprints, source-level statuses and bounded metadata",()=>{
  assert.match(migration,/CREATE TABLE public\.treasury_review_cases/);
  assert.match(migration,/CREATE TABLE public\.treasury_review_events/);
  assert.match(migration,/report_digest text NOT NULL CHECK\(report_digest ~ '\^\[a-f0-9\]\{64\}\$'\)/);
  assert.match(migration,/policy_digest text NOT NULL/);
  assert.match(migration,/UNIQUE\(tenant_id,report_digest,policy_digest\)/);
  assert.doesNotMatch(migration,/raw_accounts_csv|raw_transactions_csv|bank_statement_blob|plaintext_secret|payment_token|supplier_credential/);
  assert.match(migration,/FOREIGN KEY\(case_id,tenant_id\)/);
});

test("RLS restricts both review tables and denies direct authenticated mutations",()=>{
  assert.match(migration,/ALTER TABLE public\.treasury_review_cases ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/ALTER TABLE public\.treasury_review_events ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/REVOKE ALL ON public\.treasury_review_cases,public\.treasury_review_events FROM PUBLIC,anon,authenticated/);
  assert.match(migration,/GRANT SELECT ON public\.treasury_review_cases,public\.treasury_review_events TO authenticated/);
  assert.doesNotMatch(migration,/GRANT (?:ALL|INSERT|UPDATE|DELETE) ON public\.treasury_review_(?:cases|events) TO authenticated/);
  assert.match(migration,/public\.is_tenant_member\(tenant_id,auth\.uid\(\)\)/);
  assert.match(migration,/tp\.product_key='finvessa' AND tp\.status='active'/);
  assert.ok((migration.match(/CREATE POLICY/g)||[]).length===2);
});

test("Both transaction-safe RPCs recheck tenant role and active product, not browser claims",()=>{
  assert.match(migration,/FUNCTION public\.submit_treasury_review/);
  assert.match(migration,/FUNCTION public\.review_treasury_case/);
  assert.match(migration,/SECURITY DEFINER SET search_path=''/);
  assert.ok((migration.match(/IF auth\.uid\(\) IS NULL/g)||[]).length>=2);
  assert.ok((migration.match(/FROM public\.tenant_products tp/g)||[]).length>=4);
  assert.ok((migration.match(/FROM public\.tenant_members/g)||[]).length>=2);
  assert.match(migration,/IF c\.created_by=auth\.uid\(\) THEN/);
  assert.match(migration,/Segregation of duties: submitter cannot review own case/);
  assert.match(migration,/WHERE id=_case AND tenant_id=_tenant AND product_key='finvessa' FOR UPDATE/);
  assert.match(migration,/IF c\.status<>'submitted'/);
  assert.match(migration,/ON CONFLICT\(tenant_id,report_digest,policy_digest\) DO NOTHING/);
});

test("Reviewer decisions acknowledge or request correction; neither executes financial action",()=>{
  assert.match(migration,/_decision NOT IN\('acknowledged','correction_requested'\)/);
  assert.match(migration,/INSERT INTO public\.treasury_review_events/);
  assert.doesNotMatch(migration,/INSERT INTO public\.payment_transactions|UPDATE public\.bank_accounts|send_swift_message|create_trade/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.review_treasury_case\(uuid,uuid,text,text\) FROM PUBLIC,anon/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.review_treasury_case\(uuid,uuid,text,text\) TO authenticated/);
});

test("Authenticated gateway checks Finvessa membership, entitlement and strict payload schemas",()=>{
  assert.match(gateway,/requireSupabaseAuth/);
  assert.match(gateway,/requireTenantMembership/);
  assert.match(gateway,/requireWriteRole/);
  assert.match(gateway,/requireAdminRole/);
  assert.match(gateway,/data\.status !== "active"/);
  assert.match(gateway,/\.strict\(\)/);
  assert.match(gateway,/submit_treasury_review/);
  assert.match(gateway,/review_treasury_case/);
  assert.doesNotMatch(gateway,/createClient\(.+service_role/);
});

test("Browser hashes locally and submits only digests and bounded counts, never raw imported records",()=>{
  assert.match(ui,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ui,/reportDigest,policyDigest/);
  assert.match(ui,/getTreasuryReviewCases/);
  assert.match(ui,/submitTreasuryReview/);
  assert.match(ui,/reviewTreasuryCase/);
  assert.doesNotMatch(ui,/bankFile:inputs\.accountsCSV|rawInput:inputs\.transactionsCSV/);
  assert.match(ui,/independent reviewer required/i);
});
