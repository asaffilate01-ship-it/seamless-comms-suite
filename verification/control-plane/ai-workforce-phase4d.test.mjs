import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {
 validateCrmReadOnlyClaim,buildCrmReadOnlyPayload,performReadOnlyCrmModelCall,
 OPENAI_RESPONSE_ORIGIN
} from "../../services/ai-workforce-readonly/business-crm.mjs";
import {runReadOnlyCrmPass,main} from "../../services/ai-workforce-readonly/business-worker.mjs";

const uid=(digit)=>digit.repeat(8)+"-"+digit.repeat(4)+"-4"+digit.repeat(3)+"-8"+
 digit.repeat(3)+"-"+digit.repeat(12);
const claim=()=>({
 admissionId:uid("1"),runId:uid("2"),jobId:uid("3"),employeeId:uid("4"),
 taskId:uid("5"),tenantId:uid("6"),productKey:"omniqora",
 providerKey:"openai",modelKey:"gpt-4.1-mini",
 sourceKey:"omniqora.crm.leads-summary.v1",
 sourceReadOnly:true,humanReviewRequired:true,
 allowedTools:[],sourceHash:"a".repeat(32),
 maxInputTokens:900,maxOutputTokens:160,
 aggregate:{
  sourceKey:"omniqora.crm.leads-summary.v1",origin:"first_party_crm_aggregate",
  dataClass:"aggregate_internal",totalLeads:30,qualifiedLeads:15,
  convertedLeads:5,workingLeads:null,smallGroupsSuppressed:true,
  asOfUtc:new Date(Date.now()-15_000).toISOString().replace(/\.\d{3}Z$/,"Z"),
 },
});
const expected={tenantId:uid("6"),productKey:"omniqora",modelId:"gpt-4.1-mini"};
const token="sk-test-"+"x".repeat(40);
const providerData=()=>({
 id:"resp_123456789abcdef",status:"completed",
 output:[{type:"message",content:[{type:"output_text",
 text:"The aggregate CRM lead funnel has thirty leads, fifteen qualified and five converted; small groups are suppressed."}]}],
 usage:{input_tokens:180,output_tokens:80},
});
const fakeResponse=(data)=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(data)});
const read=path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
function fakeDb(items=[claim()],rejectFinish=false){
 const calls=[];
 return {calls,async rpc(name,args){
  calls.push({name,args});
  if(name==="claim_ai_workforce_readonly_jobs")return {data:items,error:null};
  if(name==="finish_ai_workforce_readonly_job"){
   if(rejectFinish)return {data:null,error:{message:"Revoked source consent"}};
   return {data:{status:"waiting_review",reviewRequired:true,modelCalls:1,
    toolCalls:0,customerActions:0},error:null};
  }
  if(name==="flag_ai_workforce_readonly_reconciliation")
   return {data:{status:"reconciliation_required",reservationHeld:true},error:null};
  throw new Error("Unexpected privileged RPC: "+name);
 }};
}
const scope={tenantId:uid("6"),productKey:"omniqora",modelId:"gpt-4.1-mini",
 workerRef:"readonly_worker_01",providerToken:token,enabled:true};

test("real CRM adapter accepts only aggregate totals, suppresses small groups and blocks cross-tenant",()=>{
 const s=validateCrmReadOnlyClaim(claim(),expected);
 assert.equal(s.totalLeads,30);
 assert.equal(s.workingLeads,null);
 assert.throws(()=>validateCrmReadOnlyClaim({...claim(),tenantId:uid("7")},expected),/out-of-scope/);
 assert.throws(()=>validateCrmReadOnlyClaim({...claim(),modelKey:"gpt-foreign"},expected),/out-of-scope/);
 assert.throws(()=>validateCrmReadOnlyClaim({...claim(),allowedTools:["crm.read"]},expected),/out-of-scope/);
 assert.throws(()=>validateCrmReadOnlyClaim({...claim(),aggregate:{...claim().aggregate,
   leadName:"Private CRM person"}},expected),/Unverified aggregate/);
 assert.throws(()=>validateCrmReadOnlyClaim({...claim(),aggregate:{...claim().aggregate,
   qualifiedLeads:3}},expected),/Unsafe small-group/);
 assert.throws(()=>validateCrmReadOnlyClaim({...claim(),aggregate:{...claim().aggregate,
   totalLeads:5}},expected),/Unverified aggregate/);
 assert.throws(()=>validateCrmReadOnlyClaim({...claim(),aggregate:{...claim().aggregate,
   asOfUtc:"2020-01-01T00:00:00Z"}},expected),/expired/);
});

test("provider payload has no tools, storage, customer names or arbitrary URLs",()=>{
 const payload=buildCrmReadOnlyPayload(claim(),expected);
 assert.equal(payload.model,"gpt-4.1-mini");
 assert.equal(payload.tool_choice,"none");
 assert.equal(payload.store,false);
 assert.equal(payload.background,false);
 assert.equal(payload.stream,false);
 assert.equal(payload.parallel_tool_calls,false);
 assert.deepEqual(payload.tools,[]);
 assert.equal(payload.max_output_tokens,160);
 assert.ok(!JSON.stringify(payload).includes(uid("6")));
 assert.ok(!JSON.stringify(payload).includes("Private CRM person"));
 assert.match(payload.input[0].content,/small/i);
});

test("one fixed-origin OpenAI read-only request returns usage-backed, human-review-only receipt",async()=>{
 const calls=[];
 const receipt=await performReadOnlyCrmModelCall({
  claim:claim(),expected,providerToken:token,
  fetcher:async(url,opts)=>{calls.push({url,opts});return fakeResponse(providerData());},
 });
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,OPENAI_RESPONSE_ORIGIN);
 assert.equal(calls[0].opts.method,"POST");
 assert.equal(calls[0].opts.redirect,"error");
 assert.deepEqual(JSON.parse(calls[0].opts.body).tools,[]);
 assert.equal(receipt.dataOrigin,"first_party_crm_aggregate");
 assert.equal(receipt.modelCalls,1);
 assert.equal(receipt.toolCalls,0);
 assert.equal(receipt.customerActions,0);
 assert.equal(receipt.reviewRequired,true);
 assert.equal(receipt.sourceHash,"a".repeat(32));
 assert.equal(receipt.inputTokens,180);
 assert.equal(receipt.cachedInputTokens,0);
 assert.equal(receipt.outputTokens,80);
 assert.equal(receipt.providerReceiptId,"resp_123456789abcdef");
});

test("no-tool adapter rejects malicious output, incomplete billing usage and oversize response",async()=>{
 const base={claim:claim(),expected,providerToken:token};
 await assert.rejects(performReadOnlyCrmModelCall({...base,
  fetcher:async()=>fakeResponse({...providerData(),
   output:[{type:"function_call",name:"send_whatsapp"}]})}),/tool output/);
 await assert.rejects(performReadOnlyCrmModelCall({...base,
  fetcher:async()=>fakeResponse({...providerData(),usage:null})}),/usage/);
 await assert.rejects(performReadOnlyCrmModelCall({...base,
  fetcher:async()=>fakeResponse({...providerData(),usage:{input_tokens:5000,output_tokens:30}})}),/usage/);
 await assert.rejects(performReadOnlyCrmModelCall({...base,
  fetcher:async()=>fakeResponse({...providerData(),id:"invalid"})}),/receipt/);
 await assert.rejects(performReadOnlyCrmModelCall({...base,
  fetcher:async()=>({ok:true,headers:{get:()=>String(99999)},text:async()=>"{}"})}),/too large/);
});
test("worker runs one job and rechecks transaction; denied finalisation holds reservation",async()=>{
 const db=fakeDb();
 const result=await runReadOnlyCrmPass({db,scope,fetcher:async()=>fakeResponse(providerData())});
 assert.equal(result.claimed,1);assert.equal(result.waitingReview,1);
 assert.equal(result.reconciliationRequired,0);assert.equal(result.customerActions,0);
 assert.equal(db.calls.length,2);
 assert.equal(db.calls[1].name,"finish_ai_workforce_readonly_job");
 assert.equal(db.calls[1].args._receipt.modelCalls,1);
 const revoked=fakeDb([claim()],true);
 const guarded=await runReadOnlyCrmPass({db:revoked,scope,fetcher:async()=>fakeResponse(providerData())});
 assert.equal(guarded.waitingReview,0);assert.equal(guarded.reconciliationRequired,1);
 assert.equal(revoked.calls[2].name,"flag_ai_workforce_readonly_reconciliation");
 assert.equal(revoked.calls[2].args._reason,"Provider outcome requires manual metering review");
});
test("no pilot and wrong tenant block worker before any billable call",async()=>{
 const db=fakeDb();
 await assert.rejects(runReadOnlyCrmPass({db,scope:{...scope,enabled:false}}),/explicitly authorised/);
 assert.equal(db.calls.length,0);
 let used=false;
 const wrong=fakeDb([{...claim(),tenantId:uid("9")}]);
 const result=await runReadOnlyCrmPass({db:wrong,scope,fetcher:async()=>{used=true;return fakeResponse(providerData());}});
 assert.equal(used,false);assert.equal(result.reconciliationRequired,1);
 await assert.rejects(main({}),/disabled/);
 await assert.rejects(main({AI_WORKFORCE_READONLY_PILOT_ENABLED:"true",
  AI_WORKFORCE_READONLY_CONFIRM:"CONSENTED_AGGREGATE_APPROVED",NODE_ENV:"production"}),/disabled/);
});
test("SQL source consent, budgets, isolation and metering are fail-closed",async()=>{
 const files=[
 "supabase/migrations/20261020210000_ai_workforce_readonly_consent_v4d.sql",
 "supabase/migrations/20261020211000_ai_workforce_readonly_admission_v4d.sql",
 "supabase/migrations/20261020212000_ai_workforce_readonly_worker_v4d.sql",
 ];
 const [consent,admit,worker]=await Promise.all(files.map(read));
 assert.match(consent,/DEFAULT false/);
 assert.match(consent,/FORCE ROW LEVEL SECURITY/);
 assert.match(consent,/s\.requester_id=auth\.uid\(\)/);
 assert.match(consent,/Independent CRM data-access reviewer required/);
 assert.match(consent,/auth\.role\(\) IS DISTINCT FROM 'service_role'/);
 assert.match(consent,/interval '24 hours'/);
 assert.doesNotMatch(consent,/INSERT INTO public\.tenant_services/);
 assert.match(admit,/public\.queue_budgeted_ai_agent\(/);
 assert.match(admit,/INSERT INTO public\.ai_workforce_readonly_admissions/);
 assert.match(admit,/FROM public\.crm_leads/);
 assert.match(admit,/source_total<10/);
 assert.match(admit,/qualified_count>=5/);
 assert.match(admit,/Latest model tariff lacks verified tenant-country clearance/);
 assert.match(admit,/_provider IS DISTINCT FROM 'openai'/);
 assert.match(admit,/cardinality\(t\.requested_capabilities\)<>0/);
 assert.match(admit,/allowedTools|noTools/);
 assert.match(admit,/j\.job_type NOT IN \('ai-workforce\.fixture','ai-workforce\.readonly'\)/);
 assert.doesNotMatch(admit,/INSERT INTO public\.ai_agent_runs/);
 assert.match(worker,/claim_ai_workforce_readonly_jobs/);
 assert.match(worker,/finish_ai_workforce_readonly_job/);
 assert.match(worker,/public\.settle_budgeted_ai_agent/);
 assert.match(worker,/flag_ai_workforce_readonly_reconciliation/);
 assert.match(worker,/response_ref IS NOT NULL/);
 assert.match(worker,/reservatio(n|nHeld)/);
 assert.match(worker,/review_ai_workforce_readonly_result/);
 assert.match(worker,/humanReviewed/);
 assert.match(worker,/noTools|toolCalls/);
});
test("UI/API compile with no direct browser SQL mutation",async()=>{
 const files=[
 "src/modules/ai-workforce/readonly.functions.ts",
 "src/modules/ai-workforce/AIWorkforceReadonlyPanel.tsx",
 "src/modules/ai-workforce/AIWorkforceTaskPanel.tsx",
 ];
 for(const path of files){
  const source=await read(path);
  const compiled=ts.transpileModule(source,{fileName:path,reportDiagnostics:true,
   compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,
     jsx:ts.JsxEmit.ReactJSX}});
  const errors=(compiled.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,path+": "+errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,"\n")).join(", "));
  if(path.endsWith("ReadonlyPanel.tsx")){
   assert.match(source,/queueAiWorkforceReadonlyAnalysis/);
   assert.match(source,/Independent source approval|Approve consent/);
   assert.doesNotMatch(source,/\bfetch\(|\.rpc\(|\.from\(/);
  }
 }
});
