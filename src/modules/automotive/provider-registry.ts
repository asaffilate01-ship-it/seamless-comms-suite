export type AutomotiveProviderCapability =
  | "uk_provenance"
  | "vehicle_specification"
  | "service_history"
  | "valuation"
  | "market_intelligence"
  | "verified_media"
  | "vision_inspection"
  | "jdm_auction"
  | "parts_identification"
  | "parts_compatibility"
  | "finance";

export type AutomotiveProviderAdapter = {
  id: string;
  capabilities: AutomotiveProviderCapability[];
  configured(): boolean;
};

export function providerRegistry(env: NodeJS.ProcessEnv = process.env): AutomotiveProviderAdapter[] {
  return [
    { id: "dokuvera", capabilities: ["verified_media"], configured: () => Boolean(env.DOKUVERA_API_KEY) },
    { id: "codeweavers", capabilities: ["finance"], configured: () => Boolean(env.CODEWEAVERS_API_KEY) },
    { id: "uk-vehicle-data", capabilities: ["uk_provenance","vehicle_specification","service_history","valuation","market_intelligence"], configured: () => Boolean(env.AUTOMOTIVE_UK_DATA_API_KEY) },
    { id: "jdm-auction", capabilities: ["jdm_auction","vehicle_specification"], configured: () => Boolean(env.AUTOHASHI_AUCTION_API_KEY) },
    { id: "automotive-vision", capabilities: ["vision_inspection"], configured: () => Boolean(env.AUTOMOTIVE_VISION_PROVIDER) },
    { id: "sparesgrid", capabilities: ["parts_identification","parts_compatibility"], configured: () => Boolean(env.SPARESGRID_API_KEY) },
  ];
}

export function providerStatus(env: NodeJS.ProcessEnv = process.env) {
  return providerRegistry(env).map((provider) => ({
    id: provider.id,
    capabilities: provider.capabilities,
    configured: provider.configured(),
  }));
}
