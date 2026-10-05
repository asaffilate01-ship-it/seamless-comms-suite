import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateStagingTarget, migrationManifest } from './guard.mjs';

const valid = () => ({
  PROJECT_REF: 'a'.repeat(20), APPROVED_STAGING_PROJECT_REF: 'a'.repeat(20),
  PRODUCTION_PROJECT_REF: 'b'.repeat(20), MODE: 'dry-run',
  EXPECTED_SHA: 'c'.repeat(40), CHECKED_OUT_SHA: 'c'.repeat(40),
  SUPABASE_ACCESS_TOKEN: 'fixture-token-never-real', SUPABASE_DB_PASSWORD: 'fixture-password-never-real',
});
test('valid staging dry-run is accepted without exposing credentials', () => {
  assert.deepEqual(validateStagingTarget(valid()), {
    target: 'approved-staging', mode: 'dry-run', sha: 'c'.repeat(40),
  });
});
test('apply needs exact confirmation', () => {
  assert.equal(validateStagingTarget({ ...valid(), MODE: 'apply', CONFIRMATION: 'MIGRATE-STAGING' }).mode, 'apply');
});
for (const key of ['PROJECT_REF', 'APPROVED_STAGING_PROJECT_REF', 'PRODUCTION_PROJECT_REF',
  'MODE', 'EXPECTED_SHA', 'CHECKED_OUT_SHA', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD']) {
  test(`missing ${key} fails closed`, () => {
    const env = valid(); delete env[key]; assert.throws(() => validateStagingTarget(env));
  });
}
for (const [name, override] of [
  ['unapproved project', { PROJECT_REF: 'd'.repeat(20) }],
  ['production target', { PRODUCTION_PROJECT_REF: 'a'.repeat(20) }],
  ['wrong release', { CHECKED_OUT_SHA: 'd'.repeat(40) }],
  ['abbreviated release', { EXPECTED_SHA: 'ccccccc' }],
  ['unknown mode', { MODE: 'reset' }],
  ['missing apply confirmation', { MODE: 'apply' }],
  ['case changed confirmation', { MODE: 'apply', CONFIRMATION: 'migrate-staging' }],
  ['injected confirmation', { MODE: 'apply', CONFIRMATION: '"; echo SECRET; #' }],
  ['project with shell content', { PROJECT_REF: '$(echo secret)' }],
  ['blank credential', { SUPABASE_ACCESS_TOKEN: '  ' }],
]) test(name, () => assert.throws(() => validateStagingTarget({ ...valid(), ...override })));

function fixture(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'migration-guard-'));
  try { fn(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}
test('manifest hashes exact contents and orders by migration version', () => fixture((dir) => {
  writeFileSync(join(dir, '20261002000000_second.sql'), 'select 2;');
  writeFileSync(join(dir, '20261001000000_first.sql'), 'select 1;');
  const manifest = migrationManifest(dir);
  assert.equal(manifest[0].version, '20261001000000');
  assert.equal(manifest.length, 2);
  assert.match(manifest[0].sha256, /^[a-f0-9]{64}$/);
  writeFileSync(join(dir, '20261001000000_first.sql'), 'select 3;');
  assert.notEqual(migrationManifest(dir)[0].sha256, manifest[0].sha256);
}));
test('empty migration chain is rejected', () => fixture((dir) => assert.throws(() => migrationManifest(dir))));
test('duplicate migration versions are rejected', () => fixture((dir) => {
  for (const name of ['one', 'two']) writeFileSync(join(dir, `20261001000000_${name}.sql`), 'select 1;');
  assert.throws(() => migrationManifest(dir), /Duplicate/);
}));
test('invalid SQL filename cannot be silently skipped', () => fixture((dir) => {
  writeFileSync(join(dir, 'baseline.sql'), 'select 1;');
  assert.throws(() => migrationManifest(dir), /Invalid/);
}));
test('symlinked SQL files are rejected', () => fixture((dir) => {
  writeFileSync(join(dir, 'source.txt'), 'select 1;');
  symlinkSync(join(dir, 'source.txt'), join(dir, '20261001000000_link.sql'));
  assert.throws(() => migrationManifest(dir), /Invalid/);
}));
test('CLI failure neither runs shell content nor leaks supplied credentials', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./guard.mjs', import.meta.url)), 'target'], {
    env: { ...valid(), MODE: 'apply', CONFIRMATION: '"; echo SECRET; #' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  for (const value of ['SECRET', valid().SUPABASE_ACCESS_TOKEN, valid().SUPABASE_DB_PASSWORD]) {
    assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
  }
});
