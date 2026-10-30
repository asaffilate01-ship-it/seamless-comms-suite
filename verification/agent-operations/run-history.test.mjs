import test from "node:test";
import assert from "node:assert/strict";
import {
  readRunHistory,
  readRunDetail,
  cancelQueuedFactoryRun,
} from "../../src/modules/agent-factory/run-history.server.ts";
const tenant = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
const input = { tenantId: tenant, productKey: "omniqora", runId: id };
const record = {
  id,
  tenant_id: tenant,
  product_key: "omniqora",
  profile: "discovery",
  status: "queued",
  initiated_by: "alice",
  created_at: "2026-10-30T00:00:00Z",
  updated_at: "2026-10-30T00:00:00Z",
  completed_at: null,
  current_step: 0,
  max_steps: 8,
  result: { secret: "never expose" },
};
function database(overrides = {}) {
  const tables = {
    tenant_members: [{ tenant_id: tenant, user_id: "alice", role: "agent" }],
    ai_agent_runs: [record],
    ai_agent_steps: [],
    ai_budgeted_run_reservations: [
      { tenant_id: tenant, product_key: "omniqora", run_id: id, status: "reserved" },
    ],
    ...overrides,
  };
  const calls = [];
  let errorTable = null,
    rpcError = false;
  return {
    calls,
    tables,
    setError(t) {
      errorTable = t;
    },
    setRpcError() {
      rpcError = true;
    },
    from(table) {
      calls.push({ table });
      let columns,
        filters = [],
        orders = [],
        bounds = null,
        maximum = null,
        single = false;
      const q = {
        select(c) {
          columns = c;
          calls.push({ columns });
          return q;
        },
        eq(k, v) {
          filters.push([k, v]);
          calls.push({ filter: [k, v] });
          return q;
        },
        order(k, o) {
          orders.push([k, o]);
          return q;
        },
        range(a, b) {
          bounds = [a, b];
          return q;
        },
        limit(n) {
          maximum = n;
          return q;
        },
        maybeSingle() {
          single = true;
          return q;
        },
        then(resolve, reject) {
          let rows = (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
          for (const [k, o] of [...orders].reverse())
            rows = [...rows].sort(
              (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (o.ascending ? 1 : -1),
            );
          if (bounds) rows = rows.slice(bounds[0], bounds[1] + 1);
          if (maximum !== null) rows = rows.slice(0, maximum);
          rows = rows.map((r) => Object.fromEntries(columns.split(",").map((c) => [c, r[c]])));
          return Promise.resolve({
            data: single ? (rows[0] ?? null) : rows,
            error: errorTable === table ? { message: "secret diagnostic" } : null,
          }).then(resolve, reject);
        },
      };
      return q;
    },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      return {
        data: { secret: "never expose" },
        error: rpcError ? { message: "secret diagnostic" } : null,
      };
    },
  };
}
test("pagination is scoped, deterministic and bounded with a sentinel", async () => {
  const rows = Array.from({ length: 45 }, (_, i) => ({
    ...record,
    id: `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`,
  }));
  const db = database({
    ai_agent_runs: [...rows, { ...record, tenant_id: other }, { ...record, product_key: "other" }],
  });
  const a = await readRunHistory(db, "alice", { ...input, page: 0 });
  const b = await readRunHistory(db, "alice", { ...input, page: 1 });
  const c = await readRunHistory(db, "alice", { ...input, page: 2 });
  assert.equal(a.runs.length, 20);
  assert.equal(b.runs.length, 20);
  assert.equal(c.runs.length, 5);
  assert.equal(c.hasMore, false);
  assert.equal(a.hasMore, true);
  assert.equal(new Set([...a.runs, ...b.runs, ...c.runs].map((r) => r.id)).size, 45);
  assert.ok(!JSON.stringify(a).includes("secret"));
});
test("membership denial prevents all run queries, including cancellation", async () => {
  const db = database({ tenant_members: [] });
  for (const fn of [readRunHistory, readRunDetail, cancelQueuedFactoryRun])
    await assert.rejects(fn(db, "alice", input), /membership/);
  assert.ok(db.calls.filter((x) => x.table).every((x) => x.table === "tenant_members"));
});
test("foreign tenant and product parents prevent child evidence queries", async () => {
  for (const change of [{ tenant_id: other }, { product_key: "other" }]) {
    const db = database({ ai_agent_runs: [{ ...record, ...change }] });
    await assert.rejects(readRunDetail(db, "alice", input), /unavailable/);
    assert.ok(!db.calls.some((x) => x.table === "ai_agent_steps"));
  }
});
test("steps are scoped, ordered and strip raw prompts, responses and source URLs", async () => {
  const step = {
    tenant_id: tenant,
    run_id: id,
    step_no: 1,
    step_type: "tool",
    status: "complete",
    created_at: record.created_at,
    response: { secret: "hidden" },
    request: { token: "hidden" },
    source_refs: ["secret-url"],
  };
  const db = database({
    ai_agent_steps: [step, { ...step, tenant_id: other }, { ...step, run_id: other }],
  });
  const d = await readRunDetail(db, "alice", input);
  assert.equal(d.steps.length, 1);
  assert.equal(d.canCancel, false);
  assert.ok(!JSON.stringify(d).includes("hidden"));
  assert.ok(
    db.calls
      .filter((x) => x.columns)
      .every((x) => !x.columns.includes("response") && !x.columns.includes("request")),
  );
});
test("only an unstarted reserved task owned by actor or tenant admin is cancellable", async () => {
  assert.equal((await readRunDetail(database(), "alice", input)).canCancel, true);
  for (const changes of [
    { ai_agent_runs: [{ ...record, status: "running" }] },
    { ai_budgeted_run_reservations: [] },
    {
      ai_budgeted_run_reservations: [
        { tenant_id: tenant, product_key: "omniqora", run_id: id, status: "settled" },
      ],
    },
    { ai_agent_runs: [{ ...record, initiated_by: "bob" }] },
  ]) {
    const db = database(changes);
    await assert.rejects(cancelQueuedFactoryRun(db, "alice", input));
    assert.ok(!db.calls.some((x) => x.rpc));
  }
  const db = database({
    tenant_members: [{ tenant_id: tenant, user_id: "alice", role: "admin" }],
    ai_agent_runs: [{ ...record, initiated_by: "bob" }],
  });
  assert.deepEqual(await cancelQueuedFactoryRun(db, "alice", input), { cancelled: true });
  assert.deepEqual(
    db.calls.find((x) => x.rpc),
    { rpc: "cancel_budgeted_ai_agent", args: { _tenant: tenant, _run: id } },
  );
});
test("read failures are not empty success and RPC races do not report cancellation", async () => {
  for (const table of ["ai_agent_runs", "ai_agent_steps", "ai_budgeted_run_reservations"]) {
    const db = database();
    db.setError(table);
    await assert.rejects(readRunDetail(db, "alice", input), (e) => !e.message.includes("secret"));
  }
  const db = database();
  db.setRpcError();
  await assert.rejects(cancelQueuedFactoryRun(db, "alice", input), /not confirmed/);
});
test("invalid pagination is rejected before accessing the database", async () => {
  for (const page of [-1, 1.5, 10001]) {
    const db = database();
    await assert.rejects(readRunHistory(db, "alice", { ...input, page }));
    assert.equal(db.calls.length, 0);
  }
});
test("oversized step history is explicitly truncated", async () => {
  const db = database({
    ai_agent_steps: Array.from({ length: 65 }, (_, i) => ({
      tenant_id: tenant,
      run_id: id,
      step_no: i + 1,
      step_type: "observation",
      status: "complete",
      created_at: record.created_at,
    })),
  });
  const d = await readRunDetail(db, "alice", input);
  assert.equal(d.steps.length, 64);
  assert.equal(d.truncated, true);
});
