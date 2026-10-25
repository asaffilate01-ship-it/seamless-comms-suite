import { z } from "zod";

/**
 * Costed CricLume model admission. This is a server-to-server API only:
 * the browser cannot choose providers, models, token ceilings, tools or prices.
 */
export const criclumeAggregateSchema = z
  .object({
    runs: z.number().int().min(0).max(2000).nullable(),
    wickets: z.number().int().min(0).max(10).nullable(),
    overs: z.string().regex(/^[0-9]{1,3}\.[0-5]$/).nullable(),
    target: z.number().int().min(0).max(3000).nullable(),
    recent: z.array(z.enum(["0", "1", "2", "3", "4", "5", "6", "W", "Wd", "Nb", "·", "?"])).max(6),
    matchStatus: z.enum(["live", "completed", "innings_break", "draft", "scheduled", "unknown"]),
    evidencePolicy: z.literal("aggregates_only;no_children_or_biometrics;human_review_required"),
  })
  .strict();

export const criclumeBudgetedStartSchema = z
  .object({
    operation: z.literal("run.start.budgeted"),
    tenantId: z.string().uuid(),
    productKey: z.literal("criclume"),
    sourceOrganisationId: z.string().uuid(),
    matchId: z.string().uuid(),
    sourceRevision: z.string().min(20).max(50).refine((v) => Number.isFinite(Date.parse(v)), "Invalid source revision"),
    task: z.enum([
      "match_insights",
      "batting_coach",
      "bowling_coach",
      "fielding_review",
      "training_plan",
      "analyst_agent",
    ]),
    snapshot: criclumeAggregateSchema,
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const criclumeBudgetedCancelSchema = z
  .object({
    operation: z.literal("run.cancel.budgeted"),
    tenantId: z.string().uuid(),
    productKey: z.literal("criclume"),
    admissionId: z.string().uuid(),
  })
  .strict();

export type CriclumeBudgetedStart = z.infer<typeof criclumeBudgetedStartSchema>;

export function isBudgetedCricketRequest(input: unknown): input is CriclumeBudgetedStart {
  return criclumeBudgetedStartSchema.safeParse(input).success;
}

export function sanitizeBudgetAdmissionResult(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid budgeted admission receipt");
  }
  const candidate = data as Record<string, unknown>;
  const uuid = z.string().uuid();
  const currency = z.enum(["GBP", "EUR", "USD"]);
  return {
    admissionId: uuid.parse(candidate["admissionId"]),
    runId: uuid.parse(candidate["runId"]),
    jobId: uuid.parse(candidate["jobId"]),
    reservationId: uuid.parse(candidate["reservationId"]),
    status: z.enum(["queued", "processing", "waiting_review", "completed", "failed", "cancelled", "stale"]).parse(candidate["status"]),
    currency: currency.parse(candidate["currency"]),
    reservedMinor: z.number().int().positive().max(10000).parse(candidate["reservedMinor"]),
    alreadyExists: z.boolean().parse(candidate["alreadyExists"]),
    humanReviewRequired: true as const,
    sourceProduct: "criclume" as const,
    modelExecutionReady: false as const,
  };
}

export function sanitizeBudgetCancelResult(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid model reservation cancellation receipt");
  }
  const value = data as Record<string, unknown>;
  return {
    admissionId: z.string().uuid().parse(value["admissionId"]),
    runId: z.string().uuid().parse(value["runId"]),
    releasedMinor: z.number().int().min(0).max(10000).parse(value["releasedMinor"]),
    alreadyCancelled: z.boolean().parse(value["alreadyCancelled"]),
    humanReviewRequired: true as const,
  };
}
