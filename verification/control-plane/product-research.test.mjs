import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createBuildPack, validateDossier} from '../../scripts/lib/product-research.mjs';
const fixture = () => JSON.parse(readFileSync(new URL('../../docs/factory/examples/product-research.json', import.meta.url), 'utf8'));

test('pending evidence blocks planning; reviewed evidence enables planning only', () => {
  const d = fixture();
  assert.equal(createBuildPack(d).implementation.tasks[0].state, 'needs-research');
  d.sources[0].review = 'reviewed'; d.sources[0].reviewer = 'Test reviewer';
  const pack = createBuildPack(d);
  assert.equal(pack.implementation.tasks[0].state, 'ready-for-planning');
  assert.equal(pack.implementation.executable, false);
  assert.equal(pack.implementation.status, 'development-draft');
  assert.equal(pack.implementation.tasks[0].requirement, d.features[0].requirement);
  assert.ok(!JSON.stringify(pack.implementation).includes(d.observations[0].summary));
});
test('inference remains unresolved even when source review is complete', () => {
  const d = fixture(); d.sources[0].review = 'reviewed'; d.sources[0].reviewer = 'Reviewer';
  d.observations[0].kind = 'inferred';
  assert.equal(createBuildPack(d).implementation.tasks[0].state, 'needs-research');
});
test('only selected features enter the build backlog', () => {
  const d = fixture();
  d.features.push({...d.features[0], id: 'later', decision: 'defer'});
  d.features.push({...d.features[0], id: 'omit', decision: 'exclude'});
  const pack = createBuildPack(d);
  assert.equal(pack.implementation.tasks.length, 1);
  assert.equal(pack.implementation.deferred.length, 2);
});
test('rejects duplicate IDs and dangling evidence', () => {
  const d = fixture(); d.sources.push({...d.sources[0]});
  assert.throws(() => validateDossier(d), /Duplicate/);
  const e = fixture(); e.features[0].observationIds = ['missing'];
  assert.throws(() => validateDossier(e), /Unknown/);
  const f = fixture(); f.observations[0].sourceId = 'missing';
  assert.throws(() => validateDossier(f), /Unknown/);
});
test('requires acceptance tests, permission context and reviewer attribution', () => {
  for (const mutate of [d => d.features[0].acceptance = [], d => d.sources[0].permissionNote = '', d => d.sources[0].review = 'reviewed']) {
    const d = fixture(); mutate(d); assert.throws(() => validateDossier(d));
  }
});
test('source URLs cannot carry credentials or query tokens', () => {
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/?token=secret', 'file:///tmp/a', 'https://example.com/#secret']) {
    const d = fixture(); d.sources[0].url = url; assert.throws(() => validateDossier(d));
  }
});
test('digest is stable and changes with evidence or requirements', () => {
  const d = fixture(); const pack = createBuildPack(d);
  assert.equal(pack.digest, createBuildPack(d).digest);
  d.features[0].requirement += ' Keep a revision history.';
  assert.notEqual(pack.digest, createBuildPack(d).digest);
});
test('CLI creates private output and refuses overwrites or malformed JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'product-research-'));
  const cli = new URL('../../scripts/product-research.mjs', import.meta.url);
  const input = join(dir, 'input.json'), output = join(dir, 'output.json');
  const run = () => spawnSync(process.execPath, [cli.pathname, input, output], {encoding: 'utf8'});
  try {
    writeFileSync(input, JSON.stringify(fixture()));
    assert.equal(run().status, 0);
    const original = readFileSync(output, 'utf8');
    if (process.platform !== 'win32') assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(run().status, 1); assert.equal(readFileSync(output, 'utf8'), original);
    writeFileSync(input, '{private malformed text');
    const result = run(); assert.equal(result.status, 1); assert.ok(!result.stderr.includes('private malformed'));
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
