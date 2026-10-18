import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../../" + path, import.meta.url), "utf8");
const sql = await read("supabase/migrations/20261018130000_ai_workforce_tasks_access_preflight.sql");
const api = await read("src/modules/ai-workforce/tasks.functions.ts");
const ui = await read("src/modules/ai-workforce/AIWorkforceTaskPanel.tsx");
const parent = await read("src/modules/ai-workforce/AIWorkforcePanel.tsx");

test("task control is a scoped Phase 3 extension, without new execution engines", () => {
  for (const table of ["ai_employee_tasks", "ai_employee_task_events", "ai_employee_access_proposals"]) {
    assert.match(sql, new RegExp("CREATE TABLE public\\." + table));
  }
  assert.match(sql, /FOREIGN KEY \(employee_id,tenant_id,product_key\)/);
  assert.match(sql, /FOREIGN KEY \(task_id,tenant_id,product_key\)/);
  assert.match(sql, /UNIQUE \(tenant_id,product_key,request_key\)/);
  assert.doesNotMatch(sql, /INSERT INTO public\.ai_agent_runs|INSERT INTO public\.intelligence_jobs/);
  assert.doesNotMatch(sql, /INSERT INTO public\.tenant_services|INSERT INTO public\.provider_bindings/);
  assert.doesNotMatch(api, /queue_budgeted_ai_agent|startAgentRun|queueBudgetedFactoryTask/);
  assert.doesNotMatch(ui, /startAgentRun|queueBudgetedFactoryTask|\bfetch\(/);
  assert.match(parent, /selected && step === 9 && <AIWorkforceTaskPanel/);
});

test("SQL rejects direct mutations and enforces owner/admin tenant isolation", () => {
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.%I TO authenticated/);
  assert.match(sql, /m\.tenant_id=%I\.tenant_id AND m\.user_id=auth\.uid\(\)/);
  assert.match(sql, /m\.role IN\('owner','admin'\)/);
  assert.doesNotMatch(sql, /m\.tenant_id=tenant_id/);
  assert.match(sql, /PERFORM public\.ai_workforce_require_admin\(_tenant,_product\)/);
  assert.match(sql, /WHERE id=_task AND employee_id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE/);
  assert.match(api, /requireService\(context, tenantId, "omniqora\.ai-workforce"\)/);
  assert.match(api, /requireAdminRole\(access\.role\)/);
  assert.match(api, /requireSupabaseAuth/);
  for (const rpc of ["create_ai_employee_task", "transition_ai_employee_task",
    "request_ai_employee_access_review", "review_ai_employee_access_proposal",
    "preflight_ai_employee_task"]) {
    assert.match(api, new RegExp('"'+rpc+'"'));
    assert.match(sql, new RegExp("REVOKE ALL ON FUNCTION public\\."+rpc+"\\("));
  }
});

test("independent reviews are versioned and never grant live execution", () => {
  assert.match(sql, /auth\.uid\(\) IN\(t\.created_by,t\.last_edited_by\)/);
  assert.match(sql, /t\.employee_revision<>e\.revision/);
  assert.match(sql, /e\.status<>'approved_configuration'/);
  assert.match(sql, /approved employee configuration and draft brief required/i);
  assert.match(sql, /'approved_brief'/);
  assert.match(sql, /'shortlisted_metadata'/);
  assert.match(sql, /rec\.status<>'requested' OR auth\.uid\(\)=rec\.requested_by/);
  assert.match(sql, /RAISE EXCEPTION 'Independent access proposal reviewer required'/);
  assert.doesNotMatch(sql, /'connected'|'live_grant'|'executable'/);
});

test("idempotent work orders require exact payload match", () => {
  assert.match(sql, /_request_key uuid/);
  assert.match(sql, /request_key=_request_key/);
  assert.match(sql, /existing\.employee_id<>_employee/);
  assert.match(sql, /existing\.requested_capabilities<>caps OR existing\.proposed_trigger<>trig/);
  assert.match(sql, /Task idempotency payload changed/);
  assert.match(sql, /CREATE FUNCTION public\.ai_workforce_check_task_capabilities/);
  assert.match(sql, /Task capability was not proposed in employee profile/);
  assert.match(api, /requestKey: uuid/);
});

test("schedules are inert metadata and input validation rejects arbitrary cron/tool keys", () => {
  assert.match(sql, /CHECK \(jsonb_typeof\(proposed_trigger\)='object' AND proposed_trigger->'enabled'='false'::jsonb\)/);
  assert.match(sql, /Executable trigger proposal forbidden/);
  assert.match(sql, /Unrecognized trigger property/);
  assert.match(sql, /Unsupported or unsafe trigger proposal/);
  assert.match(sql, /RETURN jsonb_build_object\('type',kind,'value',value,'enabled',false\)/);
  assert.match(api, /enabled: z\.literal\(false\)/);
  assert.match(api, /\.strict\(\)\.refine\(trigger/);
  assert.match(ui, /saved inactive|saved inactive|saved disabled/i);
});

test("readiness report always fails closed on model/tool/provider permission", () => {
  assert.match(sql, /CREATE FUNCTION public\.preflight_ai_employee_task/);
  assert.match(sql, /employee_execution_not_deployed/);
  assert.match(sql, /capability_grants_not_verified/);
  assert.match(sql, /'canExecute',false,'modelCalls',0/);
  assert.match(sql, /'toolCalls',0,'queuedJobs',0/);
  assert.match(sql, /'scheduleEnabled',false/);
  assert.match(api, /result\.canExecute !== false/);
  assert.match(api, /result\.modelCalls !== 0 \|\| result\.toolCalls !== 0 \|\| result\.queuedJobs !== 0/);
  assert.match(ui, /Model calls: \{preflight\.modelCalls\}/);
  assert.match(ui, /Queued jobs: \{preflight\.queuedJobs\}/);
});

test("canonical run association stays locked pending a separately certified worker", () => {
  assert.match(sql, /CREATE FUNCTION public\.block_unverified_ai_employee_run_link\(\)/);
  assert.match(sql, /CREATE TRIGGER ai_workforce_run_link_locked/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF ai_employee_id ON public\.ai_agent_runs/);
  assert.match(sql, /NEW\.ai_employee_id IS DISTINCT FROM OLD\.ai_employee_id/);
  assert.match(sql, /AI employee run linkage disabled until certified workforce worker/);
});

test("new server and UI source compiles syntactically as strict TypeScript", () => {
  for (const [file, src] of [
    ["tasks.functions.ts", api], ["AIWorkforceTaskPanel.tsx", ui], ["AIWorkforcePanel.tsx", parent]
  ]) {
    const output = ts.transpileModule(src, {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    });
    const errs = (output.diagnostics ?? []).filter(d=>d.category===ts.DiagnosticCategory.Error);
    assert.equal(errs.length,0,file+": "+errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")).join(", "));
  }
});
