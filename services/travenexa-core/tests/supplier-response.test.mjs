import test from "node:test";
import assert from "node:assert/strict";
import { supplierJson } from "../flightlounge/supplier-response.mjs";
const url = "https://supplier.invalid/read-only";
const bytes = (s) => new TextEncoder().encode(s);
const call = (fetchImpl, options = {}, init = {}) => supplierJson(fetchImpl, url, init, options);

test("streaming JSON handles split UTF-8 and enforces byte limits", async () => {
  const data = bytes('{"value":"é"}');
  const response = () =>
    new Response(
      new ReadableStream({
        start(c) {
          for (const b of data) c.enqueue(Uint8Array.of(b));
          c.close();
        },
      }),
    );
  assert.deepEqual((await call(async () => response(), { maxBytes: data.length })).data, {
    value: "é",
  });
  await assert.rejects(
    call(async () => response(), { maxBytes: data.length - 1 }),
    /too_large/,
  );
});
test("oversized streaming body is cancelled before all chunks are read", async () => {
  let pulls = 0,
    cancelled = false;
  const body = new ReadableStream(
    {
      pull(c) {
        pulls++;
        c.enqueue(bytes("x".repeat(16)));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  await assert.rejects(
    call(async () => new Response(body), { maxBytes: 20 }),
    /too_large/,
  );
  assert.equal(cancelled, true);
  assert.equal(pulls, 2);
});
test("oversized declared length rejects and cancels the body", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    call(async () => new Response(body, { headers: { "content-length": "4000001" } })),
    /too_large/,
  );
  assert.equal(cancelled, true);
});
test("deadline covers never-resolving fetch implementations", async () => {
  let signal;
  await assert.rejects(
    call(
      async (_, init) => {
        signal = init.signal;
        return new Promise(() => {});
      },
      { timeoutMs: 20 },
    ),
    /cancelled/,
  );
  assert.equal(signal.aborted, true);
});
test("deadline covers response-body stalls and cancels the reader", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(c) {
      c.enqueue(bytes("{"));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    call(async () => new Response(body), { timeoutMs: 20 }),
    /cancelled/,
  );
  assert.equal(cancelled, true);
});
test("late fetch completion after timeout discards its response body", async () => {
  let release,
    cancelled = false;
  await assert.rejects(
    call(
      () =>
        new Promise((r) => {
          release = r;
        }),
      { timeoutMs: 20 },
    ),
    /cancelled/,
  );
  release(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(cancelled, true);
});
test("caller cancellation interrupts a stalled body without waiting for cancel hooks", async () => {
  const controller = new AbortController();
  let started,
    cancelled = false;
  const ready = new Promise((r) => {
    started = r;
  });
  const pending = call(
    async () =>
      new Response(
        new ReadableStream({
          pull() {
            started();
          },
          cancel() {
            cancelled = true;
            return new Promise(() => {});
          },
        }),
      ),
    {},
    { signal: controller.signal },
  );
  await ready;
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(cancelled, true);
});
test("HTTP failures discard error bodies and retain only status", async () => {
  for (const status of [429, 500, 404, 410]) {
    let cancelled = false;
    const result = await call(
      async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { status },
        ),
    );
    assert.deepEqual(result, { ok: false, status });
    assert.equal(cancelled, true);
  }
});
test("invalid UTF-8 and malformed JSON fail without returning supplier data", async () => {
  await assert.rejects(
    call(async () => new Response(Uint8Array.of(0xff))),
    /encoded data/,
  );
  await assert.rejects(
    call(async () => new Response("{broken")),
    SyntaxError,
  );
});
test("trusted text-only adapters remain byte bounded and deadline bounded", async () => {
  await assert.rejects(
    call(async () => ({ ok: true, text: async () => '"é"' }), { maxBytes: 3 }),
    /too_large/,
  );
  await assert.rejects(
    call(async () => ({ ok: true, text: () => new Promise(() => {}) }), { timeoutMs: 20 }),
    /cancelled/,
  );
});
test("invalid limits and pre-cancelled requests never invoke transport", async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    return Response.json({});
  };
  for (const options of [
    { timeoutMs: 0 },
    { timeoutMs: 16000 },
    { maxBytes: 4000001 },
    { maxBytes: NaN },
  ])
    await assert.rejects(call(transport, options), /limits/);
  const c = new AbortController();
  c.abort();
  await assert.rejects(call(transport, {}, { signal: c.signal }), /cancelled/);
  assert.equal(calls, 0);
});
