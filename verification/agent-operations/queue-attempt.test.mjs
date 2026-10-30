import test from "node:test";
import assert from "node:assert/strict";
import { createQueueAttempts } from "../../src/modules/agent-factory/queue-attempt.ts";
const task = {
  tenantId: "tenant-a",
  productKey: "omniqora",
  goal: "Review operations",
  inputTokens: 100,
  modelKey: "approved-model",
};
function controller() {
  let n = 0;
  return createQueueAttempts(() => `request-${++n}`);
}
test("lost acknowledgement retries the identical request and recovers one server task", async () => {
  const attempts = controller(),
    server = new Map();
  let calls = 0;
  const send = async (request) => {
    calls++;
    if (!server.has(request.idempotencyKey)) server.set(request.idempotencyKey, { runId: "run-1" });
    if (calls === 1) throw Error("response lost");
    return server.get(request.idempotencyKey);
  };
  await assert.rejects(attempts.submit(task, send));
  assert.deepEqual(attempts.pending(task), task);
  assert.deepEqual(await attempts.submit(task, send), { runId: "run-1" });
  assert.equal(server.size, 1);
  assert.equal(attempts.pending(task), undefined);
});
test("pending task prevents changed goal, limits or model from creating a new charge", async () => {
  const attempts = controller();
  await assert.rejects(
    attempts.submit(task, async () => {
      throw Error("timeout");
    }),
  );
  for (const patch of [{ goal: "changed" }, { inputTokens: 999 }, { modelKey: "another" }])
    await assert.rejects(
      attempts.submit({ ...task, ...patch }, async () => assert.fail("must not send")),
      /previous queue/,
    );
});
test("synchronous duplicate clicks cannot race before the UI disables", async () => {
  const attempts = controller();
  let resolve;
  const first = attempts.submit(
    task,
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await assert.rejects(
    attempts.submit(task, async () => assert.fail()),
    /already in progress/,
  );
  resolve({ runId: "one" });
  await first;
});
test("a confirmed task allows an intentional new task with a fresh key", async () => {
  const attempts = controller(),
    ids = [];
  const send = async (r) => {
    ids.push(r.idempotencyKey);
    return {};
  };
  await attempts.submit(task, send);
  await attempts.submit(task, send);
  assert.deepEqual(ids, ["request-1", "request-2"]);
});
test("pending attempts are isolated by tenant and product and survive switching back", async () => {
  const attempts = controller(),
    keys = [];
  await assert.rejects(
    attempts.submit(task, async (r) => {
      keys.push(r.idempotencyKey);
      throw Error();
    }),
  );
  for (const scope of [{ tenantId: "tenant-b" }, { productKey: "other" }]) {
    const t = { ...task, ...scope };
    assert.equal(attempts.pending(t), undefined);
    await attempts.submit(t, async (r) => {
      keys.push(r.idempotencyKey);
    });
  }
  await attempts.submit(task, async (r) => {
    keys.push(r.idempotencyKey);
  });
  assert.deepEqual(keys, ["request-1", "request-2", "request-3", "request-1"]);
});
test("caller and transport mutation cannot change a retained request", async () => {
  const attempts = controller(),
    input = { ...task };
  await assert.rejects(
    attempts.submit(input, async (r) => {
      r.goal = "mutated";
      throw Error();
    }),
  );
  input.goal = "also changed";
  const retry = attempts.pending(task);
  retry.goal = "changed copy";
  assert.equal(attempts.pending(task).goal, task.goal);
  await attempts.submit(attempts.pending(task), async (r) => assert.equal(r.goal, task.goal));
});
test("repeated errors retain the original identity and release the in-flight guard", async () => {
  const attempts = controller(),
    keys = [];
  for (let i = 0; i < 3; i++)
    await assert.rejects(
      attempts.submit(task, async (r) => {
        keys.push(r.idempotencyKey);
        throw Error();
      }),
    );
  assert.deepEqual(keys, ["request-1", "request-1", "request-1"]);
});
test("explicit discard is scoped and forbidden during an in-flight request", async () => {
  const attempts = controller();
  let release;
  const p = attempts.submit(
    task,
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  assert.throws(() => attempts.discard(task), /progress/);
  release({});
  await p;
  await assert.rejects(
    attempts.submit(task, async () => {
      throw Error();
    }),
  );
  attempts.discard({ ...task, tenantId: "other" });
  assert.ok(attempts.pending(task));
  attempts.discard(task);
  assert.equal(attempts.pending(task), undefined);
});
