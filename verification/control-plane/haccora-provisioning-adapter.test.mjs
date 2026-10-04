import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {decideProvisioning} from "../../src/modules/control-plane/provisioning-policy.ts";

const worker=await readFile(new URL("../../src/modules/control-plane/provisioning-worker.server.ts",import.meta.url),"utf8");

assert.deepEqual(
 decideProvisioning({
  job:{target_kind:"service",target_key:"haccora.ai-copilot",action:"provision"},
  service:{service_key:"haccora.ai-copilot",provisioning_mode:"automatic",implementation_status:"built_main",owner_product_key:"haccora"},
  connection:{product_key:"haccora",external_tenant_id:"org-a",status:"connected"}
 }),
 {outcome:"succeed",reason:"Haccora service is backed by a connected, verified Haccora workspace."}
);
assert.equal(
 decideProvisioning({
  job:{target_kind:"service",target_key:"haccora.ai-copilot",action:"provision"},
  service:{service_key:"haccora.ai-copilot",provisioning_mode:"automatic",implementation_status:"built_main",owner_product_key:"haccora"},
  connection:null
 }).outcome,
 "block"
);
for(const expected of[
 "HACCORA_UK_FUNCTION_URL","HACCORA_DE_FUNCTION_URL","HACCORA_UK_PROVISIONING_SECRET",
 "HACCORA_DE_PROVISIONING_SECRET","OMNIQORA_PUBLIC_URL","bind_control_plane",
 "intelligence.run.start","dishbee.projection.write"
])assert(worker.includes(expected),expected);
assert(worker.includes('mode === "standalone"'));
assert(worker.includes('mode === "dishbee-addon"'));
console.log("Haccora product-specific provisioning adapter verified");
