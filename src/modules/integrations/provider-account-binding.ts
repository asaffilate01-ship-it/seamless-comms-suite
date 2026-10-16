/** Versioned Omniqora/Dishbee contract. Never contains credential values. */
export const providerKeys = ['uber_eats','deliveroo','just_eat','uber_direct',
  'deliveroo_express','just_eat_go','stuart','own_fleet'] as const;
export interface ProviderAccountBinding {
  version: 1;
  provider: typeof providerKeys[number];
  tenantId: string;
  locationId: string;
  environment: 'sandbox' | 'production';
  accountOwner: 'platform' | 'tenant';
  credentialOwnerTenantId: string | null;
  credentialRef: string | null;
  externalAccountRef: string;
  externalLocationRef: string;
  merchantAuthorised: boolean;
  platformDelegationApproved: boolean;
}
export function validateProviderAccountBinding(binding: ProviderAccountBinding, expected: {
  provider: string; tenantId: string; locationId: string; environment: string;
}) {
  const present = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
  if (!binding || binding.version !== 1 || !providerKeys.includes(binding.provider))
    throw new Error('provider_binding_invalid');
  for (const key of ['provider','tenantId','locationId','environment'] as const) {
    if (!present(expected[key]) || binding[key] !== expected[key]) throw new Error('provider_binding_scope_mismatch');
  }
  if (!['sandbox','production'].includes(binding.environment)) throw new Error('provider_binding_environment_invalid');
  if (!['platform','tenant'].includes(binding.accountOwner)) throw new Error('provider_binding_owner_invalid');
  if (binding.merchantAuthorised !== true) throw new Error('provider_binding_merchant_not_authorised');
  if (binding.accountOwner === 'tenant' && binding.credentialOwnerTenantId !== binding.tenantId)
    throw new Error('provider_binding_credential_owner_mismatch');
  if (binding.accountOwner === 'platform' && (binding.credentialOwnerTenantId !== null || binding.platformDelegationApproved !== true))
    throw new Error('provider_binding_platform_delegation_missing');
  if (binding.provider !== 'own_fleet' && (!present(binding.credentialRef)
    || !present(binding.externalAccountRef) || !present(binding.externalLocationRef)))
    throw new Error('provider_binding_account_mapping_missing');
  // Validation is not provider certification, Vault authorisation or live activation.
  return { provider: binding.provider, accountOwner: binding.accountOwner,
    tenantId: binding.tenantId, locationId: binding.locationId, environment: binding.environment,
    productionAccepted: false as const };
}

/** Refuse stale or conflicting adapter IDs before reading credentials. */
export function assertDeliveryAccountMapping(provider: string, settings: Record<string,unknown>,
  approved: { external_account_ref?: unknown; external_location_ref?: unknown }) {
  const check = (keys: string[], expected: unknown) => {
    if (typeof expected !== 'string' || !expected.trim()) throw new Error('delivery_approved_mapping_missing');
    for (const key of keys) {
      const value = settings[key];
      if (value !== undefined && value !== null && value !== '' && value !== expected)
        throw new Error('delivery_account_mapping_mismatch');
    }
  };
  check(['externalAccountRef', ...(provider === 'uber_direct' ? ['customerId','customer_id'] : [])], approved.external_account_ref);
  check(['externalLocationRef', ...(provider === 'uber_direct' ? ['externalStoreId'] : []),
    ...(provider === 'just_eat_go' ? ['collectPointId'] : [])], approved.external_location_ref);
}
