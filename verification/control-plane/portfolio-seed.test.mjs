import assert from 'node:assert/strict';
import fs from 'node:fs';

const rows = JSON.parse(
  fs.readFileSync(
    new URL('../../src/modules/control-plane/portfolio-seed.json', import.meta.url),
    'utf8',
  ),
);

assert.equal(rows.length, 124, 'portfolio seed must preserve the original 120 rows plus four travel assets');
assert.deepEqual(
  rows.map((row) => row.sourceRow),
  Array.from({ length: 124 }, (_, index) => index + 1),
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


const travel = rows.filter((row) => ['TRAVENEXA','FLIGHTLOUNGE','BESTFARES BESTRATES','MAROCWAYS'].includes(row.name));
assert.equal(travel.length, 4, 'all four discussed travel portfolio assets must be present');
assert.equal(travel.find((row) => row.name === 'TRAVENEXA')?.architectureRole, 'landlord');
for (const row of travel.filter((row) => row.name !== 'TRAVENEXA')) {
  assert.equal(row.architectureRole, 'tenant');
  assert.equal(row.parentLandlord, 'TRAVENEXA');
  assert.equal(row.repositoryUrl, null, 'do not invent a source repository');
}

console.log(`portfolio seed verified: ${rows.length} rows`);
