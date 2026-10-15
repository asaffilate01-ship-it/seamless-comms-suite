/** Server-only transport and cryptography. Import dynamically inside authenticated handlers. */
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {ensure, guid, validateModel, buildKpiQuery, analyseKpi} from './powerbi-analysis.mjs';
export const SCOPES = ['https://analysis.windows.net/powerbi/api/Workspace.Read.All', 'https://analysis.windows.net/powerbi/api/Dataset.Read.All'];
const API = 'https://api.powerbi.com/v1.0/myorg';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const secretBinding = (tenantId, userId, purpose) => `${guid(tenantId)}:${guid(userId)}:${purpose}`;
export function encryptionKey(env) {
  ensure(typeof env.OMNIQORA_BI_TOKEN_KEY === 'string' && /^[0-9a-f]{64}$/i.test(env.OMNIQORA_BI_TOKEN_KEY), 'BI_TOKEN_KEY_NOT_CONFIGURED');
  return Buffer.from(env.OMNIQORA_BI_TOKEN_KEY, 'hex');
}
export function seal(value, key, binding) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(binding));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function unseal(value, key, binding) {
  try {
    ensure(typeof value === 'string' && value.length < 100000, 'BI_INVALID_SECRET');
    const parts = value.split('.'); ensure(parts.length === 4 && parts[0] === 'v1', 'BI_INVALID_SECRET');
    const iv = Buffer.from(parts[1], 'base64url'), tag = Buffer.from(parts[2], 'base64url');
    ensure(iv.length === 12 && tag.length === 16, 'BI_INVALID_SECRET');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(binding)); decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8'));
  } catch { throw new Error('BI_SECRET_UNAVAILABLE'); }
}
export function getConfig(env, tenantId) {
  ensure(env.OMNIQORA_POWERBI_ENABLED === 'true', 'BI_PILOT_DISABLED');
  const id = guid(tenantId); let config;
  try { config = JSON.parse(env.OMNIQORA_POWERBI_CONFIG ?? '{}')[id]; } catch { throw new Error('BI_CONFIGURATION_INVALID'); }
  ensure(config && typeof config === 'object', 'BI_TENANT_NOT_CONFIGURED');
  guid(config.entraTenantId); guid(config.clientId);
  ensure(typeof config.clientSecretEnv === 'string' && /^[A-Z][A-Z0-9_]{2,100}$/.test(config.clientSecretEnv), 'BI_CONFIGURATION_INVALID');
  ensure(typeof env[config.clientSecretEnv] === 'string' && env[config.clientSecretEnv].length >= 8, 'BI_CLIENT_SECRET_NOT_CONFIGURED');
  let redirect;
  try { redirect = new URL(config.redirectUri); } catch { throw new Error('BI_REDIRECT_INVALID'); }
  ensure(redirect.protocol === 'https:' && !redirect.username && !redirect.password && !redirect.search && !redirect.hash && redirect.pathname === '/app/shared-engines', 'BI_REDIRECT_INVALID');
  ensure(Array.isArray(config.models) && config.models.length > 0 && config.models.length <= 20, 'BI_MODELS_NOT_CONFIGURED');
  config.models.forEach(validateModel);
  ensure(new Set(config.models.map(model => guid(model.workspaceId))).size <= 3, 'BI_WORKSPACE_LIMIT');
  ensure(new Set(config.models.map(model => model.key)).size === config.models.length, 'BI_DUPLICATE_MODEL');
  encryptionKey(env);
  return {...config, revision: digest(JSON.stringify(config))};
}
export function publicModels(config) {
  return config.models.map(model => ({key: model.key, label: model.label,
    measures: model.measures.map(({key, label, unit}) => ({key, label, unit})),
    dimensions: model.dimensions.map(({key, label}) => ({key, label}))}));
}
export function startOAuth(config) {
  const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
  const params = new URLSearchParams({client_id: config.clientId, response_type: 'code', response_mode: 'fragment',
    redirect_uri: config.redirectUri, scope: SCOPES.join(' '), state, prompt: 'select_account',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'});
  return {state, verifier, stateHash: digest(state), url: `https://login.microsoftonline.com/${guid(config.entraTenantId)}/oauth2/v2.0/authorize?${params}`};
}
export async function boundedJson(url, init = {}, fetcher = globalThis.fetch, maxBytes = 1048576) {
  let response;
  try { response = await fetcher(url, {...init, redirect: 'error', signal: AbortSignal.timeout(15000)}); }
  catch { throw new Error('BI_PROVIDER_UNAVAILABLE'); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(response.status === 429 ? 'BI_RATE_LIMITED' : response.status === 401 ? 'BI_RECONNECT_REQUIRED' : response.status === 403 ? 'BI_PROVIDER_ACCESS_DENIED' : 'BI_PROVIDER_ERROR');
  }
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > maxBytes) { await response.body?.cancel().catch(() => {}); throw new Error('BI_RESPONSE_TOO_LARGE'); }
  ensure(response.body, 'BI_EMPTY_RESPONSE');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('BI_RESPONSE_TOO_LARGE'); }
      chunks.push(Buffer.from(value));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    ensure(body !== null && typeof body === 'object' && !Array.isArray(body), 'BI_INVALID_PROVIDER_RESPONSE');
    return {body, requestId: (response.headers.get('requestid') ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)};
  } catch (error) { throw new Error(error?.message === 'BI_RESPONSE_TOO_LARGE' ? error.message : 'BI_INVALID_PROVIDER_RESPONSE'); }
  finally { reader.releaseLock(); }
}
export async function exchangeCode(config, env, code, verifier, fetcher = globalThis.fetch) {
  ensure(typeof code === 'string' && code.length > 0 && code.length <= 8192, 'BI_INVALID_CODE');
  ensure(typeof verifier === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(verifier), 'BI_INVALID_VERIFIER');
  const body = new URLSearchParams({client_id: config.clientId, client_secret: env[config.clientSecretEnv],
    grant_type: 'authorization_code', redirect_uri: config.redirectUri, code, code_verifier: verifier, scope: SCOPES.join(' ')});
  const result = (await boundedJson(`https://login.microsoftonline.com/${guid(config.entraTenantId)}/oauth2/v2.0/token`,
    {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body}, fetcher, 65536)).body;
  ensure(!result.error && result.token_type?.toLowerCase() === 'bearer' && typeof result.access_token === 'string' && result.access_token.length > 0 && result.access_token.length < 32768, 'BI_INVALID_TOKEN_RESPONSE');
  ensure(Number.isFinite(result.expires_in) && result.expires_in >= 60, 'BI_INVALID_TOKEN_RESPONSE');
  if (result.scope) {
    const granted = new Set(result.scope.split(' ').map(scope => scope.split('/').pop()));
    ensure(SCOPES.every(scope => granted.has(scope.split('/').pop())), 'BI_REQUIRED_SCOPE_MISSING');
  }
  // No refresh token, ID-token interpretation, service-principal fallback or user impersonation.
  return {accessToken: result.access_token, expiresAt: new Date(Date.now() + (Math.min(result.expires_in, 3600) - 30) * 1000).toISOString()};
}
function headers(token) {
  ensure(typeof token === 'string' && token.length > 0 && token.length < 32768 && !/[\r\n]/.test(token), 'BI_RECONNECT_REQUIRED');
  return {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'};
}
export async function discoverModels(config, token, fetcher = globalThis.fetch) {
  const batches = await Promise.all([...new Set(config.models.map(model => guid(model.workspaceId)))].map(async workspaceId => {
    const {body} = await boundedJson(`${API}/groups/${workspaceId}/datasets`, {headers: headers(token)}, fetcher);
    ensure(Array.isArray(body.value) && !body.error && !body['@odata.nextLink'], 'BI_INVALID_PROVIDER_RESPONSE');
    return config.models.filter(item => guid(item.workspaceId) === workspaceId).map(model => ({key: model.key, label: model.label,
      available: body.value.some(item => typeof item?.id === 'string' && item.id.toLowerCase() === guid(model.datasetId))}));
  }));
  return batches.flat();
}
export async function executeInvestigation(config, token, request, fetcher = globalThis.fetch) {
  const model = config.models.find(item => item.key === request.modelKey);
  ensure(model, 'BI_MODEL_NOT_APPROVED');
  const query = buildKpiQuery(model, request);
  const available = await discoverModels({...config, models: [model]}, token, fetcher);
  ensure(available[0]?.available, 'BI_MODEL_ACCESS_DENIED');
  const {body, requestId} = await boundedJson(`${API}/datasets/${guid(model.datasetId)}/executeQueries`, {
    method: 'POST', headers: headers(token), body: JSON.stringify({queries: [{query}], serializerSettings: {includeNulls: true}})
  }, fetcher);
  // Microsoft can return HTTP 200 with a partial result AND an embedded error.
  ensure(!body.error && Array.isArray(body.results) && body.results.length === 1 && !body.results[0].error, 'BI_INCOMPLETE_RESULT');
  const tables = body.results[0].tables;
  ensure(Array.isArray(tables) && tables.length === 1 && !tables[0].error && Array.isArray(tables[0].rows), 'BI_INCOMPLETE_RESULT');
  const analysis = analyseKpi(model, request, tables[0].rows);
  return {...analysis, evidence: {source: 'Power BI Execute Queries', compilerVersion: 'powerbi-kpi-v1', modelKey: model.key, metricKey: request.metricKey, dimensionKey: request.dimensionKey ?? null, workspaceId: guid(model.workspaceId), datasetId: guid(model.datasetId),
    queryHash: digest(query), configurationRevision: config.revision, retrievedAt: new Date().toISOString(), providerRequestId: requestId,
    currentPeriod: [request.currentStart, request.currentEnd], previousPeriod: [request.previousStart, request.previousEnd],
    rowCount: tables[0].rows.length, permissionMode: 'delegated-user', protectionLabel: typeof body.informationProtectionLabel?.name === 'string' ? body.informationProtectionLabel.name.slice(0, 200) : null}};
}
