import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sql = read("supabase/migrations/20261018223000_web_intelligence_scrapling_phase1.sql");
const server = read("src/modules/web-intelligence/functions.ts");
const workerApi = read("src/modules/web-intelligence/worker.server.ts");
const py = read("services/web-intelligence/worker.py");
const panel = read("src/modules/web-intelligence/WebIntelligencePanel.tsx");
const hub = read("src/routes/_authenticated/app.connector-hub.tsx");

test("phase 1 is optional and no tenant gets activation by migration", () => {
  assert.match(sql, /omniqora\.web-intelligence/);
  assert.match(sql, /provisioning_mode,status,metadata/);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+public\.tenant_services/i);
  assert.match(sql, /has_tenant_entitlement\(_tenant,'omniqora\.web-intelligence'\)/);
  assert.match(sql, /p\.status='active'/);
});

test("tenant-scoped reads are RLS protected with no direct client write grants", () => {
  for (const table of ["web_intel_sources", "web_intel_jobs", "web_intel_documents", "web_intel_events"]) {
    assert.match(sql, new RegExp("\\b" + table + "\\b"));
  }
  assert.match(sql, /EXECUTE format\(\x27ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY\x27,tab\)/);
  assert.match(sql, /CREATE POLICY "web intel tenant documents read"/);
  assert.match(sql, /public\.is_tenant_member\(tenant_id,\(select auth\.uid\(\)\)\)/);
  assert.match(sql, /GRANT SELECT ON public\.%I TO authenticated/);
  assert.doesNotMatch(sql, /GRANT (?:ALL|INSERT|UPDATE|DELETE) ON public\.web_intel_(?:sources|jobs|documents|events) TO authenticated/i);
});

test("server function scopes caller by membership and active service entitlement", () => {
  assert.match(server, /\.middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(server, /requireTenantMembership\(context, data\.tenantId\)/);
  assert.match(server, /requireService\(context, data\.tenantId, "omniqora\.web-intelligence"\)/);
  assert.match(server, /requireAdminRole\(access\.role\)/);
  assert.match(server, /_idempotency: data\.idempotencyKey/);
  assert.match(sql, /Independent reviewer required/);
  assert.match(sql, /status='approved'/);
});

test("worker claims exact reviewed source; time-bounded lease, hash-validated receipts", () => {
  assert.match(sql, /FOR UPDATE OF j SKIP LOCKED/);
  assert.match(sql, /lease_expires_at=now\(\)\+interval '3 minutes'/);
  assert.match(sql, /rec\.lease_token IS DISTINCT FROM _lease/);
  assert.match(workerApi, /timingSafeEqual/);
  assert.match(workerApi, /createHash\("sha256"\)/);
  assert.match(workerApi, /supabaseAdmin/);
  assert.doesNotMatch(workerApi, /input\.(?:url|tenantId|productKey)/);
});

test("Scrapling restricts endpoints, robots, JS and redirects", () => {
  assert.match(py, /validate_target\(url, hostname\)/);
  assert.match(py, /robotparser\.RobotFileParser\(\)/);
  assert.match(py, /NoRedirect/);
  assert.match(py, /follow_redirects=False/);
  assert.match(py, /stealthy_headers=False/);
  assert.match(py, /ipaddress\.ip_address/);
  assert.doesNotMatch(py, /StealthyFetcher|DynamicFetcher|solve_cloudflare|google_search=True/);
});

test("tenant UI is integrated without creating new product data surfaces", () => {
  assert.match(hub, /<WebIntelligencePanel tenantId=\{tenantId\} productKey=\{productKey\}/);
  assert.match(panel, /q\.data\.entitled/);
  assert.match(panel, /untrusted source/);
  assert.match(panel, /Propose source for independent review/);
  assert.match(panel, /Queue one-page snapshot/);
  assert.doesNotMatch(panel, /dangerouslySetInnerHTML/);
});
