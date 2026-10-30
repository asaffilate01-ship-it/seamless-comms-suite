import test from "node:test";
import assert from "node:assert/strict";
import { lookupQueueReceipt } from "../../src/modules/agent-factory/receipt-lookup.server.ts";
import { createQueueAttempts } from "../../src/modules/agent-factory/queue-attempt.ts";
const tenant = "11111111-1111-4111-8111-111111111111",
  requestId = "22222222-2222-4222-8222-222222222222",
  runId = "33333333-3333-4333-8333-333333333333";
const input = { tenantId: tenant, productKey: "omniqora", requestId };
function database(changes = {}, errorTable = null) {
  const data = {
    tenant_members: [{ tenant_id: tenant, user_id: "alice", role: "agent" }],
    ai_budgeted_run_reservations: [
      {
        tenant_id: tenant,
        product_key: "omniqora",
        idempotency_key: requestId,
        run_id: runId,
        status: "reserved",
        currency: "GBP",
        reserved_minor: 250,
        actual_minor: null,
        created_at: "2026-10-30",
        secret: "private",
      },
    ],
    ai_agent_runs: [
      {
        tenant_id: tenant,
        product_key: "omniqora",
        id: runId,
        status: "queued",
        updated_at: "2026-10-30",
        initiated_by: "alice",
        goal: "private goal",
      },
    ],
    ...changes,
  };
  const calls = [];
  return {
    data,
    calls,
    from(table) {
      calls.push({ table });
      let fields,
        filters = [];
      const q = {
        select(s) {
          fields = s;
          calls.push({ fields: s });
          return q;
        },
        eq(k, v) {
          filters.push([k, v]);
          return q;
        },
        async maybeSingle() {
          const rows = data[table].filter((r) => filters.every(([k, v]) => r[k] === v));
          return {
            error: errorTable === table ? { message: "sensitive debug" } : null,
            data: rows[0]
              ? Object.fromEntries(fields.split(",").map((k) => [k, rows[0][k]]))
              : null,
          };
        },
      };
      return q;
    },
  };
}
test("saved reference resolves to metadata without exposing goal, actor or secrets", async () => {
  const db = database();
  const result = await lookupQueueReceipt(db, "alice", input);
  assert.equal(result.found, true);
  assert.equal(result.run.id, runId);
  assert.equal(result.reservation.reserved_minor, 250);
  assert.equal(result.reservation.actual_minor, null);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(result).includes("alice"));
  assert.ok(db.calls.filter((c) => c.fields).every((c) => !c.fields.includes("goal")));
});
test("current membership is required even with a valid saved reference", async () => {
  const db = database({ tenant_members: [] });
  await assert.rejects(lookupQueueReceipt(db, "alice", input), /membership/);
  assert.deepEqual(
    db.calls.filter((c) => c.table),
    [{ table: "tenant_members" }],
  );
});
test("reference lookup is scoped to exact tenant, product and request ID", async () => {
  for (const patch of [
    { tenant_id: "other" },
    { product_key: "other" },
    { idempotency_key: "other" },
  ]) {
    const db = database();
    Object.assign(db.data.ai_budgeted_run_reservations[0], patch);
    assert.deepEqual(await lookupQueueReceipt(db, "alice", input), { found: false });
    assert.ok(!db.calls.some((c) => c.table === "ai_agent_runs"));
  }
});
test("a matched reservation cannot expose a foreign or missing linked run", async () => {
  for (const patch of [{ tenant_id: "other" }, { product_key: "other" }, { id: "other" }]) {
    const db = database();
    Object.assign(db.data.ai_agent_runs[0], patch);
    assert.deepEqual(await lookupQueueReceipt(db, "alice", input), { found: false });
  }
});
test("ordinary members cannot inspect another initiator but tenant admins can", async () => {
  for (const role of ["agent", "viewer", "owner", "admin"]) {
    const db = database();
    db.data.tenant_members[0].role = role;
    db.data.ai_agent_runs[0].initiated_by = "bob";
    assert.equal(
      (await lookupQueueReceipt(db, "alice", input)).found,
      ["owner", "admin"].includes(role),
    );
  }
});
test("read errors fail instead of returning an absent receipt or sensitive diagnostics", async () => {
  for (const table of ["tenant_members", "ai_budgeted_run_reservations", "ai_agent_runs"])
    await assert.rejects(
      lookupQueueReceipt(database({}, table), "alice", input),
      (e) => !e.message.includes("sensitive"),
    );
});
test("invalid reference is rejected before any database access", async () => {
  const db = database();
  await assert.rejects(lookupQueueReceipt(db, "alice", { ...input, requestId: "invalid" }));
  assert.equal(db.calls.length, 0);
});
test("settled zero actual cost is preserved rather than treated as unknown", async () => {
  const db = database();
  Object.assign(db.data.ai_budgeted_run_reservations[0], { status: "released", actual_minor: 0 });
  const r = await lookupQueueReceipt(db, "alice", input);
  assert.equal(r.reservation.actual_minor, 0);
});
test("unsafe monetary values fail validation", async () => {
  const db = database();
  db.data.ai_budgeted_run_reservations[0].reserved_minor = Number.MAX_SAFE_INTEGER + 1;
  await assert.rejects(lookupQueueReceipt(db, "alice", input));
});
test("pending reference is stable and isolated and disappears after confirmation", async () => {
  const attempts = createQueueAttempts(() => requestId);
  const task = { tenantId: tenant, productKey: "omniqora" };
  await assert.rejects(
    attempts.submit(task, async () => {
      throw Error();
    }),
  );
  assert.equal(attempts.reference(task), requestId);
  assert.equal(attempts.reference({ ...task, tenantId: "other" }), undefined);
  await attempts.submit(task, async () => ({}));
  assert.equal(attempts.reference(task), undefined);
});
