/** Server-only EventPlanr client for the existing Omniqora schema-v4 snapshot API. */
export const MARKETS = Object.freeze({
  GB: Object.freeze({country: 'GB', currency: 'GBP', timezone: 'Europe/London', locale: 'en-GB', repository: 'asaffilate01-ship-it/eventplanr2'}),
  DE: Object.freeze({country: 'DE', currency: 'EUR', timezone: 'Europe/Berlin', locale: 'de-DE', repository: 'asaffilate01-ship-it/eventplanrger'}),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_.:-]{1,100}$/;
const MAX_AGE = 300_000;
function deny() { throw new Error('EventPlanr Factory connection is unavailable or does not match this deployment'); }
export function connectionConfig(env, country) {
  if (typeof window !== 'undefined') deny();
  const market = Object.hasOwn(MARKETS, country) ? MARKETS[country] : null;
  if (!market || env.EVENTPLANR_FACTORY_ENABLED !== 'true') deny();
  let origin;
  try { origin = new URL(env.OMNIQORA_FACTORY_ORIGIN); } catch { deny(); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || origin.port || origin.hostname !== env.OMNIQORA_FACTORY_ALLOWED_HOST) deny();
  // This endpoint is deployment-controlled; never populate env from a browser request.
  if (!UUID.test(env.OMNIQORA_FACTORY_TENANT_ID ?? '') || !ID.test(env.EVENTPLANR_FACTORY_EXTERNAL_TENANT_ID ?? '') || !/^oqcp_[A-Za-z0-9_-]{35,200}$/.test(env.OMNIQORA_FACTORY_KEY ?? '')) deny();
  return Object.freeze({market, origin: origin.origin, internalTenantId: env.OMNIQORA_FACTORY_TENANT_ID, externalTenantId: env.EVENTPLANR_FACTORY_EXTERNAL_TENANT_ID, key: env.OMNIQORA_FACTORY_KEY});
}
export function validateSnapshot(value, config, now = Date.now()) {
  const generated = Date.parse(value?.generatedAt);
  if (!Number.isFinite(generated) || generated > now + 30_000 || now - generated >= MAX_AGE || value?.schemaVersion !== 4 || value.productKey !== 'eventplanr' || value.internalTenantId !== config.internalTenantId || value.externalTenantId !== config.externalTenantId || value.tenant?.id !== config.internalTenantId || value.tenant?.country_code !== config.market.country || value.tenant?.currency !== config.market.currency || value.tenant?.timezone !== config.market.timezone || value.tenant?.status !== 'active' || value.product?.product_key !== 'eventplanr' || value.product?.status !== 'active' || !Array.isArray(value.capabilities) || !value.capabilities.includes('tenant.snapshot') || !value.entitlements || typeof value.entitlements !== 'object' || Array.isArray(value.entitlements)) deny();
  // Return only the identity and entitlement fields needed locally; never export branding,
  // locations, customer records or raw server responses to a browser or log.
  return Object.freeze({country: config.market.country, internalTenantId: config.internalTenantId, externalTenantId: config.externalTenantId, expiresAt: Math.min(generated + MAX_AGE, now + MAX_AGE), entitlements: structuredClone(value.entitlements)});
}
export function serviceEnabled(snapshot, serviceKey, now = Date.now()) {
  if (!snapshot || !Number.isFinite(snapshot.expiresAt) || now >= snapshot.expiresAt) return false;
  const e = Object.hasOwn(snapshot.entitlements ?? {}, serviceKey) ? snapshot.entitlements[serviceKey] : null;
  if (!e || e.enabled !== true || !['active', 'trial'].includes(e.status)) return false;
  if (e.validFrom != null && (!Number.isFinite(Date.parse(e.validFrom)) || Date.parse(e.validFrom) > now)) return false;
  if (e.status === 'trial' && !e.validUntil) return false;
  if (e.validUntil != null && (!Number.isFinite(Date.parse(e.validUntil)) || Date.parse(e.validUntil) <= now)) return false;
  return true;
}
async function boundedJson(response) {
  if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') deny();
  const reader = response.body?.getReader(); if (!reader) deny();
  const chunks = []; let size = 0;
  try {
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 262144) deny(); chunks.push(item.value); }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}
export async function fetchSnapshot(config, {fetchImpl = fetch, now = Date.now} = {}) {
  if (typeof window !== 'undefined') deny();
  try {
    const response = await fetchImpl(`${config.origin}/api/control-plane/tenant-snapshot`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: {Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({productKey: 'eventplanr', externalTenantId: config.externalTenantId}),
    });
    return validateSnapshot(await boundedJson(response), config, now());
  } catch { deny(); } // Never include credential, remote body, or provider exception in logs.
}
