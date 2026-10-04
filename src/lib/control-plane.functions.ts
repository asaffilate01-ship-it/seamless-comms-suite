import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const tenantInput = z.object({ tenantId: uuid });

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ControlPlaneCatalogue = {
  isPlatformAdmin: boolean;
  products: Array<{ product_key: string; name: string; description?: string | null; category: string; deployment_mode: string; status: string; product_role?: string; parent_product_key?: string | null; implementation_status?: string }>;
  services: Array<{ service_key: string; name: string; description?: string | null; family: string; owner_product_key?: string | null; provisioning_mode: string; status: string; implementation_status?: string }>;
  dependencies: Array<{ service_key: string; depends_on_service_key: string; required: boolean }>;
  blueprints: Array<{ blueprint_key: string; name: string; description?: string | null; country_code?: string | null; category: string }>;
  ecosystemAddons: Array<{ addon_key:string;host_product_key:string;addon_product_key?:string|null;addon_service_key?:string|null;name:string;category:string;description:string;integration_mode:string;data_boundary:string;capabilities:string[];default_enabled:boolean;status:string }>;
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
  products: Array<{ product_key: string; status: string; external_tenant_id?: string | null; base_url?: string | null; plan_key?: string | null; config?: JsonValue }>;
  services: Array<{ service_key: string; status: string; source: string; valid_until?: string | null; config?: JsonValue }>;
  branding: JsonValue | null;
  brands: Array<{ id: string; product_key?: string | null; name: string; slug: string; logo_url?: string | null; theme?: JsonValue; is_primary: boolean }>;
  locations: Array<{ id: string; brand_id?: string | null; name: string; code: string; timezone: string; address?: JsonValue; status: string }>;
  domains: Array<{ id: string; product_key?: string | null; domain: string; verification_status: string; ssl_status: string; is_primary: boolean }>;
  connections: Array<{ id: string; product_key: string; external_tenant_id: string; base_url?: string | null; status: string; capabilities?: string[]; credential_suffix?: string | null; credential_expires_at?: string | null }>;
  provisioning: Array<{ id: string; target_kind: string; target_key: string; action: string; status: string; attempts: number; last_error?: string | null; created_at: string }>;
  ecosystemAddons: Array<{ addon_key:string;host_product_key:string;status:string;config?:JsonValue;external_connection_ref?:string|null;activated_at?:string|null;updated_at:string }>;
};

export const getControlPlaneCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db=context.supabase as any;
    const [core,addons]=await Promise.all([
      db.rpc("get_control_plane_catalogue"),
      db.from("ecosystem_addon_catalogue").select("*").neq("status","retired").order("host_product_key").order("name"),
    ]);
    if (core.error) throw new Error(core.error.message);
    if (addons.error) throw new Error(addons.error.message);
    return {...(core.data as unknown as Omit<ControlPlaneCatalogue,"ecosystemAddons">),ecosystemAddons:(addons.data??[])} as ControlPlaneCatalogue;
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
    const db=context.supabase as any;
    const [core,addons]=await Promise.all([
      db.rpc("get_tenant_control_plane",{_tenant:data.tenantId}),
      db.from("tenant_ecosystem_addons").select("*").eq("tenant_id",data.tenantId).order("host_product_key").order("addon_key"),
    ]);
    if(core.error)throw new Error(core.error.message);
    if(addons.error)throw new Error(addons.error.message);
    return {...(core.data as unknown as Omit<TenantControlPlane,"ecosystemAddons">),ecosystemAddons:(addons.data??[])} as TenantControlPlane;
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

const linkProductSchema = z.object({
  tenantId: uuid,
  productKey: z.string().min(2).max(80),
  externalTenantId: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().max(1000).optional(),
  capabilities: z.array(z.string().min(1).max(100)).default([]),
});

export const linkTenantProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof linkProductSchema>) => linkProductSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("platform_link_product" as never, {
      _tenant: data.tenantId,
      _product: data.productKey,
      _external_tenant_id: data.externalTenantId,
      _base_url: data.baseUrl || null,
      _capabilities: data.capabilities,
    } as never);
    if (response.error) throw new Error(response.error.message);
    return { connectionId: response.data as unknown as string };
  });

const rotateCredentialSchema = z.object({
  connectionId: uuid,
  validDays: z.number().int().min(1).max(730).default(365),
});

export const rotateProductCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof rotateCredentialSchema>) => rotateCredentialSchema.parse(input))
  .handler(async ({ context, data }) => {
    const random = crypto.getRandomValues(new Uint8Array(32));
    const token = "oqcp_" + Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const credentialHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const suffix = token.slice(-8);

    const response = await context.supabase.rpc("platform_set_product_credential" as never, {
      _connection: data.connectionId,
      _credential_hash: credentialHash,
      _suffix: suffix,
      _valid_days: data.validDays,
    } as never);
    if (response.error) throw new Error(response.error.message);

    const stored = response.data as unknown as {
      connectionId: string;
      suffix: string;
      expiresAt: string;
    };
    return { ...stored, token };
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



export type HaccoraReadiness = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  countryPack: string;
  productStatus: string;
  mode: string;
  connectionStatus: string;
  externalTenantId?: string | null;
  baseUrl?: string | null;
  lastVerifiedAt?: string | null;
  services: {
    requested: number;
    active: number;
    failed: number;
    requiredTotal: number;
    aiRequested: boolean;
    aiTotal: number;
  };
  jobs: { pending: number; blocked: number; failed: number };
  ready: boolean;
  aiReady: boolean;
};

export const getHaccoraReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) => tenantInput.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("platform_haccora_readiness" as never, {
      _tenant: data.tenantId,
    } as never);
    if (response.error) throw new Error(response.error.message);
    return response.data as unknown as HaccoraReadiness;
  });

const haccoraEnableSchema = z.object({
  tenantId: uuid,
  enableAi: z.boolean().default(true),
});

export const enableHaccoraForDishbee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof haccoraEnableSchema>) => haccoraEnableSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("platform_enable_haccora_for_dishbee" as never, {
      _tenant: data.tenantId,
      _enable_ai: data.enableAi,
    } as never);
    if (response.error) throw new Error(response.error.message);
    return response.data as unknown as {
      tenantId: string;
      tenantSlug: string;
      countryPack: string;
      product: string;
      mode: string;
      aiEnabled: boolean;
      requestedServices: string[];
    };
  });

export const retryHaccoraProvisioning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) => tenantInput.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("platform_retry_haccora_provisioning" as never, {
      _tenant: data.tenantId,
    } as never);
    if (response.error) throw new Error(response.error.message);
    return { queued: Number(response.data ?? 0) };
  });

export const enableHaccoraDishbeePilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const response = await context.supabase.rpc("platform_enable_haccora_dishbee_pilot" as never, {
      _enable_ai: true,
    } as never);
    if (response.error) throw new Error(response.error.message);
    return response.data as unknown as {
      pilot: string;
      aiEnabled: boolean;
      tenants: Array<{ tenantId: string; tenantSlug: string }>;
    };
  });

export const bootstrapDishbeePilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const response = await context.supabase.rpc("platform_bootstrap_dishbee_pilot" as never);
    if (response.error) throw new Error(response.error.message);
    return response.data as unknown as {
      organisationId: string;
      organisationSlug: string;
      landlordProductKey: string;
      tenants: Array<{ tenantId: string; tenantName: string; tenantSlug: string; blueprint: string }>;
    };
  });

const brandSchema = z.object({
  tenantId: uuid,
  productKey: z.string().min(2).max(80).nullish(),
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().regex(/^[a-z0-9-]{1,100}$/),
  primary: z.boolean().default(false),
  logoUrl: z.string().trim().max(1000).nullish(),
  theme: z.record(z.string(), z.unknown()).default({}),
});

export const upsertTenantBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof brandSchema>) => brandSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("platform_upsert_tenant_brand" as never, {
      _tenant: data.tenantId,
      _product: data.productKey ?? null,
      _name: data.name,
      _slug: data.slug,
      _primary: data.primary,
      _logo_url: data.logoUrl ?? null,
      _theme: data.theme,
    } as never);
    if (response.error) throw new Error(response.error.message);
    return { brandId: response.data as unknown as string };
  });

const locationSchema = z.object({
  tenantId: uuid,
  brandId: uuid.nullish(),
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().regex(/^[a-z0-9-]{1,100}$/),
  timezone: z.string().trim().min(1).max(80).default("Europe/London"),
  address: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["active", "inactive", "opening", "closed"]).default("active"),
});

export const upsertTenantLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof locationSchema>) => locationSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("platform_upsert_tenant_location" as never, {
      _tenant: data.tenantId,
      _brand: data.brandId ?? null,
      _name: data.name,
      _code: data.code,
      _timezone: data.timezone,
      _address: data.address,
      _status: data.status,
    } as never);
    if (response.error) throw new Error(response.error.message);
    return { locationId: response.data as unknown as string };
  });


const ecosystemAddonSchema=z.object({
  tenantId:uuid,hostProductKey:z.string().min(2).max(80),addonKey:z.string().min(3).max(120),enabled:z.boolean(),
});
export const setTenantEcosystemAddon=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:z.infer<typeof ecosystemAddonSchema>)=>ecosystemAddonSchema.parse(input))
  .handler(async({context,data})=>{
    const db=context.supabase as any;
    const{data:addon,error:addonError}=await db.from("ecosystem_addon_catalogue").select("*")
      .eq("addon_key",data.addonKey).eq("host_product_key",data.hostProductKey).maybeSingle();
    if(addonError)throw new Error(addonError.message);
    if(!addon)throw new Error("Ecosystem add-on not found");

    if(data.enabled){
      const{error}=await db.from("tenant_ecosystem_addons").upsert({
        tenant_id:data.tenantId,host_product_key:data.hostProductKey,addon_key:data.addonKey,
        status:"requested",config:{},updated_at:new Date().toISOString(),
      },{onConflict:"tenant_id,host_product_key,addon_key"});
      if(error)throw new Error(error.message);
      if(addon.addon_product_key){
        const r=await db.rpc("platform_set_tenant_product" as never,{
          _tenant:data.tenantId,_product:addon.addon_product_key,_enabled:true,_config:{ecosystemAddon:data.addonKey},
        } as never);
        if(r.error)throw new Error(r.error.message);
      }else if(addon.addon_service_key){
        const r=await db.rpc("platform_set_tenant_service" as never,{
          _tenant:data.tenantId,_service:addon.addon_service_key,_enabled:true,_config:{ecosystemAddon:data.addonKey},
        } as never);
        if(r.error)throw new Error(r.error.message);
      }
    }else{
      const{error}=await db.from("tenant_ecosystem_addons").update({status:"cancelled",updated_at:new Date().toISOString()})
        .eq("tenant_id",data.tenantId).eq("host_product_key",data.hostProductKey).eq("addon_key",data.addonKey);
      if(error)throw new Error(error.message);
    }
    return{ok:true};
  });
