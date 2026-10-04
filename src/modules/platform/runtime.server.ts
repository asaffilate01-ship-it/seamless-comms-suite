/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase generated types lag the platform kernel migrations. */
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "./service-identity";
import { eventMatches, platformEventInputSchema, usageInputSchema } from "./events";
import { optimiseFleetRoutes, optimiseRoute } from "@/modules/dispatch/routing";

const routingInputSchema = z
  .object({
    tenantId: z.string().uuid(),
    productKey: z.string().min(2).max(80),
    origin: z
      .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
      .strict(),
    stops: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
            serviceSeconds: z.number().int().min(0).max(86400).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

const constrainedStopSchema = z
  .object({
    id: z.string().min(1).max(200),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    serviceSeconds: z.number().int().min(0).max(86400).optional(),
    demand: z.number().min(0).max(1_000_000).optional(),
    priority: z.number().int().min(0).max(100).optional(),
    requiredSkills: z.array(z.string().min(1).max(80)).max(50).optional(),
    windowStart: z.string().datetime().optional(),
    windowEnd: z.string().datetime().optional(),
  })
  .strict();

const routingBatchInputSchema = z
  .object({
    tenantId: z.string().uuid(),
    productKey: z.string().min(2).max(80),
    planningTime: z.string().datetime().optional(),
    resources: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            origin: z
              .object({
                latitude: z.number().min(-90).max(90),
                longitude: z.number().min(-180).max(180),
              })
              .strict(),
            capacity: z.number().min(0).max(1_000_000).optional(),
            skills: z.array(z.string().min(1).max(80)).max(100).optional(),
            availableFrom: z.string().datetime().optional(),
            availableUntil: z.string().datetime().optional(),
            averageSpeedKph: z.number().positive().max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(250),
    stops: z.array(constrainedStopSchema).min(1).max(2_000),
  })
  .strict();

const routingProposalInputSchema = routingBatchInputSchema.extend({
  externalRouteId: z.string().min(1).max(200),
  inputFingerprint: z.string().min(16).max(128),
});

const routingProposalGetSchema = z
  .object({
    tenantId: z.string().uuid(),
    productKey: z.string().min(2).max(80),
    proposalId: z.string().uuid(),
  })
  .strict();

const maintenanceInputSchema = z
  .object({
    tenantId: z.string().uuid(),
    productKey: z.string().min(2).max(80),
  })
  .strict();

const intelligenceProposalSchema = z
  .object({
    tenantId: z.string().uuid(),
    productKey: z.string().min(2).max(80),
    recommendationType: z.enum([
      "sla_risk",
      "capacity_risk",
      "route_efficiency",
      "maintenance_risk",
      "exception_cluster",
    ]),
    subjectType: z.enum([
      "external_dispatch_job",
      "dispatch_exception",
      "delivery_route",
      "vehicle",
      "tenant_operations",
    ]),
    subjectId: z.string().min(1).max(200),
    confidence: z.number().min(0).max(1),
    evidenceRefs: z
      .array(
        z
          .object({
            kind: z.enum([
              "sla_exception",
              "route_evaluation",
              "maintenance_order",
              "aggregate_metric",
            ]),
            id: z.string().min(1).max(200),
            observedAt: z.string().datetime(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    action: z.enum([
      "review_dispatch_exception",
      "adjust_sla_policy",
      "investigate_capacity",
      "inspect_route_constraints",
      "schedule_maintenance",
    ]),
    reasonCodes: z
      .array(
        z.enum([
          "acceptance_delay",
          "arrival_delay",
          "completion_delay",
          "repeated_exception",
          "capacity_shortfall",
          "route_regression",
          "maintenance_overdue",
        ]),
      )
      .min(1)
      .max(10),
    metrics: z
      .record(z.string().min(1).max(80), z.number().finite())
      .refine((value) => Object.keys(value).length <= 30, "At most 30 metrics are allowed")
      .default({}),
    model: z
      .object({
        provider: z.string().min(1).max(80),
        modelKey: z.string().min(1).max(120),
        policyKey: z.string().min(1).max(120),
        promptTemplateVersion: z.string().min(1).max(80),
      })
      .strict(),
    expiresAt: z.string().datetime(),
    dataClassification: z.literal("aggregate_only"),
  })
  .strict();

const requestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("event.emit"), event: platformEventInputSchema }).strict(),
  z.object({ operation: z.literal("usage.record"), usage: usageInputSchema }).strict(),
  z.object({ operation: z.literal("routing.optimise"), routing: routingInputSchema }).strict(),
  z
    .object({ operation: z.literal("routing.optimiseBatch"), routing: routingBatchInputSchema })
    .strict(),
  z
    .object({ operation: z.literal("routing.proposeBatch"), routing: routingProposalInputSchema })
    .strict(),
  z
    .object({ operation: z.literal("routing.proposal.get"), routing: routingProposalGetSchema })
    .strict(),
  z
    .object({ operation: z.literal("intelligence.propose"), proposal: intelligenceProposalSchema })
    .strict(),
  z
    .object({ operation: z.literal("maintenance.run"), maintenance: maintenanceInputSchema })
    .strict(),
]);

const routingShadowEventSchema = z
  .object({
    routeId: z.string().min(1).max(200),
    engine: z.string().min(1).max(120),
    stopCount: z.number().int().nonnegative(),
    sourceDistanceKm: z.number().nonnegative(),
    candidateDistanceKm: z.number().nonnegative(),
    sequenceMatchRatio: z.number().min(0).max(1),
    passed: z.boolean(),
  })
  .passthrough();

const routeProposalAppliedEventSchema = z
  .object({
    proposalId: z.string().uuid(),
    routeId: z.string().min(1).max(200),
    planHash: z.string().regex(/^[a-f0-9]{64}$/),
    appliedAt: z.string().datetime(),
  })
  .strict();

const externalJobStatusEventSchema = z
  .object({
    jobId: z.string().min(1).max(200),
    jobType: z.string().min(1).max(80).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    status: z.string().min(1).max(80),
    createdAt: z.string().datetime().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    etaAt: z.string().datetime().nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    progress: z.number().min(0).max(1).nullable().optional(),
  })
  .strict();

const externalPodEventSchema = z
  .object({
    jobId: z.string().min(1).max(200),
    methods: z.array(z.enum(["otp", "signature", "photo", "scan", "recipient"])).max(10),
    evidenceCount: z.number().int().min(0).max(100),
    capturedAt: z.string().datetime(),
  })
  .strict();

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
  const { data: row, error } = await db
    .from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes")
    .eq("key_id", keyId)
    .maybeSingle();
  if (error || !row || !verifyServiceSecret(secret, row.secret_hash)) {
    throw new Error("Service credential refused");
  }
  const scopes = z
    .array(
      z.object({
        tenantId: z.string().uuid(),
        productKey: z.string().min(2),
        brandIds: z.array(z.string().uuid()).optional(),
        locationIds: z.array(z.string().uuid()).optional(),
        capabilities: z.array(z.string()),
      }),
    )
    .parse(row.scopes);
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
  const { data, error } = await db
    .from("tenant_products")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("product_key", productKey)
    .maybeSingle();
  if (error || !data || data.status !== "active") throw new Error("Active tenant product required");
}

async function projectFleetoraEvent(db: any, event: z.infer<typeof platformEventInputSchema>) {
  if (event.eventType === "fleet.route.shadow_compared") {
    const evidence = routingShadowEventSchema.parse(event.payload);
    const projected = await db.from("routing_shadow_evaluations").upsert(
      {
        tenant_id: event.tenantId,
        product_key: event.productKey,
        source_route_id: evidence.routeId,
        candidate_engine: evidence.engine,
        source_distance_km: evidence.sourceDistanceKm,
        candidate_distance_km: evidence.candidateDistanceKm,
        stop_count: evidence.stopCount,
        sequence_match_ratio: evidence.sequenceMatchRatio,
        passed: evidence.passed,
        evidence: {
          eventIdempotencyKey: event.idempotencyKey,
          sourceService: event.sourceService ?? null,
          occurredAt: event.occurredAt ?? null,
        },
        evaluated_at: event.occurredAt ?? new Date().toISOString(),
      },
      { onConflict: "tenant_id,product_key,source_route_id,candidate_engine" },
    );
    if (projected.error) throw new Error(projected.error.message);
    return;
  }

  if (event.eventType === "fleet.route.proposal_applied") {
    const applied = routeProposalAppliedEventSchema.parse(event.payload);
    const projected = await db.rpc("project_routing_proposal_applied", {
      _tenant: event.tenantId,
      _product: event.productKey,
      _proposal: applied.proposalId,
      _external_route: applied.routeId,
      _plan_hash: applied.planHash,
      _applied_at: applied.appliedAt,
    });
    if (projected.error) throw new Error(projected.error.message);
    return;
  }

  if (event.eventType === "fleet.job.status_changed") {
    const status = externalJobStatusEventSchema.parse(event.payload);
    const occurredAt = event.occurredAt ?? new Date().toISOString();
    const lifecycle = await db.rpc("project_external_dispatch_status", {
      _tenant: event.tenantId,
      _product: event.productKey,
      _job: status.jobId,
      _job_type: status.jobType ?? "delivery",
      _priority: status.priority ?? "normal",
      _status: status.status,
      _source_created_at: status.createdAt ?? occurredAt,
      _scheduled_at: status.scheduledAt ?? null,
      _occurred_at: occurredAt,
    });
    if (lifecycle.error) throw new Error(lifecycle.error.message);
    const tracked = await db.from("tracking_snapshots").upsert(
      {
        tenant_id: event.tenantId,
        subject_type: "external_dispatch_job",
        subject_id: status.jobId,
        status: status.status,
        eta_at: status.etaAt ?? null,
        latitude: status.latitude ?? null,
        longitude: status.longitude ?? null,
        progress: status.progress ?? null,
        public_payload: { productKey: event.productKey },
        updated_at: occurredAt,
      },
      { onConflict: "tenant_id,subject_type,subject_id" },
    );
    if (tracked.error) throw new Error(tracked.error.message);
    return;
  }

  if (event.eventType === "fleet.pod.completed") {
    const pod = externalPodEventSchema.parse(event.payload);
    const projected = await db.from("external_pod_receipts").upsert(
      {
        tenant_id: event.tenantId,
        product_key: event.productKey,
        external_job_id: pod.jobId,
        methods: pod.methods,
        evidence_count: pod.evidenceCount,
        captured_at: pod.capturedAt,
        source_event_key: event.idempotencyKey,
        metadata: { sourceService: event.sourceService ?? null },
      },
      { onConflict: "tenant_id,product_key,external_job_id" },
    );
    if (projected.error) throw new Error(projected.error.message);
  }
}

export async function servePlatformRuntime(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 262144) return reply({ error: "Payload too large" }, 413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return reply({ error: "Invalid JSON" }, 400);
    }
    const input = requestSchema.parse(parsed);
    const { db, credential } = await authenticate(request);

    if (input.operation === "maintenance.run") {
      const maintenance = input.maintenance;
      authoriseServiceScope(credential, {
        tenantId: maintenance.tenantId,
        productKey: maintenance.productKey,
        capability: "operations.maintain",
      });
      await assertActiveProduct(db, maintenance.tenantId, maintenance.productKey);
      const result = await db.rpc("run_fleetora_maintenance", {
        _tenant: maintenance.tenantId,
        _product: maintenance.productKey,
      });
      if (result.error) throw new Error(result.error.message);
      await db
        .from("platform_service_credentials")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", credential.id);
      return reply({ maintenance: result.data }, 200);
    }

    if (input.operation === "routing.optimise") {
      const routing = input.routing;
      authoriseServiceScope(credential, {
        tenantId: routing.tenantId,
        productKey: routing.productKey,
        capability: "routing.execute",
      });
      await assertActiveProduct(db, routing.tenantId, routing.productKey);
      const plan = optimiseRoute(routing.origin, routing.stops);
      await db
        .from("platform_service_credentials")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", credential.id);
      return reply({ plan }, 200);
    }

    if (input.operation === "routing.optimiseBatch") {
      const routing = input.routing;
      authoriseServiceScope(credential, {
        tenantId: routing.tenantId,
        productKey: routing.productKey,
        capability: "routing.execute",
      });
      await assertActiveProduct(db, routing.tenantId, routing.productKey);
      const plan = optimiseFleetRoutes(routing.resources, routing.stops, routing.planningTime);
      await db
        .from("platform_service_credentials")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", credential.id);
      return reply({ plan }, 200);
    }

    if (input.operation === "routing.proposeBatch") {
      const routing = input.routing;
      authoriseServiceScope(credential, {
        tenantId: routing.tenantId,
        productKey: routing.productKey,
        capability: "routing.execute",
      });
      await assertActiveProduct(db, routing.tenantId, routing.productKey);
      const existing = await db
        .from("routing_plan_proposals")
        .select("id,status,plan_hash,plan,reviewed_at,applied_at,expires_at")
        .eq("tenant_id", routing.tenantId)
        .eq("product_key", routing.productKey)
        .eq("external_route_id", routing.externalRouteId)
        .eq("input_fingerprint", routing.inputFingerprint)
        .in("status", ["review", "approved"])
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) return reply({ proposal: existing.data, idempotent: true });

      const plan = optimiseFleetRoutes(routing.resources, routing.stops, routing.planningTime);
      const planHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
      const superseded = await db
        .from("routing_plan_proposals")
        .update({ status: "superseded", updated_at: new Date().toISOString() })
        .eq("tenant_id", routing.tenantId)
        .eq("product_key", routing.productKey)
        .eq("external_route_id", routing.externalRouteId)
        .in("status", ["review", "approved"]);
      if (superseded.error) throw new Error(superseded.error.message);
      const inserted = await db
        .from("routing_plan_proposals")
        .insert({
          tenant_id: routing.tenantId,
          product_key: routing.productKey,
          external_route_id: routing.externalRouteId,
          input_fingerprint: routing.inputFingerprint,
          plan_hash: planHash,
          engine: plan.engine,
          plan,
          status: "review",
          source_service: "platform.runtime",
        })
        .select("id,status,plan_hash,plan,reviewed_at,applied_at,expires_at")
        .single();
      if (inserted.error || !inserted.data) {
        const concurrent = await db
          .from("routing_plan_proposals")
          .select("id,status,plan_hash,plan,reviewed_at,applied_at,expires_at")
          .eq("tenant_id", routing.tenantId)
          .eq("product_key", routing.productKey)
          .eq("external_route_id", routing.externalRouteId)
          .eq("input_fingerprint", routing.inputFingerprint)
          .in("status", ["review", "approved"])
          .maybeSingle();
        if (concurrent.data) return reply({ proposal: concurrent.data, idempotent: true });
        throw new Error(inserted.error?.message ?? "Routing proposal could not be stored");
      }
      return reply({ proposal: inserted.data, idempotent: false }, 201);
    }

    if (input.operation === "routing.proposal.get") {
      const routing = input.routing;
      authoriseServiceScope(credential, {
        tenantId: routing.tenantId,
        productKey: routing.productKey,
        capability: "routing.execute",
      });
      await assertActiveProduct(db, routing.tenantId, routing.productKey);
      const proposal = await db
        .from("routing_plan_proposals")
        .select(
          "id,external_route_id,status,plan_hash,engine,plan,reviewed_at,applied_at,expires_at",
        )
        .eq("id", routing.proposalId)
        .eq("tenant_id", routing.tenantId)
        .eq("product_key", routing.productKey)
        .maybeSingle();
      if (proposal.error) throw new Error(proposal.error.message);
      if (!proposal.data) return reply({ error: "Routing proposal not found" }, 404);
      return reply({ proposal: proposal.data }, 200);
    }

    if (input.operation === "intelligence.propose") {
      const proposal = input.proposal;
      authoriseServiceScope(credential, {
        tenantId: proposal.tenantId,
        productKey: proposal.productKey,
        capability: "intelligence.propose",
      });
      await assertActiveProduct(db, proposal.tenantId, proposal.productKey);
      if (Date.parse(proposal.expiresAt) <= Date.now()) {
        return reply({ error: "Recommendation expiry must be in the future" }, 422);
      }
      const recommendation = {
        action: proposal.action,
        reasonCodes: proposal.reasonCodes,
        metrics: proposal.metrics,
        requiresHumanApproval: true,
        automaticApplicationAllowed: false,
      };
      const proposalHash = createHash("sha256")
        .update(
          JSON.stringify({
            tenantId: proposal.tenantId,
            productKey: proposal.productKey,
            recommendationType: proposal.recommendationType,
            subjectType: proposal.subjectType,
            subjectId: proposal.subjectId,
            confidence: proposal.confidence,
            evidenceRefs: proposal.evidenceRefs,
            recommendation,
            model: proposal.model,
          }),
        )
        .digest("hex");
      const existing = await db
        .from("operations_recommendations")
        .select("id,status,proposal_hash,expires_at,created_at")
        .eq("tenant_id", proposal.tenantId)
        .eq("product_key", proposal.productKey)
        .eq("proposal_hash", proposalHash)
        .in("status", ["review", "approved"])
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) return reply({ recommendation: existing.data, idempotent: true });
      const inserted = await db
        .from("operations_recommendations")
        .insert({
          tenant_id: proposal.tenantId,
          product_key: proposal.productKey,
          recommendation_type: proposal.recommendationType,
          subject_type: proposal.subjectType,
          subject_id: proposal.subjectId,
          source_kind: "ai_assisted",
          source_ref: proposal.evidenceRefs[0].id,
          confidence: proposal.confidence,
          evidence: proposal.evidenceRefs,
          recommendation,
          status: "review",
          proposal_hash: proposalHash,
          model_key: `${proposal.model.provider}:${proposal.model.modelKey}`,
          policy_key: proposal.model.policyKey,
          prompt_template_version: proposal.model.promptTemplateVersion,
          requested_by_service: credential.keyId,
          expires_at: proposal.expiresAt,
        })
        .select("id,status,proposal_hash,expires_at,created_at")
        .single();
      if (inserted.error || !inserted.data) {
        throw new Error(inserted.error?.message ?? "Recommendation could not be stored");
      }
      return reply({ recommendation: inserted.data, idempotent: false }, 201);
    }

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
      const existing = await db
        .from("platform_events")
        .select("id")
        .eq("tenant_id", event.tenantId)
        .eq("product_key", event.productKey)
        .eq("idempotency_key", event.idempotencyKey)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) {
        await projectFleetoraEvent(db, event);
        return reply({ id: existing.data.id, idempotent: true });
      }

      const inserted = await db
        .from("platform_events")
        .insert({
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
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data)
        throw new Error(inserted.error?.message ?? "Event could not be recorded");

      await projectFleetoraEvent(db, event);

      const subscriptions = await db
        .from("platform_event_subscriptions")
        .select("id,event_patterns,product_key")
        .eq("tenant_id", event.tenantId)
        .eq("status", "active");
      if (subscriptions.error) throw new Error(subscriptions.error.message);
      const matching = (subscriptions.data ?? []).filter(
        (subscription: any) =>
          (!subscription.product_key || subscription.product_key === event.productKey) &&
          (subscription.event_patterns ?? []).some((pattern: string) =>
            eventMatches(pattern, event.eventType),
          ),
      );
      if (matching.length) {
        const deliveries = matching.map((subscription: any) => ({
          event_id: inserted.data.id,
          subscription_id: subscription.id,
          tenant_id: event.tenantId,
          status: "queued",
        }));
        const delivery = await db.from("platform_event_deliveries").insert(deliveries);
        if (delivery.error && delivery.error.code !== "23505")
          throw new Error(delivery.error.message);
      }
      await db
        .from("platform_service_credentials")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", credential.id);
      return reply({ id: inserted.data.id, fanout: matching.length }, 201);
    }

    const usage = input.usage;
    authoriseServiceScope(credential, {
      tenantId: usage.tenantId,
      productKey: usage.productKey,
      capability: "usage.write",
    });
    await assertActiveProduct(db, usage.tenantId, usage.productKey);
    const existing = await db
      .from("usage_events")
      .select("id")
      .eq("tenant_id", usage.tenantId)
      .eq("product_key", usage.productKey)
      .eq("metric_key", usage.metricKey)
      .eq("idempotency_key", usage.idempotencyKey)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return reply({ id: existing.data.id, idempotent: true });

    const inserted = await db
      .from("usage_events")
      .insert({
        tenant_id: usage.tenantId,
        product_key: usage.productKey,
        service_key: usage.serviceKey ?? null,
        metric_key: usage.metricKey,
        quantity: usage.quantity,
        unit: usage.unit,
        idempotency_key: usage.idempotencyKey,
        occurred_at: usage.occurredAt ?? new Date().toISOString(),
        metadata: usage.metadata,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data)
      throw new Error(inserted.error?.message ?? "Usage could not be recorded");
    await db
      .from("platform_service_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", credential.id);
    return reply({ id: inserted.data.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError)
      return reply({ error: "Invalid platform runtime contract" }, 422);
    const message = error instanceof Error ? error.message : "Platform runtime refused";
    if (/credential|scope|authorization|expired|active tenant product/i.test(message))
      return reply({ error: message }, 403);
    return reply({ error: message }, 503);
  }
}
