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

export function chooseProvider(input: {
  kind: string;
  countryCode?: string | null;
  preferredKeys?: string[];
  definitions: ProviderDefinition[];
  bindings: ProviderBinding[];
}) {
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
