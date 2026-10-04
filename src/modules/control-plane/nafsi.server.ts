import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { connectManifest } from "../connect/product-manifests";

const id = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const sha = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .nullable()
  .optional();
const capability = z.enum(["daily-plan", "flow-ai-slot", "weekly-report"]);
const language = z.enum([
  "en",
  "ar",
  "ur",
  "fr",
  "es",
  "de",
  "tr",
  "hi",
  "bn",
  "ms",
  "fa",
  "ru",
  "gu",
  "id",
]);
const evidenceRef = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const contextSchemas = {
  "daily-plan": z
    .object({
      language,
      energyBand: z.enum(["low", "balanced", "high"]),
      minutesBand: z.enum(["5", "10", "20", "30"]),
      focusCodes: z
        .array(
          z.enum([
            "prayer",
            "gratitude",
            "breathing",
            "reflection",
            "rest",
            "movement",
            "connection",
          ]),
        )
        .max(12),
    })
    .strict(),
  "flow-ai-slot": z
    .object({ language, flowKey: id, slotKey: id, tone: z.enum(["gentle", "balanced", "direct"]) })
    .strict(),
  "weekly-report": z
    .object({
      language,
      completionBand: z.enum(["none", "low", "medium", "high"]),
      streakBand: z.enum(["0", "1-3", "4-7", "8+"]),
      activityCodes: z
        .array(z.enum(["plan", "prayer", "dua", "reflection", "breathing", "movement", "sleep"]))
        .max(12),
    })
    .strict(),
} as const;
const shadowEnvelope = z
  .object({
    schemaVersion: z.literal(1),
    externalTenantId: id,
    evaluationId: z.string().uuid(),
    capability,
    testCaseKey: id,
    context: z.record(z.unknown()),
    evidenceRefs: z.array(evidenceRef).max(50),
  })
  .strict();
const providerDraft = z
  .object({
    summary: z.string().max(1200),
    actions: z
      .array(
        z
          .object({
            code: id,
            minutes: z.number().int().min(0).max(120),
            evidenceRefs: z.array(evidenceRef).max(20),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
const providerResult = z
  .object({
    draft: providerDraft,
    safety: z
      .object({ decision: z.enum(["pass", "review", "block"]), reasonCodes: z.array(id).max(20) })
      .strict(),
  })
  .strict();

const payloadSchemas: Record<string, z.ZodTypeAny> = {
  "nafsi.release.deployed": z
    .object({
      releaseSha: z.string().regex(/^[a-f0-9]{40}$/),
      environment: z.enum(["production", "staging"]),
    })
    .strict(),
  "nafsi.service.health.changed": z
    .object({
      serviceKey: id,
      status: z.enum(["healthy", "degraded", "unavailable"]),
      region: id.optional(),
    })
    .strict(),
  "nafsi.entitlement.summary.changed": z
    .object({
      enabledCount: z.number().int().nonnegative(),
      disabledCount: z.number().int().nonnegative(),
    })
    .strict(),
  "nafsi.dua.review.completed": z
    .object({
      duaId: z.string().uuid(),
      reviewType: z.enum(["content_approved", "recitation_approved"]),
      releaseSha: sha,
    })
    .strict(),
  "nafsi.dua.published": z
    .object({
      duaId: z.string().uuid(),
      releaseSha: sha,
      textVersion: z.number().int().positive().nullable(),
      syncVersion: z.number().int().nonnegative().nullable(),
    })
    .strict(),
  "nafsi.ai.run.completed": z
    .object({
      runId: z.string().uuid(),
      capability,
      status: z.enum(["evaluated", "reviewing", "accepted", "rejected", "failed"]),
      safetyDecision: z.enum(["pass", "review", "block"]),
      reviewRequired: z.boolean(),
    })
    .strict(),
  "nafsi.ai.safety.signal": z
    .object({
      runId: z.string().uuid(),
      capability,
      severity: z.enum(["medium", "high"]),
      category: z.literal("shadow_policy"),
    })
    .strict(),
  "nafsi.whatsapp.consent.changed": z
    .object({ status: z.enum(["granted", "withdrawn"]), channel: z.literal("whatsapp") })
    .strict(),
  "nafsi.delivery.failed": z
    .object({ channel: z.enum(["email", "whatsapp", "push"]), code: id })
    .strict(),
};
const eventEnvelope = z
  .object({
    schemaVersion: z.literal(1),
    externalTenantId: id,
    event: z
      .object({
        id: z.string().uuid(),
        eventType: id,
        eventVersion: z.number().int().positive(),
        occurredAt: z.string().datetime(),
        aggregateId: z.string().max(200).nullable(),
        revision: z.number().int().nonnegative(),
        idempotencyKey: id,
        payload: z.record(z.unknown()),
      })
      .strict(),
  })
  .strict();
const forbidden = new Set([
  "prompt",
  "prompts",
  "message",
  "messages",
  "journal",
  "mood",
  "content",
  "text",
  "response",
  "answer",
  "transcript",
  "email",
  "phone",
  "name",
]);

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
function equal(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function privateField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(privateField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => forbidden.has(key.toLowerCase()) || privateField(child),
  );
}
async function bodyText(request: Request, max = 65536) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw Object.assign(new Error("JSON content type required"), { status: 415 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > max)
    throw Object.assign(new Error("Request exceeds 64 KiB"), { status: 413 });
  return raw;
}

async function connection(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length > 256)
    throw Object.assign(new Error("Invalid control-plane credential"), { status: 401 });
  const token = authorization.slice(7);
  if (!token.startsWith("oqcp_") || token.length < 40 || /[\r\n]/.test(token))
    throw Object.assign(new Error("Invalid control-plane credential"), { status: 401 });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw Object.assign(new Error("Control plane is not configured"), { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const digest = createHash("sha256").update(token).digest("hex");
  const result = await db
    .from("product_connections")
    .select(
      "id,tenant_id,product_key,external_tenant_id,status,capabilities,credential_hash,credential_expires_at",
    )
    .eq("credential_hash", digest)
    .maybeSingle();
  const row = result.data;
  if (result.error || !row?.credential_hash || !equal(row.credential_hash, digest))
    throw Object.assign(new Error("Invalid control-plane credential"), { status: 401 });
  if (row.product_key !== "nafsi" || !["configured", "connected", "degraded"].includes(row.status))
    throw Object.assign(new Error("Nafsi connection is inactive"), { status: 403 });
  if (row.credential_expires_at && Date.parse(row.credential_expires_at) <= Date.now())
    throw Object.assign(new Error("Control-plane credential expired"), { status: 401 });
  return { db, row, token };
}

function providerEndpoint() {
  const raw = process.env.OMNIQORA_NAFSI_AI_SHADOW_URL;
  if (!raw)
    throw Object.assign(new Error("Nafsi shadow runtime is not configured"), { status: 503 });
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw Object.assign(new Error("Nafsi shadow runtime configuration is invalid"), {
      status: 503,
    });
  return url;
}

export async function serveNafsiIntelligenceShadow(request: Request) {
  try {
    const { db, row } = await connection(request);
    if (!(row.capabilities ?? []).includes("intelligence"))
      return json({ error: "Intelligence capability is not enabled" }, 403);
    const entitlementResult = await db
      .from("tenant_services")
      .select("status,valid_from,valid_until")
      .eq("tenant_id", row.tenant_id)
      .eq("service_key", "omniqora.ai")
      .maybeSingle();
    const entitlement = entitlementResult.data;
    if (
      entitlementResult.error ||
      !entitlement ||
      !["active", "trial"].includes(entitlement.status) ||
      (entitlement.valid_from && Date.parse(entitlement.valid_from) > Date.now()) ||
      (entitlement.valid_until && Date.parse(entitlement.valid_until) <= Date.now())
    ) {
      return json({ error: "Omniqora AI entitlement is inactive" }, 403);
    }
    const envelope = shadowEnvelope.parse(JSON.parse(await bodyText(request)));
    if (envelope.externalTenantId !== row.external_tenant_id)
      return json({ error: "Tenant binding mismatch" }, 403);
    const context = contextSchemas[envelope.capability].parse(envelope.context);
    const providerKey = process.env.OMNIQORA_NAFSI_AI_SHADOW_KEY ?? "";
    if (providerKey.length < 32 || /[\r\n]/.test(providerKey))
      return json({ error: "Nafsi shadow runtime is not configured" }, 503);
    const providerResponse = await fetch(providerEndpoint(), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${providerKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        schemaVersion: 1,
        evaluationId: envelope.evaluationId,
        capability: envelope.capability,
        context,
        evidenceRefs: envelope.evidenceRefs,
        policy: {
          mode: "shadow",
          noExternalActions: true,
          prohibitArabic: true,
          prohibitFatwaOrMedicalClaims: true,
          requireEvidenceRefs: true,
        },
      }),
    });
    const raw = await providerResponse.text();
    if (!providerResponse.ok || Buffer.byteLength(raw, "utf8") > 65536)
      return json({ error: "Shadow runtime refused the request" }, 503);
    const result = providerResult.parse(JSON.parse(raw));
    if (/[؀-ۿ]/u.test(result.draft.summary))
      return json({ error: "Shadow runtime returned unreviewed Arabic" }, 422);
    const allowed = new Set(envelope.evidenceRefs);
    if (result.draft.actions.some((action) => action.evidenceRefs.some((ref) => !allowed.has(ref))))
      return json({ error: "Shadow runtime returned an unapproved evidence reference" }, 422);
    const route = {
      provider: process.env.OMNIQORA_NAFSI_AI_PROVIDER ?? "configured-runtime",
      model: process.env.OMNIQORA_NAFSI_AI_MODEL ?? "operator-selected",
      policyVersion: process.env.OMNIQORA_NAFSI_AI_POLICY_VERSION ?? "nafsi-islamic-wellbeing-v1",
    };
    await db.from("usage_events").upsert(
      {
        tenant_id: row.tenant_id,
        product_key: "nafsi",
        service_key: "omniqora.ai",
        metric_key: "shadow_evaluation",
        quantity: 1,
        unit: "run",
        idempotency_key: envelope.evaluationId,
        occurred_at: new Date().toISOString(),
        metadata: {
          capability: envelope.capability,
          safetyDecision: result.safety.decision,
          model: route.model,
          policyVersion: route.policyVersion,
        },
      },
      { onConflict: "tenant_id,product_key,metric_key,idempotency_key" },
    );
    return json({
      schemaVersion: 1,
      evaluationId: envelope.evaluationId,
      capability: envelope.capability,
      ...result,
      route,
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "Invalid Nafsi shadow contract" }, 422);
    return json(
      { error: error instanceof Error ? error.message : "Nafsi shadow route unavailable" },
      Number((error as { status?: number })?.status) || 503,
    );
  }
}

export async function serveNafsiEvents(request: Request) {
  try {
    const { db, row, token } = await connection(request);
    if (!(row.capabilities ?? []).includes("events"))
      return json({ error: "Event capability is not enabled" }, 403);
    const raw = await bodyText(request);
    const timestamp = request.headers.get("x-event-timestamp") ?? "";
    const signature = /^t=(\d{13}),v1=([a-f0-9]{64})$/.exec(
      request.headers.get("x-omniqora-signature") ?? "",
    );
    if (
      !signature ||
      signature[1] !== timestamp ||
      Math.abs(Date.now() - Number(timestamp)) > 300000
    )
      return json({ error: "Invalid or expired event signature" }, 401);
    const expected = createHmac("sha256", token).update(`${timestamp}.${raw}`).digest("hex");
    if (!equal(expected, signature[2])) return json({ error: "Invalid event signature" }, 401);
    const envelope = eventEnvelope.parse(JSON.parse(raw));
    if (envelope.externalTenantId !== row.external_tenant_id)
      return json({ error: "Tenant binding mismatch" }, 403);
    if (request.headers.get("idempotency-key") !== envelope.event.idempotencyKey)
      return json({ error: "Idempotency key mismatch" }, 422);
    const manifest = connectManifest("nafsi");
    if (!manifest?.events.includes(envelope.event.eventType))
      return json({ error: "Nafsi event type is not allowlisted" }, 422);
    const schema = payloadSchemas[envelope.event.eventType];
    if (!schema || privateField(envelope.event.payload))
      return json({ error: "Event payload is not permitted" }, 422);
    const payload = schema.parse(envelope.event.payload);
    const existing = await db
      .from("platform_events")
      .select("id")
      .eq("tenant_id", row.tenant_id)
      .eq("product_key", "nafsi")
      .eq("idempotency_key", envelope.event.idempotencyKey)
      .maybeSingle();
    if (existing.data?.id)
      return json({ accepted: true, duplicate: true, eventId: existing.data.id }, 200);
    const inserted = await db
      .from("platform_events")
      .insert({
        tenant_id: row.tenant_id,
        product_key: "nafsi",
        event_type: envelope.event.eventType,
        event_version: envelope.event.eventVersion,
        occurred_at: envelope.event.occurredAt,
        source_service: "nafsi.core",
        subject_type: envelope.event.aggregateId ? "nafsi_record" : null,
        subject_id: envelope.event.aggregateId,
        correlation_id: envelope.event.id,
        idempotency_key: envelope.event.idempotencyKey,
        data_classification: "internal",
        payload,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) throw new Error("Could not store Nafsi event");
    return json({ accepted: true, duplicate: false, eventId: inserted.data.id }, 202);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "Invalid Nafsi event contract" }, 422);
    return json(
      { error: error instanceof Error ? error.message : "Nafsi event route unavailable" },
      Number((error as { status?: number })?.status) || 503,
    );
  }
}
