import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const tenantInput = z.object({ tenantId: uuid });

export type ControlPlaneCatalogue = {
  isPlatformAdmin: boolean;
  products: Array<{ product_key: string; name: string; description?: string | null; category: string; deployment_mode: string; status: string }>;
  services: Array<{ service_key: string; name: string; description?: string | null; family: string; owner_product_key?: string | null; provisioning_mode: string; status: string }>;
  dependencies: Array<{ service_key: string; depends_on_service_key: string; required: boolean }>;
  blueprints: Array<{ blueprint_key: string; name: string; description?: string | null; country_code?: string | null; category: string }>;
};

export type PlatformTenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  countryCode: string;
  currency: string;
  timezone: string;
  organisationId: string;
  organisationName: string;
  products: number;
  services: number;
};

export type TenantControlPlane = {
  tenant: { id: string; name: string; slug: string; organisation_id: string; country_code: string; currency: string; timezone: string; status: string };
  organisation: { id: string; name: string; slug: string; country_code: string; billing_currency: string } | null;
  products: Array<{ product_key: string; status: string; external_tenant_id?: string | null; base_url?: string | null; plan_key?: string | null; config?: Record<string, unknown> }>;
  services: Array<{ service_key: string; status: string; source: string; valid_until?: string | null; config?: Record<string, unknown> }>;
  branding: Record<string, unknown> | null;
  domains: Array<{ id: string; product_key?: string | null; domain: string; verification_status: string; ssl_status: string; is_primary: boolean }>;
  connections: Array<{ id: string; product_key: string; external_tenant_id: string; base_url?: string | null; status: string; capabilities?: string[] }>;
  provisioning: Array<{ id: string; target_kind: string; target_key: string; action: string; status: string; attempts: number; last_error?: string | null; created_at: string }>;
};

export const getControlPlaneCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_control_plane_catalogue" as never);
    if (error) throw new Error(error.message);
    return data as unknown as ControlPlaneCatalogue;
  });

export const listPlatformTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("platform_list_tenants" as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PlatformTenantRow[];
  });

export const getTenantControlPlane = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) => tenantInput.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("get_tenant_control_plane" as never, { _tenant: data.tenantId } as never);
    if (response.error) throw new Error(response.error.message);
    return response.data as unknown as TenantControlPlane;
  });

const createTenantSchema = z.object({
  organisationId: uuid.nullish(),
  organisationName: z.string().trim().max(160).default(""),
  tenantName: z.string().trim().min(1).max(160),
  slug: z.string().trim().regex(/^[a-z0-9-]{1,100}$/),
  countryCode: z.string().regex(/^[A-Z]{2}$/).default("GB"),
  currency: z.string().regex(/^[A-Z]{3}$/).default("GBP"),
  timezone: z.string().min(1).max(80).default("Europe/London"),
  blueprintKey: z.string().min(1).max(100).nullish(),
});

export const createPlatformTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof createTenantSchema>) => createTenantSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("platform_create_tenant" as never, {
      _organisation_id: data.organisationId ?? null,
      _organisation_name: data.organisationName,
      _tenant_name: data.tenantName,
      _slug: data.slug,
      _country_code: data.countryCode,
      _currency: data.currency,
      _timezone: data.timezone,
      _blueprint_key: data.blueprintKey ?? null,
    } as never);
    if (response.error) throw new Error(response.error.message);
    return { tenantId: response.data as unknown as string };
  });

const toggleProductSchema = z.object({ tenantId: uuid, productKey: z.string().min(2).max(80), enabled: z.boolean() });
export const setTenantProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof toggleProductSchema>) => toggleProductSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("platform_set_tenant_product" as never, {
      _tenant: data.tenantId, _product: data.productKey, _enabled: data.enabled, _config: {},
    } as never);
    if (response.error) throw new Error(response.error.message);
    return { ok: true };
  });

const toggleServiceSchema = z.object({ tenantId: uuid, serviceKey: z.string().min(2).max(100), enabled: z.boolean() });
export const setTenantService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof toggleServiceSchema>) => toggleServiceSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("platform_set_tenant_service" as never, {
      _tenant: data.tenantId, _service: data.serviceKey, _enabled: data.enabled, _config: {},
    } as never);
    if (response.error) throw new Error(response.error.message);
    return { ok: true };
  });

const brandingSchema = z.object({
  tenantId: uuid,
  brandName: z.string().trim().max(160).optional(),
  logoUrl: z.string().trim().max(1000).optional(),
  darkLogoUrl: z.string().trim().max(1000).optional(),
  faviconUrl: z.string().trim().max(1000).optional(),
  primaryColour: z.string().trim().max(32).optional(),
  secondaryColour: z.string().trim().max(32).optional(),
  fontFamily: z.string().trim().max(120).optional(),
  supportEmail: z.string().trim().max(320).optional(),
  supportPhone: z.string().trim().max(64).optional(),
  termsUrl: z.string().trim().max(1000).optional(),
  privacyUrl: z.string().trim().max(1000).optional(),
  emailFromName: z.string().trim().max(160).optional(),
  emailFromAddress: z.string().trim().max(320).optional(),
  smsSender: z.string().trim().max(64).optional(),
  whatsappSender: z.string().trim().max(64).optional(),
});

export const saveTenantBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof brandingSchema>) => brandingSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { tenantId, ...branding } = data;
    const response = await context.supabase.rpc("platform_set_branding" as never, {
      _tenant: tenantId,
      _branding: branding,
    } as never);
    if (response.error) throw new Error(response.error.message);
    return { ok: true };
  });

const domainSchema = z.object({
  tenantId: uuid,
  productKey: z.string().min(2).max(80).nullish(),
  domain: z.string().trim().min(4).max(253),
  primary: z.boolean().default(true),
});

export const upsertTenantDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof domainSchema>) => domainSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("platform_upsert_domain" as never, {
      _tenant: data.tenantId,
      _product: data.productKey ?? null,
      _domain: data.domain,
      _primary: data.primary,
    } as never);
    if (response.error) throw new Error(response.error.message);
    return { domainId: response.data as unknown as string };
  });
