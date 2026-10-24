import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrationManifest } from '../../verification/staging/guard.mjs';
import { inspectSchema } from './schema-preflight.mjs';

// Hash only a complete, single stored statement. Never hash just the first part
// of a multi-statement migration and mistake it for the entire source file.
export const ledgerSql = `SELECT jsonb_build_object(
  'schemaVersion', 1, 'observedAt', now(),
  'migrations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'version', version, 'statementCount', cardinality(statements),
    'sha256', CASE WHEN cardinality(statements)=1 THEN
      encode(sha256(convert_to(statements[1], 'UTF8')), 'hex') ELSE NULL END
  ) ORDER BY version) FROM supabase_migrations.schema_migrations), '[]'::jsonb)
) AS snapshot;`;

export function reconcileLedger(snapshot, manifest, releaseSha, now = Date.now()) {
  if (!snapshot || !Array.isArray(snapshot.migrations)) throw new Error('Invalid ledger snapshot');
  // Share the version, manifest, release and freshness validation with preflight.
  inspectSchema({ ...snapshot, migrationVersions: snapshot.migrations.map(m => m?.version),
    tables: [], functions: [] }, manifest, releaseSha, now);
  if (snapshot.migrations.some(m => !Number.isInteger(m.statementCount) || m.statementCount < 0
    || (m.sha256 !== null && (typeof m.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(m.sha256)))
    || (m.statementCount !== 1 && m.sha256 !== null))) throw new Error('Invalid ledger digest metadata');
  const local = new Map(manifest.map(m => [m.version, m]));
  const hosted = new Map(snapshot.migrations.map(m => [m.version, m]));
  const matched = [], aliases = [], conflicts = [], unverifiable = [], hostedOnly = [], ambiguous = [];
  const represented = new Set();
  for (const row of snapshot.migrations) {
    const source = local.get(row.version);
    if (row.statementCount !== 1 || row.sha256 === null) {
      unverifiable.push({ hostedVersion: row.version, reason: 'Complete source bytes require separate review' });
    } else if (source) {
      if (source.sha256 === row.sha256) {
        matched.push({ hostedVersion: row.version, sourceVersion: source.version, sha256: row.sha256 });
        represented.add(source.version);
      } else conflicts.push({ hostedVersion: row.version, sourceSha256: source.sha256, hostedSha256: row.sha256 });
    } else {
      const candidates = manifest.filter(m => m.sha256 === row.sha256);
      const duplicates = snapshot.migrations.filter(m => m.sha256 === row.sha256);
      if (!candidates.length) hostedOnly.push({ hostedVersion: row.version, sha256: row.sha256 });
      else if (candidates.length !== 1 || duplicates.length !== 1 || hosted.has(candidates[0].version)) {
        ambiguous.push({ hostedVersion: row.version, sourceVersions: candidates.map(m => m.version) });
      } else {
        aliases.push({ hostedVersion: row.version, sourceVersion: candidates[0].version, sha256: row.sha256 });
        represented.add(candidates[0].version);
      }
    }
  }
  // Same-version conflicts/unverifiable entries are review items, never replay candidates.
  const pendingCandidates = manifest.filter(m => !hosted.has(m.version) && !represented.has(m.version));
  return {
    schemaVersion: 1, releaseSha, observedAt: snapshot.observedAt,
    matched, aliases, conflicts, unverifiable, hostedOnly, ambiguous, pendingCandidates,
    ledgerContentsAccountedFor: ![conflicts, unverifiable, hostedOnly, ambiguous].some(a => a.length),
    applyAllowed: false, databaseIdentityVerified: false, schemaEquivalenceVerified: false,
    stagingDeployed: false, pilotAccepted: false, productionAccepted: false,
    nextStep: 'Review unresolved entries and schema/grants, then rehearse a forward plan in an isolated database; this report is not an executable migration plan',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--sql') console.log(ledgerSql);
    else {
      const [command, snapshotPath, releaseSha] = process.argv.slice(2);
      if (command !== '--snapshot' || !snapshotPath || !releaseSha || process.argv.length !== 5)
        throw new Error('Invalid arguments');
      const raw = readFileSync(snapshotPath, 'utf8');
      if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error('Snapshot too large');
      const report = reconcileLedger(JSON.parse(raw), migrationManifest('supabase/migrations'), releaseSha);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.ledgerContentsAccountedFor ? 0 : 2;
    }
  } catch {
    console.error('Ledger reconciliation failed: validate arguments, fresh snapshot and complete digest metadata. No changes made.');
    process.exitCode = 1;
  }
}
