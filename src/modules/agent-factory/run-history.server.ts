import { z } from "zod";

export const runScope = z.object({
  tenantId: z.string().uuid(),
  productKey: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,80}$/),
});
export const historyInput = runScope.extend({
  page: z.number().int().min(0).max(10000).default(0),
});
export const detailInput = runScope.extend({ runId: z.string().uuid() });
const runSchema = z.object({
  id: z.string().uuid(),
  profile: z.string(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  current_step: z.number().int(),
  max_steps: z.number().int(),
});
const stepSchema = z.object({
  step_no: z.number().int(),
  step_type: z.string(),
  status: z.string(),
  created_at: z.string(),
});
export type RunSummary = z.infer<typeof runSchema>;
export type RunStep = z.infer<typeof stepSchema>;
const runFields = "id,profile,status,created_at,updated_at,completed_at,current_step,max_steps";

// Uses the authenticated client and its RLS; never a service-role client.
async function member(db: any, userId: string, tenantId: string) {
  const r = await db
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (r.error || !r.data) throw new Error("Current tenant membership required");
  return r.data.role as string;
}
async function exactRun(db: any, input: z.infer<typeof detailInput>) {
  const r = await db
    .from("ai_agent_runs")
    .select(runFields + ",initiated_by")
    .eq("tenant_id", input.tenantId)
    .eq("product_key", input.productKey)
    .eq("id", input.runId)
    .maybeSingle();
  if (r.error || !r.data) throw new Error("Run unavailable");
  return { run: runSchema.parse(r.data), actor: r.data.initiated_by };
}
export async function readRunHistory(db: any, userId: string, raw: unknown) {
  const input = historyInput.parse(raw);
  await member(db, userId, input.tenantId);
  const r = await db
    .from("ai_agent_runs")
    .select(runFields)
    .eq("tenant_id", input.tenantId)
    .eq("product_key", input.productKey)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(input.page * 20, input.page * 20 + 20);
  if (r.error) throw new Error("Run history unavailable");
  const rows = z.array(runSchema).parse(r.data ?? []);
  return { runs: rows.slice(0, 20), hasMore: rows.length > 20 };
}
export async function readRunDetail(db: any, userId: string, raw: unknown) {
  const input = detailInput.parse(raw);
  const role = await member(db, userId, input.tenantId);
  const { run, actor } = await exactRun(db, input);
  const [steps, reservation] = await Promise.all([
    db
      .from("ai_agent_steps")
      .select("step_no,step_type,status,created_at")
      .eq("tenant_id", input.tenantId)
      .eq("run_id", input.runId)
      .order("step_no", { ascending: true })
      .limit(65),
    db
      .from("ai_budgeted_run_reservations")
      .select("status")
      .eq("tenant_id", input.tenantId)
      .eq("product_key", input.productKey)
      .eq("run_id", input.runId)
      .maybeSingle(),
  ]);
  if (steps.error || reservation.error) throw new Error("Run evidence unavailable");
  const rows = z.array(stepSchema).parse(steps.data ?? []);
  return {
    run,
    steps: rows.slice(0, 64),
    truncated: rows.length > 64,
    canCancel:
      run.status === "queued" &&
      rows.length === 0 &&
      reservation.data?.status === "reserved" &&
      (actor === userId || ["owner", "admin"].includes(role)),
  };
}
export async function cancelQueuedFactoryRun(db: any, userId: string, raw: unknown) {
  const input = detailInput.parse(raw);
  const current = await readRunDetail(db, userId, input);
  if (!current.canCancel)
    throw new Error("This task cannot be cancelled before processing. Refresh its evidence.");
  // The existing atomic RPC locks the run, reservation, job and budget and
  // rechecks that execution has not begun. Never fall back to legacy updates.
  const r = await db.rpc("cancel_budgeted_ai_agent", {
    _tenant: input.tenantId,
    _run: input.runId,
  });
  if (r.error)
    throw new Error(
      "Cancellation was not confirmed. Refresh the run; processing may have started.",
    );
  return { cancelled: true };
}
