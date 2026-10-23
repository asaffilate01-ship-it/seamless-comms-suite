import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSchema, requiredTables, requiredFunctions, snapshotSql } from '../../scripts/routing/schema-preflight.mjs';

const now = Date.parse('2026-10-23T12:00:00Z');
const sha = 'a'.repeat(40);
const manifest = [{ version: '20261001000000', file: '20261001000000_example.sql', sha256: 'b'.repeat(64) }];
const fixture = () => ({ schemaVersion: 1, observedAt: '2026-10-23T11:00:00Z',
  migrationVersions: manifest.map(m => m.version),
  tables: requiredTables.map(name => ({ name, rls: true })), functions: [...requiredFunctions] });
const inspect = s => inspectSchema(s, manifest, sha, now);

test('aligned inventory never certifies provider, database identity, migration contents or production', () => {
  const report = inspect(fixture());
  assert.equal(report.inventoryAligned, true);
  for (const field of ['migrationContentsVerified', 'databaseIdentityVerified', 'stagingDeployed', 'pilotAccepted', 'productionAccepted'])
    assert.equal(report[field], false);
});
test('hosted-only migration blocks even when the table inventory matches', () => {
  const s = fixture(); s.migrationVersions.push('20261023073521');
  const r = inspect(s); assert.equal(r.inventoryAligned, false);
  assert.deepEqual(r.unknownHostedVersions, ['20261023073521']);
  assert.match(r.nextStep, /Reconcile hosted-only/);
});
test('partial hosted schema reports missing migrations, routing tables and functions', () => {
  const s = fixture(); s.migrationVersions = []; s.tables = s.tables.filter(t => !t.name.startsWith('routing_')); s.functions = [];
  const r = inspect(s); assert.equal(r.inventoryAligned, false);
  assert.equal(r.pendingMigrations.length, 1); assert(r.missingTables.includes('routing_road_batches'));
  assert(r.missingFunctions.includes('routing_apply_optimisation'));
});
test('RLS disabled on an existing required table blocks alignment', () => {
  const s = fixture(); s.tables.find(t => t.name === 'dispatch_jobs').rls = false;
  assert.deepEqual(inspect(s).rlsDisabled, ['dispatch_jobs']); assert.equal(inspect(s).inventoryAligned, false);
});
for (const observedAt of ['invalid', '2026-10-21T11:00:00Z', '2026-10-24T11:00:00Z'])
  test(`rejects stale, invalid or future timestamp ${observedAt}`, () => assert.throws(() => inspect({ ...fixture(), observedAt })));
test('rejects missing arrays, duplicate migrations, invalid RLS and duplicate tables', () => {
  const missing = fixture(); delete missing.functions; assert.throws(() => inspect(missing));
  const dup = fixture(); dup.migrationVersions.push(dup.migrationVersions[0]); assert.throws(() => inspect(dup));
  const rls = fixture(); rls.tables[0].rls = 'true'; assert.throws(() => inspect(rls));
  const table = fixture(); table.tables.push(table.tables[0]); assert.throws(() => inspect(table));
  assert.throws(() => inspectSchema(fixture(), manifest, 'short', now));
});
test('snapshot query is metadata-only and read-only', () => {
  assert.match(snapshotSql, /^SELECT /);
  assert.doesNotMatch(snapshotSql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|CALL)\b/i);
  assert.doesNotMatch(snapshotSql, /FROM public\./i);
});
