export const MEALDECK_PROGRAMME_KEY = "mealdeck-england-wales";
export const MEALDECK_PRICING_VERSION = "2026-10-06-r2";
export const ROYALTY_QUOTE_MESSAGE = "To be confirmed in written quote";

/** Current offer reference, in GBP major units. This is not an accepted fee schedule. */
export const MEALDECK_CURRENT_PRICING = Object.freeze({
  franchiseFeeVersion: MEALDECK_PRICING_VERSION,
  feeMin: 3750,
  feeMax: 12500,
  royaltyStatus: "quote_required",
  royaltyPercent: null,
  royaltyDisplay: ROYALTY_QUOTE_MESSAGE,
  marketingPercent: 1.5,
  techFeePerMonth: 199,
  accountancyFeePerMonth: 100,
  boughtInSupplyMarkupPercent: 0,
  manufacturedSupplyMarkupPercent: 15,
  manufacturedSupplyCostBasis: "fully_costed_production",
  manufacturedSupplyFormula: "(ingredients + labour + other allocated production costs) × 1.15",
  equipmentOpeningSuppliesEstimate: 15000,
  setupEstimateStatus: "indicative",
  setupEstimateScope: "Equipment, opening packaging and opening supplies per location",
  setupEstimateExclusions: "Premises works and deposits, separately quoted technology hardware/setup, professional costs and working capital",
  feesExcludeVatWhereApplicable: true,
});

type Row = Record<string, any>;

function object(value: unknown): Row {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function hasCurrentMealDeckPricing(programme: Row): boolean {
  return programme.programme_key === MEALDECK_PROGRAMME_KEY &&
    object(object(programme.offer).pricing).franchiseFeeVersion === MEALDECK_PRICING_VERSION;
}

/** A version is a stored declaration; never infer a row's version from its programme. */
export function territoryFeeVersion(territory: Row): string | undefined {
  const version = object(territory.metadata).franchiseFeeVersion;
  return typeof version === "string" && version.length > 0 && version.length <= 80 ? version : undefined;
}

export function currentTerritoryFeeMinor(territory: Row, programme: Row): number | null {
  if (hasCurrentMealDeckPricing(programme) && territoryFeeVersion(territory) !== MEALDECK_PRICING_VERSION) return null;
  return amount(territory.fee_minor);
}

/** Public programme fields exclude pricing history and internal commercial deliberations. */
export function publicNetworkProgramme(programme: Row) {
  const current = hasCurrentMealDeckPricing(programme);
  const quoteRequired = current || programme.royalty_status === "quote_required" || programme.royalty_bps == null;
  const rawOffer = object(programme.offer);
  const offer: Row = {};
  for (const key of ["brands", "positioning", "featuredMarkets", "franchisorProvides", "franchiseeFunds"]) {
    if (rawOffer[key] !== undefined) offer[key] = rawOffer[key];
  }
  const legacyRoyalty = amount(programme.royalty_bps);
  const storedVersion = object(rawOffer.pricing).franchiseFeeVersion;
  const commercial = current ? MEALDECK_CURRENT_PRICING : {
    feeMin: Number(programme.fee_min_minor ?? 0) / 100,
    feeMax: Number(programme.fee_max_minor ?? 0) / 100,
    royaltyStatus: quoteRequired ? "quote_required" : "agreed",
    royaltyPercent: quoteRequired || legacyRoyalty === null ? null : legacyRoyalty / 100,
    royaltyDisplay: quoteRequired ? ROYALTY_QUOTE_MESSAGE : `${Number(legacyRoyalty) / 100}% of net sales`,
    marketingPercent: Number(programme.marketing_bps ?? 0) / 100,
    techFeePerOrder: Number(programme.tech_fee_minor_per_order ?? 0) / 100,
    supplyMarkupPercent: Number(programme.supply_markup_bps ?? 0) / 100,
    ...(typeof storedVersion === "string" && storedVersion ? { franchiseFeeVersion: storedVersion } : {}),
  };
  return {
    key: programme.programme_key,
    name: programme.name,
    currency: programme.currency ?? "GBP",
    ...commercial,
    managedFranchiseAvailable: !!programme.managed_franchise_available,
    managedProfitSharePercent: Number(programme.managed_profit_share_bps ?? 0) / 100,
    managedProfitBasis: programme.managed_profit_basis ?? "managed_operating_profit",
    offer,
  };
}

/** Do not present an unknown royalty or an unconverted catalogue fee as a zero charge. */
export function networkWorkspaceProgramme(programme: Row) {
  const currentTerms = publicNetworkProgramme(programme);
  return {
    ...programme,
    royalty_bps: currentTerms.royaltyStatus === "quote_required" ? null : programme.royalty_bps,
    royalty_status: currentTerms.royaltyStatus,
    current_terms: currentTerms,
  };
}

export function networkWorkspaceTerritory(territory: Row, programme: Row) {
  const fee = currentTerritoryFeeMinor(territory, programme);
  return {
    ...territory,
    fee_minor: fee,
    fee_status: fee === null ? "quote_required" : "current_offer",
    franchise_fee_version: territoryFeeVersion(territory),
  };
}

/** A geographic exhibit does not amend the commercial schedule of an existing contract. */
export function territoryCommercialExhibit(territory: Row, programme: Row) {
  const fee = currentTerritoryFeeMinor(territory, programme);
  return {
    currentOffer: {
      ...publicNetworkProgramme(programme),
      baseFranchiseFee: fee === null ? null : fee / 100,
      territoryFranchiseFeeVersion: territoryFeeVersion(territory),
      status: "indicative_offer",
    },
    contractualPricing: {
      status: "agreement_schedule_required",
      notice: "The signed agreement and its fee schedule determine contractual charges. Current offer information does not amend an existing agreement.",
    },
  };
}
