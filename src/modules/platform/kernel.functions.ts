import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const productKey = z.string().min(2).max(80);

export type KernelCatalogue = {
  regions: any[];
  locales: any[];
  providers: any[];
  requirements: any[];
};

export const getPlatformKernelCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const [regions, locales, providers, requirements] = await Promise.all([
      db.from("region_packs").select("*").neq("status", "retired").order("name"),
      db.from("locale_packs").select("*").neq("status", "retired").order("locale"),
      db.from("provider_catalogue").select("*").neq("status", "retired").order("provider_kind").order("name"),
      db.from("product_provider_requirements").select("*").order("product_key").order("provider_key"),
    ]);
    for (const response of [regions, locales, providers, requirements]) {
      if (response.error) throw new Error(response.error.message);
    }
    return {
      regions: regions.data ?? [],
      locales: locales.data ?? [],
      providers: providers.data ?? [],
      requirements: requirements.data ?? [],
    } as KernelCatalogue;
  });

const tenantProductInput = z.object({ tenantId: uuid, productKey });

export const getTenantProductKernel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof tenantProductInput>) => tenantProductInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const [product, bindings, route, readiness, brands, locations] = await Promise.all([
      db.from("tenant_products").select("*").eq("tenant_id", data.tenantId).eq("product_key", data.productKey).maybeSingle(),
      db.from("provider_bindings").select("*").eq("tenant_id", data.tenantId).eq("product_key", data.productKey).order("provider_key"),
      db.from("tenant_data_routes").select("*").eq("tenant_id", data.tenantId).eq("product_key", data.productKey).maybeSingle(),
      db.rpc("get_tenant_product_readiness", { _tenant: data.tenantId, _product: data.productKey }),
      db.from("tenant_brands").select("*").eq("tenant_id", data.tenantId).order("is_primary", { ascending: false }).order("name"),
      db.from("tenant_locations").select("*").eq("tenant_id", data.tenantId).order("name"),
    ]);
    for (const response of [product, bindings, route, readiness, brands, locations]) {
      if (response.error) throw new Error(response.error.message);
    }
    return {
      product: product.data ?? null,
      bindings: bindings.data ?? [],
      dataRoute: route.data ?? null,
      readiness: readiness.data ?? null,
      brands: brands.data ?? [],
      locations: locations.data ?? [],
    };
  });

const runtimeSchema = tenantProductInput.extend({
  regionKey: z.string().regex(/^[a-z0-9-]{2,40}$/),
  locale: z.string().min(2).max(20),
  runtimeConfig: z.record(z.string(), z.unknown()).default({}),
});
export const setTenantProductRuntime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof runtimeSchema>) => runtimeSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await (context.supabase as any).rpc("platform_set_tenant_product_runtime", {
      _tenant: data.tenantId,
      _product: data.productKey,
      _region: data.regionKey,
      _locale: data.locale,
      _runtime_config: data.runtimeConfig,
    });
    if (response.error) throw new Error(response.error.message);
    return { ok: true };
  });

const providerBindingSchema = tenantProductInput.extend({
  providerKey: z.string().min(3).max(100),
  brandId: uuid.nullish(),
  locationId: uuid.nullish(),
  environment: z.enum(["development","staging","production"]).default("production"),
  secretRefs: z.record(z.string(), z.string().min(1).max(500)).default({}),
  config: z.record(z.string(), z.unknown()).default({}),
});
export const upsertProviderBinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof providerBindingSchema>) => providerBindingSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await (context.supabase as any).rpc("platform_upsert_provider_binding", {
      _tenant: data.tenantId,
      _product: data.productKey,
      _brand: data.brandId ?? null,
      _location: data.locationId ?? null,
      _provider: data.providerKey,
      _environment: data.environment,
      _secret_refs: data.secretRefs,
      _config: data.config,
    });
    if (response.error) throw new Error(response.error.message);
    return { bindingId: response.data as string };
  });

const dataRouteSchema = tenantProductInput.extend({
  routingMode: z.enum(["shared","regional","dedicated","external"]),
  dataRegion: z.string().min(1).max(40),
  connectionRef: z.string().max(500).nullish(),
  config: z.record(z.string(), z.unknown()).default({}),
});
export const setTenantDataRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof dataRouteSchema>) => dataRouteSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await (context.supabase as any).rpc("platform_set_data_route", {
      _tenant: data.tenantId,
      _product: data.productKey,
      _mode: data.routingMode,
      _region: data.dataRegion,
      _connection_ref: data.connectionRef ?? null,
      _config: data.config,
    });
    if (response.error) throw new Error(response.error.message);
    return { ok: true };
  });

const serviceCredentialSchema = z.object({
  scopes: z.array(z.object({
    tenantId: uuid,
    productKey,
    brandIds: z.array(uuid).optional(),
    locationIds: z.array(uuid).optional(),
    capabilities: z.array(z.string().min(1).max(100)).min(1).max(100),
  })).min(1).max(100),
  validDays: z.number().int().min(1).max(730).default(365),
});

export const createServiceCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof serviceCredentialSchema>) => serviceCredentialSchema.parse(input))
  .handler(async ({ context, data }) => {
    const random = crypto.getRandomValues(new Uint8Array(32));
    const secret = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const keyPart = crypto.getRandomValues(new Uint8Array(9));
    const keyId = "oqsvc_" + Array.from(keyPart, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const response = await (context.supabase as any).rpc("platform_set_service_credential", {
      _key_id: keyId,
      _secret_hash: hash,
      _secret_suffix: secret.slice(-8),
      _scopes: data.scopes,
      _valid_days: data.validDays,
    });
    if (response.error) throw new Error(response.error.message);
    return {
      credentialId: response.data as string,
      keyId,
      token: keyId + "." + secret,
      validDays: data.validDays,
    };
  });
