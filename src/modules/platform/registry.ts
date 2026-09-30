export type ProductKind =
  | "platform"
  | "shared_engine"
  | "vertical_landlord"
  | "product_variant"
  | "standalone";

export type ModuleKind =
  | "core"
  | "crm"
  | "communications"
  | "ai"
  | "compliance"
  | "geo"
  | "dispatch"
  | "marketplace"
  | "payments"
  | "journeys"
  | "sales"
  | "feedback"
  | "analytics"
  | "mobile"
  | "documents"
  | "creative"
  | "marketing"
  | "financials"
  | "ordering"
  | "hospitality"
  | "practice"
  | "transformation"
  | "inventory";

export type ProductDefinition = {
  key: string;
  name: string;
  kind: ProductKind;
  parentProductKey?: string | null;
  industry?: string | null;
  defaultModules: string[];
  supportedRegions: string[];
  supportedLocales: string[];
  status: "active" | "incubating" | "migration_candidate" | "retired";
};

export type ModuleDefinition = {
  key: string;
  name: string;
  kind: ModuleKind;
  version: string;
  description: string;
  dependencies: string[];
  capabilities: string[];
  uiMode: "api_only" | "embedded" | "workspace" | "hybrid";
  status: "active" | "preview" | "planned";
};

export type RegionPackDefinition = {
  key: string;
  country: string;
  defaultLocale: string;
  supportedLocales: string[];
  currency: string;
  timeZones: string[];
  dataRegion?: string | null;
  taxProfile?: string | null;
  legalProfile?: string | null;
  regulatoryPacks: string[];
  providerPreferences?: Record<string, string[]>;
};

export type TenantProductBinding = {
  tenantId: string;
  productKey: string;
  regionPackKey: string;
  planKey?: string | null;
  brandKey?: string | null;
  enabledModules: string[];
};

export const PLATFORM_MODULE_KEYS = {
  identity: "platform.identity",
  tenant: "platform.tenant",
  entitlements: "platform.entitlements",
  provisioning: "platform.provisioning",
  events: "platform.events",
  audit: "platform.audit",
  crm: "crm.core",
  connect: "connect.core",
  reception: "reception.core",
  intelligence: "intelligence.core",
  compliance: "compliance.core",
  geo: "geo.core",
  dispatch: "dispatch.core",
  marketplace: "marketplace.core",
  payments: "payments.core",
  journeys: "journeys.core",
  sales: "sales.core",
  feedback: "feedback.core",
  analytics: "analytics.core",
  mobile: "mobile.core",
  creative: "creative.core",
  marketing: "marketing.core",
  financials: "financials.core",
  ordering: "ordering.core",
  hospitality: "hospitality.intelligence",
  practice: "practice.core",
  business360: "business360.core",
  transactions: "transactions.core",
  inventory: "inventory.core",
} as const;

export const OMNIQORA_PRODUCTS: ProductDefinition[] = [
  {
    key: "omniqora",
    name: "Omniqora",
    kind: "platform",
    industry: "platform",
    defaultModules: [
      PLATFORM_MODULE_KEYS.identity,
      PLATFORM_MODULE_KEYS.tenant,
      PLATFORM_MODULE_KEYS.entitlements,
      PLATFORM_MODULE_KEYS.provisioning,
      PLATFORM_MODULE_KEYS.events,
      PLATFORM_MODULE_KEYS.audit,
      PLATFORM_MODULE_KEYS.connect,
      PLATFORM_MODULE_KEYS.intelligence,
    ],
    supportedRegions: ["GB", "DE", "AE", "SA", "US", "PK"],
    supportedLocales: ["en-GB", "de-DE", "ar-SA", "ar-AE", "en-US", "ur-PK"],
    status: "active",
  },
  {
    key: "dishbee",
    name: "Dishbee",
    kind: "vertical_landlord",
    industry: "hospitality",
    defaultModules: ["connect.core", "crm.core", "feedback.core"],
    supportedRegions: ["GB", "DE", "AE"],
    supportedLocales: ["en-GB", "de-DE", "ar-AE"],
    status: "active",
  },
  {
    key: "haccora",
    name: "Haccora",
    kind: "vertical_landlord",
    industry: "compliance",
    defaultModules: ["connect.core", "crm.core", "compliance.core", "intelligence.core"],
    supportedRegions: ["GB", "DE", "AE", "SA"],
    supportedLocales: ["en-GB", "de-DE", "ar-SA", "ar-AE"],
    status: "active",
  },
  {
    key: "taxnuvia",
    name: "TaxNuvia",
    kind: "vertical_landlord",
    industry: "professional_services",
    defaultModules: ["crm.core", "sales.core", "connect.core", "intelligence.core"],
    supportedRegions: ["GB", "US"],
    supportedLocales: ["en-GB", "en-US"],
    status: "active",
  },
  {
    key: "xpertjobs",
    name: "XpertJobs",
    kind: "vertical_landlord",
    industry: "recruitment",
    defaultModules: ["crm.core", "sales.core", "connect.core", "intelligence.core"],
    supportedRegions: ["GB", "DE"],
    supportedLocales: ["en-GB", "de-DE"],
    status: "active",
  },
  {
    key: "fleetsora",
    name: "Fleetora / FleetSora",
    kind: "vertical_landlord",
    industry: "fleet_logistics",
    defaultModules: ["crm.core", "connect.core", "geo.core", "dispatch.core", "mobile.core"],
    supportedRegions: ["GB", "DE", "AE"],
    supportedLocales: ["en-GB", "de-DE", "ar-AE"],
    status: "active",
  },
  {
    key: "syndriva",
    name: "Syndriva Marketplace Engine",
    kind: "shared_engine",
    industry: "marketplace",
    defaultModules: ["marketplace.core", "crm.core", "connect.core", "payments.core", "analytics.core"],
    supportedRegions: ["GB", "DE", "AE", "SA", "US", "PK"],
    supportedLocales: ["en-GB", "de-DE", "ar-SA", "ar-AE", "en-US", "ur-PK"],
    status: "incubating",
  },
  {
    key: "affivon",
    name: "Affivon",
    kind: "vertical_landlord",
    industry: "affiliate_commerce",
    defaultModules: ["crm.core", "sales.core", "journeys.core", "connect.core", "analytics.core", "marketplace.core"],
    supportedRegions: ["GB", "DE", "US", "AE"],
    supportedLocales: ["en-GB", "de-DE", "en-US", "ar-AE"],
    status: "migration_candidate",
  },
  {
    key: "voxentri",
    name: "Voxentri Creative Studio",
    kind: "shared_engine",
    industry: "creative_studio",
    defaultModules: ["creative.core", "marketing.core", "analytics.core", "intelligence.core"],
    supportedRegions: ["GB", "DE", "AE", "SA", "US", "PK"],
    supportedLocales: ["en-GB", "de-DE", "ar-SA", "ar-AE", "en-US", "ur-PK"],
    status: "incubating",
  },
  {
    key: "business360",
    name: "Business360",
    kind: "vertical_landlord",
    industry: "business_advisory_transformation",
    defaultModules: ["crm.core","business360.core","transactions.core","documents.core","analytics.core","financials.core","intelligence.core","compliance.core","connect.core"],
    supportedRegions: ["GB","DE","AE","SA","US","PK"],
    supportedLocales: ["en-GB","de-DE","ar-SA","ar-AE","en-US","ur-PK"],
    status: "incubating",
  },
  {
    key: "taxcenda",
    name: "TaxCenda",
    kind: "vertical_landlord",
    industry: "us_tax_practice",
    defaultModules: ["crm.core","practice.core","documents.core","payments.core","connect.core","analytics.core","financials.core","intelligence.core","compliance.core"],
    supportedRegions: ["US"],
    supportedLocales: ["en-US"],
    status: "migration_candidate",
  },
  {
    key: "iq-practice-cloud",
    name: "IQ Practice Cloud",
    kind: "vertical_landlord",
    industry: "uk_accountancy_practice",
    defaultModules: ["crm.core","practice.core","documents.core","payments.core","connect.core","analytics.core","financials.core","intelligence.core","compliance.core"],
    supportedRegions: ["GB"],
    supportedLocales: ["en-GB"],
    status: "migration_candidate",
  },
  {
    key: "regulos",
    name: "RegulaOS / Compliance-as-a-Service",
    kind: "vertical_landlord",
    industry: "regulatory_compliance",
    defaultModules: ["crm.core","compliance.core","documents.core","connect.core","analytics.core","financials.core","intelligence.core","practice.core"],
    supportedRegions: ["GB","DE","AE","SA","US","PK"],
    supportedLocales: ["en-GB","de-DE","ar-SA","ar-AE","en-US","ur-PK"],
    status: "migration_candidate",
  },
  {
    key: "tendryva",
    name: "Tendryva",
    kind: "vertical_landlord",
    industry: "tenders_procurement",
    defaultModules: ["crm.core", "compliance.core", "intelligence.core", "connect.core", "sales.core", "documents.core"],
    supportedRegions: ["GB", "DE", "AE", "SA"],
    supportedLocales: ["en-GB", "de-DE", "ar-AE", "ar-SA"],
    status: "migration_candidate",
  },
];

export const OMNIQORA_MODULES: ModuleDefinition[] = [
  {
    key: "platform.identity",
    name: "Omniqora Identity",
    kind: "core",
    version: "1.0.0-preview",
    description: "Shared identity, membership and service identity foundation.",
    dependencies: [],
    capabilities: ["identity", "membership", "service_identity"],
    uiMode: "api_only",
    status: "preview",
  },
  {
    key: "platform.tenant",
    name: "Omniqora Tenant Registry",
    kind: "core",
    version: "1.0.0-preview",
    description: "Organisations, tenants, locations, workspaces and product bindings.",
    dependencies: ["platform.identity"],
    capabilities: ["tenants", "organisations", "locations", "workspaces"],
    uiMode: "workspace",
    status: "preview",
  },
  {
    key: "platform.entitlements",
    name: "Omniqora Entitlements",
    kind: "core",
    version: "1.0.0-preview",
    description: "Plans, modules, add-ons, limits and feature flags.",
    dependencies: ["platform.tenant"],
    capabilities: ["plans", "modules", "limits", "feature_flags"],
    uiMode: "api_only",
    status: "preview",
  },
  {
    key: "platform.provisioning",
    name: "Omniqora Provisioning",
    kind: "core",
    version: "1.0.0-preview",
    description: "Template-driven product and tenant provisioning plans and execution records.",
    dependencies: ["platform.tenant", "platform.entitlements"],
    capabilities: ["tenant_create", "defaults", "domains", "bindings"],
    uiMode: "workspace",
    status: "preview",
  },
  {
    key: "platform.events",
    name: "Omniqora Event Backbone",
    kind: "core",
    version: "1.0.0-preview",
    description: "Tenant-safe versioned events, subscriptions, delivery and dead-letter patterns.",
    dependencies: ["platform.tenant"],
    capabilities: ["events", "webhooks", "idempotency", "deliveries"],
    uiMode: "api_only",
    status: "preview",
  },
  {
    key: "platform.audit",
    name: "Omniqora Audit & Observability",
    kind: "core",
    version: "1.0.0-preview",
    description: "Shared audit, health, usage and trace foundations.",
    dependencies: ["platform.tenant"],
    capabilities: ["audit", "health", "usage", "traces"],
    uiMode: "workspace",
    status: "preview",
  },
  {
    key: "crm.core",
    name: "Omniqora CRM",
    kind: "crm",
    version: "1.0.0-preview",
    description: "Customer 360, companies, people, leads, opportunities, tasks and interaction timeline.",
    dependencies: ["platform.tenant", "platform.entitlements", "platform.events", "platform.audit"],
    capabilities: ["companies", "people", "leads", "opportunities", "pipelines", "tasks", "timeline"],
    uiMode: "hybrid",
    status: "preview",
  },
  {
    key: "connect.core",
    name: "Omniqora Connect",
    kind: "communications",
    version: "1.0.0-preview",
    description: "WhatsApp, SMS, email, voice, push, number registry and provider-neutral communications.",
    dependencies: ["platform.tenant", "platform.entitlements", "platform.events", "platform.audit"],
    capabilities: ["whatsapp", "sms", "email", "voice", "push", "numbers", "masked_calls"],
    uiMode: "hybrid",
    status: "preview",
  },
  {
    key: "intelligence.core",
    name: "Omniqora Intelligence",
    kind: "ai",
    version: "1.0.0-preview",
    description: "GenAI, RAG, GraphRAG, agents, approvals, AI governance and Business360.",
    dependencies: ["platform.tenant", "platform.entitlements", "platform.audit"],
    capabilities: ["genai", "rag", "graphrag", "agents", "approvals", "business360", "enterprise_ai"],
    uiMode: "workspace",
    status: "preview",
  },
  {
    key: "compliance.core",
    name: "Omniqora Compliance",
    kind: "compliance",
    version: "1.0.0-preview",
    description: "AI-first regulatory applications, evidence, monitoring and versioned regulatory packs.",
    dependencies: ["intelligence.core", "platform.audit"],
    capabilities: ["applications", "requirements", "evidence", "reviews", "monitoring", "inspections"],
    uiMode: "workspace",
    status: "preview",
  },
  {
    key: "practice.core",
    name: "Omniqora Practice Operations",
    kind: "practice",
    version: "1.0.0-preview",
    description: "Shared professional-practice operations: clients, engagements, deadlines, document requests, e-sign, portal, time/WIP and generic submissions.",
    dependencies: ["crm.core","documents.core","payments.core","connect.core","platform.audit"],
    capabilities: ["clients","engagements","deadlines","document_requests","signatures","client_portal","time_wip","fees","submissions"],
    uiMode: "hybrid",
    status: "preview",
  },
  {
    key: "ordering.core",
    name: "Omniqora Ordering",
    kind: "ordering",
    version: "1.0.0-preview",
    description: "Direct ordering, WhatsApp/phone order intents, source catalogue validation and authoritative source handoff.",
    dependencies: ["crm.core","connect.core","payments.core","platform.events"],
    capabilities: ["catalogue","cart","direct_orders","whatsapp_orders","phone_orders","source_handoff","tracking"],
    uiMode: "hybrid",
    status: "preview",
  },
  {
    key: "hospitality.intelligence",
    name: "Omniqora EPOS & Hospitality Intelligence",
    kind: "hospitality",
    version: "1.0.0-preview",
    description: "Normalized EPOS facts, menu engineering, margin/discount/refund/waste analysis, demand forecasting and AI insights.",
    dependencies: ["ordering.core","analytics.core","financials.core","intelligence.core","platform.events"],
    capabilities: ["epos_intelligence","menu_engineering","margin_analysis","discount_leakage","refund_analysis","waste","inventory","demand_forecast","dayparts","ai_insights"],
    uiMode: "workspace",
    status: "preview",
  },
  {
    key: "business360.core",
    name: "Omniqora Business360",
    kind: "transformation",
    version: "1.0.0-preview",
    description: "Business discovery, audit/assessment, improvement planning, benefits tracking and continuous monitoring.",
    dependencies: ["intelligence.core","documents.core","analytics.core","financials.core","platform.audit"],
    capabilities: ["discovery","business_audit","assessment","improvement_plan","benefits","monitoring","evidence"],
    uiMode: "workspace",
    status: "preview",
  },
  {
    key: "transactions.core",
    name: "Omniqora Transactions & Transformation",
    kind: "transformation",
    version: "1.0.0-preview",
    description: "M&A, acquisition, merger, carve-out, separation, TSA, Day-1, 100-day and integration-management planning.",
    dependencies: ["business360.core","intelligence.core","documents.core","analytics.core","financials.core","platform.audit"],
    capabilities: ["m_and_a","acquisition","merger","carve_out","separation","tsa","day1","hundred_day","imo","diligence","benefits"],
    uiMode: "workspace",
    status: "preview",
  },
  {
    key: "reception.core",
    name: "Omniqora Reception",
    kind: "communications",
    version: "1.0.0-preview",
    description: "AI-assisted phone/message intake, customer recognition and source-system handoff.",
    dependencies: ["connect.core", "crm.core", "intelligence.core"],
    capabilities: ["intake", "caller_lookup", "handoff", "order_request", "booking_request"],
    uiMode: "hybrid",
    status: "preview",
  },
  {
    key: "payments.core",
    name: "Omniqora Payments",
    kind: "payments",
    version: "1.0.0-planned",
    description: "Provider-neutral checkout, subscriptions, splits, payouts and refunds.",
    dependencies: ["platform.tenant", "platform.entitlements", "platform.audit"],
    capabilities: ["checkout", "subscriptions", "billing", "split_payments", "payouts", "refunds"],
    uiMode: "api_only",
    status: "planned",
  },
  {
    key: "documents.core",
    name: "Omniqora Documents",
    kind: "documents",
    version: "1.0.0-planned",
    description: "Templates, versions, signatures and evidence/document packs.",
    dependencies: ["platform.tenant", "platform.audit"],
    capabilities: ["templates", "versions", "signatures", "evidence_packs"],
    uiMode: "hybrid",
    status: "planned",
  },
  {
    key: "marketing.core",
    name: "Omniqora Marketing",
    kind: "marketing",
    version: "1.0.0-planned",
    description: "Campaigns, audiences, offers, channel orchestration, attribution and consent-aware marketing.",
    dependencies: ["crm.core", "connect.core", "analytics.core", "creative.core"],
    capabilities: ["audiences", "campaigns", "offers", "attribution", "channel_orchestration", "content_requests"],
    uiMode: "hybrid",
    status: "planned",
  },
  {
    key: "sales.core",
    name: "Omniqora Sales",
    kind: "sales",
    version: "1.0.0-planned",
    description: "Sequences, callbacks, tasks, meetings, lead scoring and pipeline automation.",
    dependencies: ["crm.core", "connect.core", "analytics.core"],
    capabilities: ["sequences", "callbacks", "meetings", "lead_scoring", "pipeline_automation"],
    uiMode: "hybrid",
    status: "planned",
  },
  {
    key: "journeys.core",
    name: "Omniqora Journeys",
    kind: "journeys",
    version: "1.0.0-planned",
    description: "Visual journeys, segmentation, RFM, delays, branches and outcomes.",
    dependencies: ["crm.core", "connect.core", "platform.events"],
    capabilities: ["journeys", "segments", "rfm", "delays", "branches", "outcomes"],
    uiMode: "hybrid",
    status: "planned",
  },
  {
    key: "feedback.core",
    name: "Omniqora Feedback",
    kind: "feedback",
    version: "1.0.0-planned",
    description: "NPS, CSAT, CES, review requests, sentiment and recovery workflows.",
    dependencies: ["crm.core", "connect.core"],
    capabilities: ["nps", "csat", "ces", "reviews", "sentiment", "recovery"],
    uiMode: "hybrid",
    status: "planned",
  },
  {
    key: "analytics.core",
    name: "Omniqora Analytics & Metrics",
    kind: "analytics",
    version: "1.0.0-planned",
    description: "Shared events, semantic metrics, funnels, cohorts, dashboards and warehouse integration.",
    dependencies: ["platform.events"],
    capabilities: ["events", "metrics", "semantic_layer", "funnels", "cohorts", "dashboards", "warehouse"],
    uiMode: "workspace",
    status: "planned",
  },
  {
    key: "financials.core",
    name: "Omniqora Financials",
    kind: "financials",
    version: "1.0.0-planned",
    description: "Revenue, costs, margin, budgets, forecasts, unit economics, variance and benefit tracking.",
    dependencies: ["analytics.core", "platform.audit"],
    capabilities: ["revenue", "costs", "margin", "budgets", "forecast", "unit_economics", "variance", "benefits"],
    uiMode: "workspace",
    status: "planned",
  },
  {
    key: "creative.core",
    name: "Voxentri Creative Studio",
    kind: "creative",
    version: "1.0.0-planned",
    description: "Portfolio-wide brand-aware creative production for web, social, advertising, print, video, audio and product assets.",
    dependencies: ["platform.tenant", "platform.entitlements", "intelligence.core", "analytics.core"],
    capabilities: ["brand_kits", "briefs", "copy", "images", "video", "audio", "social", "ads", "print", "web_assets", "localisation", "approvals", "asset_library", "campaign_variants"],
    uiMode: "workspace",
    status: "planned",
  },
  {
    key: "geo.core",
    name: "Omniqora Geo",
    kind: "geo",
    version: "1.0.0-planned",
    description: "Provider-neutral geocoding, routes, ETA, optimisation, geofencing and tracking.",
    dependencies: ["platform.tenant", "platform.entitlements"],
    capabilities: ["geocode", "reverse", "distance", "eta", "routes", "optimise", "geofence", "live_track"],
    uiMode: "api_only",
    status: "planned",
  },
  {
    key: "dispatch.core",
    name: "Omniqora Dispatch",
    kind: "dispatch",
    version: "1.0.0-planned",
    description: "Jobs, agents, shifts, fleets, capacity, dispatch, POD, wallets and performance.",
    dependencies: ["geo.core", "connect.core", "platform.events"],
    capabilities: ["jobs", "agents", "auto_dispatch", "manual_dispatch", "fleet", "pod", "wallet", "tracking"],
    uiMode: "hybrid",
    status: "planned",
  },
  {
    key: "inventory.core",
    name: "Omniqora Inventory",
    kind: "inventory",
    version: "1.0.0-preview",
    description: "Shared stock items, locations, balances, movements, reservations, transfers and low-stock signals.",
    dependencies: ["platform.tenant","platform.events","platform.audit"],
    capabilities: ["items","balances","movements","reservations","transfers","low_stock","valuation"],
    uiMode: "hybrid",
    status: "preview",
  },
  {
    key: "marketplace.core",
    name: "Syndriva Marketplace",
    kind: "marketplace",
    version: "1.0.0-planned",
    description: "Reusable vendor, listing, catalogue, inventory, order, booking, commission and payout core.",
    dependencies: ["crm.core", "inventory.core", "platform.events"],
    capabilities: ["vendors", "listings", "catalogue", "inventory", "availability", "orders", "bookings", "commissions", "payouts", "reviews", "disputes"],
    uiMode: "hybrid",
    status: "planned",
  },
  {
    key: "mobile.core",
    name: "Omniqora Mobile Core",
    kind: "mobile",
    version: "1.0.0-planned",
    description: "Shared native capabilities for tenant-branded apps and the universal Agent app.",
    dependencies: ["platform.identity", "platform.entitlements", "connect.core"],
    capabilities: ["push", "deep_links", "camera", "documents", "qr", "gps", "maps", "chat", "voice", "offline", "biometrics"],
    uiMode: "embedded",
    status: "planned",
  },
];

export const OMNIQORA_REGION_PACKS: RegionPackDefinition[] = [
  {
    key: "GB",
    country: "GB",
    defaultLocale: "en-GB",
    supportedLocales: ["en-GB"],
    currency: "GBP",
    timeZones: ["Europe/London"],
    dataRegion: "UK",
    taxProfile: "uk-vat",
    legalProfile: "uk",
    regulatoryPacks: ["fca", "cqc", "ofsted"],
    providerPreferences: { telephony: ["twilio", "sip"], payments: ["adyen", "stripe", "sumup"] },
  },
  {
    key: "DE",
    country: "DE",
    defaultLocale: "de-DE",
    supportedLocales: ["de-DE", "en-GB"],
    currency: "EUR",
    timeZones: ["Europe/Berlin"],
    dataRegion: "EU",
    taxProfile: "de-ust",
    legalProfile: "de",
    regulatoryPacks: [],
    providerPreferences: { telephony: ["twilio", "sip"], payments: ["adyen", "stripe"] },
  },
  {
    key: "AE",
    country: "AE",
    defaultLocale: "en-GB",
    supportedLocales: ["en-GB", "ar-AE"],
    currency: "AED",
    timeZones: ["Asia/Dubai"],
    dataRegion: "UAE",
    taxProfile: "ae-vat",
    legalProfile: "ae",
    regulatoryPacks: [],
    providerPreferences: { telephony: ["sip", "twilio"], payments: ["adyen", "stripe"] },
  },
  {
    key: "SA",
    country: "SA",
    defaultLocale: "ar-SA",
    supportedLocales: ["ar-SA", "en-GB"],
    currency: "SAR",
    timeZones: ["Asia/Riyadh"],
    dataRegion: "KSA",
    taxProfile: "sa-vat",
    legalProfile: "sa",
    regulatoryPacks: ["aramco", "nca", "sama"],
    providerPreferences: { telephony: ["sip", "twilio"], payments: ["adyen", "stripe"] },
  },
  {
    key: "US",
    country: "US",
    defaultLocale: "en-US",
    supportedLocales: ["en-US"],
    currency: "USD",
    timeZones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
    dataRegion: "US",
    taxProfile: "us",
    legalProfile: "us",
    regulatoryPacks: [],
    providerPreferences: { telephony: ["twilio", "telnyx"], payments: ["stripe", "adyen"] },
  },
  {
    key: "PK",
    country: "PK",
    defaultLocale: "en-GB",
    supportedLocales: ["en-GB", "ur-PK"],
    currency: "PKR",
    timeZones: ["Asia/Karachi"],
    dataRegion: "PK",
    taxProfile: "pk",
    legalProfile: "pk",
    regulatoryPacks: [],
    providerPreferences: { telephony: ["sip"], payments: [] },
  },
];

export function getProductDefinition(key: string) {
  return OMNIQORA_PRODUCTS.find((product) => product.key === key) ?? null;
}

export function getModuleDefinition(key: string) {
  return OMNIQORA_MODULES.find((module) => module.key === key) ?? null;
}

export function getRegionPack(key: string) {
  return OMNIQORA_REGION_PACKS.find((region) => region.key === key) ?? null;
}

export function resolveProductModules(productKey: string, enabledModules: string[] = []) {
  const product = getProductDefinition(productKey);
  if (!product) return [];
  return [...new Set([...product.defaultModules, ...enabledModules])];
}
