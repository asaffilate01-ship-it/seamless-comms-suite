import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
const sql=await read("supabase/migrations/20261021073000_ruflo_runtime_interlocks.sql");

test("staging is off by default and rechecks bounded independent approval",()=>{
 assert.match(sql,/CREATE TABLE public\.ai_ruflo_staging_controls/);
 assert.match(sql,/status IN\('disabled','staging_approved','suspended'\)/);
 assert.match(sql,/ALTER TABLE public\.ai_ruflo_staging_controls ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.ai_ruflo_staging_controls FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT SELECT ON public\.ai_ruflo_staging_controls TO authenticated/);
 assert.match(sql,/public\.is_tenant_member\(tenant_id,auth\.uid\(\)\)/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.guard_ruflo_staging_control/);
 assert.match(sql,/p\.requested_by <> NEW\.approved_by/);
 assert.match(sql,/b\.probe_manifest_sha256 ~ '\^\[a-f0-9\]\{64\}\$'/);
 assert.match(sql,/NEW\.expires_at > now\(\)\+interval '24 hours'/);
 assert.match(sql,/gate\.status='staging_approved'/);
 assert.match(sql,/gate\.expires_at>now\(\)/);
 assert.match(sql,/public\.has_tenant_entitlement\(_tenant,'omniqora\.intelligence-runtime'\)/);
 assert.doesNotMatch(sql,/INSERT INTO public\.ai_ruflo_staging_controls[\s\S]*?VALUES\s*\([^)]*'staging_approved'/);
});
test("emergency stop is admin-scoped, denies queued probes and never re-enables a worker",()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.stop_ruflo_sandbox/);
 assert.match(sql,/IF auth\.uid\(\) IS NULL/);
 assert.match(sql,/m\.role IN\('owner','admin'\)/);
 assert.match(sql,/status='suspended',stopped_by=auth\.uid\(\)/);
 assert.match(sql,/UPDATE public\.ai_ruflo_tenant_bindings SET status='suspended'/);
 assert.match(sql,/UPDATE public\.ai_ruflo_probe_tasks SET status='denied'/);
 assert.match(sql,/WHERE tenant_id=_tenant AND product_key=_product AND status='queued'/);
 assert.match(sql,/customerAgentExecutionEnabled',false/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.stop_ruflo_sandbox\(uuid,text,text\) TO authenticated/);
});
test("operator server cannot activate or invoke arbitrary agent tooling",async()=>{
 const server=await read("src/modules/agent-factory/ruflo.functions.ts");
 const panel=await read("src/modules/agent-factory/RufloPilotPanel.tsx");
 const worker=await read("services/ruflo-bridge/worker-core.mjs");
 assert.match(server,/getRufloPilotStatus/);
 assert.match(server,/ai_ruflo_staging_controls/);
 assert.match(server,/stopRufloSandbox/);
 assert.match(server,/requireAdminRole\(access\.role\)/);
 assert.match(server,/\.rpc\("stop_ruflo_sandbox"/);
 assert.match(panel,/Staging readiness checklist/);
 assert.match(panel,/Suspend Ruflo staging/);
 assert.match(panel,/stagingProbeEligibleForRequest/);
 assert.match(panel,/customer-agent execution is disabled/i);
 assert.match(worker,/finishProbeWithRetry/);
 assert.match(worker,/const receiptRef=receiptFactory\(\)/);
 assert.doesNotMatch(server,/status:"staging_approved"|process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(panel,/tools\/call|agent_execute/);
});
