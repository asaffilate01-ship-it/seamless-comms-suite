import { z } from "zod";

export const practiceScope = z.object({
  tenantId: z.string().uuid(),
  tenantProductId: z.string().uuid(),
});
const title = z.string().trim().min(1).max(240);
export const phaseDefinition = z.object({
  title,
  budgetMinutes: z.number().int().min(0).max(100000).default(0),
});
export const serviceDefinition = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/),
  name: title,
  industry: z.string().max(80),
  currency: z.string().regex(/^[A-Z]{3}$/),
  baseMinor: z.number().int().min(0).max(100000000),
  unitMinor: z.number().int().min(0).max(100000000),
  recurrence: z.enum(["none", "monthly", "quarterly", "annual"]),
  phases: z.array(phaseDefinition).min(1).max(30),
});
export const practiceCommand = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("service.save"), service: serviceDefinition }),
  z.object({
    operation: z.literal("job.create"),
    clientId: z.string().uuid(),
    serviceId: z.string().uuid(),
    periodKey: title,
    internalDue: z.string().datetime().nullable(),
    externalDue: z.string().datetime().nullable(),
  }),
  z.object({
    operation: z.literal("phase.complete"),
    jobId: z.string().uuid(),
    phaseId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    operation: z.literal("job.status"),
    jobId: z.string().uuid(),
    status: z.enum([
      "collecting",
      "processing",
      "client_action",
      "review",
      "approval",
      "submission",
      "completed",
      "cancelled",
    ]),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    operation: z.literal("job.assign"),
    jobId: z.string().uuid(),
    userId: z.string().uuid().nullable(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    operation: z.literal("request.create"),
    jobId: z.string().uuid(),
    title,
    dueAt: z.string().datetime().nullable(),
  }),
  z.object({
    operation: z.literal("request.review"),
    requestId: z.string().uuid(),
    accepted: z.boolean(),
  }),
  z.object({
    operation: z.literal("time.record"),
    jobId: z.string().uuid(),
    minutes: z.number().int().min(1).max(1440),
    costRateMinor: z.number().int().min(0).max(10000000),
    description: z.string().trim().min(1).max(2000),
  }),
  z.object({
    operation: z.literal("proposal.create"),
    clientId: z.string().uuid(),
    serviceId: z.string().uuid(),
    units: z.number().int().min(0).max(100000),
    catchupMinor: z.number().int().min(0).max(100000000),
    terms: z.string().trim().min(1).max(20000),
    expiresAt: z.string().datetime(),
  }),
  z.object({ operation: z.literal("proposal.issue"), proposalId: z.string().uuid() }),
]);
export const practiceMutation = practiceScope.extend({ command: practiceCommand });
export type PracticeCommand = z.input<typeof practiceCommand>;
export type ServiceDefinition = z.infer<typeof serviceDefinition>;
export const PRACTICE_PACKS: ServiceDefinition[] = [
  {
    key: "accounts",
    name: "Accounts preparation",
    industry: "Accounting",
    currency: "GBP",
    baseMinor: 0,
    unitMinor: 0,
    recurrence: "annual",
    phases: [
      { title: "Collect records", budgetMinutes: 30 },
      { title: "Preparation", budgetMinutes: 120 },
      { title: "Technical review", budgetMinutes: 45 },
      { title: "Client approval", budgetMinutes: 15 },
      { title: "Delivery / filing confirmation", budgetMinutes: 15 },
    ],
  },
  {
    key: "compliance",
    name: "Compliance assessment",
    industry: "Haccora",
    currency: "GBP",
    baseMinor: 0,
    unitMinor: 0,
    recurrence: "annual",
    phases: [
      { title: "Collect evidence", budgetMinutes: 30 },
      { title: "Assessment", budgetMinutes: 60 },
      { title: "Corrective actions", budgetMinutes: 30 },
      { title: "Review and close", budgetMinutes: 30 },
    ],
  },
  {
    key: "legal-matter",
    name: "Legal matter intake",
    industry: "Lawquo",
    currency: "GBP",
    baseMinor: 0,
    unitMinor: 0,
    recurrence: "none",
    phases: [
      { title: "Intake and conflict check", budgetMinutes: 30 },
      { title: "Agreement and evidence", budgetMinutes: 60 },
      { title: "Professional review", budgetMinutes: 60 },
      { title: "Client approval and closure", budgetMinutes: 30 },
    ],
  },
  {
    key: "venue-onboarding",
    name: "Venue onboarding",
    industry: "Dishbee / MealDeck",
    currency: "GBP",
    baseMinor: 0,
    unitMinor: 0,
    recurrence: "none",
    phases: [
      { title: "Business details", budgetMinutes: 20 },
      { title: "Menu and commercial agreement", budgetMinutes: 45 },
      { title: "Operational checks", budgetMinutes: 30 },
      { title: "Launch approval", budgetMinutes: 15 },
    ],
  },
  {
    key: "creative-project",
    name: "Creative production",
    industry: "Voxentri",
    currency: "GBP",
    baseMinor: 0,
    unitMinor: 0,
    recurrence: "none",
    phases: [
      { title: "Brief and agreement", budgetMinutes: 30 },
      { title: "Production", budgetMinutes: 120 },
      { title: "Client revisions", budgetMinutes: 60 },
      { title: "Approval and delivery", budgetMinutes: 30 },
    ],
  },
  {
    key: "supplier-onboarding",
    name: "Supplier onboarding",
    industry: "SparesGrid / Courier",
    currency: "GBP",
    baseMinor: 0,
    unitMinor: 0,
    recurrence: "none",
    phases: [
      { title: "Business information", budgetMinutes: 20 },
      { title: "Documents and agreement", budgetMinutes: 30 },
      { title: "Review and activation", budgetMinutes: 20 },
    ],
  },
  {
    key: "minder-application",
    name: "Childminder application",
    industry: "KinderStars",
    currency: "GBP",
    baseMinor: 0,
    unitMinor: 0,
    recurrence: "none",
    phases: [
      { title: "Application and evidence", budgetMinutes: 30 },
      { title: "Checks and assessment", budgetMinutes: 60 },
      { title: "Authorised review", budgetMinutes: 30 },
      { title: "Agreement and onboarding", budgetMinutes: 30 },
    ],
  },
];

export function quoteTotal(
  baseMinor: number,
  unitMinor: number,
  units: number,
  catchupMinor: number,
) {
  const values = [baseMinor, unitMinor, units, catchupMinor];
  if (values.some((v) => !Number.isSafeInteger(v) || v < 0))
    throw new Error("Invalid pricing inputs");
  const total = baseMinor + unitMinor * units + catchupMinor;
  if (!Number.isSafeInteger(total) || total > 100000000000)
    throw new Error("Quote total exceeds limit");
  return total;
}
