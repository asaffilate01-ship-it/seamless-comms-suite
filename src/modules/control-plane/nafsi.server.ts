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
const connectScopes = z.enum(["reminders", "reviewed-dua", "account-links", "support-links"]);
const connectRequest = z
  .object({
    schemaVersion: z.literal(1),
    externalTenantId: id,
    requestId: z.string().uuid(),
    operation: z.literal("request-opt-in"),
    phoneE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
    locale: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/),
    scopes: z.array(connectScopes).min(1).max(4),
  })
  .strict();
const connectEventRequest = z.discriminatedUnion("operation", [
  z
    .object({
      schemaVersion: z.literal(1),
      externalTenantId: id,
      operation: z.literal("claim"),
      limit: z.number().int().min(1).max(100).default(25),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      externalTenantId: id,
      operation: z.literal("ack"),
      eventIds: z.array(z.string().uuid()).min(1).max(100),
    })
    .strict(),
]);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const parityScope = z.enum(["identity", "entitlement", "billing"]);
const subscriptionStatus = z.enum([
  "active",
  "trialing",
  "grace_period",
  "cancelled",
  "canceled",
  "expired",
  "incomplete",
  "incomplete_expired",
  "past_due",
  "paused",
  "unpaid",
  "billing_issue",
]);
const parityRecord = z
  .object({
    subjectRef: z.string().regex(/^nafsi-subject:[a-f0-9]{64}$/),
    identity: z
      .object({
        accountState: z.enum(["active", "disabled"]),
        emailVerified: z.boolean(),
        authMethod: z.enum(["password", "federated"]),
        localFingerprint: fingerprint,
      })
      .strict(),
    entitlement: z
      .object({
        tier: z.enum(["free", "trial", "basic", "advanced"]),
        subscribed: z.boolean(),
        status: z.union([subscriptionStatus, z.literal("free")]),
        billingInterval: z.enum(["monthly", "yearly"]).nullable(),
        expiresAt: z.string().datetime().nullable(),
        cancelAtPeriodEnd: z.boolean(),
        localFingerprint: fingerprint,
      })
      .strict(),
    billing: z
      .object({
        evaluatedAt: z.string().datetime(),
        trialEndsAt: z.string().datetime().nullable(),
        subscriptions: z
          .array(
            z
              .object({
                provider: z.enum(["stripe", "revenuecat", "legacy"]),
                tier: z.enum(["basic", "advanced"]),
                interval: z.enum(["monthly", "yearly"]),
                status: subscriptionStatus,
                expiresAt: z.string().datetime().nullable(),
                graceExpiresAt: z.string().datetime().nullable(),
                cancelAtPeriodEnd: z.boolean(),
              })
              .strict(),
          )
          .max(3),
        localFingerprint: fingerprint,
      })
      .strict(),
  })
  .strict();
const parityRequest = z
  .object({
    schemaVersion: z.literal(1),
    externalTenantId: id,
    batchId: z.string().uuid(),
    releaseSha: z.string().regex(/^[a-f0-9]{40}$/),
    scopes: z.array(parityScope).min(1).max(3),
    records: z.array(parityRecord).max(100),
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
  "nafsi.parity.batch.completed": z
    .object({
      scopes: z.array(parityScope).min(1).max(3),
      sampledSubjects: z.number().int().nonnegative(),
      matchedRecords: z.number().int().nonnegative(),
      mismatchedRecords: z.number().int().nonnegative(),
      errorRecords: z.number().int().nonnegative(),
      releaseSha: z.string().regex(/^[a-f0-9]{40}$/),
      status: z.enum(["completed", "review_required", "failed"]),
    })
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
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function fingerprintOf(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
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

async function entitled(
  db: Awaited<ReturnType<typeof connection>>["db"],
  tenantId: string,
  serviceKey: string,
) {
  const result = await db
    .from("tenant_services")
    .select("status,valid_from,valid_until")
    .eq("tenant_id", tenantId)
    .eq("service_key", serviceKey)
    .maybeSingle();
  const value = result.data;
  return (
    !result.error &&
    value &&
    ["active", "trial"].includes(value.status) &&
    (!value.valid_from || Date.parse(value.valid_from) <= Date.now()) &&
    (!value.valid_until || Date.parse(value.valid_until) > Date.now())
  );
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

async function serveNafsiIntelligence(request: Request, authority: "shadow" | "live") {
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
    if (authority === "live" && process.env.OMNIQORA_NAFSI_AI_CUTOVER_ENABLED !== "true")
      return json({ error: "Nafsi live Intelligence cutover is disabled" }, 409);
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
          mode: authority,
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
        metric_key: authority === "shadow" ? "shadow_evaluation" : "authoritative_generation",
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
      authorityMode: authority,
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

export const serveNafsiIntelligenceShadow = (request: Request) =>
  serveNafsiIntelligence(request, "shadow");

export const serveNafsiIntelligenceLive = (request: Request) =>
  serveNafsiIntelligence(request, "live");

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

export async function serveNafsiConnect(request: Request) {
  let eventId: string | null = null;
  try {
    const { db, row } = await connection(request);
    if (!(row.capabilities ?? []).includes("connect"))
      return json({ error: "Connect capability is not enabled" }, 403);
    if (!(await entitled(db, row.tenant_id, "omniqora.connect")))
      return json({ error: "Omniqora Connect entitlement is inactive" }, 403);
    const input = connectRequest.parse(JSON.parse(await bodyText(request)));
    if (input.externalTenantId !== row.external_tenant_id)
      return json({ error: "Tenant binding mismatch" }, 403);
    if (request.headers.get("idempotency-key") !== input.requestId)
      return json({ error: "Idempotency key mismatch" }, 422);

    const prior = await db
      .from("communication_events")
      .select("id,status,metadata")
      .eq("tenant_id", row.tenant_id)
      .eq("product_key", "nafsi")
      .eq("source_event_id", input.requestId)
      .maybeSingle();
    if (prior.data)
      return json({
        contactRef: prior.data.metadata?.contactRef,
        receiptId: prior.data.id,
        destinationLabel: prior.data.metadata?.destinationLabel,
        status: prior.data.status === "delivered" ? "delivered" : "queued",
      });

    const channelResult = await db
      .from("whatsapp_channels")
      .select("id,phone_number_id,access_token")
      .eq("tenant_id", row.tenant_id)
      .eq("product_key", "nafsi")
      .eq("external_tenant_id", row.external_tenant_id)
      .eq("outbound_enabled", true)
      .eq("status", "configured")
      .eq("is_primary", true)
      .limit(1);
    const channel = channelResult.data?.[0];
    if (!channel) return json({ error: "No configured Nafsi WhatsApp pilot channel" }, 409);

    const waId = input.phoneE164.slice(1);
    const contactResult = await db
      .from("contacts")
      .upsert(
        {
          tenant_id: row.tenant_id,
          wa_id: waId,
          display_name: null,
          locale: input.locale.slice(0, 2),
          consent_marketing: false,
        },
        { onConflict: "tenant_id,wa_id" },
      )
      .select("id")
      .single();
    if (contactResult.error || !contactResult.data)
      throw new Error("Connect contact could not be prepared");
    const contactRef = `wa-contact:${contactResult.data.id}`;
    const destinationLabel = `WhatsApp ending ${waId.slice(-4)}`;
    const inserted = await db
      .from("communication_events")
      .insert({
        tenant_id: row.tenant_id,
        product_key: "nafsi",
        external_tenant_id: row.external_tenant_id,
        scope_id: row.external_tenant_id,
        source_event_id: input.requestId,
        event_type: "nafsi.whatsapp.opt_in.requested",
        direction: "source_to_connect",
        recipient: { phone: input.phoneE164 },
        message: {
          kind: "template",
          templateName: "nafsi_whatsapp_opt_in_v1",
          language: input.locale,
        },
        metadata: {
          contactRef,
          destinationLabel,
          scopes: input.scopes,
          consentVersion: "nafsi-whatsapp-v1",
        },
        status: "queued",
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) throw new Error("Connect event could not be queued");
    eventId = inserted.data.id;

    const graphVersion = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";
    const meta = await fetch(
      `https://graph.facebook.com/${graphVersion}/${channel.phone_number_id}/messages`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          authorization: `Bearer ${channel.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: waId,
          type: "template",
          template: {
            name: "nafsi_whatsapp_opt_in_v1",
            language: { code: input.locale },
            components: [],
          },
        }),
      },
    );
    const metaBody = (await meta.json()) as { messages?: Array<{ id: string }> };
    if (!meta.ok) {
      await db
        .from("communication_events")
        .update({
          status: "failed",
          attempts: 1,
          last_error: `Meta send failed (${meta.status})`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", eventId);
      return json({ error: "WhatsApp confirmation could not be sent" }, 502);
    }
    await db
      .from("communication_events")
      .update({
        status: "delivered",
        attempts: 1,
        metadata: {
          contactRef,
          destinationLabel,
          scopes: input.scopes,
          consentVersion: "nafsi-whatsapp-v1",
          waMessageId: metaBody.messages?.[0]?.id ?? null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    return json({ contactRef, receiptId: eventId, destinationLabel, status: "delivered" }, 202);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "Invalid Nafsi Connect contract" }, 422);
    if (eventId) console.error("Nafsi Connect event failed", eventId);
    return json(
      { error: error instanceof Error ? error.message : "Nafsi Connect unavailable" },
      Number((error as { status?: number })?.status) || 503,
    );
  }
}

export async function serveNafsiConnectEvents(request: Request) {
  try {
    const { db, row } = await connection(request);
    if (!(row.capabilities ?? []).includes("connect"))
      return json({ error: "Connect capability is not enabled" }, 403);
    if (!(await entitled(db, row.tenant_id, "omniqora.connect")))
      return json({ error: "Omniqora Connect entitlement is inactive" }, 403);
    const input = connectEventRequest.parse(JSON.parse(await bodyText(request)));
    if (input.externalTenantId !== row.external_tenant_id)
      return json({ error: "Tenant binding mismatch" }, 403);
    if (input.operation === "ack") {
      const result = await db
        .from("communication_events")
        .update({
          status: "delivered",
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("tenant_id", row.tenant_id)
        .eq("product_key", "nafsi")
        .eq("external_tenant_id", row.external_tenant_id)
        .eq("direction", "connect_to_source")
        .in("id", input.eventIds);
      if (result.error) throw new Error("Could not acknowledge Connect events");
      return json({ acknowledged: input.eventIds.length });
    }
    const claimed = await db.rpc("claim_nafsi_connect_events", {
      p_tenant_id: row.tenant_id,
      p_external_tenant_id: row.external_tenant_id,
      p_limit: input.limit,
    });
    if (claimed.error) throw new Error("Could not claim Connect events");
    const events = (claimed.data ?? []).map((raw: unknown) => {
      const event = raw as {
        id: string;
        event_type: string;
        recipient?: Record<string, unknown>;
        message?: Record<string, unknown>;
      };
      return {
        eventId: event.id,
        eventType: event.event_type,
        contactRef: event.recipient?.contactRef,
        ...(event.message?.command ? { command: event.message.command } : {}),
        ...(event.message?.receiptId ? { receiptId: event.message.receiptId } : {}),
        ...(event.message?.status ? { status: event.message.status } : {}),
        ...(event.message?.failureCode ? { failureCode: event.message.failureCode } : {}),
      };
    });
    return json({ events });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "Invalid Nafsi Connect event contract" }, 422);
    return json(
      { error: error instanceof Error ? error.message : "Nafsi Connect events unavailable" },
      Number((error as { status?: number })?.status) || 503,
    );
  }
}

type ParsedParityRecord = z.infer<typeof parityRecord>;
type ParsedSubscription = ParsedParityRecord["billing"]["subscriptions"][number];

function deriveEntitlement(
  subscriptions: ParsedSubscription[],
  trialEndsAt: string | null,
  evaluatedAt: string,
) {
  const accessStatuses = new Set([
    "active",
    "trialing",
    "grace_period",
    "past_due",
    "billing_issue",
    "cancelled",
    "canceled",
  ]);
  const paid = [...subscriptions]
    .filter((subscription) => {
      if (!accessStatuses.has(subscription.status)) return false;
      const until = subscription.graceExpiresAt || subscription.expiresAt;
      return until
        ? Date.parse(until) > Date.parse(evaluatedAt)
        : ["active", "trialing"].includes(subscription.status);
    })
    .sort((left, right) => Number(right.tier === "advanced") - Number(left.tier === "advanced"))[0];
  if (paid)
    return {
      tier: paid.tier,
      subscribed: true,
      status: paid.status,
      billingInterval: paid.interval,
      expiresAt: paid.graceExpiresAt || paid.expiresAt,
      cancelAtPeriodEnd: paid.cancelAtPeriodEnd || ["cancelled", "canceled"].includes(paid.status),
    };
  if (trialEndsAt && Date.parse(trialEndsAt) > Date.parse(evaluatedAt))
    return {
      tier: "trial",
      subscribed: false,
      status: "trialing",
      billingInterval: null,
      expiresAt: trialEndsAt,
      cancelAtPeriodEnd: false,
    };
  return {
    tier: "free",
    subscribed: false,
    status: "free",
    billingInterval: null,
    expiresAt: null,
    cancelAtPeriodEnd: false,
  };
}

export async function serveNafsiParity(request: Request) {
  try {
    const { db, row } = await connection(request);
    if (!(row.capabilities ?? []).includes("parity"))
      return json({ error: "Parity capability is not enabled" }, 403);
    const input = parityRequest.parse(JSON.parse(await bodyText(request, 262144)));
    if (input.externalTenantId !== row.external_tenant_id)
      return json({ error: "Tenant binding mismatch" }, 403);
    if (request.headers.get("idempotency-key") !== input.batchId)
      return json({ error: "Idempotency key mismatch" }, 422);
    const [identityEnabled, paymentsEnabled] = await Promise.all([
      entitled(db, row.tenant_id, "omniqora.identity"),
      entitled(db, row.tenant_id, "omniqora.payments"),
    ]);
    const results: Array<{
      subjectRef: string;
      scope: "identity" | "entitlement" | "billing";
      localFingerprint: string;
      factoryFingerprint: string | null;
      status: "matched" | "mismatch" | "error";
      reasonCodes: string[];
    }> = [];
    const receiptRows: Array<Record<string, unknown>> = [];
    for (const record of input.records) {
      const subjectHash = fingerprintOf(record.subjectRef);
      const identityBase = {
        accountState: record.identity.accountState,
        emailVerified: record.identity.emailVerified,
        authMethod: record.identity.authMethod,
      };
      const billingBase = {
        evaluatedAt: record.billing.evaluatedAt,
        trialEndsAt: record.billing.trialEndsAt,
        subscriptions: [...record.billing.subscriptions].sort((left, right) =>
          `${left.provider}:${left.tier}`.localeCompare(`${right.provider}:${right.tier}`),
        ),
      };
      const outputs = {
        identity: fingerprintOf(identityBase),
        entitlement: fingerprintOf(
          deriveEntitlement(
            billingBase.subscriptions,
            billingBase.trialEndsAt,
            billingBase.evaluatedAt,
          ),
        ),
        billing: fingerprintOf(billingBase),
      };
      for (const scope of input.scopes) {
        const localFingerprint = record[scope].localFingerprint;
        const serviceEnabled = scope === "billing" ? paymentsEnabled : identityEnabled;
        const reasonCodes = serviceEnabled
          ? outputs[scope] === localFingerprint
            ? []
            : ["fingerprint_mismatch"]
          : [scope === "billing" ? "payments_service_inactive" : "identity_service_inactive"];
        const status = serviceEnabled
          ? outputs[scope] === localFingerprint
            ? ("matched" as const)
            : ("mismatch" as const)
          : ("error" as const);
        results.push({
          subjectRef: record.subjectRef,
          scope,
          localFingerprint,
          factoryFingerprint: serviceEnabled ? outputs[scope] : null,
          status,
          reasonCodes,
        });
        receiptRows.push({
          tenant_id: row.tenant_id,
          product_connection_id: row.id,
          external_tenant_id: row.external_tenant_id,
          batch_id: input.batchId,
          subject_hash: subjectHash,
          scope,
          input_fingerprint: localFingerprint,
          output_fingerprint: serviceEnabled ? outputs[scope] : null,
          status,
          reason_codes: reasonCodes,
          release_sha: input.releaseSha,
        });
      }
    }
    if (receiptRows.length) {
      // Generated database types intentionally lag this migration-owned evidence table.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parityDb = db as any;
      const stored = await parityDb.from("nafsi_parity_receipts").upsert(receiptRows, {
        onConflict: "tenant_id,batch_id,subject_hash,scope",
      });
      if (stored.error) throw new Error("Could not store parity receipts");
    }
    return json({
      receiptId: `nafsi-parity:${input.batchId}`,
      mode: "shadow",
      authoritySource: "nafsi",
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "Invalid Nafsi parity contract" }, 422);
    return json(
      { error: error instanceof Error ? error.message : "Nafsi parity route unavailable" },
      Number((error as { status?: number })?.status) || 503,
    );
  }
}
