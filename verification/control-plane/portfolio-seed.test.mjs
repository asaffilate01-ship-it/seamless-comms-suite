import assert from 'node:assert/strict';
import fs from 'node:fs';

const rows = JSON.parse(
  fs.readFileSync(
    new URL('../../src/modules/control-plane/portfolio-seed.json', import.meta.url),
    'utf8',
  ),
);

assert.equal(rows.length, 120, 'portfolio seed must preserve all 120 classified rows');
assert.deepEqual(
  rows.map((row) => row.sourceRow),
  Array.from({ length: 120 }, (_, index) => index + 1),
  'source rows must remain stable and contiguous',
);
assert.equal(
  rows.filter((row) => row.name === 'OMNIQORA').length,
  1,
  'Omniqora platform row must be unique',
);
assert.equal(
  rows.find((row) => row.name === 'OMNIQORA')?.architectureRole,
  'platform_landlord',
);
assert.ok(
  rows.some((row) => row.traits.includes('marketplace')),
  'marketplace classifications must be retained',
);
assert.ok(
  rows.some((row) => row.traits.includes('site_only')),
  'site-only products must be classified',
);

console.log(`portfolio seed verified: ${rows.length} rows`);
