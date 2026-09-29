import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planTenantProvisioning } from "./saas-factory";

const requestSchema = z.object({
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

async function requireTenantAdmin(context: any, tenantId: string) {
  const { data, error } = await context.supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error || !data || !["owner","admin"].includes(data.role)) {
    throw new Error("Tenant owner/admin access required");
  }
}

export const saveProvisioningRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof requestSchema>) => requestSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireTenantAdmin(context, data.tenantId);
    const plan = planTenantProvisioning({
      tenantId: data.tenantId,
      productKey: data.productKey,
      regionPackKey: data.regionPackKey,
      locale: data.locale,
      planKey: data.planKey,
      requestedModules: data.requestedModules,
      locations: data.locations,
      domains: data.domains,
    });

    const db = context.supabase as any;
    const { data: run, error } = await db.from("platform_provisioning_runs").insert({
      tenant_id: data.tenantId,
      product_key: data.productKey,
      region_key: data.regionPackKey,
      requested_by: context.userId,
      plan,
      state: "planned",
    }).select("id,state,created_at").single();
    if (error || !run) throw new Error(error?.message ?? "Could not save provisioning plan");
    return { run, plan };
  });

export const executeProvisioningRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string; tenantId: string }) =>
    z.object({ runId: z.string().uuid(), tenantId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireTenantAdmin(context, data.tenantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: run, error: runError } = await admin
      .from("platform_provisioning_runs")
      .select("id,tenant_id,state")
      .eq("id", data.runId)
      .eq("tenant_id", data.tenantId)
      .single();
    if (runError || !run) throw new Error("Provisioning run not found");
    if (!["planned","approved"].includes(run.state)) throw new Error("Provisioning run is not executable");

    await admin.from("platform_provisioning_runs").update({ state: "approved" }).eq("id", data.runId);
    const { data: tenantProductId, error } = await admin.rpc("apply_platform_provisioning_run", { _run: data.runId });
    if (error || !tenantProductId) throw new Error(error?.message ?? "Provisioning failed");
    return { runId: data.runId, tenantProductId };
  });