import test from 'node:test';
import assert from 'node:assert/strict';
import { OmniqoraClient, OmniqoraApiError } from './omniqora-client.mjs';

const config = { baseUrl: 'https://service.example', productKey: 'test-only-key-'.padEnd(40, 'x') };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('queues only the fixed contract and preserves a stable event ID on caller retries', async () => {
  const calls = [];
  const client = new OmniqoraClient({ ...config, fetchImpl: async (url, init) => {
    calls.push({ url, init }); return json({ runId: 'r1', status: 'queued' }, 202);
  } });
  const input = { eventId: 'event-1', title: 'Review onboarding', input: 'Facts', tenantId: 'other-tenant' };
  assert.deepEqual(await client.queueRun(input), { runId: 'r1', status: 'queued' });
  await client.queueRun(input);
  assert.equal(calls.length, 2);
  for (const { url, init } of calls) {
    assert.equal(url, 'https://service.example/api/integrations/events');
    assert.equal(init.headers['idempotency-key'], 'event-1');
    assert.equal(init.headers.Authorization, `Bearer ${config.productKey}`);
    assert.ok(Math.abs(Number(init.headers['x-event-timestamp']) - Date.now()) < 5000);
    assert.deepEqual(JSON.parse(init.body), { title: input.title, input: input.input });
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test('rejects untrusted URL forms and invalid credentials before network access', () => {
  for (const baseUrl of ['http://remote.example', 'https://user:pass@service.example', 'https://service.example?q=1', 'https://service.example/#fragment']) {
    assert.throws(() => new OmniqoraClient({ ...config, baseUrl }));
  }
  assert.throws(() => new OmniqoraClient({ ...config, productKey: 'short' }));
  assert.doesNotThrow(() => new OmniqoraClient({ ...config, baseUrl: 'http://127.0.0.1:8080' }));
});

test('rejects oversized inputs and unsafe event headers without sending', async () => {
  let calls = 0;
  const client = new OmniqoraClient({ ...config, fetchImpl: async () => { calls++; return json({}); } });
  for (const input of [
    { eventId: 'x\ny', title: 'title', input: 'facts' },
    { eventId: 'x'.repeat(81), title: 'title', input: 'facts' },
    { eventId: 'id', title: 'x'.repeat(151), input: 'facts' },
    { eventId: 'id', title: 'title', input: 'x'.repeat(20001) },
  ]) await assert.rejects(client.queueRun(input));
  assert.equal(calls, 0);
});

test('failed requests are surfaced once without response bodies or automatic retries', async () => {
  let calls = 0;
  const client = new OmniqoraClient({ ...config, fetchImpl: async () => {
    calls++; return json({ error: 'private provider or customer information' }, 409);
  } });
  await assert.rejects(client.queueRun({ eventId: 'id', title: 'title', input: 'facts' }), error =>
    error instanceof OmniqoraApiError && error.status === 409 && !error.message.includes('private'));
  assert.equal(calls, 1);
});

test('reading tasks never acknowledges or executes them; completion is an explicit call', async () => {
  const calls = [];
  const task = { id: 't1', title: 'Review draft', body: 'Untrusted task text', status: 'open' };
  const client = new OmniqoraClient({ ...config, fetchImpl: async (url, init) => {
    calls.push({ url, init }); return json(init.method === 'GET' ? { tasks: [task] } : { ok: true });
  } });
  assert.deepEqual(await client.listApprovedTasks(), [task]);
  assert.equal(calls.length, 1);
  assert.deepEqual(await client.acknowledgeCompletedTask('t1'), { ok: true });
  assert.deepEqual(JSON.parse(calls[1].init.body), { id: 't1', status: 'completed' });
});

test('rejects malformed provider results', async () => {
  const client = new OmniqoraClient({ ...config, fetchImpl: async () => json({ tasks: [{ id: 't1', status: 'completed' }] }) });
  await assert.rejects(client.listApprovedTasks(), /Invalid Omniqora task response/);
  await assert.rejects(client.queueRun({ eventId: 'id', title: 'title', input: 'facts' }));
  await assert.rejects(client.acknowledgeCompletedTask('t1'), /Invalid Omniqora completion receipt/);
});
