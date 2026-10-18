import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
const sql=await read("supabase/migrations/20261018231500_ruflo_orchestrator_pilot.sql");

test("Ruflo tenant isolation is read-only from browser and not seeded live",()=>{
 for(const table of ["ai_ruflo_pilot_requests","ai_ruflo_tenant_bindings","ai_ruflo_probe_receipts"])
  assert.match(sql,new RegExp("CREATE TABLE public\\."+table));
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT SELECT ON public\.%I TO authenticated/);
 assert.match(sql,/public\.is_tenant_member\(tenant_id,auth\.uid\(\)\)/);
 assert.match(sql,/status IN\('disabled','sandbox_verified','suspended'\)/);
 assert.match(sql,/allowed_probe_tools <@ ARRAY\['swarm_health','swarm_status','agent_list'\]/);
 assert.match(sql,/guard_ruflo_probe_receipt_scope/);
 assert.match(sql,/Ruflo run belongs to another tenant\/product/);
 assert.match(sql,/Ruflo job belongs to another tenant\/product/);
 assert.doesNotMatch(sql,/INSERT INTO public\.ai_ruflo_tenant_bindings/);
});
test("pilot review needs entitlement, correct tenant country and independent reviewer",()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.request_ruflo_pilot/);
 assert.match(sql,/m\.role IN\('owner','admin'\)/);
 assert.match(sql,/p\.status='active'/);
 assert.match(sql,/public\.has_tenant_entitlement\(_tenant,'omniqora\.intelligence-runtime'\)/);
 assert.match(sql,/_region IS DISTINCT FROM \(SELECT t\.country_code/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.review_ruflo_pilot/);
 assert.match(sql,/rec\.requested_by=auth\.uid\(\)/);
 assert.match(sql,/Independent reviewer required/);
 assert.match(sql,/does NOT provision ai_ruflo_tenant_bindings/);
});
test("existing authenticated AI control/UI integrates without arbitrary MCP execution",async()=>{
 const server=await read("src/modules/agent-factory/ruflo.functions.ts");
 const panel=await read("src/modules/agent-factory/RufloPilotPanel.tsx");
 const reviewer=await read("src/modules/agent-factory/RufloReviewPanel.tsx");
 const intelligence=await read("src/routes/_authenticated/app.intelligence.tsx");
 const mcpReview=await read("src/routes/_authenticated/app.mcp-review.tsx");
 assert.match(server,/requireTenantMembership\(context,data\.tenantId\)/);
 assert.match(server,/requireService\(context,data\.tenantId,"omniqora\.intelligence-runtime"\)/);
 assert.match(server,/requireAdminRole\(access\.role\)/);
 assert.match(server,/\.rpc\("request_ruflo_pilot"/);
 assert.match(server,/\.rpc\("review_ruflo_pilot"/);
 assert.match(server,/\.rpc\("is_platform_admin"/);
 assert.match(server,/customerAgentExecutionReady:false/);
 assert.match(panel,/Ruflo multi-agent orchestration pilot/);
 assert.match(panel,/cannot run customer agents, install tools/);
 assert.match(reviewer,/independent platform security review|Independent platform review/i);
 assert.match(intelligence,/RufloPilotPanel/);
 assert.match(mcpReview,/RufloReviewPanel/);
 assert.doesNotMatch(server,/spawn\(|exec\(|tools\/call/);
});
test("sandbox adapter has integrity, tool-effect, and spending protections",async()=>{
 const adapter=await read("services/ruflo-bridge/mcp-client.mjs");
 const policy=await read("services/ruflo-bridge/sandbox-policy.mjs");
 const probe=await read("services/ruflo-bridge/probe.mjs");
 assert.match(adapter,/expectedSha256/);
 assert.match(adapter,/shell:false/);
 assert.match(adapter,/RUFLO_TELEMETRY_ENABLED:"false"/);
 assert.match(adapter,/Only approved, read-only Ruflo probes are permitted/);
 assert.match(policy,/includesCustomerContent!==false/);
 assert.match(policy,/reservationStatus!=="reserved"/);
 assert.match(policy,/bindingStatus!=="sandbox_verified"/);
 assert.match(probe,/tenantExecutionEnabled:false/);
 assert.doesNotMatch(probe,/job\.claim|queue_budgeted_ai_agent/);
});
