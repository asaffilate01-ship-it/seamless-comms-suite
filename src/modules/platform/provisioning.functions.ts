import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildProvisioningPlanFromDatabase } from "./saas-factory.server";

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

async function requireProvisioner(context: any, productKey: string, regionKey: string) {
  const db = context.supabase as any;
  const { data: platformOperator } = await db
    .from("platform_operators")
    .select("role,status")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (platformOperator?.status === "active" && ["platform_owner","platform_admin"].includes(platformOperator.role)) return;

  const { data: productOperator } = await db
    .from("product_operators")
    .select("role,status,region_keys")
    .eq("product_key", productKey)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!productOperator || productOperator.status !== "active" || !["landlord_owner","landlord_admin"].includes(productOperator.role)) {
    throw new Error("Platform or landlord admin approval is required");
  }
  const regions = Array.isArray(productOperator.region_keys) ? productOperator.region_keys : [];
  if (regions.length && !regions.includes(regionKey)) throw new Error("Landlord region scope refused");
}
async function requirePlanner(context: any, tenantId: string, productKey: string, regionKey: string) {
  const db=context.supabase as any;
  const { data: membership } = await db.from("tenant_members").select("role").eq("tenant_id",tenantId).eq("user_id",context.userId).maybeSingle();
  if (membership && ["owner","admin"].includes(membership.role)) return;
  await requireProvisioner(context, productKey, regionKey);
}
export const saveProvisioningRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof requestSchema>) => requestSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requirePlanner(context, data.tenantId, data.productKey, data.regionPackKey);
    const db = context.supabase as any;
    const plan = await buildProvisioningPlanFromDatabase(db, data);
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: run, error: runError } = await admin
      .from("platform_provisioning_runs")
      .select("id,tenant_id,state,product_key,region_key")
      .eq("id", data.runId)
      .eq("tenant_id", data.tenantId)
      .single();
    if (runError || !run) throw new Error("Provisioning run not found");
    if (!["planned","approved"].includes(run.state)) throw new Error("Provisioning run is not executable");
    await requireProvisioner(context, run.product_key, run.region_key);

    await admin.from("platform_provisioning_runs").update({ state: "approved" }).eq("id", data.runId);
    const { data: tenantProductId, error } = await admin.rpc("apply_platform_provisioning_run", { _run: data.runId, _actor: context.userId });
    if (error || !tenantProductId) {
      await admin.from("platform_provisioning_runs").update({
        state: "failed",
        error: error?.message ?? "Provisioning failed",
        completed_at: new Date().toISOString(),
      }).eq("id", data.runId);
      throw new Error(error?.message ?? "Provisioning failed");
    }
    return { runId: data.runId, tenantProductId };
  });