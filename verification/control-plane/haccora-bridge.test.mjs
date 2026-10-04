import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../../src/modules/haccora/haccora-bridge.server.ts", import.meta.url),
  "utf8",
);
const env = await readFile(new URL("../../.env.example", import.meta.url), "utf8");

for (const token of [
  "haccora.projection.write",
  "haccora.compliance.read",
  "haccora.dishbee-sync",
  "sync_projection",
  "compliance_summary",
]) {
  assert(source.includes(token), token);
}

assert(source.includes('productKey:z.literal("dishbee")'));
assert(source.includes('const prefix=country==="GB"?"HACCORA_UK":country==="DE"?"HACCORA_DE":null'));
assert(source.includes('process.env[`${prefix}_SYNC_SECRET`]'));

for (const token of [
  "HACCORA_UK_SYNC_SECRET",
  "HACCORA_DE_SYNC_SECRET",
  "HACCORA_UK_PROVISIONING_SECRET",
  "HACCORA_DE_PROVISIONING_SECRET",
]) {
  assert(env.includes(token), token);
}

assert(!source.includes("SUPABASE_SERVICE_ROLE_KEY"));
console.log("Dishbee to Haccora bridge contract verified");
