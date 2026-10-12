import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const file=async(path)=>readFile(new URL("../../"+path,import.meta.url),"utf8");
const migration=await file("supabase/migrations/20261012180000_mcp_budgeted_ai_factory_v2.sql");

test("MCP requests have an independent approval and no automatic activation state",()=>{
 assert.match(migration,/CREATE TABLE public\.mcp_setup_requests/);
 assert.match(migration,/status IN\('requested','shortlisted','rejected','revoked'\)/);
 assert.match(migration,/rec\.requested_by=auth\.uid\(\)/);
 assert.match(migration,/Platform approval required/);
 assert.match(migration,/An active tenant product is required/);
 assert.match(migration,/Independent reviewer required/);
 assert.doesNotMatch(migration,/status IN\([^)]*'connected'/);
 assert.doesNotMatch(migration,/INSERT INTO public\.provider_bindings/);
 assert.doesNotMatch(migration,/INSERT INTO public\.tenants/);
});

test("budgets are atomic, tenant scoped, and cannot be forged with browser grants",()=>{
 for(const table of ["mcp_setup_requests","ai_reviewed_model_rates","ai_spend_budgets","ai_budgeted_run_reservations"]){
  assert.ok(migration.includes("public."+table),table);
 }
 assert.match(migration,/REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated/);
 assert.match(migration,/CREATE POLICY "ai budget scoped read"/);
 assert.match(migration,/CREATE POLICY "ai reservation scoped read"/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.queue_budgeted_ai_agent/);
 assert.match(migration,/SELECT \* INTO account FROM public\.ai_spend_budgets[\s\S]+?FOR UPDATE/);
 assert.match(migration,/account\.spent_minor\+account\.reserved_minor\+estimate>account\.limit_minor/);
 assert.match(migration,/Current evaluated model price|No current evaluated model price/);
 assert.match(migration,/Fresh production provider verification required/);
 assert.match(migration,/verified_at>=now\(\)-interval '30 days'/);
 assert.match(migration,/last_verified_at>=now\(\)-interval '24 hours'/);
 assert.match(migration,/RISK|risk_required:=CASE/i);
 assert.match(migration,/Idempotency payload changed/);
 assert.match(migration,/COALESCE\(member_role,''\) NOT IN/);
 assert.match(migration,/allowedTools',uc\.allowed_tools/);
 assert.match(migration,/sourcePermissionsRequired',true/);
 assert.match(migration,/INSERT INTO public\.ai_agent_runs/);
 assert.match(migration,/INSERT INTO public\.intelligence_jobs/);
 assert.match(migration,/INSERT INTO public\.ai_budgeted_run_reservations/);
});

test("settlement is denied to clients and reports provider overspend",()=>{
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.settle_budgeted_ai_agent\(uuid,bigint,text\) FROM PUBLIC,anon,authenticated/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.settle_budgeted_ai_agent\(uuid,bigint,text\) TO service_role/);
 assert.match(migration,/CASE WHEN _actual_minor>res\.reserved_minor THEN 'overage' ELSE 'settled'/);
 assert.match(migration,/provider_receipt_ref=_receipt_ref AND res\.actual_minor=_actual_minor/);
 assert.match(migration,/reserved_minor=reserved_minor-res\.reserved_minor,spent_minor=spent_minor\+_actual_minor/);
});

test("operator UI routes through trusted RPCs with no browser tool execution",async()=>{
 const server=await file("src/modules/agent-factory/operations.functions.ts");
 const ui=await file("src/modules/agent-factory/AgentFactoryPanel.tsx");
 const reviewer=await file("src/routes/_authenticated/app.mcp-review.tsx");
 const legacy=await file("src/modules/intelligence/functions.ts");
 for(const r of ["getAgentFactoryOperations","setAgentFactoryBudget","requestAgentMcpSetup","queueBudgetedFactoryTask"]){
  assert.match(server,new RegExp(r));
 }
 assert.match(server,/\.rpc\("queue_budgeted_ai_agent"/);
 assert.match(server,/\.rpc\("request_mcp_setup"/);
 assert.match(server,/\.rpc\("configure_ai_spend_budget"/);
 assert.match(server,/requireAdminRole\(access\.role\)/);
 assert.match(server,/requireService\(context,data\.tenantId,"omniqora\.intelligence-runtime"\)/);
 assert.match(ui,/queueBudgetedFactoryTask/);
 assert.match(ui,/monthly AI spending/i);
 assert.match(ui,/Request setup review/);
 assert.match(ui,/modelKey:currentRate\.model_key/);
 assert.match(reviewer,/reviewAgentMcpSetup/);
 assert.match(reviewer,/Shortlist for secure setup/);
 assert.match(legacy,/AI Factory tasks require the budgeted task queue/);
 assert.doesNotMatch(ui,/startAgentRun/);
 assert.doesNotMatch(ui,/\.from\("ai_spend_budgets"\)/);
});

test("budget configuration and reviewed tariffs do not imply funded or live accounts",async()=>{
 const doc=await file("docs/ai-factory/MCP-BUDGET-PHASE2.md");
 assert.match(doc,/not a usable connection/i);
 assert.match(doc,/No third-party MCP tool is invoked/i);
 assert.match(doc,/No model is automatically invoked/i);
 assert.match(doc,/reservation.*not actual expenditure/i);
 assert.doesNotMatch(migration,/INSERT INTO public\.ai_reviewed_model_rates/);
 assert.doesNotMatch(migration,/INSERT INTO public\.tenant_services/);
});
