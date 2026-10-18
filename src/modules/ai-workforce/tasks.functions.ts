import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole, requireService } from "@/modules/platform/access";

const uuid = z.string().uuid();
const productKey = z.string().regex(/^[a-z0-9][a-z0-9.-]{1,80}$/);
const resourceKey = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,99}$/);
const taskScope = z.object({ tenantId: uuid, productKey, employeeId: uuid });
const taskIdScope = taskScope.extend({ taskId: uuid });
const accessIdScope = taskScope.extend({ proposalId: uuid });

const triggerSchema = z.object({
  type: z.enum(["manual", "daily", "weekly", "event"]),
  value: z.string().max(120),
  enabled: z.literal(false),
}).strict().refine(trigger => {
  if (trigger.type === "manual") return trigger.value === "";
  if (trigger.type === "daily") return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(trigger.value);
  if (trigger.type === "weekly") return /^(MON|TUE|WED|THU|FRI|SAT|SUN) ([01][0-9]|2[0-3]):[0-5][0-9]$/.test(trigger.value);
  return /^[a-z0-9][a-z0-9._-]{2,119}$/.test(trigger.value);
}, { message: "Use a supported inert workflow proposal" });
export type ProposedTaskTrigger = z.infer<typeof triggerSchema>;

export interface AiEmployeeTask {
  id: string;
  employee_id: string;
  title: string;
  objective: string;
  output_spec: string;
  acceptance_criteria: string;
  requested_capabilities: string[];
  proposed_trigger: ProposedTaskTrigger;
  employee_revision: number;
  status: "draft" | "pending_review" | "approved_brief" | "returned" | "cancelled";
  created_by: string;
  last_edited_by: string;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}
export interface AiEmployeeAccessProposal {
  id: string;
  employee_id: string;
  capability_key: string;
  provider_key: string;
  rationale: string;
  status: "requested" | "shortlisted_metadata" | "declined" | "revoked";
  requested_by: string;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}
export interface AiEmployeeTaskEvent {
  id: string;
  employee_id: string;
  task_id: string;
  event_type: string;
  created_at: string;
}
export interface AiEmployeeTaskPreflight {
  mode: "read_only_preflight";
  taskId: string;
  employeeId: string;
  employeeRevision: number;
  canExecute: false;
  modelCalls: 0;
  toolCalls: 0;
  queuedJobs: 0;
  blockers: string[];
  checks: Record<string, boolean | number>;
}
export interface AiEmployeeTaskWorkspace {
  tasks: AiEmployeeTask[];
  accessProposals: AiEmployeeAccessProposal[];
  events: AiEmployeeTaskEvent[];
}

async function requireWorkforceAdmin(context: any, tenantId: string) {
  const access = await requireService(context, tenantId, "omniqora.ai-workforce");
  requireAdminRole(access.role);
}

export const getAiEmployeeTaskWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof taskScope>) => taskScope.parse(input))
  .handler(async ({ context, data }): Promise<AiEmployeeTaskWorkspace> => {
    await requireWorkforceAdmin(context, data.tenantId);
    const db = context.supabase as any;
    const [employee, tasks, accessProposals, events] = await Promise.all([
      db.from("ai_employees").select("id").eq("tenant_id", data.tenantId)
        .eq("product_key", data.productKey).eq("id", data.employeeId).single(),
      db.from("ai_employee_tasks").select(
        "id,employee_id,title,objective,output_spec,acceptance_criteria,requested_capabilities,proposed_trigger,employee_revision,status,created_by,last_edited_by,reviewed_by,review_note,created_at,updated_at"
      ).eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .eq("employee_id", data.employeeId).order("updated_at", { ascending: false }).limit(100),
      db.from("ai_employee_access_proposals").select(
        "id,employee_id,capability_key,provider_key,rationale,status,requested_by,reviewed_by,review_note,created_at,reviewed_at"
      ).eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .eq("employee_id", data.employeeId).order("created_at", { ascending: false }).limit(80),
      db.from("ai_employee_task_events").select("id,employee_id,task_id,event_type,created_at")
        .eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .eq("employee_id", data.employeeId).order("created_at", { ascending: false }).limit(120),
    ]);
    for (const query of [employee, tasks, accessProposals, events]) {
      if (query.error) throw new Error(query.error.message);
    }
    return {
      tasks: tasks.data ?? [],
      accessProposals: accessProposals.data ?? [],
      events: events.data ?? [],
    };
  });

const createTaskSchema = taskScope.extend({
  requestKey: uuid,
  title: z.string().trim().min(4).max(180),
  objective: z.string().trim().min(10).max(3000),
  outputSpec: z.string().trim().min(4).max(1000),
  acceptanceCriteria: z.string().trim().min(8).max(1800),
  requestedCapabilities: z.array(resourceKey).max(20),
  proposedTrigger: triggerSchema,
});
export const createAiEmployeeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof createTaskSchema>) => createTaskSchema.parse(input))
  .handler(async ({ context, data }): Promise<string> => {
    await requireWorkforceAdmin(context, data.tenantId);
    const { data: taskId, error } = await (context.supabase as any).rpc("create_ai_employee_task", {
      _tenant: data.tenantId, _product: data.productKey,
      _employee: data.employeeId, _request_key: data.requestKey,
      _title: data.title, _objective: data.objective, _output_spec: data.outputSpec,
      _criteria: data.acceptanceCriteria, _capabilities: data.requestedCapabilities,
      _trigger: data.proposedTrigger,
    });
    if (error) throw new Error(error.message);
    return taskId as string;
  });

const transitionSchema = taskIdScope.extend({
  action: z.enum(["submit", "approve", "return", "cancel"]),
  note: z.string().trim().max(1000).nullable().optional(),
});
export const transitionAiEmployeeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof transitionSchema>) => transitionSchema.parse(input))
  .handler(async ({ context, data }): Promise<AiEmployeeTask> => {
    await requireWorkforceAdmin(context, data.tenantId);
    const { data: task, error } = await (context.supabase as any).rpc("transition_ai_employee_task", {
      _tenant: data.tenantId, _product: data.productKey,
      _employee: data.employeeId, _task: data.taskId,
      _action: data.action, _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return task as AiEmployeeTask;
  });

const accessSchema = taskScope.extend({
  providerKey: resourceKey,
  capabilityKey: resourceKey,
  rationale: z.string().trim().min(12).max(900),
});
export const requestAiEmployeeAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof accessSchema>) => accessSchema.parse(input))
  .handler(async ({ context, data }): Promise<string> => {
    await requireWorkforceAdmin(context, data.tenantId);
    const { data: requestId, error } = await (context.supabase as any).rpc("request_ai_employee_access_review", {
      _tenant: data.tenantId, _product: data.productKey, _employee: data.employeeId,
      _capability: data.capabilityKey, _provider: data.providerKey, _rationale: data.rationale,
    });
    if (error) throw new Error(error.message);
    return requestId as string;
  });

const accessReviewSchema = accessIdScope.extend({
  decision: z.enum(["shortlisted_metadata", "declined", "revoked"]),
  note: z.string().trim().min(12).max(900),
});
export const reviewAiEmployeeAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof accessReviewSchema>) => accessReviewSchema.parse(input))
  .handler(async ({ context, data }): Promise<AiEmployeeAccessProposal> => {
    await requireWorkforceAdmin(context, data.tenantId);
    const { data: reviewed, error } = await (context.supabase as any).rpc("review_ai_employee_access_proposal", {
      _tenant: data.tenantId, _product: data.productKey, _proposal: data.proposalId,
      _decision: data.decision, _note: data.note,
    });
    if (error) throw new Error(error.message);
    return reviewed as AiEmployeeAccessProposal;
  });

export const preflightAiEmployeeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof taskIdScope>) => taskIdScope.parse(input))
  .handler(async ({ context, data }): Promise<AiEmployeeTaskPreflight> => {
    await requireWorkforceAdmin(context, data.tenantId);
    const { data: result, error } = await (context.supabase as any).rpc("preflight_ai_employee_task", {
      _tenant: data.tenantId, _product: data.productKey,
      _employee: data.employeeId, _task: data.taskId,
    });
    if (error) throw new Error(error.message);
    if (!result || result.canExecute !== false ||
        result.modelCalls !== 0 || result.toolCalls !== 0 || result.queuedJobs !== 0) {
      throw new Error("Unexpected executable result; refused");
    }
    return result as AiEmployeeTaskPreflight;
  });
