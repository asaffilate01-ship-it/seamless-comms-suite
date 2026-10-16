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

const transactionTables=[
  'travenexa_supplier_approvals','travenexa_live_offers','travenexa_booking_records',
  'travenexa_payment_events','travenexa_supplier_events','travenexa_booking_state_events',
  'travenexa_commission_ledger','travenexa_supplier_webhook_inbox',
];
const pgRls=await db.query(`
 SELECT tablename,rowsecurity FROM pg_tables
 WHERE schemaname='public' AND tablename LIKE 'travenexa_%'
`);
for(const table of transactionTables){
  const found=pgRls.rows.find(x=>x.tablename===table);
  assert(found,`transaction table missing: ${table}`);
  assert.equal(found.rowsecurity,true,`RLS missing on ${table}`);
}
const grants=await db.query(`
 SELECT has_table_privilege('anon','public.travenexa_booking_records','SELECT') AS anon_select,
   has_table_privilege('authenticated','public.travenexa_booking_records','INSERT') AS user_insert,
   has_table_privilege('service_role','public.travenexa_booking_records','INSERT') AS service_insert
`);
assert.equal(grants.rows[0].anon_select,false);
assert.equal(grants.rows[0].user_insert,false);
assert.equal(grants.rows[0].service_insert,true);

// A supplier can be catalogued but must NOT become active without the merchant,
// licensing, API and servicing evidence. A failing check cannot leave partial rows.
await assert.rejects(db.query(`
  INSERT INTO public.travenexa_supplier_approvals
  (tenant_key,supplier_key,product_type,status,active,payment_mode,merchant_of_record)
  VALUES ('travenexa-flightlounge','mystifly','flights','approved',true,
    'platform_checkout','travenexa')
`));
await db.query(`
 INSERT INTO public.travenexa_supplier_approvals
 (tenant_key,supplier_key,product_type,status,active,payment_mode,merchant_of_record,
  contract_approved,credentials_verified,travel_compliance_approved,payment_approved,
  ticketing_approved,servicing_approved,multi_brand_permission)
 VALUES ('travenexa-flightlounge','mystifly','flights','approved',true,
 'platform_checkout','travenexa',true,true,true,true,true,true,true)
`);
const quote=(await db.query(`
 INSERT INTO public.travenexa_live_offers
 (tenant_key,supplier_key,product_type,supplier_offer_ref,booking_mode,currency_code,
  supplier_minor,markup_minor,verified_at,expires_at)
 VALUES ('travenexa-flightlounge','mystifly','flights','sandbox-offer-001',
 'platform_checkout','GBP',20000,1000,now(),now()+interval '10 minutes')
 RETURNING id,total_minor
`)).rows[0];
assert.equal(Number(quote.total_minor),21000);
const booking=(await db.query(`
 INSERT INTO public.travenexa_booking_records
 (tenant_key,offer_id,supplier_key,product_type,idempotency_key,booking_mode,
 seller_of_record,currency_code,gross_minor,supplier_minor,markup_minor,
 customer_contract_reference)
 VALUES ('travenexa-flightlounge',$1,'mystifly','flights','idempotency-001',
 'platform_checkout','travenexa','GBP',21000,20000,1000,'terms-test-001')
 RETURNING id,status
`,[quote.id])).rows[0];
assert.equal(booking.status,'draft');
await assert.rejects(db.query(`
 INSERT INTO public.travenexa_booking_records
 (tenant_key,offer_id,supplier_key,product_type,idempotency_key,booking_mode,
 seller_of_record,currency_code,gross_minor,supplier_minor,markup_minor)
 VALUES ('travenexa-marocways',$1,'mystifly','flights','idempotency-002',
 'platform_checkout','travenexa','GBP',21000,20000,1000)
`,[quote.id]),/foreign key|violates/i);
await assert.rejects(db.query(`
 INSERT INTO public.travenexa_booking_records
 (tenant_key,offer_id,supplier_key,product_type,idempotency_key,booking_mode,
 seller_of_record,currency_code,gross_minor,supplier_minor,markup_minor)
 VALUES ('travenexa-flightlounge',$1,'mystifly','flights','idempotency-001',
 'platform_checkout','travenexa','GBP',21000,20000,1000)
`,[quote.id]),/unique|duplicate/i);
await assert.rejects(db.query(`
 INSERT INTO public.travenexa_payment_events
 (tenant_key,booking_id,processor,external_event_ref,event_type,amount_minor,
  currency_code,signature_verified)
 VALUES ('travenexa-marocways',$1,'adyen','psp-001','authorised',21000,'GBP',true)
`,[booking.id]),/foreign key|violates/i);
const count=(await db.query(`
 SELECT count(*)::int AS n FROM public.travenexa_commission_ledger
`)).rows[0].n;
assert.equal(count,0,'creating a fare/booking must never automatically create commission revenue');
console.log('TraveNexa Phase 2: eight RLS tables, default-disabled supplier and tenant-bound booking/payment contracts verified');
