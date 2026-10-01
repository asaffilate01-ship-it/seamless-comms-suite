export type PluginKind =
  | "communications"
  | "payments"
  | "maps"
  | "ai"
  | "storage"
  | "search"
  | "analytics"
  | "accounting"
  | "identity"
  | "delivery"
  | "creative"
  | "tax"
  | "registry"
  | "esign"
  | "banking"
  | "remittance"
  | "telecom"
  | "commerce"
  | "vehicle"
  | "custom";

export type PluginScope = "platform" | "product" | "tenant" | "location";

export type PluginDefinition = {
  key: string;
  name: string;
  kind: PluginKind;
  version: string;
  capabilities: string[];
  supportedCountries?: string[];
  supportedLocales?: string[];
  secretNames: string[];
  publicConfigNames?: string[];
  status: "active" | "preview" | "planned";
};

export type PluginBinding = {
  pluginKey: string;
  scope: PluginScope;
  tenantId?: string | null;
  tenantProductId?: string | null;
  locationId?: string | null;
  country?: string | null;
  environment: "development" | "staging" | "production";
  secretRefs: Record<string, string>;
  config: Record<string, unknown>;
};

export type PluginHealth = {
  ok: boolean;
  checkedAt: string;
  details?: Record<string, unknown>;
};

export interface OmniqoraPluginAdapter {
  readonly definition: PluginDefinition;
  validateBinding(binding: PluginBinding): void;
  health(binding: PluginBinding): Promise<PluginHealth>;
}

export const BUILTIN_PLUGIN_DEFINITIONS: PluginDefinition[] = [
  {
    key: "identity.host",
    name: "Host Identity Provider",
    kind: "identity",
    version: "1",
    capabilities: ["session","membership","password","magic_link"],
    secretNames: [],
    status: "active",
  },
  {
    key: "identity.whatsapp-otp",
    name: "WhatsApp OTP Identity Adapter",
    kind: "identity",
    version: "1",
    capabilities: ["whatsapp_otp","mfa"],
    secretNames: [],
    publicConfigNames: ["template_key"],
    status: "planned",
  },
  {
    key: "identity.microsoft-entra",
    name: "Microsoft Entra ID",
    kind: "identity",
    version: "1",
    capabilities: ["oidc","sso","mfa"],
    secretNames: ["client_id","client_secret"],
    publicConfigNames: ["tenant_id","redirect_uri"],
    status: "planned",
  },
  {
    key: "identity.google",
    name: "Google Identity",
    kind: "identity",
    version: "1",
    capabilities: ["oidc","sso"],
    secretNames: ["client_id","client_secret"],
    publicConfigNames: ["redirect_uri"],
    status: "planned",
  },
  {
    key: "identity.apple",
    name: "Sign in with Apple",
    kind: "identity",
    version: "1",
    capabilities: ["oidc","sso"],
    secretNames: ["client_id","client_secret"],
    publicConfigNames: ["redirect_uri"],
    status: "planned",
  },
  {
    key: "identity.passkey",
    name: "Passkey / WebAuthn Adapter",
    kind: "identity",
    version: "1",
    capabilities: ["passkey","mfa"],
    secretNames: [],
    publicConfigNames: ["rp_id","origin"],
    status: "planned",
  },
  {
    key: "communications.meta-whatsapp",
    name: "Meta WhatsApp Cloud API",
    kind: "communications",
    version: "1",
    capabilities: ["whatsapp.inbound", "whatsapp.outbound", "whatsapp.templates"],
    secretNames: ["access_token", "app_secret", "verify_token"],
    publicConfigNames: ["phone_number_id", "waba_id"],
    status: "active",
  },
  {
    key: "communications.twilio",
    name: "Twilio Communications",
    kind: "communications",
    version: "1",
    capabilities: ["voice", "sms", "whatsapp", "masked_calls"],
    secretNames: ["account_sid", "auth_token"],
    publicConfigNames: ["messaging_service_sid", "voice_number"],
    status: "preview",
  },
  {
    key: "communications.sip",
    name: "SIP / Voice Provider",
    kind: "communications",
    version: "1",
    capabilities: ["voice", "masked_calls", "ivr"],
    secretNames: ["username", "password"],
    publicConfigNames: ["host", "trunk_id"],
    status: "planned",
  },
  {
    key: "payments.stripe",
    name: "Stripe",
    kind: "payments",
    version: "1",
    capabilities: ["checkout", "subscriptions", "refunds", "webhooks"],
    secretNames: ["secret_key", "webhook_secret"],
    publicConfigNames: ["publishable_key"],
    status: "preview",
  },
  {
    key: "payments.adyen",
    name: "Adyen",
    kind: "payments",
    version: "1",
    capabilities: ["checkout", "platforms", "splits", "payouts", "refunds"],
    secretNames: ["api_key", "hmac_key"],
    publicConfigNames: ["merchant_account", "client_key"],
    status: "preview",
  },
  {
    key: "payments.sumup",
    name: "SumUp",
    kind: "payments",
    version: "1",
    capabilities: ["pos", "checkout"],
    secretNames: ["access_token"],
    publicConfigNames: ["merchant_code"],
    status: "preview",
  },
  {
    key: "maps.google",
    name: "Google Maps Platform",
    kind: "maps",
    version: "1",
    capabilities: ["geocode", "reverse", "routes", "distance", "places"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "maps.mapbox",
    name: "Mapbox",
    kind: "maps",
    version: "1",
    capabilities: ["geocode", "routes", "matrix", "maps"],
    secretNames: ["access_token"],
    status: "planned",
  },
  {
    key: "ai.openai",
    name: "OpenAI",
    kind: "ai",
    version: "1",
    capabilities: ["generation", "embeddings", "speech", "vision", "document_extraction"],
    secretNames: ["api_key"],
    status: "preview",
  },
  {
    key: "ai.anthropic",
    name: "Anthropic",
    kind: "ai",
    version: "1",
    capabilities: ["generation", "vision", "document_extraction"],
    secretNames: ["api_key"],
    status: "preview",
  },
  {
    key: "ai.gemini",
    name: "Google Gemini",
    kind: "ai",
    version: "1",
    capabilities: ["generation", "vision", "document_extraction"],
    secretNames: ["api_key"],
    status: "preview",
  },
  {
    key: "creative.voxentri",
    name: "Voxentri Creative Studio",
    kind: "creative",
    version: "1",
    capabilities: ["copy", "images", "video", "audio", "localisation", "brand_assets"],
    secretNames: [],
    status: "planned",
  },
  {
    key: "tax.uk-legislation",
    name: "UK Legislation Source",
    kind: "tax",
    version: "1",
    capabilities: ["legislation_search", "point_in_time", "change_monitoring"],
    supportedCountries: ["GB"],
    secretNames: [],
    status: "planned",
  },
  {
    key: "tax.uk-case-law",
    name: "UK Tax Case Law Source",
    kind: "tax",
    version: "1",
    capabilities: ["case_search", "judgment_retrieval", "citation"],
    supportedCountries: ["GB"],
    secretNames: [],
    status: "planned",
  },
  {
    key: "tax.irs-authority",
    name: "IRS Authority Source",
    kind: "tax",
    version: "1",
    capabilities: ["irb", "rulings", "procedures", "official_guidance", "change_monitoring"],
    supportedCountries: ["US"],
    secretNames: [],
    status: "planned",
  },
  {
    key: "tax.us-tax-court",
    name: "US Tax Court Source",
    kind: "tax",
    version: "1",
    capabilities: ["opinion_search", "case_retrieval", "citation"],
    supportedCountries: ["US"],
    secretNames: [],
    status: "planned",
  },
  {
    key: "accounting.document-extraction",
    name: "Accounting Document Extraction",
    kind: "accounting",
    version: "1",
    capabilities: ["receipt_extraction", "invoice_extraction", "statement_extraction", "csv_import", "classification"],
    secretNames: [],
    publicConfigNames: ["ai_provider_key"],
    status: "planned",
  },
  {
    key: "tax.hmrc",
    name: "HMRC API Adapter",
    kind: "tax",
    version: "1",
    capabilities: ["oauth","obligations","submissions","receipts"],
    supportedCountries: ["GB"],
    secretNames: ["client_id","client_secret"],
    publicConfigNames: ["redirect_uri"],
    status: "planned",
  },
  {
    key: "registry.companies-house",
    name: "Companies House Adapter",
    kind: "registry",
    version: "1",
    capabilities: ["company_lookup","filing_status","submissions"],
    supportedCountries: ["GB"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "tax.us-efile",
    name: "US e-file Provider Adapter",
    kind: "tax",
    version: "1",
    capabilities: ["submission","acknowledgement","rejection","receipt"],
    supportedCountries: ["US"],
    secretNames: ["provider_credential"],
    publicConfigNames: ["provider_name"],
    status: "planned",
  },
  {
    key: "esign.provider",
    name: "E-signature Provider",
    kind: "esign",
    version: "1",
    capabilities: ["signature_request","status","evidence"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "banking.open-banking",
    name: "Open Banking / Bank Feed Adapter",
    kind: "banking",
    version: "1",
    capabilities: ["accounts","transactions","balances","consent"],
    secretNames: ["client_id","client_secret"],
    status: "planned",
  },
  {
    key: "banking.clearbank",
    name: "ClearBank",
    kind: "banking",
    version: "1",
    capabilities: ["accounts","payments","beneficiaries","webhooks"],
    supportedCountries: ["GB"],
    secretNames: ["client_id","client_secret"],
    publicConfigNames: ["institution_id","webhook_url"],
    status: "planned",
  },
  {
    key: "remittance.thunes",
    name: "Thunes",
    kind: "remittance",
    version: "1",
    capabilities: ["quotes","transfers","beneficiaries","status","webhooks"],
    secretNames: ["api_key","api_secret"],
    publicConfigNames: ["base_url","callback_url"],
    status: "planned",
  },
  {
    key: "telecom.gigs",
    name: "Gigs",
    kind: "telecom",
    version: "1",
    capabilities: ["plans","subscriptions","sims","esims","usage","webhooks"],
    supportedCountries: ["GB"],
    secretNames: ["api_key","webhook_secret"],
    publicConfigNames: ["project_id"],
    status: "planned",
  },
  {
    key: "delivery.uber-direct",
    name: "Uber Direct",
    kind: "delivery",
    version: "1",
    capabilities: ["quote","delivery","tracking","webhooks"],
    secretNames: ["client_id","client_secret"],
    publicConfigNames: ["customer_id"],
    status: "planned",
  },
  {
    key: "delivery.deliveroo-express",
    name: "Deliveroo Express",
    kind: "delivery",
    version: "1",
    capabilities: ["delivery","tracking","webhooks"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "delivery.just-eat-go",
    name: "Just Eat Go",
    kind: "delivery",
    version: "1",
    capabilities: ["delivery","tracking","webhooks"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "delivery.stuart",
    name: "Stuart",
    kind: "delivery",
    version: "1",
    capabilities: ["quote","delivery","tracking","webhooks"],
    secretNames: ["client_id","client_secret"],
    status: "planned",
  },
  {
    key: "delivery.gophr",
    name: "Gophr",
    kind: "delivery",
    version: "1",
    capabilities: ["quote","job","tracking","webhooks"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "delivery.lalamove",
    name: "Lalamove",
    kind: "delivery",
    version: "1",
    capabilities: ["quote","job","tracking","webhooks"],
    secretNames: ["api_key","api_secret"],
    status: "planned",
  },
  {
    key: "delivery.shiply",
    name: "Shiply",
    kind: "delivery",
    version: "1",
    capabilities: ["quote","job","status"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "delivery.anyvan",
    name: "AnyVan",
    kind: "delivery",
    version: "1",
    capabilities: ["quote","job","status"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "delivery.uship",
    name: "uShip",
    kind: "delivery",
    version: "1",
    capabilities: ["quote","job","status"],
    secretNames: ["client_id","client_secret"],
    status: "planned",
  },
  {
    key: "delivery.cx",
    name: "Courier Exchange",
    kind: "delivery",
    version: "1",
    capabilities: ["jobs","quotes","status"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "commerce.ebay",
    name: "eBay",
    kind: "commerce",
    version: "1",
    capabilities: ["listings","orders","inventory","webhooks"],
    secretNames: ["client_id","client_secret"],
    status: "planned",
  },
  {
    key: "commerce.amazon",
    name: "Amazon",
    kind: "commerce",
    version: "1",
    capabilities: ["listings","orders","inventory"],
    secretNames: ["client_id","client_secret"],
    status: "planned",
  },
  {
    key: "vehicle.uk-data",
    name: "UK Vehicle Data",
    kind: "vehicle",
    version: "1",
    capabilities: ["vehicle_lookup","history"],
    supportedCountries: ["GB"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "vehicle.jp-auctions",
    name: "Japanese Auction Feeds",
    kind: "vehicle",
    version: "1",
    capabilities: ["vehicles","auctions","bids","images"],
    secretNames: ["api_key"],
    status: "planned",
  },
  {
    key: "accounting.xero",
    name: "Xero Adapter",
    kind: "accounting",
    version: "1",
    capabilities: ["contacts","invoices","payments","accounts","transactions"],
    secretNames: ["client_id","client_secret"],
    status: "planned",
  },
  {
    key: "accounting.quickbooks",
    name: "QuickBooks Adapter",
    kind: "accounting",
    version: "1",
    capabilities: ["contacts","invoices","payments","accounts","transactions"],
    secretNames: ["client_id","client_secret"],
    status: "planned",
  },
  {
    key: "accounting.sage",
    name: "Sage Adapter",
    kind: "accounting",
    version: "1",
    capabilities: ["contacts","invoices","payments","accounts","transactions"],
    secretNames: ["client_id","client_secret"],
    status: "planned",
  },
];

export function pluginDefinition(key: string) {
  return BUILTIN_PLUGIN_DEFINITIONS.find((plugin) => plugin.key === key) ?? null;
}
