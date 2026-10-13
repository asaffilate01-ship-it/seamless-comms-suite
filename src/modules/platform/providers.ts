export type ProviderDefinition = {
  providerKey: string;
  name: string;
  providerKind: string;
  capabilities: string[];
  supportedCountries: string[];
  requiredSecretNames: string[];
  publicConfigNames: string[];
  status: "active" | "preview" | "planned" | "retired";
  implementationStatus: "live_main" | "built_main" | "draft_branch" | "catalogue_only" | "external_product";
};

export type ProviderBinding = {
  id: string;
  tenantId: string;
  productKey: string;
  brandId?: string | null;
  locationId?: string | null;
  providerKey: string;
  environment: "development" | "staging" | "production";
  status: "configured" | "active" | "degraded" | "disabled" | "failed";
  secretRefs: Record<string, string>;
  config: Record<string, unknown>;
  health: Record<string, unknown>;
  lastVerifiedAt?: string | null;
};

export function providerBindingMissingSecrets(definition: ProviderDefinition, binding: ProviderBinding) {
  return definition.requiredSecretNames.filter((key) => !binding.secretRefs[key]);
}

/** Finance providers require dedicated regulated-product certification.
 * Never select them through the generic no-extra-verification provider fallback.
 */
const REGULATED_FINANCE_FAMILIES = new Set(["merchant_capital","consumer_checkout","b2b_terms","personal_finance"]);

export function chooseProvider(input: {
  kind: string;
  countryCode?: string | null;
  preferredKeys?: string[];
  definitions: ProviderDefinition[];
  bindings: ProviderBinding[];
}) {
  if(REGULATED_FINANCE_FAMILIES.has(input.kind))
    throw new Error("Regulated finance connectors require the dedicated Finance Factory certification gate");
  const candidates = input.bindings
    .filter((binding) => binding.environment === "production" && binding.status === "active")
    .map((binding) => ({
      binding,
      definition: input.definitions.find((definition) => definition.providerKey === binding.providerKey),
    }))
    .filter((item): item is { binding: ProviderBinding; definition: ProviderDefinition } =>
      !!item.definition &&
      item.definition.providerKind === input.kind &&
      item.definition.status !== "retired" &&
      (!input.countryCode || !item.definition.supportedCountries.length || item.definition.supportedCountries.includes(input.countryCode)) &&
      providerBindingMissingSecrets(item.definition, item.binding).length === 0
    );

  for (const key of input.preferredKeys ?? []) {
    const match = candidates.find((candidate) => candidate.definition.providerKey === key);
    if (match) return match;
  }
  if (!candidates.length) throw new Error("No active verified provider binding for " + input.kind);
  return candidates[0];
}
