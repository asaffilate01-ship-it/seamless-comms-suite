import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  probeProvisioningSchema,
  provisioningReadTables,
  type ReadOnlyProbeClient,
} from "../../src/modules/control-plane/provisioning-preflight";

function fakeDb(broken: string | null = null) {
  const calls: Array<{ table: string; column: string; limit: number }> = [];
  const db: ReadOnlyProbeClient = {
    from(table) {
      return {
        select(column) {
          return {
            async limit(count) {
              calls.push({ table, column, limit: count });
              return { error: table === broken ? { message: "Permission denied" } : null };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

test("preflight reads only the four required SaaS Factory tables", async () => {
  const { db, calls } = fakeDb();
  assert.equal(await probeProvisioningSchema(db), true);
  assert.deepEqual(calls, provisioningReadTables.map((item) => ({
    table: item.table, column: item.column, limit: 1,
  })));
});

test("preflight fails closed on any missing table or denied read", async () => {
  for (const { table } of provisioningReadTables) {
    const { db } = fakeDb(table);
    assert.equal(await probeProvisioningSchema(db), false, table);
  }
});

test("preflight propagates transport failures to a sanitising HTTP boundary", async () => {
  const { db } = fakeDb();
  const failingDb: ReadOnlyProbeClient = {
    ...db,
    from(table) {
      if (table === "tenant_services") throw new Error("Private database connectivity details");
      return db.from(table);
    },
  };
  await assert.rejects(() => probeProvisioningSchema(failingDb), /Private database/);
});

test("readiness route does not run the side-effectful claim code", async () => {
  const server = await readFile(new URL("../../src/modules/control-plane/provisioning-worker.server.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../../src/routes/api.control-plane.workers.provisioning.ts", import.meta.url), "utf8");
  assert.match(route, /GET:\s*\(\{ request \}\) => serveProvisioningWorker\(request, true\)/);
  assert.match(route, /POST:\s*\(\{ request \}\) => serveProvisioningWorker\(request\)/);
  assert.ok(server.indexOf('if (preflight) {') < server.indexOf('db.rpc("server_claim_provisioning_jobs"'));
  assert.match(server, /return json\(\{ ready: false, mode: "read-only" \}, 503\)/);
});

test("scheduled drain remains opt-in and manual default cannot drain without approval", async () => {
  const flow = await readFile(new URL("../../.github/workflows/provisioning-worker.yml", import.meta.url), "utf8");
  assert.match(flow, /default: preflight/);
  assert.match(flow, /DRAIN-PROVISIONING/);
  assert.match(flow, /inputs\.operation == 'drain'/);
  assert.match(flow, /PROVISIONING_WORKER_ENABLED == 'true'/);
  assert.match(flow, /--request GET/);
  assert.match(flow, /--request POST/);
  assert.match(flow, /github\.event_name == 'schedule' \|\| inputs\.operation == 'drain'/);
});
