import { z } from "zod";

const money=z.object({
  grossMinor:z.number().int(),
  currency:z.string().regex(/^[A-Z]{3}$/),
  netMinor:z.number().int().optional(),
  taxMinor:z.number().int().optional(),
  discountMinor:z.number().int().nonnegative().optional(),
  refundMinor:z.number().int().nonnegative().optional(),
  cogsMinor:z.number().int().nonnegative().optional(),
});

export const customerPayload=z.object({
  customerRef:z.string().min(1).max(200),displayName:z.string().min(1).max(240),
  firstName:z.string().max(120).optional().nullable(),lastName:z.string().max(120).optional().nullable(),
  email:z.string().email().optional().nullable(),phoneE164:z.string().regex(/^\+[1-9][0-9]{6,14}$/).optional().nullable(),
  locale:z.string().max(20).optional().nullable(),marketingConsent:z.boolean().default(false),
  companyRef:z.string().max(200).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const companyPayload=z.object({
  companyRef:z.string().min(1).max(200),name:z.string().min(1).max(240),
  legalName:z.string().max(240).optional().nullable(),website:z.string().url().optional().nullable(),
  industry:z.string().max(160).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const leadPayload=z.object({
  leadRef:z.string().min(1).max(200),title:z.string().min(1).max(240),
  customerRef:z.string().max(200).optional().nullable(),companyRef:z.string().max(200).optional().nullable(),
  source:z.string().max(120).optional().nullable(),score:z.number().min(0).max(1000).optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const orderCompletedPayload=z.object({
  orderId:z.string().min(1).max(200),customerRef:z.string().max(200).optional().nullable(),
  locationRef:z.string().max(200).optional().nullable(),channel:z.string().max(120).optional().nullable(),
  amounts:money,metadata:z.record(z.string(),z.unknown()).default({})
});
export const bookingCompletedPayload=z.object({
  bookingId:z.string().min(1).max(200),customerRef:z.string().max(200).optional().nullable(),
  locationRef:z.string().max(200).optional().nullable(),valueMinor:z.number().int().optional().nullable(),
  currency:z.string().regex(/^[A-Z]{3}$/).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const refundCompletedPayload=z.object({
  refundId:z.string().min(1).max(200),orderId:z.string().max(200).optional().nullable(),
  amountMinor:z.number().int().positive(),currency:z.string().regex(/^[A-Z]{3}$/),
  metadata:z.record(z.string(),z.unknown()).default({})
});

export const eposTransactionPayload=z.object({
  sourceTransactionRef:z.string().min(1).max(200),
  businessDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  channel:z.string().min(1).max(120),
  orderType:z.string().max(120).optional().nullable(),
  customerRef:z.string().max(200).optional().nullable(),
  amounts:z.object({
    grossMinor:z.number().int(),
    discountMinor:z.number().int().nonnegative().default(0),
    refundMinor:z.number().int().nonnegative().default(0),
    netMinor:z.number().int(),
    taxMinor:z.number().int().optional().nullable(),
    cogsMinor:z.number().int().nonnegative().optional().nullable(),
    currency:z.string().regex(/^[A-Z]{3}$/),
  }),
  itemCount:z.number().int().nonnegative().default(0),
  items:z.array(z.object({
    lineRef:z.string().min(1).max(200),
    itemRef:z.string().min(1).max(200),
    itemName:z.string().min(1).max(240),
    categoryRef:z.string().max(200).optional().nullable(),
    quantity:z.number().positive(),
    grossMinor:z.number().int(),
    discountMinor:z.number().int().nonnegative().default(0),
    refundMinor:z.number().int().nonnegative().default(0),
    netMinor:z.number().int(),
    estimatedCogsMinor:z.number().int().nonnegative().optional().nullable(),
    modifierRefs:z.array(z.string().max(200)).max(100).default([]),
  })).max(1000).default([]),
  metadata:z.record(z.string(),z.unknown()).default({}),
});

export const inventoryMovementPayload=z.object({
  sourceRef:z.string().min(1).max(200),itemRef:z.string().min(1).max(200),
  movementType:z.enum(["purchase","sale","waste","adjustment","transfer_in","transfer_out","return"]),
  quantity:z.number(),unit:z.string().max(40).optional().nullable(),
  costMinor:z.number().int().optional().nullable(),currency:z.string().regex(/^[A-Z]{3}$/).optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).default({}),
});

export const STANDARD_EVENT_PAYLOADS={
 "customer.created":customerPayload,
 "customer.updated":customerPayload,
 "company.created":companyPayload,
 "company.updated":companyPayload,
 "lead.created":leadPayload,
 "order.completed":orderCompletedPayload,
 "booking.completed":bookingCompletedPayload,
 "refund.completed":refundCompletedPayload,
 "epos.transaction.recorded":eposTransactionPayload,
 "inventory.movement.recorded":inventoryMovementPayload,
 "hospitality.waste.recorded":inventoryMovementPayload,
} as const;

export type StandardEventType=keyof typeof STANDARD_EVENT_PAYLOADS;
export function parseStandardEventPayload(type:string,payload:unknown){
  const schema=STANDARD_EVENT_PAYLOADS[type as StandardEventType];
  return schema?schema.parse(payload):payload;
}
