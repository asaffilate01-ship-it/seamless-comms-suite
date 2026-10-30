import { z } from "zod";
export const receiptInput = z.object({
  tenantId: z.string().uuid(),
  productKey: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,80}$/),
  requestId: z.string().uuid(),
});
const reservation = z.object({
  run_id: z.string().uuid(),
  status: z.string(),
  currency: z.enum(["GBP", "USD", "EUR"]),
  reserved_minor: z.number().int().nonnegative().safe(),
  actual_minor: z.number().int().nonnegative().safe().nullable(),
  created_at: z.string(),
});
const run = z.object({ id: z.string().uuid(), status: z.string(), updated_at: z.string() });
const step = z.object({
  step_no: z.number().int(),
  step_type: z.string(),
  status: z.string(),
  created_at: z.string(),
});
const job = z.object({
  id: z.string().uuid(),
  status: z.string(),
  attempts: z.number().int().nonnegative(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  updated_at: z.string(),
});
export type ReceiptLookup =
  | { found: false }
  | {
      found: true;
      reservation: z.infer<typeof reservation>;
      run: z.infer<typeof run>;
      steps: z.infer<typeof step>[];
      stepsTruncated: boolean;
      jobs: z.infer<typeof job>[];
      jobsTruncated: boolean;
    };
/** Read-only receipt lookup. The reference is not an authentication credential. */
export async function lookupQueueReceipt(
  db: any,
  userId: string,
  raw: unknown,
): Promise<ReceiptLookup> {
  const input = receiptInput.parse(raw);
  const membership = await db
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", input.tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership.error || !membership.data) throw new Error("Current tenant membership required");
  const r = await db
    .from("ai_budgeted_run_reservations")
    .select("run_id,status,currency,reserved_minor,actual_minor,created_at")
    .eq("tenant_id", input.tenantId)
    .eq("product_key", input.productKey)
    .eq("idempotency_key", input.requestId)
    .maybeSingle();
  if (r.error) throw new Error("Receipt lookup unavailable");
  if (!r.data) return { found: false };
  const record = reservation.parse(r.data);
  const task = await db
    .from("ai_agent_runs")
    .select("id,status,updated_at,initiated_by")
    .eq("tenant_id", input.tenantId)
    .eq("product_key", input.productKey)
    .eq("id", record.run_id)
    .maybeSingle();
  if (task.error) throw new Error("Receipt lookup unavailable");
  if (
    !task.data ||
    !(task.data.initiated_by === userId || ["owner", "admin"].includes(membership.data.role))
  )
    return { found: false };
  const [steps, jobs] = await Promise.all([
    db
      .from("ai_agent_steps")
      .select("step_no,step_type,status,created_at")
      .eq("tenant_id", input.tenantId)
      .eq("run_id", record.run_id)
      .order("step_no", { ascending: true })
      .limit(65),
    db
      .from("intelligence_jobs")
      .select("id,status,attempts,started_at,completed_at,updated_at")
      .eq("tenant_id", input.tenantId)
      .eq("product_key", input.productKey)
      .eq("subject_type", "ai_agent_run")
      .eq("subject_id", record.run_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(6),
  ]);
  if (steps.error || jobs.error) throw new Error("Task evidence unavailable");
  const stepRows = z.array(step).parse(steps.data ?? []),
    jobRows = z.array(job).parse(jobs.data ?? []);
  return {
    found: true,
    reservation: record,
    run: run.parse(task.data),
    steps: stepRows.slice(0, 64),
    stepsTruncated: stepRows.length > 64,
    jobs: jobRows.slice(0, 5),
    jobsTruncated: jobRows.length > 5,
  };
}
