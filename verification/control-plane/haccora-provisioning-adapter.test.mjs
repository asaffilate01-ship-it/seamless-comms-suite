import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decideProvisioning } from "../../src/modules/control-plane/provisioning-policy.ts";

const worker = await readFile(new URL("../../src/modules/control-plane/provisioning-worker.server.ts", import.meta.url), "utf8");

// The shared adapter now covers Dishbee-owned services as well as Haccora.
// Keep the full expected decision and deny-state coverage; do not make this
// release gate pass by ignoring the outcome or skipping the adapter checks.
for (const [productKey, serviceKey] of [
  ["haccora", "haccora.ai-copilot"],
  ["dishbee", "dishbee.one"],
  ["dishbee", "dishbee.hive"],
  ["dishbee", "dishbee.stay"],
  ["dishbee", "dishbee.court-connect"],
]) {
  const job = { target_kind: "service", target_key: serviceKey, action: "provision" };
  const service = {
    service_key: serviceKey,
    provisioning_mode: "automatic",
    implementation_status: "built_main",
    owner_product_key: productKey,
  };
  const connection = { product_key: productKey, external_tenant_id: "workspace-a", status: "connected" };

  assert.deepEqual(
    decideProvisioning({ job, service, connection }),
    { outcome: "succeed", reason: "Product-owned service is implemented and its authoritative workspace is connected." },
    `${serviceKey}: a connected implemented workspace can be provisioned`,
  );
  assert.equal(decideProvisioning({ job, service, connection: null }).outcome, "block", `${serviceKey}: no workspace`);
  for (const status of ["configured", "pending", "failed", "disabled"]) {
    assert.equal(
      decideProvisioning({ job, service, connection: { ...connection, status } }).outcome,
      "block",
      `${serviceKey}: ${status} is not a verified connection`,
    );
  }
  for (const implementation_status of ["draft_branch", "planned", null]) {
    assert.equal(
      decideProvisioning({ job, service: { ...service, implementation_status }, connection }).outcome,
      "block",
      `${serviceKey}: connection alone cannot make unimplemented code ready`,
    );
  }
}

for (const expected of [
  "HACCORA_UK_FUNCTION_URL", "HACCORA_DE_FUNCTION_URL", "HACCORA_UK_PROVISIONING_SECRET",
  "HACCORA_DE_PROVISIONING_SECRET", "OMNIQORA_PUBLIC_URL", "bind_control_plane",
  "intelligence.run.start", "dishbee.projection.write",
]) assert(worker.includes(expected), expected);
assert(worker.includes('mode === "standalone"'));
assert(worker.includes('mode === "dishbee-addon"'));
console.log("Haccora/Dishbee product-owned provisioning decisions and Haccora worker wiring verified");
