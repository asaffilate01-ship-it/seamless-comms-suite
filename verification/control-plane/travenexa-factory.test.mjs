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
assert.deepEqual(product.metadata.tenantBrands, ['FlightLounge','BestFares BestRates','MarocWays']);

const services = (await db.query(`
 SELECT service_key,implementation_status FROM public.service_catalogue
 WHERE service_key LIKE 'travenexa.%'
 ORDER BY service_key
`)).rows;
assert.equal(services.length, 14);
assert(services.every(x => x.implementation_status === 'external_product'));

const providers = (await db.query(`
 SELECT provider_key,status,implementation_status FROM public.provider_catalogue
 WHERE provider_key LIKE 'travel.%'
 ORDER BY provider_key
`)).rows;
assert.equal(providers.length, 13);
assert(providers.every(x => x.status === 'planned' && x.implementation_status === 'catalogue_only'));

const requirements = (await db.query(`
 SELECT provider_key,required FROM public.product_provider_requirements
 WHERE product_key='travenexa'
`)).rows;
assert.equal(requirements.length, 13);
assert(requirements.every(x => x.required === false));

const blueprints = (await db.query(`
 SELECT blueprint_key,metadata FROM public.tenant_blueprints
 WHERE blueprint_key LIKE 'travenexa-%' ORDER BY blueprint_key
`)).rows;
assert.equal(blueprints.length, 5);
assert.equal(blueprints.find(x => x.blueprint_key === 'travenexa-flightlounge')?.metadata?.workspaceType,'flight_metasearch');

const productBlueprints = (await db.query(`
 SELECT blueprint_key,product_key FROM public.blueprint_products
 WHERE blueprint_key LIKE 'travenexa-%'
`)).rows;
assert.equal(productBlueprints.length, 5);
assert(productBlueprints.every(x => x.product_key === 'travenexa'));

const workspaces = (await db.query(`
 SELECT workspace_type FROM public.product_workspace_types
 WHERE product_key='travenexa'
`)).rows.map(x => x.workspace_type).sort();
assert.deepEqual(workspaces, ['agency','comparison','destination','flight_metasearch','landlord']);

const noFakeActivation = await db.query(`
 SELECT count(*)::int AS total FROM public.provider_bindings WHERE product_key='travenexa'
`);
assert.equal(noFakeActivation.rows[0].total, 0, 'catalogue creation must not pretend suppliers are connected');

const inventory = JSON.parse(await readFile(new URL('../../src/modules/control-plane/portfolio-seed.json', import.meta.url), 'utf8'));
assert.equal(inventory.length, 124);
assert.equal(inventory.find(x=>x.name==='FLIGHTLOUNGE')?.parentLandlord, 'TRAVENEXA');

console.log('TraveNexa SaaS Factory catalogue, brand blueprints and supplier setup gates verified');
