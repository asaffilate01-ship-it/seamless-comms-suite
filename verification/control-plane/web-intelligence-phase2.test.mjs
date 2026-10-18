import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sql = read("supabase/migrations/20261018235300_web_intelligence_monitoring_phase2.sql");
const functions = read("src/modules/web-intelligence/functions.ts");
const monitorPanel = read("src/modules/web-intelligence/WebIntelMonitoringPanel.tsx");
const parentPanel = read("src/modules/web-intelligence/WebIntelligencePanel.tsx");

test("opt-in source monitoring is constrained by review, entitlement and active products", () => {
  assert.match(sql, /enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql, /CHECK\(interval_hours IN\(24,72,168\)\)/);
  assert.match(sql, /CHECK\(retention_days IN\(7,30,90\)\)/);
  assert.match(sql, /Tenant maximum of ten source monitors reached/);
  assert.match(sql, /s\.status='approved'/);
  assert.match(sql, /tp\.status='active'/);
  assert.match(sql, /has_tenant_entitlement\(m\.tenant_id,'omniqora\.web-intelligence'\)/);
  assert.match(sql, /Tenant administrator required/);
});

test("scheduled jobs use vetted sources, existing quotas and idempotent worker claims", () => {
  assert.match(sql, /CREATE FUNCTION public\.schedule_due_web_intel_monitors/);
  assert.match(sql, /FOR UPDATE OF m SKIP LOCKED/);
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(sql, /j\.status IN\('queued','running'\)/);
  assert.match(sql, /interval '60 minutes'/);
  assert.match(sql, /LIMIT 10 FOR UPDATE OF m SKIP LOCKED/);
  assert.match(sql, /gen_random_uuid\(\),monitor\.id,'scheduled'/);
  assert.match(sql, /PERFORM public\.schedule_due_web_intel_monitors\(\)/);
});

test("monitors and changes cannot be directly mutated by browser roles", () => {
  assert.match(sql, /ALTER TABLE public\.web_intel_monitors ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.web_intel_changes ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.web_intel_monitors,public\.web_intel_changes FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.web_intel_monitors,public\.web_intel_changes TO authenticated/);
  assert.match(sql, /is_tenant_member\(tenant_id,\(select auth\.uid\(\)\)\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.schedule_due_web_intel_monitors\(\)\s+FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.prune_web_intel_evidence\(\)\s+FROM PUBLIC,anon,authenticated/);
  assert.match(functions, /requireService\(context, data\.tenantId, "omniqora\.web-intelligence"\)/);
  assert.match(functions, /requireAdminRole\(access\.role\)/);
});

test("fingerprints only compare within the same tenant, product and reviewed source", () => {
  assert.match(sql, /CREATE FUNCTION public\.record_web_intel_change/);
  assert.match(sql, /d\.tenant_id=NEW\.tenant_id/);
  assert.match(sql, /d\.product_key=NEW\.product_key/);
  assert.match(sql, /d\.source_id=NEW\.source_id/);
  assert.match(sql, /WHEN previous\.content_sha256=NEW\.content_sha256 THEN 'unchanged'/);
  assert.match(sql, /'initial'/);
  assert.match(sql, /'changed'/);
  assert.doesNotMatch(sql, /INSERT INTO public\.ai_tool_bindings/);
  assert.doesNotMatch(sql, /INSERT INTO public\.ai_agent_jobs/);
});

test("expired source text is hidden before bounded physical deletion", () => {
  assert.match(sql, /ADD COLUMN retention_until timestamptz/);
  assert.match(sql, /SET retention_until=captured_at \+ interval '30 days'/);
  assert.match(sql, /ALTER COLUMN retention_until SET NOT NULL/);
  assert.match(sql, /CREATE FUNCTION public\.set_web_intel_retention/);
  assert.match(sql, /NEW\.retention_until/);
  assert.match(sql, /retention_until > now\(\)/);
  assert.match(sql, /DELETE FROM public\.web_intel_documents/);
  assert.match(sql, /LIMIT 100/);
  assert.match(sql, /detected_at<=now\(\)-interval '120 days'/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.match(sql, /PERFORM public\.prune_web_intel_evidence\(\)/);
});

test("no tenant URL execution or automatic AI ingestion in phase 2 UI", () => {
  assert.match(parentPanel, /<WebIntelMonitoringPanel/);
  assert.match(monitorPanel, /canManage = entitled/);
  assert.match(monitorPanel, /Enable scheduled checks/);
  assert.match(monitorPanel, /Pause future checks/);
  assert.match(monitorPanel, /Change evidence \(metadata only\)/);
  assert.doesNotMatch(monitorPanel, /dangerouslySetInnerHTML|fetch\(/);
  assert.match(functions, /web_intel_changes/);
  assert.match(functions, /web_intel_monitors/);
});
