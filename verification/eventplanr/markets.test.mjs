import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MARKETS} from '../../adapters/eventplanr/control-plane.mjs';
const manifest=JSON.parse(readFileSync(new URL('../../src/modules/control-plane/eventplanr-markets.json',import.meta.url)));
const registry=JSON.parse(readFileSync(new URL('../../src/modules/control-plane/portfolio-factory-registry.json',import.meta.url)));
test('country directory agrees with adapter and canonical repository mappings',()=>{
 assert.equal(manifest.productKey,'eventplanr');assert.equal(manifest.activation,'not_activated');
 assert.deepEqual(manifest.markets.map(m=>m.country).sort(),['DE','GB']);
 const product=registry.products.find(p=>p.productKey==='eventplanr');
 for(const market of manifest.markets){for(const field of ['country','currency','locale','timezone','repository'])assert.equal(market[field],MARKETS[market.country][field]);assert.ok(product.repositories.includes(`https://github.com/${market.repository}.git`));}
});
