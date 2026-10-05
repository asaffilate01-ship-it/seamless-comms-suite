import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKpiQuery, analyseKpi, validateModel, validateRequest, guid} from '../src/modules/analytics/powerbi-analysis.mjs';
import {getConfig, encryptionKey, seal, unseal, secretBinding, startOAuth, exchangeCode, boundedJson, discoverModels, executeInvestigation, SCOPES, digest} from '../src/modules/analytics/powerbi.server.mjs';
const tenant = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222';
const workspace = '33333333-3333-4333-8333-333333333333', dataset = '44444444-4444-4444-8444-444444444444';
const model = {key: 'sales', label: 'Sales', workspaceId: workspace, datasetId: dataset, date: {table: 'Calendar', column: 'Date'},
  measures: [{key: 'revenue', label: 'Revenue', table: 'Measures', name: 'Net Revenue', kind: 'additive', unit: 'currency', blankAsZero: false}],
  dimensions: [{key: 'region', label: 'Region', table: 'Store', column: 'Region'}]};
const config = {entraTenantId: tenant, clientId: user, clientSecretEnv: 'TEST_BI_SECRET', redirectUri: 'https://example.test/app/shared-engines', models: [model]};
const env = {OMNIQORA_POWERBI_ENABLED: 'true', OMNIQORA_BI_TOKEN_KEY: 'ab'.repeat(32), OMNIQORA_POWERBI_CONFIG: JSON.stringify({[tenant]: config}), TEST_BI_SECRET: 'fixture-not-a-real-client-secret'};
const request = {modelKey: 'sales', metricKey: 'revenue', dimensionKey: 'region', previousStart: '2026-08-01', previousEnd: '2026-08-31', currentStart: '2026-10-01', currentEnd: '2026-10-31'};
const row = (kind, segment, current, previous) => ({'[__kind]': kind, '[__segment]': segment, '[__current]': current, '[__previous]': previous});
const rows = [row('total', null, 120, 100), row('segment', 'North', 70, 40), row('segment', 'South', 50, 60)];
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {status, headers});
const copy = value => structuredClone(value);

test('configuration is disabled by default and isolates tenant settings', () => {
  assert.throws(() => getConfig({}, tenant), /BI_PILOT_DISABLED/);
  assert.throws(() => getConfig(env, workspace), /BI_TENANT_NOT_CONFIGURED/);
  assert.equal(getConfig(env, tenant).models[0].key, 'sales');
});
test('configuration requires secrets, encryption key and fixed HTTPS callback', () => {
  for (const changes of [{TEST_BI_SECRET: ''}, {OMNIQORA_BI_TOKEN_KEY: 'bad'}]) assert.throws(() => getConfig({...env, ...changes}, tenant));
  for (const redirectUri of ['http://example.test/app/shared-engines', 'https://example.test/wrong', 'https://example.test/app/shared-engines?next=x', 'https://name:pass@example.test/app/shared-engines']) {
    assert.throws(() => getConfig({...env, OMNIQORA_POWERBI_CONFIG: JSON.stringify({[tenant]: {...config, redirectUri}})}, tenant), /BI_REDIRECT_INVALID/);
  }
});
test('configuration revision changes when approved models change', () => {
  const first = getConfig(env, tenant); const changed = copy(config); changed.models[0].label = 'Changed';
  assert.notEqual(first.revision, getConfig({...env, OMNIQORA_POWERBI_CONFIG: JSON.stringify({[tenant]: changed})}, tenant).revision);
});
test('encryption uses random IVs and authenticates tenant/user/purpose', () => {
  const key = encryptionKey(env), binding = secretBinding(tenant, user, 'token'), value = {token: 'private-fixture'};
  const a = seal(value, key, binding), b = seal(value, key, binding);
  assert.notEqual(a, b); assert.ok(!a.includes('private-fixture')); assert.deepEqual(unseal(a, key, binding), value);
  assert.throws(() => unseal(a, key, secretBinding(workspace, user, 'token')), /BI_SECRET_UNAVAILABLE/);
  assert.throws(() => unseal(a, key, secretBinding(tenant, workspace, 'token')), /BI_SECRET_UNAVAILABLE/);
  assert.throws(() => unseal(a, key, secretBinding(tenant, user, 'state')), /BI_SECRET_UNAVAILABLE/);
  assert.throws(() => unseal(a, Buffer.alloc(32), binding), /BI_SECRET_UNAVAILABLE/);
  const parts = a.split('.'); parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  assert.throws(() => unseal(parts.join('.'), key, binding), /BI_SECRET_UNAVAILABLE/);
});
test('PKCE uses S256, random state, delegated read-only scopes and fragment callback', () => {
  const oauth = startOAuth(config), second = startOAuth(config), url = new URL(oauth.url);
  assert.equal(url.origin, 'https://login.microsoftonline.com'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('response_mode'), 'fragment'); assert.equal(oauth.stateHash, digest(oauth.state));
  assert.notEqual(oauth.state, second.state); assert.notEqual(oauth.verifier, second.verifier);
  assert.ok(!oauth.url.includes(oauth.verifier)); assert.ok(!oauth.url.includes(env.TEST_BI_SECRET));
  assert.ok(!url.searchParams.get('scope').includes('Write')); assert.ok(!url.searchParams.get('scope').includes('offline_access'));
});
test('OAuth exchanges a code only on the pinned tenant endpoint and keeps token server-side', async () => {
  const oauth = startOAuth(config); let called;
  const token = await exchangeCode(config, env, 'code', oauth.verifier, async (url, init) => {
    called = {url, init}; return json({token_type: 'Bearer', access_token: 'fixture', expires_in: 3600, scope: SCOPES.join(' '), refresh_token: 'not-retained'});
  });
  assert.ok(called.url.startsWith(`https://login.microsoftonline.com/${tenant}/`)); assert.equal(called.init.redirect, 'error');
  assert.equal(called.init.body.get('grant_type'), 'authorization_code'); assert.equal(called.init.body.get('code_verifier'), oauth.verifier);
  assert.equal(token.accessToken, 'fixture'); assert.ok(!('refreshToken' in token)); assert.ok(Date.parse(token.expiresAt) > Date.now());
});
for (const [name, body] of Object.entries({wrongType: {token_type: 'other', access_token: 'x', expires_in: 3600}, expired: {token_type: 'Bearer', access_token: 'x', expires_in: 0}, missingToken: {token_type: 'Bearer', expires_in: 3600}, missingScopes: {token_type: 'Bearer', access_token: 'x', expires_in: 3600, scope: 'User.Read'}})) {
  test(`OAuth rejects ${name}`, async () => assert.rejects(() => exchangeCode(config, env, 'code', startOAuth(config).verifier, async () => json(body)), /BI_/));
}
test('identifiers, catalogue keys and API path identifiers reject injection', () => {
  for (const bad of ["x'];EVALUATE", '../groups', 'a\nEVALUATE', 'x[y]', 'x/*y']) {
    const changed = copy(model); changed.measures[0].name = bad; assert.throws(() => validateModel(changed), /BI_INVALID_IDENTIFIER/);
  }
  assert.throws(() => guid('../other'), /BI_INVALID_ID/);
  const changed = copy(model); changed.measures.push(copy(changed.measures[0])); assert.throws(() => validateModel(changed), /BI_DUPLICATE_KEY/);
});
test('compiler uses approved metrics and one bounded table, never client DAX', () => {
  const query = buildKpiQuery(model, {...request, query: 'DELETE EVERYTHING'});
  assert.ok(query.startsWith('EVALUATE UNION(')); assert.ok(query.includes('TOPN(101,')); assert.ok(query.includes("'Measures'[Net Revenue]"));
  assert.ok(!query.includes('DELETE')); assert.equal(query.match(/EVALUATE/g).length, 1);
  assert.ok(buildKpiQuery(model, {...request, dimensionKey: null}).startsWith('EVALUATE ROW('));
});
for (const patch of [{modelKey: 'unknown'}, {metricKey: 'unknown'}, {dimensionKey: 'unknown'}, {currentStart: '2026-02-30'}, {currentEnd: '2026-10-30'}, {previousEnd: '2026-11-30'}, {maxSegments: 0}, {maxSegments: 201}]) {
  test(`query rejects invalid request ${JSON.stringify(patch)}`, () => assert.throws(() => validateRequest(model, {...request, ...patch}), /BI_/));
}
test('reconciles additive changes and orders segment movements without causal claims', () => {
  const value = analyseKpi(model, request, rows);
  assert.equal(value.total.change, 20); assert.equal(value.total.percentChange, 20); assert.equal(value.reconciliation.status, 'matched');
  assert.equal(value.contributionEligible, true); assert.equal(value.segments[0].segment, 'North'); assert.equal(value.segments[1].change, -10);
  assert.ok(value.warnings.some(item => item.includes('not proof of causation')));
});
test('mismatch disables contribution attribution', () => {
  const value = analyseKpi(model, request, [row('total', null, 130, 100), ...rows.slice(1)]);
  assert.equal(value.reconciliation.status, 'mismatch'); assert.equal(value.contributionEligible, false);
});
test('ratios and distinct counts are not additively attributed', () => {
  const changed = copy(model); changed.measures[0].kind = 'nonadditive'; changed.measures[0].unit = 'ratio';
  const value = analyseKpi(changed, request, [row('total', null, 0.25, 0.2), row('segment', 'North', 0.3, 0.2)]);
  assert.equal(value.contributionEligible, false); assert.ok(Math.abs(value.percentagePointChange - 5) < 1e-10);
});
test('zero and negative baselines do not create infinite or misleading percent changes', () => {
  for (const previous of [0, -10]) assert.equal(analyseKpi(model, {...request, dimensionKey: null}, [row('total', null, 10, previous)]).total.percentChange, null);
});
test('blank conversion needs explicit approved metric policy', () => {
  assert.throws(() => analyseKpi(model, {...request, dimensionKey: null}, [row('total', null, null, 1)]), /BI_MISSING/);
  const changed = copy(model); changed.measures[0].blankAsZero = true;
  assert.equal(analyseKpi(changed, {...request, dimensionKey: null}, [row('total', null, null, 1)]).total.current, 0);
});
for (const badRows of [[], [...rows, row('total', null, 1, 2)], [...rows, rows[1]], [row('total', null, '120', 100)], [row('total', null, NaN, 100)], [row('total', null, Infinity, 100)]]) {
  test('malformed, duplicate or nonnumeric rows are withheld', () => assert.throws(() => analyseKpi(model, request, badRows), /BI_/));
}
test('extra sentinel segment is rejected as incomplete instead of silently truncated', () => {
  assert.throws(() => analyseKpi(model, {...request, maxSegments: 1}, rows), /BI_INCOMPLETE_RESULT/);
});
for (const status of [401, 403, 429, 500]) {
  test(`provider HTTP ${status} is sanitised and never retried`, async () => {
    let calls = 0; await assert.rejects(() => boundedJson('https://example.test', {}, async () => {calls++; return json({error: {message: 'secret-provider-message'}}, status);}), error => /^BI_/.test(error.message) && !error.message.includes('secret'));
    assert.equal(calls, 1);
  });
}
test('stream and Content-Length limits reject oversized responses', async () => {
  await assert.rejects(() => boundedJson('https://example.test', {}, async () => json({x: 'a'.repeat(200)}), 20), /BI_RESPONSE_TOO_LARGE/);
  await assert.rejects(() => boundedJson('https://example.test', {}, async () => json({}, 200, {'content-length': '99999'}), 20), /BI_RESPONSE_TOO_LARGE/);
});
test('malformed JSON and network errors return safe errors', async () => {
  await assert.rejects(() => boundedJson('https://example.test', {}, async () => new Response('not json')), /BI_INVALID_PROVIDER_RESPONSE/);
  await assert.rejects(() => boundedJson('https://example.test', {}, async () => {throw new Error('secret-in-network-error');}), /BI_PROVIDER_UNAVAILABLE/);
});
test('discovery returns only approved datasets, not unrelated accessible models', async () => {
  const value = await discoverModels(config, 'fixture', async () => json({value: [{id: dataset}, {id: tenant, name: 'Unrelated sensitive model'}]}));
  assert.deepEqual(value, [{key: 'sales', label: 'Sales', available: true}]);
});
test('unavailable model fails before query execution', async () => {
  let calls = 0; await assert.rejects(() => executeInvestigation(config, 'fixture', request, async () => {calls++; return json({value: []});}), /BI_MODEL_ACCESS_DENIED/);
  assert.equal(calls, 1);
});
test('full mocked read workflow records evidence and never impersonates or writes', async () => {
  const calls = [], cfg = getConfig(env, tenant);
  const value = await executeInvestigation(cfg, 'fixture', request, async (url, init) => {
    calls.push({url, init}); return url.endsWith('/datasets') ? json({value: [{id: dataset}]}) : json({results: [{tables: [{rows}]}]}, 200, {requestid: 'request-123'});
  });
  assert.equal(value.evidence.rowCount, 3); assert.equal(value.evidence.configurationRevision, cfg.revision); assert.equal(value.evidence.providerRequestId, 'request-123');
  assert.equal(calls.length, 2); assert.equal(calls[1].init.method, 'POST'); assert.ok(calls[1].url.endsWith('/executeQueries'));
  const sent = JSON.parse(calls[1].init.body); assert.equal(sent.queries.length, 1); assert.ok(!('impersonatedUserName' in sent));
  assert.ok(!JSON.stringify(value).includes('fixture')); assert.equal(calls[1].init.redirect, 'error');
});
for (const body of [{error: {code: 'partial'}, results: [{tables: [{rows}]}]}, {results: [{error: {code: 'partial'}, tables: [{rows}]}]}, {results: [{tables: [{error: {code: 'partial'}, rows}]}]}, {results: [{tables: [{rows}, {rows}]}]}, {results: [{tables: [{rows}]}, {tables: [{rows}]}]}]) {
  test('HTTP 200 embedded errors and multiple result tables are never reported as success', async () => {
    await assert.rejects(() => executeInvestigation(config, 'fixture', request, async url => url.endsWith('/datasets') ? json({value: [{id: dataset}]}) : json(body)), /BI_INCOMPLETE_RESULT/);
  });
}

test('non-object metric rows fail closed with a stable validation error', () => {
  for (const bad of [null, 42, 'row', []]) assert.throws(() => analyseKpi(model, request, [bad]), /BI_INVALID_RESULT_SHAPE/);
});
test('non-object provider JSON is rejected before interpretation', async () => {
  for (const bad of [null, 42, 'text', []]) await assert.rejects(() => boundedJson('https://example.test', {}, async () => json(bad)), /BI_INVALID_PROVIDER_RESPONSE/);
});
