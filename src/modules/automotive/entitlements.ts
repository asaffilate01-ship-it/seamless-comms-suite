import type { AutomotiveAddon, AutomotiveProduct } from "./contracts";

const coreByProduct: Record<AutomotiveProduct, Set<AutomotiveAddon>> = {
  zivvo: new Set([
    "vehicle_intelligence",
    "vehicle_passport",
    "remote_appraisal",
    "uk_provenance",
    "valuation",
    "compliance_center",
    "finance_adapter",
  ]),
  autohashi: new Set([
    "vehicle_intelligence",
    "vehicle_passport",
    "jdm_intelligence",
    "auction_sheet_ai",
    "landed_cost",
    "max_bid",
  ]),
  sparesgrid: new Set([
    "vehicle_intelligence",
    "vehicle_passport",
    "factory_specification",
    "parts_intelligence",
    "parts_compatibility",
  ]),
};

export function isCoreAddon(product: AutomotiveProduct, addon: AutomotiveAddon) {
  return coreByProduct[product].has(addon);
}

export function addonAvailability(product: AutomotiveProduct, addon: AutomotiveAddon) {
  if (isCoreAddon(product, addon)) return "core" as const;
  return "addon" as const;
}

export function requireAddon(enabled: Iterable<AutomotiveAddon>, addon: AutomotiveAddon) {
  if (!new Set(enabled).has(addon)) {
    const error = new Error(`Automotive add-on "${addon}" is not enabled for this tenant`);
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}
