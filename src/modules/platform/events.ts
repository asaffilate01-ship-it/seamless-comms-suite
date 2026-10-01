import { z } from "zod";

export const platformEventInputSchema = z.object({
  tenantId: z.string().uuid(),
  productKey: z.string().min(2).max(80),
  brandId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  eventType: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/),
  eventVersion: z.number().int().positive().default(1),
  occurredAt: z.string().datetime().optional(),
  sourceService: z.string().min(1).max(120).nullable().optional(),
  subjectType: z.string().min(1).max(80).nullable().optional(),
  subjectId: z.string().min(1).max(200).nullable().optional(),
  correlationId: z.string().max(120).nullable().optional(),
  causationId: z.string().max(120).nullable().optional(),
  idempotencyKey: z.string().min(8).max(160),
  dataClassification: z.enum(["public","internal","confidential","restricted"]).default("internal"),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const usageInputSchema = z.object({
  tenantId: z.string().uuid(),
  productKey: z.string().min(2).max(80),
  serviceKey: z.string().min(2).max(100).nullable().optional(),
  metricKey: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  quantity: z.number().finite().nonnegative().default(1),
  unit: z.string().min(1).max(40).default("count"),
  idempotencyKey: z.string().min(8).max(160),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export function eventMatches(pattern: string, eventType: string) {
  if (pattern === eventType || pattern === "*") return true;
  if (pattern.endsWith(".*")) return eventType.startsWith(pattern.slice(0, -1));
  return false;
}
