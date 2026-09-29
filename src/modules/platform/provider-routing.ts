import type { PluginBinding, PluginDefinition } from "./plugins";
import type { RegionPackDefinition } from "./registry";

export type ProviderCandidate = {
  definition: PluginDefinition;
  binding: PluginBinding;
  health?: "healthy" | "unknown" | "degraded";
};

export function chooseProvider(
  kind: string,
  candidates: ProviderCandidate[],
  region?: RegionPackDefinition | null,
): ProviderCandidate {
  const available = candidates.filter((candidate) =>
    candidate.definition.kind === kind &&
    candidate.binding.environment === "production" &&
    candidate.health !== "degraded"
  );

  if (!available.length) throw new Error("No configured provider for " + kind);

  const preferenceKey = kind === "communications" ? "telephony" : kind;
  const preferredKeys = region?.providerPreferences?.[preferenceKey] ?? [];

  for (const preferred of preferredKeys) {
    const direct = available.find((candidate) =>
      candidate.definition.key === preferred ||
      candidate.definition.key.endsWith("." + preferred)
    );
    if (direct) return direct;
  }

  return available[0];
}

export function pluginSupports(candidate: ProviderCandidate, capability: string): boolean {
  return candidate.definition.capabilities.includes(capability);
}