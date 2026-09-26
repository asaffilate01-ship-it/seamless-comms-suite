import { z } from "zod";

export const automotiveProduct = z.enum(["zivvo", "autohashi", "sparesgrid"]);
export type AutomotiveProduct = z.infer<typeof automotiveProduct>;

export const automotiveAddon = z.enum([
  "vehicle_intelligence",
  "vehicle_passport",
  "verified_media",
  "vision_inspection",
  "remote_appraisal",
  "uk_provenance",
  "factory_specification",
  "service_history",
  "valuation",
  "market_intelligence",
  "jdm_intelligence",
  "auction_sheet_ai",
  "landed_cost",
  "max_bid",
  "parts_intelligence",
  "parts_compatibility",
  "compliance_center",
  "finance_adapter",
  "api_access",
]);
export type AutomotiveAddon = z.infer<typeof automotiveAddon>;

export const vehicleIdentityBaseSchema = z.object({
  vehicleId: z.string().uuid(),
  tenantId: z.string().uuid(),
  origin: z.enum(["uk", "japan", "other"]),
  vrm: z.string().min(1).max(20).optional(),
  vin: z.string().min(6).max(40).optional(),
  chassisNumber: z.string().min(4).max(64).optional(),
  modelCode: z.string().min(1).max(64).optional(),
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(120),
  derivative: z.string().max(160).optional(),
  firstRegistrationDate: z.string().date().optional(),
});

export const vehicleIdentitySchema = vehicleIdentityBaseSchema.superRefine((value, ctx) => {
  if (!value.vrm && !value.vin && !value.chassisNumber) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one vehicle identifier is required" });
  }
});

export const evidenceMediaSchema = z.object({
  evidenceId: z.string().uuid(),
  tenantId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  appraisalId: z.string().uuid().optional(),
  kind: z.enum(["photo", "video", "document"]),
  captureItem: z.string().min(1).max(120),
  originalObjectKey: z.string().min(1).max(500),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  captureSessionCreatedAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  providerTimestamp: z.string().datetime().optional(),
  mimeType: z.string().min(1).max(120),
  bytes: z.number().int().nonnegative(),
  source: z.enum(["customer_capture", "dealer_capture", "auction_feed", "port", "preparation", "handover"]),
  locationCaptured: z.literal(false),
  metadataSanitised: z.boolean().default(true),
}).strict();

export const appraisalRequestSchema = z.object({
  tenantId: z.string().uuid(),
  product: automotiveProduct,
  vehicle: vehicleIdentityBaseSchema.omit({ tenantId: true }).superRefine((value, ctx) => {
    if (!value.vrm && !value.vin && !value.chassisNumber) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one vehicle identifier is required" });
  }),
  requestedItems: z.array(z.string().min(1).max(120)).min(1).max(100),
  requireFreshCapture: z.boolean().default(true),
  allowLibraryUpload: z.boolean().default(false),
  captureGeolocation: z.literal(false).default(false),
  expiresAt: z.string().datetime(),
}).strict();

export const automotiveEventType = z.enum([
  "vehicle.created",
  "vehicle.updated",
  "vehicle.passport.updated",
  "provenance.completed",
  "valuation.completed",
  "market_intelligence.completed",
  "appraisal.created",
  "media.requested",
  "media.received",
  "media.capture_completed",
  "vision.analysis.completed",
  "appraisal.completed",
  "auction.vehicle.discovered",
  "auction.sheet.parsed",
  "auction.images.ingested",
  "auction.history.completed",
  "landed_cost.updated",
  "max_bid.updated",
  "auction.won",
  "vehicle.shipped",
  "vehicle.arrived_uk",
  "vehicle.registered_uk",
  "part.identified",
  "compatibility.completed",
  "part.request.created",
  "quote.received",
  "compliance.pack.updated",
  "intelligence.run.created",
  "intelligence.step.queued",
  "intelligence.step.completed",
  "intelligence.run.completed",
]);
export type AutomotiveEventType = z.infer<typeof automotiveEventType>;

export const automotiveWebhookEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: automotiveEventType,
  occurredAt: z.string().datetime(),
  tenantId: z.string().uuid(),
  product: automotiveProduct,
  subject: z.object({
    vehicleId: z.string().uuid().optional(),
    appraisalId: z.string().uuid().optional(),
    auctionLotId: z.string().max(120).optional(),
    partRequestId: z.string().uuid().optional(),
  }).strict(),
  data: z.record(z.unknown()),
  schemaVersion: z.literal(1),
}).strict();

export const entitlementSchema = z.object({
  tenantId: z.string().uuid(),
  product: automotiveProduct,
  addon: automotiveAddon,
  enabled: z.boolean(),
  plan: z.enum(["core", "addon", "enterprise", "trial"]),
  usageLimit: z.number().int().positive().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
}).strict();
