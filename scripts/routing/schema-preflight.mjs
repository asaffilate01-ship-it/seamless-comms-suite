import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrationManifest } from '../../verification/staging/guard.mjs';

// Inventory only: presence and RLS flags do not prove policies, grants or runtime wiring.
export const requiredTables = [
  'tenants', 'tenant_products', 'tenant_services', 'provider_bindings',
  'crm_people', 'crm_leads', 'crm_opportunities', 'crm_activities',
  'dispatch_agents', 'dispatch_vehicles', 'dispatch_jobs', 'dispatch_job_stops',
  'dispatch_agent_positions', 'dispatch_pod', 'tracking_snapshots', 'public_tracking_tokens',
  'fleet_shifts', 'routing_policies', 'routing_matrix_jobs', 'routing_matrix_cells',
  'routing_matrix_daily_quota', 'routing_optimisation_jobs', 'routing_route_plans',
  'routing_route_plan_stops', 'routing_road_batches', 'routing_road_batch_tiles',
];
export const requiredFunctions = [
  'routing_create_optimisation', 'routing_queue_optimisation_matrix',
  'routing_queue_matrix_batch', 'service_complete_road_matrix',
  'routing_assert_batch_ready', 'routing_apply_optimisation',
  'agent_portal_status', 'agent_portal_position', 'agent_portal_pod',
];

// Reads catalogue metadata and migration versions only; no customer rows or secrets.
// If the migration ledger is inaccessible, the query fails rather than assuming no drift.
export const snapshotSql = `SELECT jsonb_build_object(
  'schemaVersion', 1,
  'observedAt', now(),
  'migrationVersions', COALESCE((SELECT jsonb_agg(version ORDER BY version)
    FROM supabase_migrations.schema_migrations), '[]'::jsonb),
  'tables', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', c.relname, 'rls', c.relrowsecurity))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')), '[]'::jsonb),
  'functions', COALESCE((SELECT jsonb_agg(DISTINCT p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'), '[]'::jsonb)
) AS snapshot;`;

export function inspectSchema(snapshot, manifest, releaseSha, now = Date.now()) {
  if (!/^[a-f0-9]{40}$/.test(releaseSha ?? '')) throw new Error('Exact release SHA required');
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.migrationVersions)
      || !Array.isArray(snapshot.tables) || !Array.isArray(snapshot.functions))
    throw new Error('Invalid schema snapshot');
  const observed = Date.parse(snapshot.observedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(now) || observed > now || now - observed > 86400000)
    throw new Error('Schema snapshot must be from the last 24 hours and not the future');
  const versions = snapshot.migrationVersions;
  if (versions.some(v => typeof v !== 'string' || !/^\d{14}$/.test(v)) || new Set(versions).size !== versions.length)
    throw new Error('Invalid or duplicate hosted migration version');
  if (!Array.isArray(manifest) || !manifest.length || manifest.some(m => !/^\d{14}$/.test(m.version)
      || !/^[a-f0-9]{64}$/.test(m.sha256)) || new Set(manifest.map(m => m.version)).size !== manifest.length)
    throw new Error('Invalid source migration manifest');
  if (snapshot.tables.some(t => !t || typeof t.name !== 'string' || typeof t.rls !== 'boolean')
      || new Set(snapshot.tables.map(t => t.name)).size !== snapshot.tables.length
      || snapshot.functions.some(f => typeof f !== 'string')) throw new Error('Invalid schema inventory');
  const local = new Set(manifest.map(m => m.version));
  const remote = new Set(versions);
  const tables = new Map(snapshot.tables.map(t => [t.name, t]));
  const pendingMigrations = manifest.filter(m => !remote.has(m.version));
  const unknownHostedVersions = versions.filter(v => !local.has(v)).sort();
  const missingTables = requiredTables.filter(t => !tables.has(t));
  const rlsDisabled = requiredTables.filter(t => tables.has(t) && !tables.get(t).rls);
  const missingFunctions = requiredFunctions.filter(f => !snapshot.functions.includes(f));
  const inventoryAligned = ![pendingMigrations, unknownHostedVersions, missingTables, rlsDisabled, missingFunctions].some(a => a.length);
  return {
    schemaVersion: 1, releaseSha, observedAt: snapshot.observedAt,
    inventoryAligned, pendingMigrations, unknownHostedVersions, missingTables, rlsDisabled, missingFunctions,
    migrationContentsVerified: false, databaseIdentityVerified: false,
    stagingDeployed: false, pilotAccepted: false, productionAccepted: false,
    nextStep: unknownHostedVersions.length ? 'Reconcile hosted-only migrations before preparing any apply plan'
      : !inventoryAligned ? 'Rehearse the complete source chain in an isolated approved staging database'
      : 'Verify grants, policies, provider bindings and the authenticated pilot flow in staging',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--sql') console.log(snapshotSql);
    else {
      const [command, snapshotPath, releaseSha] = process.argv.slice(2);
      if (command !== '--snapshot' || !snapshotPath || !releaseSha || process.argv.length !== 5)
        throw new Error('Usage: --sql OR --snapshot snapshot.json exact-release-sha');
      const raw = readFileSync(snapshotPath, 'utf8');
      if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error('Snapshot too large');
      const report = inspectSchema(JSON.parse(raw), migrationManifest('supabase/migrations'), releaseSha);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.inventoryAligned ? 0 : 2;
    }
  } catch {
    console.error('Schema preflight failed: validate arguments, snapshot freshness and migration inventory. No changes made.');
    process.exitCode = 1;
  }
}
