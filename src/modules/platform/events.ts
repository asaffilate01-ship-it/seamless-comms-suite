import { z } from "zod";

export const eventEnvelopeSchema = z.object({
  schema: z.literal("omniqora.event.v1"),
  id: z.string().min(8).max(120),
  type: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/),
  version: z.number().int().positive().default(1),
  occurredAt: z.string().datetime(),
  source: z.object({
    productKey: z.string().min(1).max(80),
    service: z.string().min(1).max(120).optional(),
    environment: z.enum(["development", "staging", "production"]),
  }),
  scope: z.object({
    tenantId: z.string().uuid(),
    tenantProductId: z.string().uuid().optional(),
    brandKey: z.string().max(120).optional(),
    locationId: z.string().uuid().optional(),
    workspaceId: z.string().max(160).optional(),
    userId: z.string().uuid().optional(),
  }),
  subject: z.object({
    type: z.string().min(1).max(80),
    id: z.string().min(1).max(200),
  }).optional(),
  correlationId: z.string().max(120).optional(),
  causationId: z.string().max(120).optional(),
  idempotencyKey: z.string().min(8).max(160),
  dataClassification: z.enum(["public", "internal", "confidential", "restricted"]).default("internal"),
  payload: z.record(z.string(), z.unknown()),
});

export type OmniqoraEventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export function parseEventEnvelope(input: unknown): OmniqoraEventEnvelope {
  return eventEnvelopeSchema.parse(input);
}

export function eventPartitionKey(event: OmniqoraEventEnvelope) {
  return [event.scope.tenantId, event.source.productKey, event.type].join(":");
}

export function assertSameTenant(
  event: OmniqoraEventEnvelope,
  expectedTenantId: string,
): OmniqoraEventEnvelope {
  if (event.scope.tenantId !== expectedTenantId) {
    throw new Error("Cross-tenant event scope refused");
  }
  return event;
}

export const CORE_EVENT_TYPES = {
  tenantProvisioned: "platform.tenant.provisioned",
  moduleEnabled: "platform.module.enabled",
  moduleDisabled: "platform.module.disabled",
  integrationActivated: "platform.integration.activated",
  domainVerified: "platform.domain.verified",
  usageRecorded: "platform.usage.recorded",
} as const;
