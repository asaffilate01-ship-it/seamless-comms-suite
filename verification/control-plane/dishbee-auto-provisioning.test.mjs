import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration=await readFile(
  new URL("../../supabase/migrations/20261005081000_product_location_authority.sql",import.meta.url),
  "utf8",
);
const worker=await readFile(
  new URL("../../src/modules/control-plane/provisioning-worker.server.ts",import.meta.url),
  "utf8",
);
const factory=await readFile(
  new URL("../../src/routes/_authenticated/app.tenant-factory.tsx",import.meta.url),
  "utf8",
);

test("external product locations are explicit and tenant scoped",()=>{
  assert.match(migration,/product_location_links/);
  assert.match(migration,/tenant_location_id uuid NOT NULL/);
  assert.match(migration,/external_location_id text NOT NULL/);
  assert.match(migration,/UNIQUE\(product_connection_id,tenant_location_id\)/);
  assert.match(migration,/platform_upsert_product_location_link/);
  assert.match(migration,/server_upsert_product_location_link/);
});

test("Dishbee provisioning fails closed when product/location mapping is incomplete",()=>{
  assert.match(worker,/provisionDishbee/);
  assert.match(worker,/requireCompleteLocationLinks/);
  assert.match(worker,/Dishbee external tenant\/workspace ID must be the real Dishbee tenant UUID/);
  assert.match(worker,/action: "bind_omniqora"/);
  assert.match(worker,/locationMappings:/);
  assert.match(worker,/server_set_product_credential/);
  assert.doesNotMatch(worker,/find\([^)]*name.*dishbee/i);
});

test("Haccora Dishbee sync uses both explicit product location maps",()=>{
  assert.match(worker,/bindHaccoraDishbeeRuntime/);
  assert.match(worker,/action: "bind_dishbee_runtime"/);
  assert.match(worker,/action: "bind_haccora"/);
  assert.match(worker,/haccoraMap\.links/);
  assert.match(worker,/dishbeeMap\.links/);
});

test("Tenant Factory exposes product and location mapping controls",()=>{
  assert.match(factory,/title="Product tenant links"/);
  assert.match(factory,/title="Product location map"/);
  assert.match(factory,/External product location UUID/);
  assert.match(factory,/Runtime provisioning fails closed/);
});
