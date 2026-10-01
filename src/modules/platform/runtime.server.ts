import { z } from "zod";
import { authoriseServiceScope, parseServiceAuthorization, verifyServiceSecret, type ServiceCredentialRecord } from "./service-identity";
import { eventMatches, platformEventInputSchema, usageInputSchema } from "./events";

const requestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("event.emit"), event: platformEventInputSchema }).strict(),
  z.object({ operation: z.literal("usage.record"), usage: usageInputSchema }).strict(),
]);

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function authenticate(request: Request) {
  const { keyId, secret } = parseServiceAuthorization(request.headers.get("authorization"));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: row, error } = await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes")
    .eq("key_id", keyId).maybeSingle();
  if (error || !row || !verifyServiceSecret(secret, row.secret_hash)) {
    throw new Error("Service credential refused");
  }
  const scopes = z.array(z.object({
    tenantId: z.string().uuid(),
    productKey: z.string().min(2),
    brandIds: z.array(z.string().uuid()).optional(),
    locationIds: z.array(z.string().uuid()).optional(),
    capabilities: z.array(z.string()),
  })).parse(row.scopes);
  const credential: ServiceCredentialRecord = {
    id: row.id,
    keyId: row.key_id,
    secretHash: row.secret_hash,
    status: row.status,
    expiresAt: row.expires_at,
    scopes,
  };
  return { db, credential };
}

async function assertActiveProduct(db: any, tenantId: string, productKey: string) {
  const { data, error } = await db.from("tenant_products")
    .select("status").eq("tenant_id", tenantId).eq("product_key", productKey).maybeSingle();
  if (error || !data || data.status !== "active") throw new Error("Active tenant product required");
}

export async function servePlatformRuntime(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 262144) return reply({ error: "Payload too large" }, 413);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return reply({ error: "Invalid JSON" }, 400); }
    const input = requestSchema.parse(parsed);
    const { db, credential } = await authenticate(request);

    if (input.operation === "event.emit") {
      const event = input.event;
      authoriseServiceScope(credential, {
        tenantId: event.tenantId,
        productKey: event.productKey,
        brandId: event.brandId,
        locationId: event.locationId,
        capability: "events.write",
      });
      await assertActiveProduct(db, event.tenantId, event.productKey);
      const existing = await db.from("platform_events")
        .select("id").eq("tenant_id", event.tenantId).eq("product_key", event.productKey)
        .eq("idempotency_key", event.idempotencyKey).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) return reply({ id: existing.data.id, idempotent: true });

      const inserted = await db.from("platform_events").insert({
        tenant_id: event.tenantId,
        product_key: event.productKey,
        brand_id: event.brandId ?? null,
        location_id: event.locationId ?? null,
        event_type: event.eventType,
        event_version: event.eventVersion,
        occurred_at: event.occurredAt ?? new Date().toISOString(),
        source_service: event.sourceService ?? null,
        subject_type: event.subjectType ?? null,
        subject_id: event.subjectId ?? null,
        correlation_id: event.correlationId ?? null,
        causation_id: event.causationId ?? null,
        idempotency_key: event.idempotencyKey,
        data_classification: event.dataClassification,
        payload: event.payload,
      }).select("id").single();
      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? "Event could not be recorded");

      const subscriptions = await db.from("platform_event_subscriptions")
        .select("id,event_patterns,product_key").eq("tenant_id", event.tenantId).eq("status", "active");
      if (subscriptions.error) throw new Error(subscriptions.error.message);
      const matching = (subscriptions.data ?? []).filter((subscription: any) =>
        (!subscription.product_key || subscription.product_key === event.productKey) &&
        (subscription.event_patterns ?? []).some((pattern: string) => eventMatches(pattern, event.eventType))
      );
      if (matching.length) {
        const deliveries = matching.map((subscription: any) => ({
          event_id: inserted.data.id,
          subscription_id: subscription.id,
          tenant_id: event.tenantId,
          status: "queued",
        }));
        const delivery = await db.from("platform_event_deliveries").insert(deliveries);
        if (delivery.error && delivery.error.code !== "23505") throw new Error(delivery.error.message);
      }
      await db.from("platform_service_credentials").update({ last_used_at: new Date().toISOString() }).eq("id", credential.id);
      return reply({ id: inserted.data.id, fanout: matching.length }, 201);
    }

    const usage = input.usage;
    authoriseServiceScope(credential, {
      tenantId: usage.tenantId,
      productKey: usage.productKey,
      capability: "usage.write",
    });
    await assertActiveProduct(db, usage.tenantId, usage.productKey);
    const existing = await db.from("usage_events").select("id")
      .eq("tenant_id", usage.tenantId).eq("product_key", usage.productKey)
      .eq("metric_key", usage.metricKey).eq("idempotency_key", usage.idempotencyKey).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return reply({ id: existing.data.id, idempotent: true });

    const inserted = await db.from("usage_events").insert({
      tenant_id: usage.tenantId,
      product_key: usage.productKey,
      service_key: usage.serviceKey ?? null,
      metric_key: usage.metricKey,
      quantity: usage.quantity,
      unit: usage.unit,
      idempotency_key: usage.idempotencyKey,
      occurred_at: usage.occurredAt ?? new Date().toISOString(),
      metadata: usage.metadata,
    }).select("id").single();
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? "Usage could not be recorded");
    await db.from("platform_service_credentials").update({ last_used_at: new Date().toISOString() }).eq("id", credential.id);
    return reply({ id: inserted.data.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return reply({ error: "Invalid platform runtime contract" }, 422);
    const message = error instanceof Error ? error.message : "Platform runtime refused";
    if (/credential|scope|authorization|expired|active tenant product/i.test(message)) return reply({ error: message }, 403);
    return reply({ error: message }, 503);
  }
}
