import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { kindeloTenantLaunchSchema, kindeloCmaFeaturesAllowed } from '../../src/modules/control-plane/kindelo-factory.contracts.ts';

const migration = await readFile(new URL('../../supabase/migrations/20261014110000_kindelo_uk_white_label_factory.sql', import.meta.url),'utf8');
const seed = JSON.parse(await readFile(new URL('../../src/modules/control-plane/portfolio-seed.json', import.meta.url),'utf8'));
const sample = {
  omniqoraTenantId:'00000000-0000-4000-8000-000000000000',
  externalWorkspaceKey:'pilot-children-uk',
  displayName:'Pilot Childcare Workspace',
  workspaceKind:'software_tenant',
  country:'GB',jurisdiction:'England',currency:'GBP',timezone:'Europe/London',
  regulatoryStatus:'unverified',
  brand:{name:'Pilot Childcare'},
};

test('Kindelo canonical landlord source points to current UK repository',()=>{
  const row=seed.find(x=>x.sourceRow===25);
  assert.equal(row.repositoryUrl,'https://github.com/asaffilate01-ship-it/kindelo-uk.git');
  assert.equal(row.architectureRole,'landlord');
});
test('white-label blueprint remains draft and does not create a live tenant',()=>{
  assert.match(migration,/kindelo-white-label-gb/);
  assert.match(migration,/'draft'/);
  assert.doesNotMatch(migration,/INSERT INTO public\.tenants/i);
  assert.doesNotMatch(migration,/INSERT INTO public\.landlord_instances/i);
});
test('factory has separate Kindelo workspace types',()=>{
  for (const kind of ['landlord','operator','agency_tenant','software_tenant','nanny_tenant']){
    assert.match(migration,new RegExp("'kindelo','"+kind+"'"));
  }
});
test('software-only workspace does not inherit a regulator approval',()=>{
  assert.equal(kindeloTenantLaunchSchema.safeParse(sample).success,true);
  assert.equal(kindeloCmaFeaturesAllowed({workspaceKind:'software_tenant',registrationStatus:'approved',currentEvidenceVerified:true,provisioningConnected:true}),false);
  assert.equal(kindeloCmaFeaturesAllowed({workspaceKind:'agency_tenant',registrationStatus:'application_pending',currentEvidenceVerified:true,provisioningConnected:true}),false);
});
test('separate agency registration requires independently reviewed evidence and verified connection',()=>{
  assert.equal(kindeloTenantLaunchSchema.safeParse({...sample,workspaceKind:'agency_tenant',regulatoryStatus:'approved'}).success,false);
  assert.equal(kindeloCmaFeaturesAllowed({workspaceKind:'agency_tenant',registrationStatus:'approved',currentEvidenceVerified:false,provisioningConnected:true}),false);
  assert.equal(kindeloCmaFeaturesAllowed({workspaceKind:'agency_tenant',registrationStatus:'approved',currentEvidenceVerified:true,provisioningConnected:true}),true);
});
test('workspaces cannot claim UK coverage outside England',()=>{
  assert.equal(kindeloTenantLaunchSchema.safeParse({...sample,jurisdiction:'Wales'}).success,false);
});

const registry = JSON.parse(await readFile(
 new URL('../../src/modules/control-plane/portfolio-factory-registry.json', import.meta.url),'utf8'));
test('canonical UK Kindelo source is visible without activating any tenant',()=>{
 const product=registry.products.find(x=>x.productKey==='kindelo');
 assert.ok(product);
 assert.equal(product.repositories[0],'https://github.com/asaffilate01-ship-it/kindelo-uk.git');
 assert.ok(product.repositories.some(x=>x.endsWith('/kinderstars.git')));
 assert.equal(product.tenantProvisioning,'not_activated');
 assert.equal(seed.find(x=>x.sourceRow===25).liveUrl,null,'unverified domain must not be flagged as live');
 assert.equal(seed.length,127);
});
