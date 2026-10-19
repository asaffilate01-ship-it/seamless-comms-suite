import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
const sql=await read("supabase/migrations/20261019090000_ruflo_probe_lease_worker.sql");

test("Ruflo probe queue is content-free, bounded, scoped and browser-read-only",()=>{
 assert.match(sql,/CREATE TABLE public\.ai_ruflo_probe_tasks/);
 assert.match(sql,/CHECK\(probe_key IN\('swarm_health','swarm_status','agent_list'\)\)/);
 assert.match(sql,/CREATE UNIQUE INDEX ai_ruflo_one_active_probe_idx/);
 assert.match(sql,/status IN\('queued','processing'\)/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.ai_ruflo_probe_tasks FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT SELECT ON public\.ai_ruflo_probe_tasks TO authenticated/);
 assert.match(sql,/public\.is_tenant_member\(tenant_id,auth\.uid\(\)\)/);
 assert.doesNotMatch(sql,/INSERT INTO public\.ai_ruflo_probe_tasks.*VALUES.*[A-Za-z0-9]/s);
 assert.doesNotMatch(sql,/customer_prompt|user_message|model_output|tool_arguments/i);
});
test("operator queue is owner/admin-only with independently verified sandbox and strict quotas",()=>{
 assert.match(sql,/FUNCTION public\.request_ruflo_probe/);
 assert.match(sql,/m\.role IN\('owner','admin'\)/);
 assert.match(sql,/public\.ruflo_probe_gate\(_tenant,_product,_probe,region_code\)/);
 assert.match(sql,/created_at>now\(\)-interval '24 hours'/);
 assert.match(sql,/Ruflo idempotency payload mismatch/);
 assert.match(sql,/p\.status='shortlisted'/);
 assert.match(sql,/b\.status='sandbox_verified'/);
 assert.match(sql,/public\.is_platform_admin\(b\.verified_by\)/);
 assert.match(sql,/t\.country_code=_region/);
 assert.match(sql,/public\.has_tenant_entitlement\(_tenant,'omniqora\.intelligence-runtime'\)/);
});
test("service-only claims, lease ownership, recheck and idempotent metadata receipts",()=>{
 for(const method of ["claim_ruflo_probe","preflight_ruflo_probe","finish_ruflo_probe","reap_ruflo_probes"]){
  assert.match(sql,new RegExp("FUNCTION public\\."+method));
 }
 assert.match(sql,/FOR UPDATE SKIP LOCKED/);
 assert.match(sql,/lease_expires_at=now\(\)\+interval '120 seconds'/);
 assert.match(sql,/item\.claim_token IS DISTINCT FROM _claim/);
 assert.match(sql,/item\.claimed_by IS DISTINCT FROM _worker/);
 assert.match(sql,/auth\.role\(\) IS DISTINCT FROM 'service_role'/);
 assert.match(sql,/INSERT INTO public\.ai_ruflo_probe_receipts/);
 assert.match(sql,/item\.result_receipt_ref=_receipt_ref/);
 assert.match(sql,/public\.ruflo_probe_gate\(_tenant,_product,item\.probe_key,item\.data_region\)/);
 assert.match(sql,/WHEN final_result='denied' THEN 'policy_denied'/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.claim_ruflo_probe.*TO service_role/);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION public\.claim_ruflo_probe.*TO authenticated/);
});
test("Ruflo worker endpoint enforces credential scope and rejects sub-location escalation",async()=>{
 const gateway=await read("src/modules/agent-factory/ruflo-probe.server.ts");
 const route=await read("src/routes/api.platform.ruflo-probe.ts");
 assert.match(gateway,/parseServiceAuthorization/);
 assert.match(gateway,/verifyServiceSecret/);
 assert.match(gateway,/authoriseServiceScope/);
 assert.match(gateway,/approvedScope\.brandIds\?\.length\|\|approvedScope\.locationIds\?\.length/);
 assert.match(gateway,/tenant\.data\.country_code!==input\.region/);
 assert.match(gateway,/ruflo\.probe\.claim/);
 assert.match(gateway,/ruflo\.probe\.finish/);
 for(const rpc of ["claim_ruflo_probe","preflight_ruflo_probe","finish_ruflo_probe","reap_ruflo_probes"])
  assert.ok(gateway.includes(rpc),rpc);
 assert.match(route,/serveRufloProbeWorker/);
 assert.doesNotMatch(gateway,/tools\/call|child_process|exec\(/);
});
test("operator UI requests no-prompt, reviewed probes through RPC only",async()=>{
 const server=await read("src/modules/agent-factory/ruflo.functions.ts");
 const panel=await read("src/modules/agent-factory/RufloPilotPanel.tsx");
 assert.match(server,/queueRufloHealthProbe/);
 assert.match(server,/requireAdminRole\(access\.role\)/);
 assert.match(server,/\.rpc\("request_ruflo_probe"/);
 assert.match(panel,/Queue read-only staging probe/);
 assert.match(panel,/crypto\.randomUUID\(\)/);
 assert.match(panel,/status\.data\?\.probes/);
 assert.doesNotMatch(panel,/fetch\(["']https?:\/\//);
});
