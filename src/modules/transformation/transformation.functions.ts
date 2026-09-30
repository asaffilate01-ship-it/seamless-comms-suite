import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const requestSchema = z.object({
  tenantId: z.string().uuid(),
  tenantProductId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional(),
  command: z.enum([
    "projects.list", "projects.create", "snapshot", "export", "records.save",
    "finance.import", "finance.scenario", "finance.savings", "technical.impact",
    "knowledge.ingest", "knowledge.edge", "knowledge.delete", "knowledge.ask",
    "actions.propose", "actions.review", "actions.execute", "agents.run",
    "policy.update", "members.add", "members.remove", "diagnostic.create", "audit", "product.report", "product.brief",
    "workstreams.initialise", "workstreams.report", "benefits.propose", "benefits.verify",
    "planning.generate", "planning.get", "planning.review", "business.report",
    "ai.status", "ai.policy.save", "ai.runs.start", "ai.runs.step", "ai.runs.get", "ai.runs.list", "ai.runs.cancel",
    "connectors.read", "connectors.ingest",
  ]),
  data: z.record(z.unknown()).default({}),
});

export type TransformationRequest = z.infer<typeof requestSchema>;

const TRANSACTION_COMMANDS = new Set([
  "workstreams.initialise",
  "workstreams.report",
  "planning.generate",
  "planning.get",
  "planning.review",
]);

async function hasModuleGrant(
  supabase: any,
  tenantId: string,
  moduleKey: string,
  tenantProductId?: string | null,
) {
  let query = supabase
    .from("tenant_module_entitlements")
    .select("enabled,starts_at,ends_at")
    .eq("tenant_id", tenantId)
    .eq("module_key", moduleKey)
    .eq("enabled", true);

  if (tenantProductId) query = query.eq("tenant_product_id", tenantProductId);
  else query = query.limit(10);

  const { data: rows, error } = tenantProductId ? await query.maybeSingle() : await query;
  if (error) return false;

  const grants = tenantProductId ? (rows ? [rows] : []) : (rows ?? []);
  const now = Date.now();
  return grants.some((grant: any) =>
    (!grant.starts_at || Date.parse(grant.starts_at) <= now) &&
    (!grant.ends_at || Date.parse(grant.ends_at) > now)
  );
}

export const transformationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(requestSchema)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: membership, error } = await supabase
      .from("tenant_members").select("role")
      .eq("tenant_id", data.tenantId).eq("user_id", userId).maybeSingle();
    if (error || !membership) throw new Error("Tenant access denied");

    const legacyEnabled = new Set((process.env.BUSINESS360_ENABLED_TENANTS ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean)).has(data.tenantId);

    const business360Enabled =
      await hasModuleGrant(supabase as any, data.tenantId, "business360.core", data.tenantProductId)
      || legacyEnabled;

    if (!business360Enabled) throw new Error("Business360 entitlement is required");

    if (TRANSACTION_COMMANDS.has(data.command)) {
      const transactionsEnabled =
        await hasModuleGrant(supabase as any, data.tenantId, "transactions.core", data.tenantProductId)
        || legacyEnabled;
      if (!transactionsEnabled) throw new Error("Transactions & Transformation entitlement is required");
    }

    if (data.command === "members.add") {
      const target = z.string().uuid().parse(data.data.user_id);
      const { data: colleague, error: targetError } = await supabase
        .from("tenant_members").select("user_id")
        .eq("tenant_id", data.tenantId).eq("user_id", target).maybeSingle();
      if (targetError || !colleague) throw new Error("That user is not a verified member of this tenant");
    }

    const { callTransformation } = await import("./transformation.server");
    const result = await callTransformation(
      { tenant: data.tenantId, user: userId, tenant_role: membership.role },
      { command: data.command, project_id: data.projectId, data: data.data },
    );

    const { data: current, error: currentError } = await supabase.from("tenant_members").select("role")
      .eq("tenant_id", data.tenantId).eq("user_id", userId).maybeSingle();
    if (currentError || !current || current.role !== membership.role) {
      throw new Error("Workspace access changed; retry after signing in");
    }
    return { payload: JSON.stringify(result) };
  });
