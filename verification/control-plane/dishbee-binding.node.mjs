import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../../src/modules/control-plane/dishbee-binding.server.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { newFactoryCredentials, approvedOrigin, verifyFactoryReceipt, provisionDishbeeFactory } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const env = { DISHBEE_APP_URL: 'https://dishbee.example', OMNIQORA_PUBLIC_URL: 'https://factory.example', DISHBEE_PROVISIONING_SECRET: 'test-only-'.repeat(5) };
const mappings = [{ dishbeeLocationId: id(11), omniqoraLocationId: id(21) }];
const attempt = { connectionId: id(1), tenantId: id(2), externalTenantId: id(3), runtimeKeyId: `oqsvc_${'a'.repeat(18)}`, controlPlaneKeySuffix: '1234abcd', locationMappings: mappings };
const receipt = () => ({ tenantId: id(3), omniqoraTenantId: id(2), runtimeKeyId: attempt.runtimeKeyId, controlPlaneKeySuffix: attempt.controlPlaneKeySuffix, bindingComplete: true, productionAccepted: false, activeLocations: 1, mappedLocations: 1, locationMappings: mappings });
function fixture() {
 const state = { connection: { id: id(1), tenant_id: id(2), product_key: 'dishbee', external_tenant_id: id(3), base_url: env.DISHBEE_APP_URL, status: 'configured' }, pending: null, remote: { tenantId: id(3), controlPlaneBound: false, omniqoraRuntimeBound: false }, calls: [], sent: [], filters: [], loseResponse: false };
 const db = {
  from(table) { const query = { select() { return this; }, eq(key, value) { state.filters.push([table, key, value]); return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { data: table === 'product_connections' ? state.connection : state.pending, error: null }; } }; return query; },
  async rpc(name, args) {
   state.calls.push({ name, args });
   if (name === 'server_prepare_dishbee_factory_binding') {
    if (state.pending) return { data: null, error: { code: 'existing_attempt' } };
    state.pending = { connection_id: id(1), tenant_id: id(2), external_tenant_id: id(3), control_plane_suffix: args._control_plane_suffix, runtime_key_id: args._runtime_key_id, location_mappings: mappings, state: 'prepared' };
    return { data: { ...attempt, controlPlaneKeySuffix: args._control_plane_suffix, runtimeKeyId: args._runtime_key_id }, error: null };
   }
   assert.equal(name, 'server_complete_dishbee_factory_binding');
   state.connection.status = 'connected'; state.pending.state = 'accepted';
   return { data: state.connection, error: null };
  },
 };
 const send = async (url, options) => {
  assert.equal(url, `${env.DISHBEE_APP_URL}/api/platform/provisioning`);
  assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
  const body = JSON.parse(options.body); state.sent.push(body);
  if (body.action === 'bind_omniqora') {
   state.remote = { tenantId: body.tenantId, omniqoraTenantId: body.omniqoraTenantId, runtimeKeyId: body.runtimeToken.split('.')[0], controlPlaneKeySuffix: body.connectorKey.slice(-8), bindingComplete: true, productionAccepted: false, activeLocations: 1, mappedLocations: 1, locationMappings: body.locationMappings };
   if (state.loseResponse) { state.loseResponse = false; throw Error('simulated response lost after commit'); }
  }
  return Response.json({ ok: true, status: state.remote });
 };
 const job = { id: id(4), tenant_id: id(2), action: 'provision' };
 return { state, db, send, job, run: () => provisionDishbeeFactory(db, job, { env, send }) };
}
test('runtime token uses the actual kernel key-id/secret format', () => {
 const c = newFactoryCredentials(); assert.match(c.runtimeToken, /^oqsvc_[a-f0-9]{18}\.[a-f0-9]{64}$/); assert.match(c.connectorKey, /^oqcp_[a-f0-9]{64}$/);
 const secret = c.runtimeToken.split('.')[1]; assert.equal(c.runtimeSecretHash, createHash('sha256').update(secret).digest('hex'));
 assert.equal(c.controlPlaneHash, createHash('sha256').update(c.connectorKey).digest('hex')); assert.notEqual(c.runtimeToken, c.connectorKey);
});
test('credentials are different on independent attempts', () => assert.notEqual(newFactoryCredentials().runtimeToken, newFactoryCredentials().runtimeToken));
test('origin validation rejects credentials, HTTP and path overrides', () => {
 for (const value of ['http://dishbee.example', 'https://x@y.example', 'https://dishbee.example/path', 'https://dishbee.example?x', 'https://dishbee.example#x']) assert.throws(() => approvedOrigin(value, 'test'));
 assert.equal(approvedOrigin('https://dishbee.example/', 'test'), env.DISHBEE_APP_URL);
});
test('matching receipt is accepted as binding only', () => assert.equal(verifyFactoryReceipt(receipt(), attempt).productionAccepted, false));
for (const [name, change] of Object.entries({ tenant: { tenantId: id(9) }, factoryTenant: { omniqoraTenantId: id(9) }, runtimeKey: { runtimeKeyId: 'wrong' }, controlPlane: { controlPlaneKeySuffix: 'wrong' }, count: { activeLocations: 0 }, ready: { bindingComplete: false }, live: { productionAccepted: true }, foreignLocation: { locationMappings: [{ dishbeeLocationId: id(99), omniqoraLocationId: id(21) }] } })) {
 test(`rejects ${name} receipt mismatch`, () => assert.throws(() => verifyFactoryReceipt({ ...receipt(), ...change }, attempt)));
}
test('first binding stores hashes only and sends separate credentials', async () => {
 const f = fixture(); assert.equal((await f.run()).status, 'connected');
 const prepared = f.state.calls[0]; const body = f.state.sent[1];
 assert.equal(prepared.name, 'server_prepare_dishbee_factory_binding');
 assert.equal(prepared.args._runtime_hash, createHash('sha256').update(body.runtimeToken.split('.')[1]).digest('hex'));
 assert.ok(!JSON.stringify(prepared.args).includes(body.runtimeToken)); assert.ok(!JSON.stringify(prepared.args).includes(body.connectorKey));
 assert.equal(f.state.calls[1].name, 'server_complete_dishbee_factory_binding');
});
test('lost response is recovered using the same pending credentials', async () => {
 const f = fixture(); f.state.loseResponse = true; await assert.rejects(f.run(), /response lost/);
 assert.equal(f.state.pending.state, 'prepared');
 assert.equal((await f.run()).status, 'connected');
 assert.equal(f.state.calls.filter(x => x.name === 'server_prepare_dishbee_factory_binding').length, 1);
 assert.equal(f.state.sent.filter(x => x.action === 'bind_omniqora').length, 1);
});
test('existing unrelated remote binding is never silently overwritten', async () => {
 const f = fixture(); f.state.remote.controlPlaneBound = true;
 await assert.rejects(f.run(), /explicit reconciliation/); assert.equal(f.state.calls.length, 0);
});
test('pending mismatched receipt is blocked rather than rotated', async () => {
 const f = fixture(); f.state.loseResponse = true; await assert.rejects(f.run()); f.state.remote.runtimeKeyId = 'different';
 await assert.rejects(f.run(), /does not match/); assert.equal(f.state.calls.length, 1);
});
test('unapproved connection URL receives no shared secret', async () => {
 const f = fixture(); f.state.connection.base_url = 'https://attacker.example';
 await assert.rejects(f.run(), /deployment-approved/); assert.equal(f.state.sent.length, 0); assert.equal(f.state.calls.length, 0);
});
test('suspend jobs do not initialise provisioning', async () => {
 const f = fixture(); f.job.action = 'suspend'; await assert.rejects(f.run(), /enabling provisioning job/); assert.equal(f.state.sent.length, 0);
});
test('non-2xx remote response cannot mark a tenant connected', async () => {
 const f = fixture(); await assert.rejects(provisionDishbeeFactory(f.db, f.job, { env, send: async () => Response.json({ error: 'no' }, { status: 403 }) }), /HTTP 403/);
 assert.equal(f.state.calls.length, 0); assert.equal(f.state.connection.status, 'configured');
});
test('integration jobs bind the explicit external workspace rather than the latest connection', async () => {
 const f = fixture(); Object.assign(f.job, { target_kind: 'integration', target_key: `dishbee:${id(3)}`, action: 'verify' });
 assert.equal((await f.run()).status, 'connected');
 assert.ok(f.state.filters.some(([table,key,value]) => table === 'product_connections' && key === 'external_tenant_id' && value === id(3)));
});
test('integration jobs for another product cannot bind Dishbee', async () => {
 const f = fixture(); Object.assign(f.job, { target_kind: 'integration', target_key: `haccora:${id(3)}`, action: 'verify' });
 await assert.rejects(f.run(), /exact Dishbee integration/); assert.equal(f.state.sent.length, 0);
});
