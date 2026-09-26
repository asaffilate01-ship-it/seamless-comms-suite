import { createClient } from "@supabase/supabase-js";
import { automotiveWebhookEnvelopeSchema, type AutomotiveEventType, type AutomotiveProduct } from "./contracts";
import { signAutomotiveWebhook } from "./webhooks.server";
import { randomUUID } from "node:crypto";

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Automotive event bus is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function queueAutomotiveEvent(input: {
  tenantId: string;
  product: AutomotiveProduct;
  type: AutomotiveEventType;
  subject?: { vehicleId?: string; appraisalId?: string; auctionLotId?: string; partRequestId?: string };
  data?: Record<string, unknown>;
}) {
  const db = client();
  const envelope = automotiveWebhookEnvelopeSchema.parse({
    id: randomUUID(),
    type: input.type,
    occurredAt: new Date().toISOString(),
    tenantId: input.tenantId,
    product: input.product,
    subject: input.subject ?? {},
    data: input.data ?? {},
    schemaVersion: 1,
  });

  const { data: endpoints, error } = await db
    .from("automotive_webhook_endpoints")
    .select("endpoint_id,subscribed_events")
    .eq("tenant_id", input.tenantId)
    .eq("product", input.product)
    .eq("enabled", true);
  if (error) throw new Error("Unable to resolve automotive webhook subscriptions");

  const rows = (endpoints ?? [])
    .filter((endpoint: any) => !endpoint.subscribed_events?.length || endpoint.subscribed_events.includes(input.type))
    .map((endpoint: any) => ({
      tenant_id: input.tenantId,
      endpoint_id: endpoint.endpoint_id,
      event_id: envelope.id,
      event_type: envelope.type,
      payload: envelope,
      status: "pending",
      next_attempt_at: new Date().toISOString(),
    }));

  if (rows.length) {
    const { error: insertError } = await db.from("automotive_webhook_deliveries").insert(rows);
    if (insertError && insertError.code !== "23505") throw new Error("Unable to queue automotive webhook");
  }
  return envelope;
}

const delaysSeconds = [60, 300, 900, 3600, 14400, 43200];

export async function deliverDueAutomotiveWebhooks(limit = 50) {
  const db = client();
  const now = new Date().toISOString();
  const { data: deliveries, error } = await db
    .from("automotive_webhook_deliveries")
    .select("tenant_id,delivery_id,endpoint_id,event_id,event_type,payload,attempt_count")
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error("Unable to load automotive webhook deliveries");

  const outcomes: Array<{ deliveryId: string; status: string }> = [];
  for (const delivery of deliveries ?? []) {
    const { data: endpoint } = await db
      .from("automotive_webhook_endpoints")
      .select("endpoint_url,secret_ref,enabled")
      .eq("tenant_id", delivery.tenant_id)
      .eq("endpoint_id", delivery.endpoint_id)
      .maybeSingle();

    if (!endpoint?.enabled) {
      await db.from("automotive_webhook_deliveries").update({ status: "dead_letter", last_error: "Endpoint disabled" }).eq("tenant_id", delivery.tenant_id).eq("delivery_id", delivery.delivery_id);
      outcomes.push({ deliveryId: delivery.delivery_id, status: "dead_letter" });
      continue;
    }

    const secret = process.env[endpoint.secret_ref];
    if (!secret || secret.length < 32) {
      await db.from("automotive_webhook_deliveries").update({ status: "dead_letter", last_error: "Endpoint secret unavailable" }).eq("tenant_id", delivery.tenant_id).eq("delivery_id", delivery.delivery_id);
      outcomes.push({ deliveryId: delivery.delivery_id, status: "dead_letter" });
      continue;
    }

    const body = JSON.stringify(delivery.payload);
    const headers = signAutomotiveWebhook(secret, body);
    const attempt = Number(delivery.attempt_count ?? 0) + 1;
    try {
      const response = await fetch(endpoint.endpoint_url, { method: "POST", headers, body, signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        await db.from("automotive_webhook_deliveries").update({
          status: "delivered", attempt_count: attempt, delivered_at: new Date().toISOString(),
          last_http_status: response.status, last_error: null, next_attempt_at: null,
        }).eq("tenant_id", delivery.tenant_id).eq("delivery_id", delivery.delivery_id);
        outcomes.push({ deliveryId: delivery.delivery_id, status: "delivered" });
      } else {
        throw Object.assign(new Error("Non-success webhook response"), { httpStatus: response.status });
      }
    } catch (error) {
      const exhausted = attempt > delaysSeconds.length;
      const delay = delaysSeconds[Math.min(attempt - 1, delaysSeconds.length - 1)];
      await db.from("automotive_webhook_deliveries").update({
        status: exhausted ? "dead_letter" : "retry",
        attempt_count: attempt,
        last_http_status: typeof error === "object" && error && "httpStatus" in error ? Number((error as any).httpStatus) : null,
        last_error: exhausted ? "Webhook delivery retries exhausted" : "Webhook delivery failed",
        next_attempt_at: exhausted ? null : new Date(Date.now() + delay * 1000).toISOString(),
      }).eq("tenant_id", delivery.tenant_id).eq("delivery_id", delivery.delivery_id);
      outcomes.push({ deliveryId: delivery.delivery_id, status: exhausted ? "dead_letter" : "retry" });
    }
  }
  return outcomes;
}
