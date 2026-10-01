import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProductDefinition, getRegionPack } from "./registry";

const inputSchema = z.object({
  tenantId: z.string().uuid(),
  productKey: z.string().min(1).max(80),
});

export const getTenantRuntimeContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof inputSchema>) => inputSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;

    const { data: membership, error: membershipError } = await db
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", data.tenantId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membershipError || !membership) throw new Error("Tenant access required");

    const { data: tenantProduct, error: productError } = await db
      .from("tenant_products")
      .select("id,tenant_id,product_key,region_key,plan_key,status,brand_key,settings,provisioned_at")
      .eq("tenant_id", data.tenantId)
      .eq("product_key", data.productKey)
      .eq("status", "active")
      .maybeSingle();
    if (productError || !tenantProduct) throw new Error("Active tenant product not found");

    const [entitlements, locations, domains] = await Promise.all([
      db.from("tenant_module_entitlements")
        .select("module_key,enabled,limits,config,starts_at,ends_at,source")
        .eq("tenant_id", data.tenantId)
        .eq("tenant_product_id", tenantProduct.id),
      db.from("tenant_locations")
        .select("id,location_key,name,kind,country_code,locale,time_zone,currency,status")
        .eq("tenant_id", data.tenantId)
        .eq("tenant_product_id", tenantProduct.id)
        .eq("status", "active"),
      db.from("tenant_domains")
        .select("hostname,purpose,verification_status,is_primary")
        .eq("tenant_id", data.tenantId)
        .eq("tenant_product_id", tenantProduct.id),
    ]);

    const enabledModules = (entitlements.data ?? [])
      .filter((item: any) => item.enabled)
      .filter((item: any) => !item.starts_at || Date.parse(item.starts_at) <= Date.now())
      .filter((item: any) => !item.ends_at || Date.parse(item.ends_at) > Date.now());

    const product = getProductDefinition(data.productKey);
    const region = getRegionPack(tenantProduct.region_key);

    return {
      tenantId: data.tenantId,
      tenantRole: membership.role,
      tenantProduct,
      product,
      region,
      modules: enabledModules,
      moduleKeys: enabledModules.map((item: any) => item.module_key),
      locations: locations.data ?? [],
      domains: domains.data ?? [],
    };
  });

export const getTenantIntegrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof inputSchema>) => inputSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const { data: membership } = await db
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", data.tenantId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!membership || !["owner","admin"].includes(membership.role)) {
      throw new Error("Tenant admin access required");
    }
    const { data: tenantProduct } = await db
      .from("tenant_products")
      .select("id")
      .eq("tenant_id", data.tenantId)
      .eq("product_key", data.productKey)
      .eq("status", "active")
      .maybeSingle();
    if (!tenantProduct) throw new Error("Active tenant product not found");

    const { data: bindings, error } = await db
      .from("tenant_integration_bindings")
      .select("id,module_key,provider,integration_kind,environment,external_account_ref,status,last_verified_at,created_at,updated_at")
      .eq("tenant_id", data.tenantId)
      .eq("tenant_product_id", tenantProduct.id);
    if (error) throw new Error(error.message);
    return bindings ?? [];
  });