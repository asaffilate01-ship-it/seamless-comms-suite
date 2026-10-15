import assert from 'node:assert/strict';
import fs from 'node:fs';

const rows = JSON.parse(
  fs.readFileSync(
    new URL('../../src/modules/control-plane/portfolio-seed.json', import.meta.url),
    'utf8',
  ),
);

assert.equal(rows.length, 127, 'portfolio seed includes canonical source assets, ChefzHub, Finvessa and five travel assets');
assert.deepEqual(
  rows.map((row) => row.sourceRow),
  Array.from({ length: 127 }, (_, index) => index + 1),
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


const travel = rows.filter((row) => ['TRAVENEXA','FLIGHTLOUNGE','BESTFARES BESTRATES','MAROCWAYS','ROUTE50'].includes(row.name));
assert.equal(travel.length, 5, 'all five discussed travel portfolio assets must be present');
assert.equal(travel.find((row) => row.name === 'TRAVENEXA')?.architectureRole, 'landlord');
for (const row of travel.filter((row) => row.name !== 'TRAVENEXA')) {
  assert.equal(row.architectureRole, 'tenant');
  assert.equal(row.parentLandlord, 'TRAVENEXA');
  assert.equal(row.repositoryUrl, null, 'do not invent a source repository');
}

console.log(`portfolio seed verified: ${rows.length} rows`);

const partner = rows.find((row) => row.name === 'CHEFZHUB (DISHBEE HIVE CUSTOMER)');
const practice = rows.find((row) => row.name === 'FINVESSA (ACCOUNTANCY PRACTICE TENANT)');
assert.equal(partner?.architectureRole, 'tenant');
assert.equal(partner?.parentLandlord, 'DISHBEE');
assert.equal(practice?.architectureRole, 'tenant');
assert.equal(practice?.parentLandlord, 'OMNIQORA ACCOUNTS');
