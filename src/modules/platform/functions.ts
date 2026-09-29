import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  OMNIQORA_MODULES,
  OMNIQORA_PRODUCTS,
  OMNIQORA_REGION_PACKS,
  getProductDefinition,
} from "./registry";
import { planTenantProvisioning } from "./saas-factory";
import { BUILTIN_PLUGIN_DEFINITIONS } from "./plugins";

export const getPlatformCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    products: OMNIQORA_PRODUCTS,
    modules: OMNIQORA_MODULES,
    regions: OMNIQORA_REGION_PACKS,
    plugins: BUILTIN_PLUGIN_DEFINITIONS,
  }));

const planSchema = z.object({
  tenantId: z.string().uuid(),
  productKey: z.string().min(1).max(80),
  regionPackKey: z.string().min(2).max(16),
  locale: z.string().min(2).max(20),
  planKey: z.string().max(80).optional().nullable(),
  requestedModules: z.array(z.string().min(1).max(120)).max(80).optional(),
  locations: z.array(z.object({
    key: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    countryCode: z.string().max(3).optional().nullable(),
    locale: z.string().max(20).optional().nullable(),
    timeZone: z.string().max(80).optional().nullable(),
  })).max(500).optional(),
  domains: z.array(z.object({
    hostname: z.string().min(3).max(253),
    purpose: z.enum(["marketing","app","api","tracking","assets","auth","other"]),
    primary: z.boolean().optional(),
  })).max(50).optional(),
});

export const planTenantProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof planSchema>) => planSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: membership, error } = await context.supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", data.tenantId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error || !membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Owner or admin tenant access is required");
    }
    if (!getProductDefinition(data.productKey)) throw new Error("Unknown product");

    return planTenantProvisioning({
      tenantId: data.tenantId,
      productKey: data.productKey,
      regionPackKey: data.regionPackKey,
      locale: data.locale,
      planKey: data.planKey,
      requestedModules: data.requestedModules,
      locations: data.locations,
      domains: data.domains,
    });
  });
