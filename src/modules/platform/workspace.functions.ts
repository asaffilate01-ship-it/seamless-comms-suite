import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ tenantId: z.string().uuid() });

export const listMyTenantProducts = createServerFn({ method: "POST" })
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

    const { data: products, error } = await db
      .from("tenant_products")
      .select("id,tenant_id,product_key,region_key,plan_key,status,brand_key,settings,provisioned_at")
      .eq("tenant_id", data.tenantId)
      .eq("status", "active")
      .order("product_key");

    if (error) throw new Error(error.message);
    const productRows = products ?? [];
    const ids = productRows.map((row: any) => row.id);
    if (!ids.length) return { role: membership.role, products: [] };

    const [entitlements, domains, brands, locations] = await Promise.all([
      db.from("tenant_module_entitlements")
        .select("tenant_product_id,module_key,enabled,limits,config,starts_at,ends_at,source")
        .eq("tenant_id", data.tenantId)
        .in("tenant_product_id", ids),
      db.from("tenant_domains")
        .select("tenant_product_id,hostname,purpose,verification_status,is_primary")
        .eq("tenant_id", data.tenantId)
        .in("tenant_product_id", ids),
      db.from("tenant_brand_profiles")
        .select("tenant_product_id,brand_key,name,logo_url,primary_colour,secondary_colour,accent_colour,app_name,locale,status,revision")
        .eq("tenant_id", data.tenantId)
        .in("tenant_product_id", ids)
        .eq("status", "active"),
      db.from("tenant_locations")
        .select("id,tenant_product_id,location_key,name,kind,country_code,locale,time_zone,currency,status")
        .eq("tenant_id", data.tenantId)
        .in("tenant_product_id", ids)
        .eq("status", "active"),
    ]);

    for (const result of [entitlements, domains, brands, locations]) {
      if (result.error) throw new Error(result.error.message);
    }

    const now = Date.now();
    return {
      role: membership.role,
      products: productRows.map((product: any) => {
        const modules = (entitlements.data ?? [])
          .filter((item: any) => item.tenant_product_id === product.id && item.enabled)
          .filter((item: any) => !item.starts_at || Date.parse(item.starts_at) <= now)
          .filter((item: any) => !item.ends_at || Date.parse(item.ends_at) > now);

        return {
          ...product,
          modules,
          moduleKeys: modules.map((item: any) => item.module_key),
          domains: (domains.data ?? []).filter((item: any) => item.tenant_product_id === product.id),
          brands: (brands.data ?? []).filter((item: any) => item.tenant_product_id === product.id),
          locations: (locations.data ?? []).filter((item: any) => item.tenant_product_id === product.id),
        };
      }),
    };
  });
