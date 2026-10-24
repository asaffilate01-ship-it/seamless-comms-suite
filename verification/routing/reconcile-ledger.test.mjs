import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLedger, ledgerSql } from '../../scripts/routing/reconcile-ledger.mjs';
import { migrationManifest } from '../staging/guard.mjs';
const now = Date.parse('2026-10-23T12:00:00Z');
const sha = 'a'.repeat(40), hash = 'b'.repeat(64);
const source = [{ version: '20261001000000', file: 'example.sql', sha256: hash }];
const row = (version = source[0].version, sha256 = hash, statementCount = 1) => ({ version, sha256, statementCount });
const snapshot = migrations => ({ schemaVersion: 1, observedAt: '2026-10-23T11:00:00Z', migrations });
const inspect = (rows, manifest = source) => reconcileLedger(snapshot(rows), manifest, sha, now);

test('exact match never authorizes apply or certifies schema/runtime', () => {
  const r = inspect([row()]); assert.equal(r.matched.length, 1); assert.equal(r.ledgerContentsAccountedFor, true);
  assert.equal(r.pendingCandidates.length, 0);
  for (const key of ['applyAllowed', 'databaseIdentityVerified', 'schemaEquivalenceVerified', 'stagingDeployed', 'pilotAccepted', 'productionAccepted']) assert.equal(r[key], false);
});
test('same version with different bytes blocks and is never a replay candidate', () => {
  const r = inspect([row(undefined, 'c'.repeat(64))]);
  assert.equal(r.conflicts.length, 1); assert.equal(r.pendingCandidates.length, 0); assert.equal(r.ledgerContentsAccountedFor, false);
});
test('unique exact-byte alias is represented without rewriting either ledger', () => {
  const rows = [row('20261001000001')]; const before = structuredClone(rows);
  const r = inspect(rows); assert.equal(r.aliases.length, 1); assert.equal(r.pendingCandidates.length, 0);
  assert.deepEqual(rows, before);
});
test('historical hosted digests match two aliases and the merged Craftvaro migration', () => {
  const manifest = migrationManifest('supabase/migrations');
  const r = inspect([
    row('20260723193652', 'd3a9081583f66d2ff7a71d15365d0d14bcde7ac4d532793cea80936e59e3f737'),
    row('20260723193744', '6cd7695165f10c48b04666b6ea929e1a5f010f75fc2eccdf71b3c164a5a6b22d'),
    row('20261023073521', '4b2de12d5de28451abd457e43a8a04eab6cae5f3be18e67141cf16185eed1dd6'),
  ], manifest);
  assert.deepEqual(r.aliases.map(a => a.sourceVersion), ['20260723193650', '20260723193737']);
  assert.equal(r.matched.length, 1); assert.equal(r.hostedOnly.length, 0); assert.equal(r.ledgerContentsAccountedFor, true);
});
test('duplicate source content cannot establish a unique alias', () => {
  const r = inspect([row('20261001000002')], [...source, { ...source[0], version: '20261001000001' }]);
  assert.equal(r.ambiguous.length, 1); assert.equal(r.aliases.length, 0);
});
test('duplicate hosted content and alias beside canonical version need review', () => {
  for (const rows of [[row('20261001000001'), row('20261001000002')], [row(), row('20261001000001')]]) {
    const r = inspect(rows); assert(r.ambiguous.length); assert.equal(r.aliases.length, 0);
  }
});
test('null and multi-statement digests cannot certify whole-file equivalence', () => {
  for (const count of [0, 1, 2]) {
    const r = inspect([row(undefined, null, count)]); assert.equal(r.unverifiable.length, 1);
    assert.equal(r.pendingCandidates.length, 0); assert.equal(r.ledgerContentsAccountedFor, false);
  }
  assert.throws(() => inspect([row(undefined, hash, 2)]));
});
test('missing source entries are candidates only, even with no ledger conflicts', () => {
  const r = inspect([]); assert.deepEqual(r.pendingCandidates, source); assert.equal(r.applyAllowed, false);
});
test('invalid or incomplete metadata fails closed', () => {
  for (const rows of [[row(), row()], [row('bad')], [row(undefined, 'bad')], [row(undefined, hash, -1)], [null], [{ version: source[0].version }]]) assert.throws(() => inspect(rows));
  for (const observedAt of ['invalid', '2026-10-21', '2026-10-24']) assert.throws(() => reconcileLedger({ ...snapshot([]), observedAt }, source, sha, now));
  assert.throws(() => reconcileLedger(snapshot([]), source, 'main', now));
});
test('query reads only metadata and guards complete single-statement hashes', () => {
  assert.match(ledgerSql, /^SELECT /); assert.match(ledgerSql, /CASE WHEN cardinality\(statements\)=1/);
  assert.doesNotMatch(ledgerSql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|CALL)\b/i);
});

test('unknown hosted content is preserved as a blocking review item', () => {
  const r = inspect([row('20261002000000', 'd'.repeat(64))]);
  assert.equal(r.hostedOnly.length, 1); assert.equal(r.ledgerContentsAccountedFor, false);
  assert.equal(r.applyAllowed, false);
});
