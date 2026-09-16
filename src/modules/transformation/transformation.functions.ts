import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const requestSchema = z.object({
  tenantId: z.string().uuid(),
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

export const transformationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(requestSchema)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Check the requested tenant against the authenticated user on EVERY call.
    // Do not use the first membership or accept a browser-supplied role.
    const { data: membership, error } = await supabase
      .from("tenant_members").select("role")
      .eq("tenant_id", data.tenantId).eq("user_id", userId).maybeSingle();
    if (error || !membership) throw new Error("Tenant access denied");
    // Operator-managed pilot entitlement. Empty configuration denies every tenant.
    // Replace with the host's billing entitlement service before self-serve sales.
    const enabledTenants = new Set((process.env.BUSINESS360_ENABLED_TENANTS ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean));
    if (!enabledTenants.has(data.tenantId)) throw new Error("Business360 is not enabled for this workspace");
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
    if (currentError || !current || current.role !== membership.role) throw new Error("Workspace access changed; retry after signing in");
    return { payload: JSON.stringify(result) };
  });
