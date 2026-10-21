import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {executeOperatorAction,main} from "../../services/ai-workforce-readonly/operator-ops.mjs";

const read=path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
const sql=await read("supabase/migrations/20261021073000_ai_workforce_operator_safety_v4e.sql");
const ops=await read("src/modules/ai-workforce/operations.functions.ts");
const panel=await read("src/modules/ai-workforce/AIWorkforceOperationsPanel.tsx");
const parent=await read("src/modules/ai-workforce/AIWorkforceReadonlyPanel.tsx");
const worker=await read("services/ai-workforce-readonly/operator-ops.mjs");
const staging=await read("verification/staging/ai-workforce-phase4e-operator.sql");
const fixture=await read("verification/staging/ai-workforce-phase4d-access.sql");
const testingRunner=await read("verification/staging/ai-workforce-phase4a-access.sql");

const defaultScope={
  enabled:true,tenantId:"11111111-1111-4111-8111-111111111111",productKey:"omniqora",
  workerRef:"trusted_worker_01",modelKey:"gpt-4.1-mini",
  action:"allow",maxClaims:2,
  operatorReference:"Staging administrator approved one supervised worker",
  evidenceReference:"https://example.test/workforce/verified-attestation",
  minimumAgeMinutes:15,limit:10,
};
function fakeDB(){
 const calls=[];
 return {calls,async rpc(method,args){
  calls.push({method,args});
  if(method==="configure_ai_workforce_worker_allowlist")
   return {data:{status:args._enabled?"active":"disabled",max_claims:args._max_claims,
     used_claims:0},error:null};
  if(method==="emergency_stop_ai_workforce_readonly")
   return {data:{pilotEnabled:false,workerPermitsRevoked:1,reservationsReleased:0},error:null};
  if(method==="quarantine_stale_ai_workforce_readonly")
   return {data:{quarantined:1,reservationsReleased:0},error:null};
  throw new Error("Unexpected RPC");
 }};
}
test("worker leases are operator-only, tenant-scoped and disabled by default",()=>{
 assert.match(sql,/CREATE TABLE public\.ai_workforce_worker_allowlist/);
 assert.match(sql,/CREATE TABLE public\.ai_workforce_operator_events/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/m\.tenant_id=%I\.tenant_id AND m\.user_id=auth\.uid\(\)/);
 assert.match(sql,/auth\.role\(\) IS DISTINCT FROM 'service_role'/);
 assert.match(sql,/status text NOT NULL DEFAULT 'disabled'/);
 assert.match(sql,/expires_at>now\(\)\+interval '2 hours'/);
 assert.match(sql,/Cannot silently renew an active worker permit/);
 assert.match(sql,/FOREIGN KEY\(tenant_id,product_key\)/);
 assert.doesNotMatch(sql,/INSERT INTO public\.tenant_services|INSERT INTO public\.provider_bindings/);
});
test("database trigger denies unapproved, exhausted, wrong-model or revoked claims",()=>{
 assert.match(sql,/CREATE TRIGGER ai_workforce_readonly_lease_guard/);
 assert.match(sql,/BEFORE UPDATE OF status ON public\.ai_workforce_readonly_admissions/);
 assert.match(sql,/OLD\.status='queued' AND NEW\.status='processing'/);
 assert.match(sql,/att\.status<>'active'/);
 assert.match(sql,/att\.model_key<>NEW\.model_key/);
 assert.match(sql,/att\.used_claims>=att\.max_claims/);
 assert.match(sql,/used_claims=used_claims\+1/);
 assert.match(sql,/Worker permission revoked before result settlement/);
 assert.match(sql,/OLD\.status='processing' AND NEW\.status='reconciliation_required'/);
 assert.match(sql,/uncertain_usage_held/);
});
test("stale processing never silently releases provider budget",()=>{
 assert.match(sql,/CREATE FUNCTION public\.quarantine_stale_ai_workforce_readonly/);
 assert.match(sql,/j\.locked_at<=now\(\)-make_interval\(mins=>_minutes\)/);
 assert.match(sql,/FOR UPDATE OF a,j,r,b SKIP LOCKED/);
 assert.match(sql,/status='reconciliation_required',finished_at=now\(\)/);
 assert.match(sql,/status='waiting_review'/);
 assert.match(sql,/'reservationsReleased',0/);
 assert.doesNotMatch(sql,/UPDATE public\.ai_spend_budgets/);
 assert.doesNotMatch(sql,/public\.settle_budgeted_ai_agent\(/);
});
test("emergency operator stop revokes permits and preserves uncertain provider billing",()=>{
 assert.match(sql,/CREATE FUNCTION public\.emergency_stop_ai_workforce_readonly/);
 assert.match(sql,/SET enabled=false,expires_at=now\(\),updated_at=now\(\)/);
 assert.match(sql,/status='revoked',expires_at=now\(\)/);
 assert.match(sql,/pilot_emergency_stopped/);
 assert.match(sql,/'reservationsReleased',0/);
});
test("operator CLI refuses invalid scopes and never calls provider or database by default",async()=>{
 const db=fakeDB();
 await assert.rejects(executeOperatorAction({db,scope:{...defaultScope,enabled:false}}),/scope refused/);
 await assert.rejects(executeOperatorAction({db,scope:{...defaultScope,workerRef:"bad!"}}),/approval evidence/);
 await assert.rejects(executeOperatorAction({db,scope:{...defaultScope,action:"quarantine",minimumAgeMinutes:1}}),/watchdog/);
 assert.equal(db.calls.length,0);
 await assert.rejects(main({}),/disabled/);
 await assert.rejects(main({AI_WORKFORCE_OPS_ENABLED:"true",
   AI_WORKFORCE_OPS_CONFIRM:"MANUAL_STAGING_APPROVED",NODE_ENV:"production"}),/disabled/);
 assert.doesNotMatch(worker,/api\.openai\.com|queue_budgeted_ai_agent|intelligence_jobs.*insert/i);
 assert.match(worker,/MANUAL_STAGING_APPROVED/);
});
test("operator one-pass allowlist, quarantine and kill-switch API are strict",async()=>{
 const db=fakeDB();
 const allow=await executeOperatorAction({db,scope:defaultScope});
 assert.equal(allow.status,"active");
 assert.equal(db.calls[0].method,"configure_ai_workforce_worker_allowlist");
 assert.equal(db.calls[0].args._tenant,defaultScope.tenantId);
 assert.equal(db.calls[0].args._max_claims,2);
 const deny=await executeOperatorAction({db,scope:{...defaultScope,action:"disable"}});
 assert.equal(deny.status,"disabled");
 assert.equal(db.calls[1].args._enabled,false);
 const watch=await executeOperatorAction({db,scope:{...defaultScope,action:"quarantine"}});
 assert.equal(watch.quarantined,1);assert.equal(watch.reservationsReleased,0);
 const stop=await executeOperatorAction({db,scope:{...defaultScope,action:"stop"}});
 assert.equal(stop.pilotEnabled,false);assert.equal(stop.reservationsReleased,0);
 assert.equal(db.calls.length,4);
});
test("real disposable SQL fixture demonstrates RLS, refusal and kill switch",()=>{
 assert.match(fixture,/configure_ai_workforce_worker_allowlist/);
 assert.match(staging,/Missing operations RLS/);
 assert.match(staging,/Viewer saw worker permit metadata/);
 assert.match(staging,/Foreign tenant saw employee worker permits/);
 assert.match(staging,/Unapproved worker changed admission to processing/);
 assert.match(staging,/Cannot silently renew/);
 assert.match(staging,/emergency_stop_ai_workforce_readonly/);
 assert.match(staging,/quarantine_stale_ai_workforce_readonly/);
 assert.match(testingRunner,/ai-workforce-phase4e-operator\.sql/);
});
test("tenant operations UI is read-only and does not leak privileged service credentials",()=>{
 assert.match(ops,/requireSupabaseAuth/);
 assert.match(ops,/requireService\(context,data\.tenantId,"omniqora\.ai-workforce"\)/);
 assert.match(ops,/requireAdminRole\(access\.role\)/);
 assert.match(panel,/AI Workforce operations and safety/);
 assert.match(panel,/Emergency stop and stale-job quarantine/);
 assert.match(parent,/AIWorkforceOperationsPanel/);
 assert.doesNotMatch(panel,/\.rpc\(|\.from\(|\bfetch\(/);
 assert.doesNotMatch(ops,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(ops,/heldReservesByCurrency/);
 for(const [name,text] of [["operations.functions.ts",ops],["AIWorkforceOperationsPanel.tsx",panel]]){
  const result=ts.transpileModule(text,{fileName:name,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
      jsx:ts.JsxEmit.ReactJSX}});
  const errors=(result.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,name+": "+errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,"\n")));
 }
});
