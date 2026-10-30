import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindingFor, workspaceAccess, workspaceClient } from './workspace.mjs';

const scope = { tenantId: '11111111-1111-4111-8111-111111111111', productKey: 'omniqora' };
const binding = { ...scope, endpoint: 'https://documents.example.test' };
const config = JSON.stringify([binding]);
function db(role = 'owner', status = 'active', error = null) {
  const filters = [];
  return { filters, from(table) {
    const query = { select() { return query; }, eq(key, value) { filters.push([table, key, value]); return query; },
      async maybeSingle() { return { error, data: table === 'tenant_members' ? role && { role } : { status } }; } };
    return query;
  } };
}

test('configuration is opt-in and exact tenant/product bound', () => {
  assert.equal(bindingFor(undefined, scope), null);
  assert.deepEqual(bindingFor(config, scope), binding);
  assert.equal(bindingFor(config, { ...scope, productKey: 'dishbee' }), null);
  assert.equal(bindingFor(config, { ...scope, tenantId: '22222222-2222-4222-8222-222222222222' }), null);
});

test('rejects ambiguous origins, duplicate scopes and invalid endpoint configuration', () => {
  for (const raw of ['null', '{}', '{', JSON.stringify([binding, binding]),
    JSON.stringify([binding, { ...binding, productKey: 'dishbee' }]),
    ...['http://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test?token=x'].map(endpoint => JSON.stringify([{ ...binding, endpoint }]))]) {
    assert.throws(() => bindingFor(raw, scope), /configuration is unavailable/);
  }
});

test('authorization filters both tables and current actor before exposing a binding', async () => {
  const database = db();
  assert.deepEqual(await workspaceAccess(database, 'actor-a', scope, config), { binding, canWrite: true });
  assert.deepEqual(database.filters, [
    ['tenant_members', 'tenant_id', scope.tenantId], ['tenant_members', 'user_id', 'actor-a'],
    ['tenant_products', 'tenant_id', scope.tenantId], ['tenant_products', 'product_key', scope.productKey],
  ]);
});

test('missing membership, disabled products and database errors fail closed', async () => {
  for (const database of [db(null), db('owner', 'disabled'), db('owner', 'active', { message: 'secret' })]) {
    await assert.rejects(workspaceAccess(database, 'actor-a', scope, config), /access unavailable/);
  }
});

test('viewer and unknown roles never receive write capability; role revocation is fresh', async () => {
  for (const role of ['viewer', 'invented']) assert.equal((await workspaceAccess(db(role), 'actor-a', scope, config)).canWrite, false);
  for (const role of ['owner', 'admin', 'agent']) assert.equal((await workspaceAccess(db(role), 'actor-a', scope, config)).canWrite, true);
  await assert.rejects(workspaceAccess(db(null), 'actor-a', scope, config));
});

test('no client is created without binding or request authentication', () => {
  assert.throws(() => workspaceClient(null, 'Bearer token'), /not configured/);
  assert.throws(() => workspaceClient(binding, null), /Authentication required/);
});
