import test from 'node:test';
import assert from 'node:assert/strict';
import { providerKeys, validateProviderAccountBinding, assertDeliveryAccountMapping } from '../../src/modules/integrations/provider-account-binding.ts';
const fixture = (provider) => ({ version: 1, provider, tenantId: 'tenant-a', locationId: 'site-a',
  environment: 'sandbox', accountOwner: 'tenant', credentialOwnerTenantId: 'tenant-a',
  credentialRef: 'vault-ref', externalAccountRef: 'merchant', externalLocationRef: 'pickup',
  merchantAuthorised: true, platformDelegationApproved: false });
for (const provider of providerKeys) {
  test(`${provider}: tenant and approved platform account modes`, () => {
    const binding = fixture(provider);
    assert.equal(validateProviderAccountBinding(binding, binding).accountOwner, 'tenant');
    const platform = { ...binding, accountOwner: 'platform', credentialOwnerTenantId: null, platformDelegationApproved: true };
    assert.equal(validateProviderAccountBinding(platform, binding).accountOwner, 'platform');
    assert.equal(validateProviderAccountBinding(platform, binding).productionAccepted, false);
  });
}
test('scope, environment, delegation and credential-owner isolation', () => {
  const binding = fixture('uber_direct');
  for (const changes of [{tenantId:'other'}, {locationId:'other'}, {environment:'production'},
    {provider:'stuart'}, {credentialOwnerTenantId:'other'}, {merchantAuthorised:false},
    {accountOwner:'platform',credentialOwnerTenantId:null}, {credentialRef:''}]) {
    assert.throws(() => validateProviderAccountBinding({...binding,...changes},binding));
  }
});
test('adapter aliases must all match authorised merchant and pickup', () => {
  const approved = { external_account_ref:'merchant', external_location_ref:'pickup' };
  assertDeliveryAccountMapping('uber_direct',{customerId:'merchant',externalStoreId:'pickup'},approved);
  assertDeliveryAccountMapping('just_eat_go',{collectPointId:'pickup'},approved);
  for(const settings of [{customerId:'other'}, {customerId:'merchant',customer_id:'other'},
    {externalStoreId:'other'}, {externalAccountRef:'other'}])
    assert.throws(() => assertDeliveryAccountMapping('uber_direct',settings,approved));
  assert.throws(() => assertDeliveryAccountMapping('just_eat_go',{collectPointId:'other'},approved));
  assert.throws(() => assertDeliveryAccountMapping('stuart',{},{}));
});
