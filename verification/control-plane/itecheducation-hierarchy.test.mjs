import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { auditPortfolioRegistry } from '../../scripts/factory-portfolio-audit.mjs';

const registry = JSON.parse(readFileSync(new URL('../../src/modules/control-plane/portfolio-factory-registry.json', import.meta.url), 'utf8'));

test('education brands belong to one landlord without duplicate product identities', () => {
  const keys = ['ilmvero', 'traindirekt', 'skillfinch', 'unipathway'];
  assert.equal(registry.products.filter(p => p.productKey === 'itecheducation').length, 1);
  assert.equal(registry.products.filter(p => keys.includes(p.productKey)).length, 0);
  const tenants = registry.tenants.filter(t => t.parentLandlord === 'itecheducation');
  assert.deepEqual(tenants.map(t => t.tenantKey).sort(), keys.sort());
  for (const tenant of tenants) {
    assert.equal(tenant.productKey, 'itecheducation');
    assert.equal(tenant.provisioning, 'not_activated');
    assert.equal(tenant.blueprintState, 'draft');
    assert.ok(tenant.sourceRows.length);
  }
  assert.deepEqual(registry.tenants.find(t => t.tenantKey === 'unipathway').sourceRows, [4, 29]);
  assert.deepEqual(auditPortfolioRegistry(registry).errors, []);
});

test('repository discovery retains tenant source apps and corrects Skillfinch mapping', () => {
  const repos = auditPortfolioRegistry(registry).repositories;
  for (const name of ['schooldash', 'horizon-educate', 'care-quest-learn', 'ascent-education-cloud']) {
    assert.ok(repos.includes('asaffilate01-ship-it/' + name));
  }
  assert.deepEqual(registry.tenants.find(t => t.tenantKey === 'skillfinch').repositories,
    ['https://github.com/asaffilate01-ship-it/care-quest-learn.git']);
});

test('malformed tenant repository references are surfaced by the audit', () => {
  const copy = structuredClone(registry);
  copy.tenants.find(t => t.tenantKey === 'skillfinch').repositories = ['https://example.com/private.git'];
  assert.ok(auditPortfolioRegistry(copy).unverifiedRepoEntries.some(r => r.tenantKey === 'skillfinch'));
});
