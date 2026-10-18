import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole, requireService, requireTenantMembership } from "@/modules/platform/access";
import { agentForProduct } from "@/modules/agent-factory/catalogue";

/** AI Workforce is a configuration layer, not a second agent execution engine. */
const uuid = z.string().uuid();
const productKey = z.string().regex(/^[a-z0-9][a-z0-9.-]{1,80}$/);
const tenantScope = z.object({ tenantId: uuid, productKey });
const employeeScope = tenantScope.extend({ employeeId: uuid });
const capabilityKey = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,99}$/);

export const workforceProfileSchema = z.object({
  goal: z.string().trim().min(10).max(1500),
  tasks: z.array(z.string().trim().min(4).max(350)).min(1).max(20),
  businessContext: z.string().max(6000),
  instructions: z.string().max(6000),
  sopRefs: z.array(z.string().min(3).max(300)).max(20),
  capabilities: z.array(capabilityKey).max(30),
  trigger: z.object({
    type: z.enum(["manual", "daily", "weekly", "event"]),
    value: z.string().max(120),
    enabled: z.literal(false),
  }).strict(),
}).strict();

export type WorkforceProfile = z.infer<typeof workforceProfileSchema>;
export type WorkforceStatus = "draft" | "pending_review" | "approved_configuration" | "paused" | "retired";
export interface AiEmployee {
  id: string;
  tenant_id: string;
  product_key: string;
  blueprint_key: string;
  display_name: string;
  role_title: string;
  status: WorkforceStatus;
  profile: WorkforceProfile | Record<string, never>;
  revision: number;
  created_by: string;
  last_edited_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}
export interface AiEmployeeEvent {
  id: string;
  employee_id: string;
  event_key: string;
  revision: number;
  created_at: string;
  note: string | null;
}
export interface AiEmployeePreview {
  id: string;
  employee_id: string;
  revision: number;
  created_at: string;
  result: {
    mode: "configuration_preview_only";
    executed: false;
    modelCalls: 0;
    toolCalls: 0;
    scheduleEnabled: false;
    canExecute: false;
    reviewStatus: string;
    checks: Array<{ key: string; passed: boolean }>;
  };
}
export interface WorkforceWorkspace {
  enabled: boolean;
  productActive: boolean;
  employees: AiEmployee[];
  events: AiEmployeeEvent[];
  previews: AiEmployeePreview[];
  runs: Array<{ id: string; ai_employee_id: string; status: string; goal: string; created_at: string }>;
  providers: Array<{ provider_key: string; status: string; last_verified_at: string | null }>;
}

export const getAiWorkforceWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof tenantScope>) => tenantScope.parse(input))
  .handler(async ({ context, data }): Promise<WorkforceWorkspace> => {
    const access = await requireTenantMembership(context, data.tenantId);
    requireAdminRole(access.role);
    const db = context.supabase as any;
    const entitlement = await db.rpc("has_tenant_entitlement", {
      _tenant: data.tenantId, _service: "omniqora.ai-workforce",
    });
    if (entitlement.error) throw new Error(entitlement.error.message);
    const [product, employees, events, previews, runs, providers] = await Promise.all([
      db.from("tenant_products").select("status").eq("tenant_id", data.tenantId)
        .eq("product_key", data.productKey).maybeSingle(),
      db.from("ai_employees").select("*").eq("tenant_id", data.tenantId)
        .eq("product_key", data.productKey).order("updated_at", { ascending: false }).limit(100),
      db.from("ai_employee_audit_events")
        .select("id,employee_id,event_key,revision,created_at,note")
        .eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .order("created_at", { ascending: false }).limit(150),
      db.from("ai_employee_previews")
        .select("id,employee_id,revision,created_at,result")
        .eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .order("created_at", { ascending: false }).limit(75),
      db.from("ai_agent_runs")
        .select("id,ai_employee_id,status,goal,created_at")
        .eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .not("ai_employee_id", "is", null)
        .order("created_at", { ascending: false }).limit(75),
      db.from("provider_bindings")
        .select("provider_key,status,last_verified_at")
        .eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .limit(75),
    ]);
    for (const result of [product, employees, events, previews, runs, providers]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      enabled: entitlement.data === true,
      productActive: product.data?.status === "active",
      employees: (employees.data ?? []) as AiEmployee[],
      events: (events.data ?? []) as AiEmployeeEvent[],
      previews: (previews.data ?? []) as AiEmployeePreview[],
      runs: runs.data ?? [],
      providers: providers.data ?? [],
    };
  });

const createSchema = tenantScope.extend({
  blueprintKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,119}$/),
  displayName: z.string().trim().min(3).max(120),
  roleTitle: z.string().trim().min(3).max(120),
});
export const createAiEmployeeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof createSchema>) => createSchema.parse(input))
  .handler(async ({ context, data }): Promise<string> => {
    const access = await requireService(context, data.tenantId, "omniqora.ai-workforce");
    requireAdminRole(access.role);
    if (data.blueprintKey !== "custom.ai-employee" &&
        !agentForProduct(data.productKey, data.blueprintKey)) {
      throw new Error("Unknown blueprint for this SaaS product");
    }
    const { data: id, error } = await (context.supabase as any).rpc(
      "create_ai_employee_draft", {
        _tenant: data.tenantId, _product: data.productKey,
        _blueprint: data.blueprintKey, _name: data.displayName, _role: data.roleTitle,
      });
    if (error) throw new Error(error.message);
    return id as string;
  });

const saveSchema = employeeScope.extend({
  displayName: z.string().trim().min(3).max(120),
  roleTitle: z.string().trim().min(3).max(120),
  profile: workforceProfileSchema,
});
export const saveAiEmployeeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof saveSchema>) => saveSchema.parse(input))
  .handler(async ({ context, data }): Promise<AiEmployee> => {
    const access = await requireService(context, data.tenantId, "omniqora.ai-workforce");
    requireAdminRole(access.role);
    if (data.profile.trigger.type === "event" &&
        !/^[a-z0-9][a-z0-9._-]{2,119}$/.test(data.profile.trigger.value)) {
      throw new Error("Use a valid event key for the proposed trigger");
    }
    const db = context.supabase as any;
    const employee = await db.from("ai_employees").select("blueprint_key")
      .eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
      .eq("id", data.employeeId).single();
    if (employee.error) throw new Error(employee.error.message);
    const blueprint = agentForProduct(data.productKey, employee.data.blueprint_key);
    if (employee.data.blueprint_key !== "custom.ai-employee" && !blueprint) {
      throw new Error("Employee blueprint does not belong to this product");
    }
    const allowed = blueprint?.requiredCapabilities ?? [];
    if (data.profile.capabilities.some(key => !allowed.includes(key))) {
      throw new Error("A requested capability is not in this blueprint");
    }
    const { data: saved, error } = await db.rpc("save_ai_employee_profile", {
      _tenant: data.tenantId, _product: data.productKey, _employee: data.employeeId,
      _name: data.displayName, _role: data.roleTitle,
      // Hard-disable schedules even if a hostile client attempts activation.
      _profile: { ...data.profile, trigger: { ...data.profile.trigger, enabled: false } },
    });
    if (error) throw new Error(error.message);
    return saved as AiEmployee;
  });

const transitionSchema = employeeScope.extend({
  action: z.enum(["submit", "approve", "reject", "pause", "resume", "retire"]),
  note: z.string().max(1000).nullable().optional(),
});
export const transitionAiEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof transitionSchema>) => transitionSchema.parse(input))
  .handler(async ({ context, data }): Promise<AiEmployee> => {
    const access = await requireService(context, data.tenantId, "omniqora.ai-workforce");
    requireAdminRole(access.role);
    const { data: saved, error } = await (context.supabase as any).rpc(
      "transition_ai_employee", {
        _tenant: data.tenantId, _product: data.productKey, _employee: data.employeeId,
        _action: data.action, _note: data.note ?? null,
      });
    if (error) throw new Error(error.message);
    return saved as AiEmployee;
  });

export const previewAiEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof employeeScope>) => employeeScope.parse(input))
  .handler(async ({ context, data }): Promise<AiEmployeePreview> => {
    const access = await requireService(context, data.tenantId, "omniqora.ai-workforce");
    requireAdminRole(access.role);
    const { data: result, error } = await (context.supabase as any).rpc(
      "preview_ai_employee", {
        _tenant: data.tenantId, _product: data.productKey, _employee: data.employeeId,
      });
    if (error) throw new Error(error.message);
    return result as AiEmployeePreview;
  });
