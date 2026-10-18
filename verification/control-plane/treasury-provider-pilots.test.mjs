import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const read=path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
async function load(path,deps={}){
  const source=await read(path);
  const js=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const mod={exports:{}};
  vm.runInNewContext(js,{
    module:mod,exports:mod.exports,AbortSignal,TextDecoder,Uint8Array,
    require(name){if(!(name in deps))throw new Error("Unexpected dependency "+name);return deps[name];}
  });
  return mod.exports;
}
const finance=await load("src/modules/treasury/engine.ts");
const pilots=await load("src/modules/treasury/provider-pilots.ts",{"./engine":finance});
const TENANT="2c48cebe-0011-42d4-a8cd-80fa1e30df75";
const XERO_TENANT="5a9ce10e-1496-4c34-bd02-2b01f858e884";
const CONNECTION_ID="e6e7d29d-7318-4f77-8c95-3d7422358572";
const XERO_ACCOUNT="12481bb9-2484-4b1d-9e0b-b77e986fd987";
const ACCOUNT_ID="56c7b029e0f8ec5a2334fb0ffc2fface";
const NOW="2026-10-18T09:00:00Z";
const EXPIRES="2026-10-19T09:00:00Z";
const TOKEN="test_only_ephemeral_bearer_token_1234567890";

const approval=(provider="truelayer_data_v3")=>({
  tenantId:TENANT,productKey:"finvessa",provider,
  environment:"sandbox_test_only",approvalState:"independently_verified",
  approvalReference:"test-evidence-approval-01",
  approvedReadScopes:provider==="truelayer_data_v3"?["accounts"]:["accounting.transactions.read"],
  consentValidUntil:EXPIRES,connectorProofValidUntil:EXPIRES,
  accountAllowlist:provider==="truelayer_data_v3"?[ACCOUNT_ID]:[XERO_ACCOUNT],
  externalConnectionId:provider==="truelayer_data_v3"?CONNECTION_ID:XERO_TENANT
});
const truelayerFixture={
  items:[
    {id:ACCOUNT_ID,account_type:"current",customer_segment:"business",currency:"GBP",
      account_identifiers:[{type:"sort_code_account_number",account_number:"12345678"}],
      account_holder_names:["SECRET CUSTOMER"]},
    {id:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",account_type:"current",
      customer_segment:"business",currency:"GBP"}
  ],pagination:{}
};
const xeroFixture={
  pagination:{page:1,pageSize:100,pageCount:1,itemCount:3},
  BankTransactions:[
    {BankTransactionID:"00000000-0000-4000-8000-000000000001",
      BankAccount:{AccountID:XERO_ACCOUNT},DateString:"2026-10-17T00:00:00",
      CurrencyCode:"GBP",Status:"AUTHORISED",Type:"RECEIVE",
      IsReconciled:true,Total:150.25,Reference:"Receipt 001"},
    {BankTransactionID:"00000000-0000-4000-8000-000000000002",
      BankAccount:{AccountID:XERO_ACCOUNT},DateString:"2026-10-17T00:00:00",
      CurrencyCode:"GBP",Status:"AUTHORISED",Type:"SPEND",
      IsReconciled:true,Total:52.5,Reference:"Supplier 002"},
    {BankTransactionID:"00000000-0000-4000-8000-000000000003",
      BankAccount:{AccountID:XERO_ACCOUNT},DateString:"2026-10-17T00:00:00",
      CurrencyCode:"GBP",Status:"DRAFT",Type:"SPEND",
      IsReconciled:false,Total:99.9,Reference:"Not authorised"}
  ]
};
function transportFor(payload,opts={}){
  const calls=[];
  const network=async (url,init)=>{
    calls.push({url,method:init.method,redirect:init.redirect,cache:init.cache,
      credentials:init.credentials,headers:init.headers,signal:init.signal});
    if(opts.fail) return new Response(JSON.stringify({error:"ACCESS TOKEN SHOULD NOT LEAK"}),{
      status:opts.fail,headers:{"content-type":"application/json"}});
    if(opts.redirected) return {redirected:true,status:200,ok:true};
    return new Response(
      opts.raw??JSON.stringify(payload),{
        status:200,headers:{"content-type":opts.contentType??"application/json",
          ...(opts.responseLength?{"content-length":opts.responseLength}:{})}
      }
    );
  };
  return {network,calls};
}
async function invoke(provider,fixture){
  const t=transportFor(fixture);
  const result=await pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,
    pilot:approval(provider),secret:{bearerToken:TOKEN},now:NOW,transport:t.network
  });
  return {result,call:t.calls[0]};
}

test("TrueLayer Data v3 account discovery is strictly GET, sandbox-hosted, consent-scoped",async()=>{
  const {result,call}=await invoke("truelayer_data_v3",truelayerFixture);
  assert.equal(result.provider,"truelayer_data_v3");
  assert.equal(result.kind,"bank_account_discovery");
  assert.equal(result.recordsObserved,2);
  assert.equal(result.recordsAccepted,1);
  assert.equal(result.accounts[0].id,ACCOUNT_ID);
  assert.equal(result.accounts[0].currency,"GBP");
  assert.equal(result.status,"sandbox_preview_only");
  assert.equal(result.certification,"none");
  assert.equal(result.complete,false);
  assert.equal(result.canUseAsBankStatement,false);
  assert.equal(result.canUseAsFullGeneralLedger,false);
  assert.ok(result.findings.some(x=>x.code==="ACCOUNT_NOT_AUTHORISED"));
  assert.ok(result.findings.some(x=>x.code==="SOURCE_NOT_FULL_STATEMENT"));
  assert.equal(call.url,"https://api.truelayer-sandbox.com/v3/connected-accounts");
  assert.equal(call.method,"GET");
  assert.equal(call.headers["Connection-Id"],CONNECTION_ID);
  assert.equal(call.headers.authorization,"Bearer "+TOKEN);
  assert.equal(call.redirect,"error");
  assert.equal(call.credentials,"omit");
  assert.equal(call.cache,"no-store");
  assert.ok(call.signal);
  assert.doesNotMatch(JSON.stringify(result),/12345678|SECRET CUSTOMER|bearer_token|Authorization/);
});

test("Xero bank transactions are partial reconciled cash activity, never complete GL",async()=>{
  const {result,call}=await invoke("xero_accounting",xeroFixture);
  assert.equal(result.provider,"xero_accounting");
  assert.equal(result.kind,"accounting_cash_activity");
  assert.equal(result.recordsObserved,3);
  assert.equal(result.recordsAccepted,2);
  assert.equal(result.cashCandidates.length,2);
  assert.equal(result.cashCandidates[0].signedAmountMinor,15025);
  assert.equal(result.cashCandidates[1].signedAmountMinor,-5250);
  assert.ok(result.findings.some(x=>x.code==="NOT_AUTHORISED"));
  assert.ok(result.findings.some(x=>x.code==="SOURCE_NOT_FULL_CASH_LEDGER"));
  assert.equal(result.canPostLedger,false);
  assert.equal(result.canUseAsFullGeneralLedger,false);
  assert.equal(call.url,"https://api.xero.com/api.xro/2.0/BankTransactions?page=1&pageSize=100");
  assert.equal(call.headers["xero-tenant-id"],XERO_TENANT);
  assert.equal(call.method,"GET");
  assert.doesNotMatch(JSON.stringify(result),/bearer_token|authorization/i);
});

test("Unverified consent, expired proof and incorrect external connection always fail before transport",async()=>{
  const t=transportFor(truelayerFixture);
  const bad=approval();
  bad.approvalState="requested";
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,pilot:bad,secret:{bearerToken:TOKEN},now:NOW,transport:t.network}),/verified/);
  const stale=approval();stale.consentValidUntil="2026-10-17T09:00:00Z";
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,pilot:stale,secret:{bearerToken:TOKEN},now:NOW,transport:t.network}),/expired/);
  const malformed=approval();malformed.externalConnectionId="https://evil.test/";
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,pilot:malformed,secret:{bearerToken:TOKEN},now:NOW,transport:t.network}),/verified/);
  assert.equal(t.calls.length,0);
});

test("Only exact provider-read scopes permitted; write-capable permissions are forbidden",async()=>{
  const t=transportFor(xeroFixture);
  const p=approval("xero_accounting");
  p.approvedReadScopes=["accounting.transactions"];
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,pilot:p,secret:{bearerToken:TOKEN},now:NOW,transport:t.network}),/read-only scopes/);
  const b=approval();b.approvedReadScopes=["accounts","payments"];
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,pilot:b,secret:{bearerToken:TOKEN},now:NOW,transport:t.network}),/read-only scopes/);
  assert.equal(t.calls.length,0);
});

test("Cross-tenant and unapproved account identities are excluded or denied",async()=>{
  const t=transportFor(truelayerFixture);
  const p=approval();p.tenantId="0c037829-1217-4bc7-9924-1270b142f579";
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({
    authenticatedTenantId:TENANT,pilot:p,secret:{bearerToken:TOKEN},now:NOW,transport:t.network
  }),/Cross-tenant/);
  assert.equal(t.calls.length,0);
  const notAllowed=approval();notAllowed.accountAllowlist=["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"];
  const t2=transportFor(truelayerFixture);
  const out=await pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,pilot:notAllowed,secret:{bearerToken:TOKEN},now:NOW,transport:t2.network});
  assert.equal(out.recordsAccepted,1);
  assert.equal(out.accounts[0].id,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
});

test("Provider refusal and rate limit do not leak credentials or response bodies",async()=>{
  for(const status of [401,403,429,500]){
    const {network,calls}=transportFor(truelayerFixture,{fail:status});
    await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,
      pilot:approval(),secret:{bearerToken:TOKEN},now:NOW,transport:network
    }),/provider/i);
    assert.equal(calls.length,1);
  }
});

test("Xero pagination omission/continuation prevents financial use",async()=>{
  const t=transportFor({...xeroFixture,pagination:{page:1,pageCount:2}});
  const r=await pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,pilot:approval("xero_accounting"),secret:{bearerToken:TOKEN},now:NOW,transport:t.network});
  assert.equal(r.recordsAccepted,0);
  assert.equal(r.cashCandidates.length,0);
  assert.ok(r.findings.some(x=>x.code==="INCOMPLETE_PAGINATION"));
  const a=transportFor({BankTransactions:xeroFixture.BankTransactions});
  const b=await pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,pilot:approval("xero_accounting"),secret:{bearerToken:TOKEN},now:NOW,transport:a.network});
  assert.equal(b.recordsAccepted,0);
  assert.equal(b.complete,false);
});

test("TrueLayer paginated discovery flags incomplete listing instead of pretending completeness",async()=>{
  const t=transportFor({...truelayerFixture,pagination:{next_cursor:"cursor123"}});
  const r=await pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,pilot:approval(),secret:{bearerToken:TOKEN},now:NOW,transport:t.network});
  assert.equal(r.complete,false);
  assert.ok(r.findings.some(x=>x.code==="INCOMPLETE_PAGINATION"));
});

test("Xero malformed amounts, unsupported transaction types and duplicates are rejected",async()=>{
  const bad={...xeroFixture,BankTransactions:[
    {...xeroFixture.BankTransactions[0],Total:1.001}
  ]};
  const t=transportFor(bad);
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,
    pilot:approval("xero_accounting"),secret:{bearerToken:TOKEN},now:NOW,transport:t.network
  }),/safe positive two-decimal/);
  const dup={...xeroFixture,BankTransactions:[
    xeroFixture.BankTransactions[0],xeroFixture.BankTransactions[0]
  ]};
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,
    pilot:approval("xero_accounting"),secret:{bearerToken:TOKEN},now:NOW,transport:transportFor(dup).network
  }),/Duplicate Xero bank transaction/);
  const excluded={...xeroFixture,BankTransactions:[
    {...xeroFixture.BankTransactions[0],Type:"TRANSFER"}
  ]};
  const r=await pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,
    pilot:approval("xero_accounting"),secret:{bearerToken:TOKEN},now:NOW,transport:transportFor(excluded).network
  });
  assert.equal(r.recordsAccepted,0);
  assert.ok(r.findings.some(x=>x.code==="UNSUPPORTED_TRANSACTION"));
});

test("Non-JSON, oversized and redirected responses cannot enter analysis",async()=>{
  const wrong=transportFor(truelayerFixture,{contentType:"text/html"});
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,
    pilot:approval(),secret:{bearerToken:TOKEN},now:NOW,transport:wrong.network
  }),/expected JSON/);
  const oversize=transportFor(truelayerFixture,{responseLength:"1000001"});
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,
    pilot:approval(),secret:{bearerToken:TOKEN},now:NOW,transport:oversize.network
  }),/byte limit/);
  const huge=transportFor(truelayerFixture,{raw:JSON.stringify({items:[{big:"x".repeat(1_000_001)}]})});
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,
    pilot:approval(),secret:{bearerToken:TOKEN},now:NOW,transport:huge.network
  }),/byte limit/);
  const redirected=transportFor(truelayerFixture,{redirected:true});
  await assert.rejects(()=>pilots.performTreasuryReadOnlyPilot({authenticatedTenantId:TENANT,
    pilot:approval(),secret:{bearerToken:TOKEN},now:NOW,transport:redirected.network
  }),/redirect/);
});

test("Read-only provider adapter stays generic and cannot be turned into a browser data fetch",async()=>{
  const source=await read("src/modules/treasury/provider-pilots.ts");
  assert.match(source,/TRUE_LAYER_URL="https:\/\/api.truelayer-sandbox.com\/v3\/connected-accounts"/);
  assert.match(source,/XERO_URL="https:\/\/api.xero.com\/api.xro\/2.0\/BankTransactions\?page=1&pageSize=100"/);
  assert.match(source,/method:"GET",redirect:"error",credentials:"omit",cache:"no-store"/);
  assert.match(source,/Only an approved server worker/);
  assert.doesNotMatch(source,/method:"POST"|method:"PATCH"|method:"PUT"|method:"DELETE"|createPayment|createBankTransaction|createTransfer/);
});
