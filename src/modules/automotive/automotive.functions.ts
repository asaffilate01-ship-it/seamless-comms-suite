import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { automotiveAddon, automotiveProduct, vehicleIdentitySchema } from "./contracts";
import { addonAvailability } from "./entitlements";

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Automotive service is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function tenantRole(context: any, tenantId: string) {
  const { data, error } = await context.supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error || !data) throw new Error("You do not have access to this workspace");
  return data.role as string;
}

const tenantInput = z.object({ tenantId: z.string().uuid() });

export const getAutomotiveOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tenantInput)
  .handler(async ({ context, data }) => {
    await tenantRole(context, data.tenantId);
    const client = serviceClient();

    const [entitlements, vehicles, evidence, inbound, endpoints] = await Promise.all([
      client.from("automotive_addon_entitlements").select("product,addon,enabled,plan,usage_limit,starts_at,ends_at").eq("tenant_id", data.tenantId),
      client.from("automotive_vehicles").select("vehicle_id,origin,vrm,vin,chassis_number,make,model,derivative,updated_at").eq("tenant_id", data.tenantId).order("updated_at", { ascending: false }).limit(25),
      client.from("automotive_evidence").select("evidence_id,vehicle_id,kind,capture_item,received_at,source,location_captured").eq("tenant_id", data.tenantId).order("received_at", { ascending: false }).limit(25),
      client.from("automotive_inbound_events").select("event_id,product,event_type,occurred_at,status").eq("tenant_id", data.tenantId).order("received_at", { ascending: false }).limit(25),
      client.from("automotive_webhook_endpoints").select("endpoint_id,product,endpoint_url,enabled,subscribed_events,updated_at").eq("tenant_id", data.tenantId).order("updated_at", { ascending: false }),
    ]);

    const firstError = [entitlements, vehicles, evidence, inbound, endpoints].find((r) => r.error)?.error;
    if (firstError) throw new Error("Automotive data is unavailable. Apply the automotive migration and retry.");

    const products = automotiveProduct.options.map((product) => ({
      product,
      addons: automotiveAddon.options.map((addon) => {
        const configured = entitlements.data?.find((row: any) => row.product === product && row.addon === addon);
        const defaultMode = addonAvailability(product, addon);
        return {
          addon,
          mode: defaultMode,
          enabled: configured ? Boolean(configured.enabled) : defaultMode === "core",
          plan: configured?.plan ?? (defaultMode === "core" ? "core" : "addon"),
          usageLimit: configured?.usage_limit ?? null,
        };
      }),
    }));

    return {
      products,
      vehicles: vehicles.data ?? [],
      evidence: evidence.data ?? [],
      inboundEvents: inbound.data ?? [],
      webhookEndpoints: endpoints.data ?? [],
    };
  });

export const setAutomotiveAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    product: automotiveProduct,
    addon: automotiveAddon,
    enabled: z.boolean(),
  }))
  .handler(async ({ context, data }) => {
    const role = await tenantRole(context, data.tenantId);
    if (!["owner", "admin"].includes(role)) throw new Error("Workspace administrator access is required");

    const mode = addonAvailability(data.product, data.addon);
    if (mode === "core" && !data.enabled) throw new Error("Core automotive modules cannot be disabled");

    const client = serviceClient();
    const { error } = await client.from("automotive_addon_entitlements").upsert({
      tenant_id: data.tenantId,
      product: data.product,
      addon: data.addon,
      enabled: data.enabled,
      plan: mode === "core" ? "core" : "addon",
      starts_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,product,addon" });
    if (error) throw new Error("Unable to update automotive add-on");
    return { ok: true };
  });

export const registerAutomotiveVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    origin: z.enum(["uk", "japan", "other"]),
    vrm: z.string().trim().max(20).optional(),
    vin: z.string().trim().max(40).optional(),
    chassisNumber: z.string().trim().max(64).optional(),
    modelCode: z.string().trim().max(64).optional(),
    make: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(120),
    derivative: z.string().trim().max(160).optional(),
  }))
  .handler(async ({ context, data }) => {
    await tenantRole(context, data.tenantId);
    const parsed = vehicleIdentitySchema.omit({ vehicleId: true }).parse({
      tenantId: data.tenantId,
      origin: data.origin,
      vrm: data.vrm || undefined,
      vin: data.vin || undefined,
      chassisNumber: data.chassisNumber || undefined,
      modelCode: data.modelCode || undefined,
      make: data.make,
      model: data.model,
      derivative: data.derivative || undefined,
    });
    const client = serviceClient();
    const { data: row, error } = await client.from("automotive_vehicles").insert({
      tenant_id: parsed.tenantId,
      origin: parsed.origin,
      vrm: parsed.vrm ?? null,
      vin: parsed.vin ?? null,
      chassis_number: parsed.chassisNumber ?? null,
      model_code: parsed.modelCode ?? null,
      make: parsed.make,
      model: parsed.model,
      derivative: parsed.derivative ?? null,
    }).select("vehicle_id").single();
    if (error || !row) throw new Error("Unable to register vehicle");
    return { vehicleId: row.vehicle_id as string };
  });
