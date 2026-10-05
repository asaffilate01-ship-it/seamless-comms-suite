import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const marketplaceMode = z.enum([
  "products",
  "services",
  "bookings",
  "delivery",
  "consultations",
  "freelancer",
  "rental",
  "peer_to_peer",
  "rfq",
]);

const listSchema = z.object({
  tenantId: uuid,
  productKey: z.string().min(2).max(80).optional(),
});

export const getSyndrivaMarketplaceEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof listSchema>) => listSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;

    const [templates, capabilities] = await Promise.all([
      db
        .from("syndriva_marketplace_templates")
        .select("*")
        .neq("status", "retired")
        .order("name"),
      db
        .from("syndriva_capability_catalogue")
        .select("*")
        .neq("status", "retired")
        .order("family")
        .order("name"),
    ]);

    if (templates.error) throw new Error(templates.error.message);
    if (capabilities.error) throw new Error(capabilities.error.message);

    let marketplaceQuery = db
      .from("syndriva_marketplaces")
      .select("*, capabilities:syndriva_marketplace_capabilities(*), connections:syndriva_marketplace_connections(*)")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });

    if (data.productKey) marketplaceQuery = marketplaceQuery.eq("product_key", data.productKey);

    const marketplaces = await marketplaceQuery;
    if (marketplaces.error) throw new Error(marketplaces.error.message);

    return {
      templates: templates.data ?? [],
      capabilities: capabilities.data ?? [],
      marketplaces: marketplaces.data ?? [],
    };
  });

const createMarketplaceSchema = z.object({
  tenantId: uuid,
  productKey: z.string().min(2).max(80),
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  templateKey: z.string().min(2).max(80).default("hybrid"),
  marketplaceKey: z.string().min(2).max(160).nullish(),
  brandId: uuid.nullish(),
  sellerModel: z.enum(["single_brand", "single_seller", "multi_seller", "peer_to_peer"]).default("multi_seller"),
  branchModel: z.enum(["single_branch", "multi_branch", "not_applicable"]).default("multi_branch"),
  currency: z.string().regex(/^[A-Z]{3}$/).default("GBP"),
  country: z.string().length(2).nullish(),
  timezone: z.string().min(2).max(100).default("Europe/London"),
  marketplaceModes: z.array(marketplaceMode).max(9).default([]),
  config: z.record(z.unknown()).default({}),
});

export const createSyndrivaMarketplace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof createMarketplaceSchema>) =>
    createMarketplaceSchema.parse(input),
  )
  .handler(async ({ context, data }) => {
    const config = {
      ...data.config,
      seller_model: data.sellerModel,
      branch_model: data.branchModel,
      currency: data.currency,
      country: data.country ?? undefined,
      timezone: data.timezone,
      ...(data.marketplaceModes.length ? { requested_modes: data.marketplaceModes } : {}),
    };

    const result = await (context.supabase as any).rpc("syndriva_create_marketplace", {
      _tenant: data.tenantId,
      _product: data.productKey,
      _name: data.name,
      _slug: data.slug,
      _template: data.templateKey,
      _marketplace_key: data.marketplaceKey ?? null,
      _brand: data.brandId ?? null,
      _config: config,
    });

    if (result.error) throw new Error(result.error.message);
    return { marketplaceId: result.data as string };
  });

const setCapabilitySchema = z.object({
  marketplaceId: uuid,
  capabilityKey: z.string().min(2).max(100),
  enabled: z.boolean(),
  config: z.record(z.unknown()).default({}),
});

export const setSyndrivaMarketplaceCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof setCapabilitySchema>) => setCapabilitySchema.parse(input))
  .handler(async ({ context, data }) => {
    const result = await (context.supabase as any).rpc("syndriva_set_capability", {
      _marketplace: data.marketplaceId,
      _capability: data.capabilityKey,
      _enabled: data.enabled,
      _config: data.config,
    });
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

const connectionSchema = z.object({
  marketplaceId: uuid,
  tenantId: uuid,
  connectionType: z.enum([
    "omniqora",
    "payments",
    "dispatch",
    "geo",
    "crm",
    "messaging",
    "analytics",
    "webhooks",
    "vertical",
    "inventory",
    "accounting",
    "identity",
    "other",
  ]),
  providerKey: z.string().max(100).nullish(),
  externalRef: z.string().max(240).nullish(),
  status: z.enum(["pending", "connected", "degraded", "failed", "disabled"]).default("pending"),
  config: z.record(z.unknown()).default({}),
});

export const connectSyndrivaMarketplace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof connectionSchema>) => connectionSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;

    const scope = await db
      .from("syndriva_marketplaces")
      .select("id")
      .eq("id", data.marketplaceId)
      .eq("tenant_id", data.tenantId)
      .single();

    if (scope.error) throw new Error(scope.error.message);

    const inserted = await db
      .from("syndriva_marketplace_connections")
      .insert({
        marketplace_id: data.marketplaceId,
        tenant_id: data.tenantId,
        connection_type: data.connectionType,
        provider_key: data.providerKey ?? null,
        external_ref: data.externalRef ?? null,
        status: data.status,
        config: data.config,
      })
      .select("*")
      .single();

    if (inserted.error) throw new Error(inserted.error.message);
    return inserted.data;
  });


const searchSchema = z.object({
  marketplaceId: uuid,
  query: z.string().max(200).nullish(),
  category: z.string().max(120).nullish(),
  vendorId: uuid.nullish(),
  minPriceMinor: z.number().int().nonnegative().nullish(),
  maxPriceMinor: z.number().int().nonnegative().nullish(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const searchSyndrivaMarketplace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof searchSchema>) => searchSchema.parse(input))
  .handler(async ({ context, data }) => {
    const result = await (context.supabase as any).rpc("syndriva_search_listings", {
      _marketplace: data.marketplaceId,
      _query: data.query ?? null,
      _category: data.category ?? null,
      _vendor: data.vendorId ?? null,
      _min_price: data.minPriceMinor ?? null,
      _max_price: data.maxPriceMinor ?? null,
      _limit: data.limit,
      _offset: data.offset,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  });

const eventSchema = z.object({
  marketplaceId: uuid,
  eventType: z.string().regex(/^marketplace\.[a-z0-9]+([._-][a-z0-9]+)*$/),
  subjectId: z.string().max(240).nullish(),
  payload: z.record(z.unknown()).default({}),
  idempotencyKey: z.string().max(240).nullish(),
  correlationId: z.string().max(240).nullish(),
  causationId: z.string().max(240).nullish(),
});

export const emitSyndrivaMarketplaceEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof eventSchema>) => eventSchema.parse(input))
  .handler(async ({ context, data }) => {
    const result = await (context.supabase as any).rpc("syndriva_emit_marketplace_event", {
      _marketplace: data.marketplaceId,
      _event_type: data.eventType,
      _subject_id: data.subjectId ?? null,
      _payload: data.payload,
      _idempotency_key: data.idempotencyKey ?? null,
      _correlation_id: data.correlationId ?? null,
      _causation_id: data.causationId ?? null,
    });
    if (result.error) throw new Error(result.error.message);
    return { eventId: result.data as string };
  });

export const getSyndrivaEventCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await (context.supabase as any)
      .from("syndriva_event_catalogue")
      .select("*")
      .neq("status", "retired")
      .order("family")
      .order("event_type");
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  });
