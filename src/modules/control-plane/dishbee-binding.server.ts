import { createHash, randomBytes } from "node:crypto";

export class FactoryBindingError extends Error {}
type Env = Record<string, string | undefined>;
type Mapping = { dishbeeLocationId: string; omniqoraLocationId: string };
type Attempt = {
  connectionId: string; tenantId: string; externalTenantId: string;
  controlPlaneKeySuffix: string; runtimeKeyId: string; locationMappings: Mapping[];
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stop = (message: string): never => { throw new FactoryBindingError(message); };
export function approvedOrigin(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) return stop(`${label} is not configured`);
  let url: URL;
  try { url = new URL(value); } catch { return stop(`${label} is invalid`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    return stop(`${label} must be an HTTPS origin without credentials, path or query`);
  }
  return url.origin;
}
export function newFactoryCredentials() {
  const connectorKey = `oqcp_${randomBytes(32).toString("hex")}`;
  const keyId = `oqsvc_${randomBytes(9).toString("hex")}`;
  const secret = randomBytes(32).toString("hex");
  return {
    connectorKey,
    controlPlaneHash: createHash("sha256").update(connectorKey).digest("hex"),
    controlPlaneSuffix: connectorKey.slice(-8),
    runtimeKeyId: keyId,
    runtimeToken: `${keyId}.${secret}`,
    runtimeSecretHash: createHash("sha256").update(secret).digest("hex"),
    runtimeSuffix: secret.slice(-8),
  };
}
function canonicalMappings(value: unknown): string {
  if (!Array.isArray(value) || !value.length || value.length > 200) return stop("Location evidence is incomplete");
  const local = new Set<string>(); const remote = new Set<string>();
  const pairs = value.map((entry: Mapping) => {
    if (!entry || !UUID.test(entry.dishbeeLocationId) || !UUID.test(entry.omniqoraLocationId)) return stop("Location evidence is invalid");
    const a = entry.dishbeeLocationId.toLowerCase(); const b = entry.omniqoraLocationId.toLowerCase();
    if (local.has(a) || remote.has(b)) return stop("Location evidence is duplicated");
    local.add(a); remote.add(b); return `${b}:${a}`;
  });
  return JSON.stringify(pairs.sort());
}
export function verifyFactoryReceipt(receipt: any, attempt: Attempt) {
  if (!receipt || receipt.bindingComplete !== true || receipt.productionAccepted !== false ||
      receipt.tenantId !== attempt.externalTenantId || receipt.omniqoraTenantId !== attempt.tenantId ||
      receipt.runtimeKeyId !== attempt.runtimeKeyId || receipt.controlPlaneKeySuffix !== attempt.controlPlaneKeySuffix ||
      receipt.activeLocations !== attempt.locationMappings.length || receipt.mappedLocations !== attempt.locationMappings.length ||
      canonicalMappings(receipt.locationMappings) !== canonicalMappings(attempt.locationMappings)) {
    stop("Dishbee binding evidence does not match this tenant, credential attempt and locations; reconcile before retrying");
  }
  return receipt;
}
async function postDishbee(origin: string, secret: string, payload: unknown, send: typeof fetch) {
  const response = await send(`${origin}/api/platform/provisioning`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json", "x-omniqora-provisioning-secret": secret },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return stop(`Dishbee provisioning returned HTTP ${response.status}; inspect the binding attempt before retrying`);
  const reader = response.body?.getReader();
  if (!reader) return stop("Dishbee provisioning response is empty");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) { await reader.cancel(); return stop("Dishbee provisioning response is too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let data: any;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { return stop("Dishbee provisioning response is invalid"); }
  if (data?.ok !== true || !data.status) return stop("Dishbee provisioning was not acknowledged");
  return data.status;
}

// Binds a real draft workspace; does not create tenants or publish storefronts.
// A durable hash-only attempt prevents competing jobs from rotating credentials.
export async function provisionDishbeeFactory(db: any, job: any, options: { env?: Env; send?: typeof fetch } = {}) {
  const env = options.env ?? process.env; const send = options.send ?? fetch;
  if (!UUID.test(job?.tenant_id) || !UUID.test(job?.id) || !["provision", "update", "resume", "verify"].includes(job?.action)) {
    return stop("A valid enabling provisioning job is required");
  }
  const connectionResult = await db.from("product_connections").select("*")
    .eq("tenant_id", job.tenant_id).eq("product_key", "dishbee")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (connectionResult.error) return stop("Dishbee connection lookup failed");
  const connection = connectionResult.data;
  if (!connection || !UUID.test(connection.external_tenant_id)) return stop("Link the real Dishbee tenant UUID in Tenant Factory first");
  if (["suspended", "disabled", "revoked"].includes(connection.status)) return stop("Dishbee connection is disabled");
  const origin = approvedOrigin(env.DISHBEE_APP_URL, "DISHBEE_APP_URL");
  if (approvedOrigin(connection.base_url, "Dishbee connection URL") !== origin) return stop("Dishbee connection URL differs from the deployment-approved origin");
  const factoryOrigin = approvedOrigin(env.OMNIQORA_PUBLIC_URL, "OMNIQORA_PUBLIC_URL");
  const secret = env.DISHBEE_PROVISIONING_SECRET ?? "";
  if (secret.length < 32) return stop("DISHBEE_PROVISIONING_SECRET is not configured");
  const existing = await db.from("dishbee_factory_binding_attempts")
    .select("connection_id,tenant_id,external_tenant_id,control_plane_suffix,runtime_key_id,location_mappings,state")
    .eq("connection_id", connection.id).maybeSingle();
  if (existing.error) return stop("Factory binding migration has not been verified");
  const before = await postDishbee(origin, secret, { action: "status", tenantId: connection.external_tenant_id }, send);
  let attempt: Attempt;
  let receipt: any;
  if (existing.data) {
    const row = existing.data;
    attempt = { connectionId: row.connection_id, tenantId: row.tenant_id, externalTenantId: row.external_tenant_id,
      controlPlaneKeySuffix: row.control_plane_suffix, runtimeKeyId: row.runtime_key_id, locationMappings: row.location_mappings };
    // A lost response after remote commit can be recovered without a new secret.
    receipt = verifyFactoryReceipt(before, attempt);
  } else {
    if (before.controlPlaneBound !== false || before.omniqoraRuntimeBound !== false || before.tenantId !== connection.external_tenant_id) {
      return stop("Existing Dishbee credentials require explicit reconciliation; automatic rotation is disabled");
    }
    const credentials = newFactoryCredentials();
    const prepared = await db.rpc("server_prepare_dishbee_factory_binding", {
      _connection: connection.id, _job: job.id,
      _control_plane_hash: credentials.controlPlaneHash, _control_plane_suffix: credentials.controlPlaneSuffix,
      _runtime_key_id: credentials.runtimeKeyId, _runtime_hash: credentials.runtimeSecretHash, _runtime_suffix: credentials.runtimeSuffix,
    });
    if (prepared.error || !prepared.data) return stop("Factory binding attempt could not be reserved; resolve missing locations or the existing attempt");
    attempt = prepared.data as Attempt;
    if (attempt.tenantId !== job.tenant_id || attempt.externalTenantId !== connection.external_tenant_id ||
        attempt.connectionId !== connection.id || attempt.runtimeKeyId !== credentials.runtimeKeyId ||
        attempt.controlPlaneKeySuffix !== credentials.controlPlaneSuffix) return stop("Factory binding reservation identity mismatch");
    canonicalMappings(attempt.locationMappings);
    const bound = await postDishbee(origin, secret, {
      action: "bind_omniqora", tenantId: connection.external_tenant_id, omniqoraTenantId: job.tenant_id,
      productKey: "dishbee", controlPlaneUrl: `${factoryOrigin}/api/control-plane/tenant-snapshot`, runtimeUrl: factoryOrigin,
      connectorKey: credentials.connectorKey, runtimeToken: credentials.runtimeToken,
      locationMappings: attempt.locationMappings,
    }, send);
    receipt = verifyFactoryReceipt(bound, attempt);
  }
  const completed = await db.rpc("server_complete_dishbee_factory_binding", { _connection: connection.id, _receipt: receipt });
  if (completed.error || !completed.data) return stop("Binding is saved but local acknowledgement needs reconciliation; do not rotate credentials");
  return completed.data;
}
