import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=p=>readFile(new URL("../../"+p,import.meta.url),"utf8");
const sql=await read("supabase/migrations/20261020235000_ruflo_manifest_pin.sql");

test("verified Ruflo sandbox requires current reviewed executable and tool schema pins",()=>{
 assert.match(sql,/ADD COLUMN IF NOT EXISTS probe_manifest_sha256/);
 assert.match(sql,/CHECK\(status<>'sandbox_verified' OR probe_manifest_sha256 IS NOT NULL\)/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.ruflo_probe_gate/);
 assert.match(sql,/b\.executable_sha256 ~ '\^\[a-f0-9\]\{64\}\$'/);
 assert.match(sql,/b\.probe_manifest_sha256 ~ '\^\[a-f0-9\]\{64\}\$'/);
 assert.match(sql,/b\.verified_at>=now\(\)-interval '30 days'/);
 assert.match(sql,/p\.status='shortlisted'/);
 assert.match(sql,/public\.has_tenant_entitlement/);
 assert.doesNotMatch(sql,/INSERT INTO public\.ai_ruflo_tenant_bindings/);
});
test("trusted scope-bound preflight returns independently recorded digest, not tool instructions",()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.preflight_ruflo_probe/);
 assert.match(sql,/auth\.role\(\) IS DISTINCT FROM 'service_role'/);
 assert.match(sql,/item\.claim_token IS DISTINCT FROM _claim/);
 assert.match(sql,/item\.lease_expires_at<=now\(\)/);
 assert.match(sql,/'expectedManifestDigest',binding\.probe_manifest_sha256/);
 assert.match(sql,/public\.ruflo_probe_gate\(_tenant,_product,item\.probe_key,item\.data_region\)/);
 assert.doesNotMatch(sql,/raw_tool_output|customer_prompt|service_token/i);
});
test("Ruflo child never receives customer or service secrets from manifest attestation",async()=>{
 const client=await read("services/ruflo-bridge/mcp-client.mjs");
 const worker=await read("services/ruflo-bridge/worker-core.mjs");
 const cli=await read("services/ruflo-bridge/worker.mjs");
 assert.match(client,/attestReadOnlyManifest\(schemaCandidates\)/);
 assert.match(client,/probeManifestSha256/);
 assert.match(client,/env:\{PATH:process\.env\.PATH/);
 assert.match(worker,/assertManifestPin\(connected\?\.probeManifestSha256,cfg\.expectedManifestDigest\)/);
 assert.match(worker,/preflight\.expectedManifestDigest===config\.expectedManifestDigest/);
 assert.match(cli,/RUFLO_MANIFEST_SHA256/);
 assert.doesNotMatch(worker,/model\.generate|agent_execute|action\.approve/);
});
test("synthetic agent rehearsal cannot invoke models, tools or source tenant data",async()=>{
 const scenario=await read("services/ruflo-bridge/shadow-missions.mjs");
 assert.match(scenario,/source:"embedded_noncustomer_fixture"/);
 assert.match(scenario,/roles=Object\.freeze\(\["coordinator","analyst","independent_verifier"\]\)/);
 assert.match(scenario,/allowedActions:\[\]/);
 assert.match(scenario,/modelCalls:0,externalToolCalls:0/);
 assert.match(scenario,/approvedToExecute:false/);
 assert.doesNotMatch(scenario,/fetch\(|child_process|supabaseAdmin|OPENAI_API_KEY/);
});
