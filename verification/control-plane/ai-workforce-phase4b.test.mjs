import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {createSyntheticReceipt,permittedFixtures} from "../../services/ai-workforce-sandbox/fixtures.mjs";
import {runFixtureSandboxPass,main} from "../../services/ai-workforce-sandbox/worker.mjs";

const read=path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
const migration=await read("supabase/migrations/20261018210000_ai_workforce_fixture_sandbox_v4b.sql");
const api=await read("src/modules/ai-workforce/sandbox.functions.ts");
const panel=await read("src/modules/ai-workforce/AIWorkforceSandboxPanel.tsx");
const taskPanel=await read("src/modules/ai-workforce/AIWorkforceTaskPanel.tsx");
const worker=await read("services/ai-workforce-sandbox/worker.mjs");
const claim={
 admissionId:"11111111-1111-4111-8111-111111111111",
 jobId:"22222222-2222-4222-8222-222222222222",
 tenantId:"33333333-3333-4333-8333-333333333333",
 productKey:"omniqora",
 employeeId:"44444444-4444-4444-8444-444444444444",
 taskId:"55555555-5555-4555-8555-555555555555",
 fixtureKey:"fixture.crm.pipeline",
 employeeRevision:1,taskRevision:1,maxSteps:1,syntheticOnly:true,
};
const workerRef="fixture_Worker_01";
function fakeDb(claims=[claim],failFinish=false){
 const calls=[];
 return {calls,async rpc(method,args){
  calls.push({method,args});
  if(method==="claim_ai_workforce_fixture_rehearsals")return {data:claims,error:null};
  if(method==="finish_ai_workforce_fixture_rehearsal"){
   if(failFinish&&args._success)return {data:null,error:{message:"pilot revoked"}};
   return {data:{status:args._success?"completed":"failed",costMinor:0,syntheticOnly:true},error:null};
  }
  throw new Error("Unexpected database function "+method);
 }};
}
test("fixture renderer uses only hard-coded synthetic evidence and does not execute tools",()=>{
 assert.deepEqual(permittedFixtures,["fixture.crm.pipeline","fixture.dishbee.orders","fixture.finance.cashflow"]);
 for(const key of permittedFixtures){
  const result=createSyntheticReceipt({...claim,fixtureKey:key});
  assert.equal(result.fixtureKey,key);
  assert.equal(result.dataOrigin,"synthetic_fixture");
  assert.equal(result.reviewRequired,true);
  assert.equal(result.customerDataRead,false);
  assert.equal(result.modelCalls,0);
  assert.equal(result.toolCalls,0);
  assert.equal(result.costMinor,0);
  assert.equal(result.noExternalActions,true);
  assert.ok(result.findings.length>0);
  assert.ok(result.citations.every(x=>x.kind==="synthetic_fixture"));
  assert.ok(!JSON.stringify(result).includes("SENSITIVE_CUSTOMER"));
 }
 const crm=createSyntheticReceipt(claim);
 assert.equal(crm.findings[0].value,60);
 assert.equal(crm.findings[1].value,44.4);
 const finance=createSyntheticReceipt({...claim,fixtureKey:"fixture.finance.cashflow"});
 assert.equal(finance.findings[0].value,1010000);
});
test("rehearsal worker is disabled by default and refuses foreign/fabricated claims",async()=>{
 const db=fakeDb();
 await assert.rejects(runFixtureSandboxPass({db,...{
  tenantId:claim.tenantId,productKey:claim.productKey,workerRef,limit:2,
 }}),/explicitly enabled/);
 assert.equal(db.calls.length,0);
 await assert.rejects(runFixtureSandboxPass({db,tenantId:claim.tenantId,productKey:claim.productKey,
   workerRef,enabled:true,limit:6}),/Invalid sandbox worker scope/);
 const foreign=fakeDb([{...claim,tenantId:"66666666-6666-4666-8666-666666666666"}]);
 await assert.rejects(runFixtureSandboxPass({db:foreign,tenantId:claim.tenantId,productKey:claim.productKey,
   workerRef,enabled:true}),/Cross-scope/);
 assert.equal(foreign.calls.length,1);
 assert.throws(()=>createSyntheticReceipt({...claim,fixtureKey:"https://malicious.example"}),
   /Untrusted/);
 assert.throws(()=>createSyntheticReceipt({...claim,maxSteps:999}),/Unbounded/);
 assert.throws(()=>createSyntheticReceipt({...claim,taskRevision:-1}),/Unbounded/);
});
test("one worker pass can finish only bounded fixture jobs, with terminal failure on revoke",async()=>{
 const db=fakeDb();
 const response=await runFixtureSandboxPass({db,tenantId:claim.tenantId,productKey:claim.productKey,
   workerRef,enabled:true,limit:1});
 assert.equal(response.claimed,1);assert.equal(response.completed,1);
 assert.equal(response.failed,0);assert.equal(response.modelCalls,0);
 assert.equal(response.toolCalls,0);assert.equal(response.costMinor,0);
 assert.equal(db.calls.length,2);
 assert.equal(db.calls[1].args._result.fixtureKey,claim.fixtureKey);
 assert.equal(db.calls[1].args._result.modelCalls,0);
 const rejectDb=fakeDb([claim],true);
 const reject=await runFixtureSandboxPass({db:rejectDb,tenantId:claim.tenantId,productKey:claim.productKey,
  workerRef,enabled:true,limit:2});
 assert.equal(reject.completed,0);
 assert.equal(reject.failed,1);
 assert.equal(rejectDb.calls.length,3);
 assert.equal(rejectDb.calls[2].args._success,false);
 assert.equal(rejectDb.calls[2].args._error,"synthetic rehearsal failed");
});
test("manual CLI refuses without explicit environment before loading clients or providers",async()=>{
 await assert.rejects(main({}),/disabled/);
 await assert.rejects(main({
 AI_WORKFORCE_SANDBOX_RUNNER_ENABLED:"true",SUPABASE_URL:"http://127.0.0.1/",
 AI_WORKFORCE_ALLOWED_DATABASE_HOST:"127.0.0.1",
 }),/HTTPS Supabase host/);
 await assert.rejects(main({
 AI_WORKFORCE_SANDBOX_RUNNER_ENABLED:"true",SUPABASE_URL:"https://evil.supabase.co/",
 AI_WORKFORCE_ALLOWED_DATABASE_HOST:"expected.supabase.co",
 }),/explicitly approved HTTPS/);
});
test("migration separates sandbox admissions from real agent/model execution",()=>{
 for(const name of ["ai_workforce_sandbox_pilots","ai_workforce_sandbox_admissions"])
  assert.match(migration,new RegExp("CREATE TABLE public\\."+name));
 assert.match(migration,/enabled boolean NOT NULL DEFAULT false/);
 assert.match(migration,/_expires_at>now\(\)\+interval '7 days'/);
 assert.match(migration,/daily_limit BETWEEN 1 AND 20/);
 assert.match(migration,/GRANT SELECT ON public\.%I TO authenticated/);
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/j\.job_type <> 'ai-workforce\.fixture'/);
 assert.match(migration,/CREATE FUNCTION public\.claim_ai_workforce_fixture_rehearsals/);
 assert.match(migration,/FOR UPDATE OF a,j SKIP LOCKED/);
 assert.match(migration,/CREATE FUNCTION public\.finish_ai_workforce_fixture_rehearsal/);
 assert.match(migration,/Pilot disabled or employee\/task revision revoked mid-flight/);
 assert.match(migration,/Independent approved no-tool employee brief required/);
 assert.match(migration,/Independent approved Agent Factory use case required/);
 assert.match(migration,/Sandbox daily quota exceeded/);
 assert.match(migration,/Sandbox idempotency payload changed/);
 assert.match(migration,/canExecute|noExternalCalls/);
 assert.match(migration,/FROM PUBLIC,anon,authenticated/);
 assert.match(migration,/TO service_role/);
 assert.doesNotMatch(migration,/INSERT INTO public\.ai_agent_runs/);
 assert.doesNotMatch(migration,/INSERT INTO public\.ai_budgeted_run_reservations/);
 assert.doesNotMatch(migration,/INSERT INTO public\.tenant_services/);
});
test("tenant-scoped UI and server contain no model/tool/webhook execution path",()=>{
 assert.match(api,/requireService\(context,tenantId,"omniqora\.ai-workforce"\)/);
 assert.match(api,/requireAdminRole\(access\.role\)/);
 assert.match(api,/Refused an unverified fixture queue result/);
 assert.match(panel,/synthetic sandbox/);
 assert.match(panel,/No approved sandbox pilot/);
 assert.match(panel,/Queue synthetic rehearsal/);
 assert.match(taskPanel,/AIWorkforceSandboxPanel/);
 assert.doesNotMatch(panel,/queueBudgetedFactoryTask|startAgentRun|\bfetch\(/);
 assert.doesNotMatch(api,/queue_budgeted_ai_agent|startAgentRun|\bfetch\(/);
 assert.doesNotMatch(worker,/api\.openai\.com|responses\/|tools:|executeTool|fetch\(https:\/\//);
 for(const [filename,content] of [
  ["sandbox.functions.ts",api],["AIWorkforceSandboxPanel.tsx",panel],["AIWorkforceTaskPanel.tsx",taskPanel]
 ]){
  const compiled=ts.transpileModule(content,{fileName:filename,reportDiagnostics:true,compilerOptions:{
   jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
  assert.equal((compiled.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,
   filename+": no parsing errors");
 }
});
