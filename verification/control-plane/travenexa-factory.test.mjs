import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../../supabase/migrations/', import.meta.url);
const db = new PGlite();
await db.exec(`
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;
`);
for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
  const sql = await readFile(new URL(name, migrations), 'utf8');
  if (name.startsWith('20260816120554')) {
    for (const id of [
      '18bafcd5-3e4c-4044-bb63-10325a0b7209',
      'e66c0525-1787-4250-be26-79f849624521',
      '890c71b1-cf6e-4b68-a56e-dd6050372481',
      '97319fe5-82fd-44cd-b27d-6ae314ee368b',
    ]) {
      await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, 'fixture@example.invalid']);
    }
  }
  await db.exec(sql);
}
const product = (await db.query(`
 SELECT product_key,product_role,deployment_mode,status,implementation_status,default_base_url,metadata
 FROM public.product_catalogue WHERE product_key='travenexa'
`)).rows[0];
assert.equal(product.product_role, 'landlord');
assert.equal(product.deployment_mode, 'external');
assert.equal(product.status, 'beta');
assert.equal(product.implementation_status, 'external_product');
assert.equal(product.default_base_url, null, 'unknown deployment URL must not be invented');
assert.deepEqual(product.metadata.tenantBrands, ['FlightLounge','BestFares BestRates','MarocWays','Route50']);
assert.equal(product.metadata.canonicalTravelLandlord,true);
assert.equal(product.metadata.supplierApiAuthority,'travenexa');
assert.equal(product.metadata.brandsHaveIndependentSupplierCredentials,false);

const services = (await db.query(`
 SELECT service_key,implementation_status FROM public.service_catalogue
 WHERE service_key LIKE 'travenexa.%'
 ORDER BY service_key
`)).rows;
assert.equal(services.length, 20);
assert(services.every(x => x.implementation_status === 'external_product'));

const providers = (await db.query(`
 SELECT provider_key,status,implementation_status FROM public.provider_catalogue
 WHERE provider_key LIKE 'travel.%'
 ORDER BY provider_key
`)).rows;
assert.equal(providers.length, 16);
assert(providers.every(x => x.status === 'planned' && x.implementation_status === 'catalogue_only'));

const requirements = (await db.query(`
 SELECT provider_key,required FROM public.product_provider_requirements
 WHERE product_key='travenexa'
`)).rows;
assert.equal(requirements.length, 16);
assert(requirements.every(x => x.required === false));

const blueprints = (await db.query(`
 SELECT blueprint_key,metadata FROM public.tenant_blueprints
 WHERE blueprint_key LIKE 'travenexa%' ORDER BY blueprint_key
`)).rows;
assert.equal(blueprints.length, 10);
assert.equal(blueprints.find(x => x.blueprint_key === 'travenexa-flightlounge')?.metadata?.workspaceType,'flight_metasearch');


for(const [market, locale, currency] of [
  ['kr','ko-KR','KRW'], ['jp','ja-JP','JPY'], ['cn','zh-CN','CNY'], ['us','en-US','USD'],
]) {
  const item=blueprints.find(x=>x.blueprint_key===`travenexa.uk-inbound.${market}`);
  assert(item,`missing inbound UK site for ${market}`);
  assert.equal(item.metadata.destinationCountry,'GB');
  assert.equal(item.metadata.operatingCountry,'GB');
  assert.equal(item.metadata.locale,locale);
  assert.equal(item.metadata.presentationCurrency,currency);
  assert.equal(item.metadata.paymentStatus,'requires-acquirer-approval');
  assert.equal(item.metadata.domainStatus,'not-registered-or-verified');
  assert.equal(item.metadata.supplierBookingStatus,'not-connected');
}
for(const key of ['travenexa.ground-transport','travenexa.rail-coach','travenexa.local-sites','travenexa.inbound-uk']) {
  assert(services.some(x=>x.service_key===key),`missing travel service ${key}`);
}
for(const key of ['travel.omio','travel.rdg-rail','travel.uk-phv-partners']) {
  assert(providers.some(x=>x.provider_key===key),`missing ground travel provider ${key}`);
}


const consumerBrands = ['travenexa-flightlounge','travenexa-bestfares','travenexa-marocways','travenexa-route50'];
for(const key of consumerBrands){
  const blueprint=blueprints.find(row=>row.blueprint_key===key);
  assert(blueprint,`missing travel tenant ${key}`);
  assert.equal(blueprint.metadata.landlordProductKey,'travenexa',`${key} must inherit the travel landlord`);
  assert.equal(blueprint.metadata.productKey,'travenexa',`${key} must use TraveNexa product`);
  assert.equal(blueprint.metadata.supplierApiAuthority,'travenexa');
  assert.equal(blueprint.metadata.tenantKind,'brand');
}
const route50=blueprints.find(row=>row.blueprint_key==='travenexa-route50');
assert.equal(route50.metadata.workspaceType,'travel_brand');
assert.equal(route50.metadata.brandScope,'to-be-configured');
assert.equal(route50.metadata.launchState,'awaiting-external-workspace');
const brandedProducts = (await db.query(`
 SELECT product_key FROM public.product_catalogue
 WHERE product_key IN ('flightlounge','bestfares-bestrates','marocways','route50')
`)).rows;
assert.equal(brandedProducts.length,0,'travel brand tenants must not register independent travel SaaS products');
const tenantConfigs=(await db.query(`
 SELECT blueprint_key,config FROM public.blueprint_products
 WHERE product_key='travenexa' AND blueprint_key <> 'travenexa-platform'
`)).rows;
assert.equal(tenantConfigs.length,9);
assert(tenantConfigs.every(row=>row.config.landlordProductKey==='travenexa'
  && row.config.supplierApiAuthority==='travenexa' && row.config.isIndependentLandlord===false));
const route50Services=(await db.query(`
 SELECT service_key,required FROM public.blueprint_services
 WHERE blueprint_key='travenexa-route50'
`)).rows;
assert.equal(route50Services.length,10);
assert(route50Services.some(s=>s.service_key==='travenexa.core' && s.required));
assert(route50Services.some(s=>s.service_key==='travenexa.white-label' && s.required));
assert(route50Services.filter(s=>!['travenexa.core','travenexa.white-label'].includes(s.service_key))
 .every(s=>!s.required));
for(const market of ['kr','jp','cn','us']){
  const bp=blueprints.find(row=>row.blueprint_key===`travenexa.uk-inbound.${market}`);
  assert.equal(bp.metadata.landlordProductKey,'travenexa');
  assert.equal(bp.metadata.supplierApiAuthority,'travenexa');
  assert.equal(bp.metadata.tenantKind,'local-market-site');
}

const productBlueprints = (await db.query(`
 SELECT blueprint_key,product_key FROM public.blueprint_products
 WHERE blueprint_key LIKE 'travenexa%'
`)).rows;
assert.equal(productBlueprints.length, 10);
assert(productBlueprints.every(x => x.product_key === 'travenexa'));

const workspaces = (await db.query(`
 SELECT workspace_type FROM public.product_workspace_types
 WHERE product_key='travenexa'
`)).rows.map(x => x.workspace_type).sort();
assert.deepEqual(workspaces, ['agency','comparison','destination','flight_metasearch','inbound_uk_site','landlord','travel_brand']);

const noFakeActivation = await db.query(`
 SELECT count(*)::int AS total FROM public.provider_bindings WHERE product_key='travenexa'
`);
assert.equal(noFakeActivation.rows[0].total, 0, 'catalogue creation must not pretend suppliers are connected');

const inventory = JSON.parse(await readFile(new URL('../../src/modules/control-plane/portfolio-seed.json', import.meta.url), 'utf8'));
assert.equal(inventory.length, 127);
assert.equal(inventory.find(x=>x.name==='FLIGHTLOUNGE')?.parentLandlord, 'TRAVENEXA');
assert.equal(inventory.find(x=>x.name==='MAROCWAYS')?.parentLandlord, 'TRAVENEXA');
const route50Inventory=inventory.find(x=>x.name==='ROUTE50');
assert.equal(route50Inventory?.parentLandlord,'TRAVENEXA');
assert.equal(route50Inventory?.architectureRole,'tenant');
assert.equal(route50Inventory?.repositoryUrl,null);

console.log('TraveNexa SaaS Factory catalogue, brand blueprints and supplier setup gates verified');
