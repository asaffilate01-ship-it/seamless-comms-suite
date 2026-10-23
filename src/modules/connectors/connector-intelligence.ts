/**
 * Phase 1: strictly local, deterministic API discovery from authorised JSON.
 * No outbound requests, model invocation, captured credentials, storage or execution.
 * Input is untrusted. Only structural metadata is returned to the UI/code generator.
 */
export type ImportKind = "openapi" | "har";
export type ApiVerb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export interface ProposedOperation {
  method: ApiVerb;
  path: string;
  id: string;
  queryFields: string[];
  requestFields: string[];
  responseFields: string[];
}
export interface ConnectorDiscovery {
  kind: ImportKind;
  sourceHost: string | null;
  authentication: string[];
  operations: ProposedOperation[];
  warnings: string[];
  status: "review_only";
}

const MAX_INPUT = 300_000;
const MAX_OPERATIONS = 80;
const MAX_HAR_ENTRIES = 1_000;
const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const SAFE_FIELD = /^[a-zA-Z][a-zA-Z0-9_]{0,48}$/;
const SAFE_SEGMENT = /^[a-zA-Z][a-zA-Z0-9_.-]{0,48}$/;
const TEMPLATE_SEGMENT = /^\{[a-zA-Z][a-zA-Z0-9_]{0,48}\}$/;
const SENSITIVE = /auth|secret|token|passw|cookie|session|signat|api.?key|credential|bearer|private|cvv|card|iban|ssn|dob|birth|email|phone|mobile|address|postcode|person|pin|otp|account.?number/i;
const HAR_STATIC_PARTS = new Set([
  "api", "v1", "v2", "v3", "v4", "health", "status", "users", "user", "customers", "customer",
  "orders", "order", "quotes", "quote", "deliveries", "delivery", "stores", "store", "products",
  "product", "items", "item", "inventory", "locations", "location", "tracking", "track", "events",
  "webhooks", "shipments", "shipment", "drivers", "driver", "reports", "transactions", "payments",
  "refunds", "invoices", "search", "list", "details", "create", "update", "cancel", "accept",
  "dispatch", "pickup", "dropoff", "rates", "pricing", "routes", "jobs", "job", "menus", "menu",
  "availability", "checkout", "confirm", "complete", "estimate", "me", "graphql", "ping", "sandbox",
]);

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const valueString = (value: unknown): string => typeof value === "string" ? value : "";
const safeFields = (names: string[]): string[] => [...new Set(names.filter(name => SAFE_FIELD.test(name) && !SENSITIVE.test(name)))].slice(0, 24).sort();
const fieldsFromSchema = (value: unknown): string[] => safeFields(Object.keys(record(record(value).properties)));

function normalisePath(raw: string, isHar: boolean): string | null {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.length > 300 || /[\\\u0000-\u001f\u007f?#]/.test(raw)) return null;
  if (raw === "/") return "/";
  const segments = raw.slice(1).split("/");
  if (segments.some(s => !s || s === "." || s === "..")) return null;
  const cleaned = segments.map(segment => {
    if (TEMPLATE_SEGMENT.test(segment)) return SENSITIVE.test(segment) ? "{id}" : segment;
    if (!SAFE_SEGMENT.test(segment) || SENSITIVE.test(segment) || /^\d+$/.test(segment)) return "{id}";
    if (isHar && !HAR_STATIC_PARTS.has(segment.toLowerCase())) return "{id}";
    return segment;
  });
  return "/" + cleaned.join("/");
}

function hostFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") return null;
    if (!/^[a-z0-9.-]{4,200}$/i.test(url.hostname) || !url.hostname.includes(".")) return null;
    if (/^(?:localhost|\d+\.\d+\.\d+\.\d+)$/.test(url.hostname) || /\.(?:local|internal)$/i.test(url.hostname)) return null;
    return url.hostname.toLowerCase();
  } catch { return null; }
}

function operationId(method: ApiVerb, path: string): string {
  const chunks = (method.toLowerCase() + " " + path.replace(/\{[^}]*\}/g, " by id"))
    .match(/[a-zA-Z0-9]+/g) ?? ["operation"];
  return "call" + chunks.map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join("").slice(0, 76);
}
function finish(kind: ImportKind, host: string | null, ops: ProposedOperation[], auth: Set<string>, warnings: string[]): ConnectorDiscovery {
  if (!ops.length) throw new Error("No valid HTTPS API operations found in this import");
  if (ops.length > MAX_OPERATIONS) throw new Error("Too many operations; maximum " + MAX_OPERATIONS);
  const used = new Map<string, number>();
  const unique = ops.map(op => {
    const base = operationId(op.method, op.path);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return {...op, id: n > 1 ? base + n : base};
  });
  return {kind, sourceHost: host, operations: unique, authentication: [...auth].sort(), warnings: [...new Set(warnings)], status: "review_only"};
}

function openApi(document: JsonRecord): ConnectorDiscovery {
  if (!/^3\.\d+(?:\.\d+)?$/.test(valueString(document.openapi))) throw new Error("Import an OpenAPI 3.x JSON document");
  const paths = record(document.paths);
  const warnings = ["Metadata only: official supplier authorization and independent sandbox verification are required."];
  const servers = Array.isArray(document.servers) ? document.servers : [];
  const firstServerUrl = valueString(record(servers[0]).url);
  const host = firstServerUrl ? hostFromUrl(firstServerUrl) : null;
  if (firstServerUrl && !host) warnings.push("Server URL was ignored: expected a standard HTTPS DNS hostname.");
  const auth = new Set<string>();
  for (const scheme of Object.values(record(record(document.components).securitySchemes)).slice(0, 20)) {
    const item = record(scheme);
    if (item.type === "oauth2") auth.add("oauth2");
    if (item.type === "apiKey") auth.add("api_key");
    if (item.type === "http") auth.add(item.scheme === "bearer" ? "bearer" : "http_auth");
    if (item.type === "openIdConnect") auth.add("openid_connect");
  }
  const ops: ProposedOperation[] = [];
  for (const [rawPath, definition] of Object.entries(paths)) {
    const path = normalisePath(rawPath, false);
    if (!path) {warnings.push("Invalid or ambiguous OpenAPI paths were skipped."); continue;}
    for (const verb of VERBS) {
      const def = record(record(definition)[verb.toLowerCase()]);
      if (!Object.keys(def).length) continue;
      const params = [...(Array.isArray(record(definition).parameters) ? record(definition).parameters as unknown[] : []),
        ...(Array.isArray(def.parameters) ? def.parameters : [])];
      const queryFields = safeFields(params.filter(x => record(x).in === "query").map(x => valueString(record(x).name)));
      const media = record(record(def.requestBody).content);
      const requestFields = fieldsFromSchema(record(media["application/json"]).schema);
      const responses = record(def.responses);
      const successCode = Object.keys(responses).find(code => /^2\d\d$/.test(code));
      const responseContent = record(record(responses[successCode ?? "200"]).content);
      const responseFields = fieldsFromSchema(record(responseContent["application/json"]).schema);
      ops.push({method: verb, path, id: "", queryFields, requestFields, responseFields});
      if (ops.length > MAX_OPERATIONS) throw new Error("Too many operations; maximum " + MAX_OPERATIONS);
    }
  }
  return finish("openapi", host, ops, auth, warnings);
}

function jsonKeys(body: unknown): string[] {
  if (typeof body !== "string" || body.length > 32_000 || !body.trim().startsWith("{")) return [];
  try { return safeFields(Object.keys(record(JSON.parse(body)))); } catch { return []; }
}
function har(document: JsonRecord): ConnectorDiscovery {
  const entries = record(document.log).entries;
  if (!Array.isArray(entries) || !entries.length || entries.length > MAX_HAR_ENTRIES) {
    throw new Error("HAR must contain 1–" + MAX_HAR_ENTRIES + " entries");
  }
  const selectedHost = entries.map(e => hostFromUrl(valueString(record(record(e).request).url))).find(Boolean) ?? null;
  if (!selectedHost) throw new Error("HAR contains no supported HTTPS API hostname");
  const auth = new Set<string>();
  const warnings = ["HAR URLs and JSON bodies were reduced to structural metadata; captured values were discarded.",
    "Endpoint paths inferred from traffic may be incomplete or contain redacted dynamic segments."];
  const ops = new Map<string, ProposedOperation>();
  let excludedHosts = 0;
  for (const entry of entries) {
    const request = record(record(entry).request);
    const urlValue = valueString(request.url);
    const host = hostFromUrl(urlValue);
    if (host !== selectedHost) {excludedHosts++; continue;}
    let url: URL;
    try {url = new URL(urlValue);} catch {continue;}
    const method = valueString(request.method).toUpperCase();
    if (!VERBS.includes(method as ApiVerb)) continue;
    const path = normalisePath(url.pathname, true);
    if (!path) continue;
    const headers = Array.isArray(request.headers) ? request.headers : [];
    const names = headers.map(h => valueString(record(h).name).toLowerCase());
    if (names.includes("authorization")) auth.add("header_authorization");
    if (names.includes("cookie")) auth.add("cookie");
    const queryFields = safeFields([...url.searchParams.keys()]);
    const response = record(record(entry).response);
    const requestFields = jsonKeys(record(request.postData).text);
    const responseFields = jsonKeys(record(response.content).text);
    const key = method + " " + path;
    const existing = ops.get(key);
    if (existing) {
      existing.queryFields = safeFields([...existing.queryFields, ...queryFields]);
      existing.requestFields = safeFields([...existing.requestFields, ...requestFields]);
      existing.responseFields = safeFields([...existing.responseFields, ...responseFields]);
    } else {
      ops.set(key, {method: method as ApiVerb, path, id: "", queryFields, requestFields, responseFields});
      if (ops.size > MAX_OPERATIONS) throw new Error("Too many operations; maximum " + MAX_OPERATIONS);
    }
  }
  if (excludedHosts) warnings.push("Other hosts and non-HTTPS requests were excluded from the import.");
  return finish("har", selectedHost, [...ops.values()], auth, warnings);
}

export function inspectConnectorSource(kind: ImportKind, source: string): ConnectorDiscovery {
  if (kind !== "openapi" && kind !== "har") throw new Error("Unsupported import format");
  if (typeof source !== "string" || !source.trim() || source.length > MAX_INPUT) {
    throw new Error("Import must be non-empty JSON up to " + MAX_INPUT + " characters");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error("Invalid JSON document"); }
  const document = record(parsed);
  return kind === "openapi" ? openApi(document) : har(document);
}

/** Produces inert TypeScript; nothing generated can execute API requests. */
export function generateReviewOnlyConnector(discovery: ConnectorDiscovery): string {
  if (discovery.status !== "review_only" || discovery.operations.length > MAX_OPERATIONS || !discovery.operations.length) {
    throw new Error("Only inspected review-only discoveries can be exported");
  }
  for (const op of discovery.operations) {
    if (!/^call[A-Za-z0-9]{1,90}$/.test(op.id) || !VERBS.includes(op.method) || normalisePath(op.path, false) !== op.path ||
      ![...op.queryFields, ...op.requestFields, ...op.responseFields].every(field => safeFields([field]).length === 1)) {
      throw new Error("Review-only draft contains an invalid operation");
    }
  }
  const operations = discovery.operations.map(x => ({
    id: x.id, method: x.method, path: x.path,
    queryFields: x.queryFields, requestFields: x.requestFields, responseFields: x.responseFields,
  }));
  // Do not emit captured hosts, tokens, cookies, query values, sample bodies or provider secrets.
  const methods = operations.map(x => "  async " + x.id + "(_input: Record<string, unknown> = {}): Promise<never> {\n" +
    '    throw new Error("REVIEW_ONLY: this adapter has no authenticated or approved transport");\n  }').join("\n\n");
  return [
    "/* GENERATED REVIEW-ONLY DRAFT. No transport, credentials or live provider access. */",
    "/* An independent reviewer must approve supplier rights, scopes, code and sandbox tests. */",
    "export const proposedOperations = " + JSON.stringify(operations, null, 2) + " as const;",
    "",
    "export class ReviewOnlyConnector {",
    methods,
    "}",
    "",
  ].join("\n");
}
