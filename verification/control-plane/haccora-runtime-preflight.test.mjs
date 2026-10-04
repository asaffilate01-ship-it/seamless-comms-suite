import test from "node:test";
import assert from "node:assert/strict";
import { getHaccoraRuntimePreflight } from "../../src/modules/haccora/runtime-preflight.server.ts";

const secret = "s".repeat(48);

test("Haccora runtime preflight reports UK and DE provisioning ready without exposing values", () => {
  const result = getHaccoraRuntimePreflight({
    OMNIQORA_PUBLIC_URL: "https://omniqora.example.test",
    CONTROL_PLANE_WORKER_SECRET: secret,
    HACCORA_UK_FUNCTION_URL: "https://uk.example.test/functions/v1/omniqora-platform",
    HACCORA_UK_APP_URL: "https://app.haccora.co.uk",
    HACCORA_UK_PROVISIONING_SECRET: secret,
    HACCORA_UK_SYNC_SECRET: secret,
    HACCORA_DE_FUNCTION_URL: "https://de.example.test/functions/v1/omniqora-platform",
    HACCORA_DE_APP_URL: "https://app.haccora.de",
    HACCORA_DE_PROVISIONING_SECRET: secret,
    HACCORA_DE_SYNC_SECRET: secret,
  });

  assert.equal(result.schedulerRuntimeReady, true);
  assert.equal(result.readyForUkProvisioning, true);
  assert.equal(result.readyForDeProvisioning, true);
  assert.equal(result.countries.GB.bridgeReady, true);
  assert.equal(result.countries.DE.bridgeReady, true);
  assert.deepEqual(result.missing, []);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("Haccora runtime preflight fails closed for missing, short or non-HTTPS configuration", () => {
  const result = getHaccoraRuntimePreflight({
    OMNIQORA_PUBLIC_URL: "http://localhost:3000",
    CONTROL_PLANE_WORKER_SECRET: "short",
    HACCORA_UK_FUNCTION_URL: "not-a-url",
    HACCORA_UK_APP_URL: "https://app.haccora.co.uk",
    HACCORA_UK_PROVISIONING_SECRET: secret,
    HACCORA_UK_SYNC_SECRET: "",
  });

  assert.equal(result.schedulerRuntimeReady, false);
  assert.equal(result.readyForUkProvisioning, false);
  assert.equal(result.readyForDeProvisioning, false);
  assert(result.missing.includes("OMNIQORA_PUBLIC_URL"));
  assert(result.missing.includes("CONTROL_PLANE_WORKER_SECRET"));
  assert(result.missing.includes("HACCORA_UK_FUNCTION_URL"));
  assert(result.missing.includes("HACCORA_UK_SYNC_SECRET"));
  assert(result.missing.includes("HACCORA_DE_FUNCTION_URL"));
});
