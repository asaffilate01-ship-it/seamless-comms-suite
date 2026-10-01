import {
  getModuleDefinition,
  getProductDefinition,
  getRegionPack,
  resolveProductModules,
} from "./registry";

export type BrandTheme = {
  brandKey: string;
  name: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
  primaryColour?: string | null;
  secondaryColour?: string | null;
  fontFamily?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
};

export type ProductBlueprint = {
  productKey: string;
  industry: string;
  regions: string[];
  locales: string[];
  modules: string[];
  optionalModules?: string[];
  roles: string[];
  navigation: string[];
  domainObjects: string[];
  workflows: string[];
  mobileCapabilities: string[];
  metadata?: Record<string, unknown>;
};

export type TenantProvisionRequest = {
  tenantId: string;
  productKey: string;
  regionPackKey: string;
  locale: string;
  planKey?: string | null;
  brand?: BrandTheme | null;
  requestedModules?: string[];
  locations?: Array<{
    key: string;
    name: string;
    countryCode?: string | null;
    locale?: string | null;
    timeZone?: string | null;
  }>;
  domains?: Array<{
    hostname: string;
    purpose: "marketing" | "app" | "api" | "tracking" | "assets" | "auth" | "other";
    primary?: boolean;
  }>;
};

export type ProvisioningStep =
  | { kind: "tenant_product"; productKey: string; regionPackKey: string; planKey?: string | null }
  | { kind: "module"; moduleKey: string }
  | { kind: "location"; key: string; name: string; locale: string; timeZone: string }
  | { kind: "domain"; hostname: string; purpose: string; primary: boolean }
  | { kind: "brand"; brand: BrandTheme };

export type ProvisioningPlan = {
  tenantId: string;
  productKey: string;
  regionPackKey: string;
  locale: string;
  planKey?: string | null;
  modules: string[];
  steps: ProvisioningStep[];
  warnings: string[];
};

function moduleClosure(moduleKeys: string[]) {
  const resolved = new Set<string>();
  const visiting = new Set<string>();

  function add(key: string) {
    if (resolved.has(key)) return;
    if (visiting.has(key)) throw new Error(`Circular module dependency: ${key}`);
    const definition = getModuleDefinition(key);
    if (!definition) throw new Error(`Unknown module: ${key}`);
    visiting.add(key);
    definition.dependencies.forEach(add);
    visiting.delete(key);
    resolved.add(key);
  }

  moduleKeys.forEach(add);
  return [...resolved];
}

export function planTenantProvisioning(request: TenantProvisionRequest): ProvisioningPlan {
  const product = getProductDefinition(request.productKey);
  if (!product) throw new Error("Unknown product");

  const region = getRegionPack(request.regionPackKey);
  if (!region) throw new Error("Unknown region pack");

  if (!product.supportedRegions.includes(region.key)) {
    throw new Error(`Product ${product.key} does not support region ${region.key}`);
  }
  if (!region.supportedLocales.includes(request.locale) && !product.supportedLocales.includes(request.locale)) {
    throw new Error(`Locale ${request.locale} is not supported for this product/region`);
  }

  const requested = resolveProductModules(product.key, request.requestedModules ?? []);
  const modules = moduleClosure(requested);
  const steps: ProvisioningStep[] = [
    {
      kind: "tenant_product",
      productKey: product.key,
      regionPackKey: region.key,
      planKey: request.planKey ?? null,
    },
    ...modules.map((moduleKey) => ({ kind: "module" as const, moduleKey })),
  ];

  if (request.brand) steps.push({ kind: "brand", brand: request.brand });

  const defaultTimeZone = region.timeZones[0] ?? "UTC";
  for (const location of request.locations ?? []) {
    steps.push({
      kind: "location",
      key: location.key,
      name: location.name,
      locale: location.locale ?? request.locale,
      timeZone: location.timeZone ?? defaultTimeZone,
    });
  }

  for (const domain of request.domains ?? []) {
    steps.push({
      kind: "domain",
      hostname: domain.hostname.toLowerCase(),
      purpose: domain.purpose,
      primary: domain.primary ?? false,
    });
  }

  const warnings: string[] = [];
  if (!request.locations?.length) warnings.push("No locations requested; suitable for virtual/head-office products only.");
  if (!request.domains?.length) warnings.push("No custom domain requested; platform domain can be used initially.");

  return {
    tenantId: request.tenantId,
    productKey: product.key,
    regionPackKey: region.key,
    locale: request.locale,
    planKey: request.planKey ?? null,
    modules,
    steps,
    warnings,
  };
}

export function validateBlueprint(blueprint: ProductBlueprint) {
  if (!blueprint.productKey.trim()) throw new Error("productKey is required");
  if (!blueprint.industry.trim()) throw new Error("industry is required");
  for (const regionKey of blueprint.regions) {
    if (!getRegionPack(regionKey)) throw new Error(`Unknown region pack: ${regionKey}`);
  }
  moduleClosure([...(blueprint.modules??[]),...(blueprint.optionalModules??[])]);
  const overlap=(blueprint.optionalModules??[]).filter((key)=>blueprint.modules.includes(key));
  if(overlap.length)throw new Error("Modules cannot be both default and optional: "+overlap.join(", "));
  return blueprint;
}
