import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { practiceScope, practiceMutation } from "./workspace-contracts";

export const listPracticeWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const { data: members, error: memberError } = await db
      .from("tenant_members")
      .select("tenant_id,role")
      .eq("user_id", context.userId);
    if (memberError) throw new Error(memberError.message);
    if (!members?.length) return [];
    const { data, error } = await db
      .from("tenant_products")
      .select("id,tenant_id,product_key")
      .in(
        "tenant_id",
        members.map((m: any) => m.tenant_id),
      )
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      ...p,
      role: members.find((m: any) => m.tenant_id === p.tenant_id)?.role,
    }));
  });

export const getPracticeWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof practiceScope>) => practiceScope.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const { data: allowed, error: accessError } = await db.rpc("practice_workspace_access", {
      _tenant: data.tenantId,
      _product: data.tenantProductId,
      _write: false,
    });
    if (accessError) throw new Error(accessError.message);
    if (!allowed)
      throw new Error(
        "Practice is not enabled for this workspace. Ask the landlord to enable practice.core.",
      );
    const names = [
      "practice_clients",
      "practice_service_templates",
      "practice_engagements",
      "practice_job_phases",
      "practice_work_requests",
      "practice_work_time",
      "practice_proposals",
      "practice_work_audit",
      "practice_recurring_work",
    ] as const;
    const results = await Promise.all(
      names.map((name) =>
        db
          .from(name)
          .select("*")
          .eq("tenant_id", data.tenantId)
          .eq("tenant_product_id", data.tenantProductId)
          .limit(1000),
      ),
    );
    for (const r of results) if (r.error) throw new Error(r.error.message);
    const { data: crmCompanies, error: crmError } = await db
      .from("crm_companies")
      .select("id,name")
      .eq("tenant_id", data.tenantId)
      .order("name")
      .limit(1000);
    if (crmError) throw new Error(crmError.message);
    const { data: members, error: memberError } = await db
      .from("tenant_members")
      .select("user_id,role")
      .eq("tenant_id", data.tenantId);
    if (memberError) throw new Error(memberError.message);
    return {
      clients: results[0].data ?? [],
      services: results[1].data ?? [],
      jobs: (results[2].data ?? []).filter((j: any) => j.template_id),
      phases: results[3].data ?? [],
      requests: results[4].data ?? [],
      time: results[5].data ?? [],
      proposals: results[6].data ?? [],
      audit: results[7].data ?? [],
      crmCompanies: crmCompanies ?? [],
      schedules: results[8].data ?? [],
      members: members ?? [],
      userId: context.userId,
      truncated: results.some((r) => r.data?.length === 1000),
    };
  });

export const mutatePracticeWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof practiceMutation>) => practiceMutation.parse(input))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await (context.supabase as any).rpc(
      "practice_workspace_command",
      {
        _tenant: data.tenantId,
        _product: data.tenantProductId,
        _command: data.command,
      },
    );
    if (error) throw new Error(error.message);
    return result as { id: string; existing?: boolean };
  });

export const listMyPracticePortals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("practice_client_users")
      .select("practice_client_id,portal_role")
      .eq("user_id", context.userId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
const portalInput = z.object({
  clientId: z.string().uuid(),
  action: z.enum(["read", "respond", "accept", "decline"]).default("read"),
  entityId: z.string().uuid().optional(),
  response: z.string().trim().min(1).max(10000).optional(),
});
export const accessPracticePortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof portalInput>) => portalInput.parse(i))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await (context.supabase as any).rpc(
      "practice_portal_workspace",
      {
        _client: data.clientId,
        _action: data.action,
        _entity: data.entityId ?? null,
        _response: data.response ?? null,
      },
    );
    if (error) throw new Error(error.message);
    return result;
  });

const automationInput = practiceScope.extend({
  command: z.discriminatedUnion("operation", [
    z.object({
      operation: z.literal("request.chasing"),
      requestId: z.string().uuid(),
      enabled: z.boolean(),
    }),
    z.object({
      operation: z.literal("recurrence.save"),
      clientId: z.string().uuid(),
      serviceId: z.string().uuid(),
      nextOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      internalDays: z.number().int().min(0).max(366),
      externalDays: z.number().int().min(0).max(366),
      enabled: z.boolean(),
    }),
  ]),
});
export const configurePracticeAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof automationInput>) => automationInput.parse(i))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await (context.supabase as any).rpc(
      "configure_practice_automation",
      { _tenant: data.tenantId, _product: data.tenantProductId, _input: data.command },
    );
    if (error) throw new Error(error.message);
    return result as string;
  });
