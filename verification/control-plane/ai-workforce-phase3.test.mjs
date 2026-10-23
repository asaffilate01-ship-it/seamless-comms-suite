import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../../" + path, import.meta.url), "utf8");
const migration = await read("supabase/migrations/20261018110000_ai_workforce_phase3.sql");
const api = await read("src/modules/ai-workforce/functions.ts");
const ui = await read("src/modules/ai-workforce/AIWorkforcePanel.tsx");
const route = await read("src/routes/_authenticated/app.ai-employees.tsx");
const nav = await read("src/components/app/shell.tsx");
const workflow = await read(".github/workflows/verify.yml");

test("AI Workforce add-on is never activated implicitly", () => {
  assert.match(migration, /'omniqora\.ai-workforce'/);
  assert.match(migration, /'manual','beta'/);
  assert.match(migration, /VALUES \('omniqora','omniqora\.ai-workforce',false,false/);
  assert.doesNotMatch(migration, /INSERT INTO public\.tenant_services/);
  assert.doesNotMatch(migration, /INSERT INTO public\.provider_bindings/);
  assert.doesNotMatch(migration, /INSERT INTO public\.ai_agent_runs/);
  assert.doesNotMatch(migration, /INSERT INTO public\.intelligence_jobs/);
  assert.match(migration, /AI Workforce entitlement required/);
  assert.match(api, /requireService\(context, data\.tenantId, "omniqora\.ai-workforce"\)/);
});

test("every employee and immutable history table carries the tenant + product scope", () => {
  for (const name of ["ai_employees", "ai_employee_revisions",
    "ai_employee_audit_events", "ai_employee_previews"]) {
    assert.match(migration, new RegExp("CREATE TABLE public\\." + name));
    assert.match(migration, new RegExp("'" + name + "'"));
  }
  assert.match(migration, /FOREIGN KEY \(employee_id,tenant_id,product_key\)/);
  assert.match(migration, /FOREIGN KEY \(tenant_id,product_key\)/);
  assert.match(migration, /FOREIGN KEY \(ai_employee_id,tenant_id,product_key\)/);
  assert.match(migration, /ALTER TABLE public\.ai_agent_runs ADD COLUMN IF NOT EXISTS ai_employee_id uuid/);
  assert.match(migration, /REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT SELECT ON public\.%I TO authenticated/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  // The outer table qualifier is essential. An unqualified tenant_id here
  // would bind to tenant_members and make the comparison always true.
  assert.match(migration, /m\.tenant_id=%I\.tenant_id AND m\.user_id=auth\.uid\(\)/);
  assert.doesNotMatch(migration, /m\.tenant_id=tenant_id/);
  assert.match(migration, /m\.role IN \('owner','admin'\)/);
  assert.match(migration, /WHERE id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE/);
});

test("approval is independently reviewed and profile edits reset prior approval", () => {
  assert.match(migration, /auth\.uid\(\) IN \(e\.created_by,e\.last_edited_by\)/);
  assert.match(migration, /Independent reviewer required/);
  assert.match(migration, /status='draft',reviewed_by=NULL,reviewed_at=NULL/);
  assert.match(migration, /CREATE TABLE public\.ai_employee_revisions/);
  assert.match(migration, /UNIQUE\(id,tenant_id,product_key\)/);
  for (const action of ["submit", "approve", "reject", "pause", "resume", "retire"]) {
    assert.match(migration, new RegExp("WHEN '" + action + "' THEN"));
  }
  assert.match(migration, /'approved_configuration'/);
  assert.doesNotMatch(migration, /status IN \([^)]*'running'/);
});

test("capabilities and schedules are proposals, never live grants", () => {
  assert.match(api, /data\.profile\.capabilities\.some\(key => !allowed\.includes\(key\)\)/);
  assert.match(api, /enabled: false/);
  assert.match(migration, /'trigger',jsonb_build_object\('type',trigger_type,'value',trigger_value,'enabled',false\)/);
  assert.match(migration, /No Phase 3 path creates a model job/);
  assert.match(ui, /No OAuth, MCP, account or permission becomes connected/);
  assert.match(ui, /No scheduler or event subscriber is activated/);
  assert.doesNotMatch(ui, /queueBudgetedFactoryTask|startAgentRun|\bfetch\(/);
  assert.doesNotMatch(api, /queue_budgeted_ai_agent|startAgentRun|fetch\(/);
});

test("safe preview records non-execution and missing live readiness", () => {
  assert.match(migration, /'mode','configuration_preview_only','executed',false,'modelCalls',0/);
  assert.match(migration, /'toolCalls',0,'scheduleEnabled',false,'canExecute',false/);
  assert.match(migration, /'live_connectors_verified','passed',false/);
  assert.match(migration, /'worker_execution_verified','passed',false/);
  assert.match(ui, /Step \{step \+ 1\} of 10/);
  assert.match(ui, /Recorded preview/);
  assert.match(ui, /Approved configs/);
  assert.match(ui, /audit history/i);
  assert.match(api, /\.not\("ai_employee_id", "is", null\)/);
});

test("server-only mutations and input bounds cannot be bypassed by browser", () => {
  assert.match(api, /requireSupabaseAuth/);
  assert.match(api, /requireAdminRole\(access\.role\)/);
  assert.match(api, /workforceProfileSchema/);
  assert.match(api, /\.strict\(\)/);
  assert.match(api, /Unknown blueprint for this SaaS product/);
  for (const rpc of ["create_ai_employee_draft", "save_ai_employee_profile",
    "transition_ai_employee", "preview_ai_employee"]) {
    assert.match(api, new RegExp('"'+rpc+'"'));
    assert.match(migration, new RegExp("REVOKE ALL ON FUNCTION public\\."+rpc+"\\("));
  }
  assert.match(migration, /length\(_profile::text\)>30000/);
  assert.match(migration, /Unsupported AI employee profile field/);
  assert.match(migration, /Unsupported proposed trigger/);
  assert.match(migration, /jsonb_object_keys\(_profile\) AS keys\(field_name\)/);
  assert.doesNotMatch(ui, /\.from\("ai_employees"\)|\.rpc\(/);
});

test("route and navigation are present and source parses as TypeScript", () => {
  assert.match(route, /createFileRoute\("\/_authenticated\/app\/ai-employees"\)/);
  assert.match(nav, /to: "\/app\/ai-employees"/);
  assert.match(workflow, /name: Verify Omniqora integration/);
  for (const [path, source, tsx] of [
    ["functions.ts", api, false], ["AIWorkforcePanel.tsx", ui, true],
    ["app.ai-employees.tsx", route, true],
  ]) {
    const result = ts.transpileModule(source, {
      fileName: path,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    const errors = (result.diagnostics ?? []).filter(x => x.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, path + ": " + errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, "\n")));
  }
});
