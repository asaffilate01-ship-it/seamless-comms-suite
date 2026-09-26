import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { automotiveWebhookEnvelopeSchema, type AutomotiveEventType, type AutomotiveProduct } from "./contracts";

const MAX_SKEW_SECONDS = 300;

function digest(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signAutomotiveWebhook(secret: string, body: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  if (secret.length < 32) throw new Error("Webhook secret must be at least 32 characters");
  return {
    "content-type": "application/json",
    "x-omniqora-timestamp": timestamp,
    "x-omniqora-signature": `v1=${digest(secret, timestamp, body)}`,
  };
}

export function verifyAutomotiveWebhook(
  secret: string,
  rawBody: string,
  headers: Headers,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (secret.length < 32) throw new Error("Webhook secret is not configured");
  const timestamp = headers.get("x-omniqora-timestamp") ?? "";
  const signature = headers.get("x-omniqora-signature") ?? "";
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(nowSeconds - seconds) > MAX_SKEW_SECONDS) {
    throw new Error("Webhook timestamp is outside the allowed replay window");
  }
  const match = /^v1=([a-f0-9]{64})$/.exec(signature);
  if (!match) throw new Error("Webhook signature is invalid");
  const expected = Buffer.from(digest(secret, timestamp, rawBody), "hex");
  const supplied = Buffer.from(match[1], "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("Webhook signature is invalid");
  }
  return automotiveWebhookEnvelopeSchema.parse(JSON.parse(rawBody));
}

export function createAutomotiveEvent(input: {
  type: AutomotiveEventType;
  tenantId: string;
  product: AutomotiveProduct;
  subject?: Record<string, string | undefined>;
  data?: Record<string, unknown>;
}) {
  return automotiveWebhookEnvelopeSchema.parse({
    id: randomUUID(),
    type: input.type,
    occurredAt: new Date().toISOString(),
    tenantId: input.tenantId,
    product: input.product,
    subject: input.subject ?? {},
    data: input.data ?? {},
    schemaVersion: 1,
  });
}
