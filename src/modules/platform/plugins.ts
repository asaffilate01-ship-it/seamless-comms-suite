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
    capabilities: ["generation", "embeddings", "speech"],
    secretNames: ["api_key"],
    status: "preview",
  },
  {
    key: "ai.anthropic",
    name: "Anthropic",
    kind: "ai",
    version: "1",
    capabilities: ["generation"],
    secretNames: ["api_key"],
    status: "preview",
  },
  {
    key: "ai.gemini",
    name: "Google Gemini",
    kind: "ai",
    version: "1",
    capabilities: ["generation"],
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
];

export function pluginDefinition(key: string) {
  return BUILTIN_PLUGIN_DEFINITIONS.find((plugin) => plugin.key === key) ?? null;
}
