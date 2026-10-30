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
    ai_agent_steps: [],
    intelligence_jobs: [],
    ...changes,
  };
  const calls = [];
  return {
    data,
    calls,
    from(table) {
      calls.push({ table });
      let fields,
        filters = [],
        orders = [],
        maximum = null;
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
        order(k, o) {
          orders.push([k, o]);
          return q;
        },
        limit(n) {
          maximum = n;
          return q;
        },
        then(resolve, reject) {
          let rows = data[table].filter((r) => filters.every(([k, v]) => r[k] === v));
          for (const [k, o] of [...orders].reverse())
            rows = [...rows].sort(
              (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (o.ascending ? 1 : -1),
            );
          if (maximum !== null) rows = rows.slice(0, maximum);
          return Promise.resolve({
            error: errorTable === table ? { message: "sensitive debug" } : null,
            data: rows.map((r) => Object.fromEntries(fields.split(",").map((k) => [k, r[k]]))),
          }).then(resolve, reject);
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
const stepRecord = {
  tenant_id: tenant,
  run_id: runId,
  step_no: 1,
  step_type: "tool",
  status: "complete",
  created_at: "2026-10-30",
  request: { secret: "hidden" },
  response: { secret: "hidden" },
  source_refs: ["secret-url"],
};
const jobRecord = {
  tenant_id: tenant,
  product_key: "omniqora",
  subject_type: "ai_agent_run",
  subject_id: runId,
  id: "44444444-4444-4444-8444-444444444444",
  status: "queued",
  attempts: 0,
  started_at: null,
  completed_at: null,
  updated_at: "2026-10-30",
  created_at: "2026-10-30",
  input: { secret: "hidden" },
  last_error: "secret-error",
  worker_key_id: "secret-key",
};
test("receipt evidence excludes foreign steps and unrelated jobs and strips payloads", async () => {
  const db = database({
    ai_agent_steps: [
      stepRecord,
      { ...stepRecord, tenant_id: "other" },
      { ...stepRecord, run_id: "other" },
    ],
    intelligence_jobs: [
      jobRecord,
      ...[
        { tenant_id: "other" },
        { product_key: "other" },
        { subject_type: "other" },
        { subject_id: "other" },
      ].map((p) => ({ ...jobRecord, ...p })),
    ],
  });
  const r = await lookupQueueReceipt(db, "alice", input);
  assert.equal(r.steps.length, 1);
  assert.equal(r.jobs.length, 1);
  assert.equal(r.jobs[0].attempts, 0);
  assert.equal(r.jobs[0].started_at, null);
  assert.ok(!JSON.stringify(r).includes("secret"));
  assert.ok(!JSON.stringify(r).includes("hidden"));
});
test("child queries do not run when the actor cannot inspect the parent", async () => {
  const db = database();
  db.data.ai_agent_runs[0].initiated_by = "bob";
  assert.deepEqual(await lookupQueueReceipt(db, "alice", input), { found: false });
  assert.ok(!db.calls.some((c) => ["ai_agent_steps", "intelligence_jobs"].includes(c.table)));
});
test("step and job histories are ordered and bounded with explicit truncation", async () => {
  const db = database({
    ai_agent_steps: Array.from({ length: 66 }, (_, i) => ({ ...stepRecord, step_no: 66 - i })),
    intelligence_jobs: Array.from({ length: 7 }, (_, i) => ({
      ...jobRecord,
      id: `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`,
    })),
  });
  const r = await lookupQueueReceipt(db, "alice", input);
  assert.equal(r.steps.length, 64);
  assert.equal(r.steps[0].step_no, 1);
  assert.equal(r.stepsTruncated, true);
  assert.equal(r.jobs.length, 5);
  assert.equal(r.jobsTruncated, true);
  assert.ok(r.jobs[0].id > r.jobs[1].id);
});
test("child read failures never masquerade as no execution evidence", async () => {
  for (const table of ["ai_agent_steps", "intelligence_jobs"])
    await assert.rejects(
      lookupQueueReceipt(database({}, table), "alice", input),
      (e) => e.message === "Task evidence unavailable",
    );
});
test("unrecorded histories stay empty without manufactured progress", async () => {
  const r = await lookupQueueReceipt(database(), "alice", input);
  assert.deepEqual(r.steps, []);
  assert.deepEqual(r.jobs, []);
  assert.equal(r.stepsTruncated, false);
  assert.equal(r.jobsTruncated, false);
});
