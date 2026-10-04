/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase generated types lag the dispatch migrations. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const uuid = z.string().uuid();
export const listDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => z.object({ tenantId: uuid }).parse(i))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const [jobs, agents, vehicles] = await Promise.all([
      db
        .from("dispatch_jobs")
        .select("*,stops:dispatch_job_stops(*)")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
      db.from("dispatch_agents").select("*").eq("tenant_id", data.tenantId).order("name"),
      db.from("dispatch_vehicles").select("*").eq("tenant_id", data.tenantId).order("registration"),
    ]);
    for (const r of [jobs, agents, vehicles]) if (r.error) throw new Error(r.error.message);
    return { jobs: jobs.data ?? [], agents: agents.data ?? [], vehicles: vehicles.data ?? [] };
  });
export const listRoutingProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => z.object({ tenantId: uuid }).parse(i))
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as any)
      .from("routing_plan_proposals")
      .select(
        "id,product_key,external_route_id,engine,status,plan_hash,plan,reviewed_at,expires_at,created_at",
      )
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (r.error) throw new Error(r.error.message);
    return r.data ?? [];
  });
export const reviewRoutingProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { proposalId: string; decision: string; note?: string | null }) =>
    z
      .object({
        proposalId: uuid,
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(1000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as any).rpc("review_routing_plan_proposal", {
      _proposal: data.proposalId,
      _decision: data.decision,
      _note: data.note ?? null,
    });
    if (r.error) throw new Error(r.error.message);
    return r.data;
  });
export const listOperationsControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => z.object({ tenantId: uuid }).parse(i))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const [policies, jobs, exceptions, recommendations] = await Promise.all([
      db
        .from("dispatch_sla_policies")
        .select("*")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false }),
      db
        .from("external_dispatch_jobs")
        .select("*")
        .eq("tenant_id", data.tenantId)
        .order("last_event_at", { ascending: false })
        .limit(200),
      db
        .from("dispatch_exceptions")
        .select("*")
        .eq("tenant_id", data.tenantId)
        .order("opened_at", { ascending: false })
        .limit(200),
      db
        .from("operations_recommendations")
        .select("*")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    for (const r of [policies, jobs, exceptions, recommendations])
      if (r.error) throw new Error(r.error.message);
    return {
      policies: policies.data ?? [],
      jobs: jobs.data ?? [],
      exceptions: exceptions.data ?? [],
      recommendations: recommendations.data ?? [],
    };
  });
const slaPolicy = z
  .object({
    tenantId: uuid,
    productKey: z.string().min(2).max(80),
    name: z.string().trim().min(2).max(160),
    jobType: z.string().trim().min(1).max(80).nullish(),
    priority: z.enum(["low", "normal", "high", "urgent"]).nullish(),
    acceptSeconds: z.number().int().positive().max(604800).nullish(),
    arriveSeconds: z.number().int().positive().max(604800).nullish(),
    completeSeconds: z.number().int().positive().max(2592000).nullish(),
  })
  .refine(
    (v) => v.acceptSeconds || v.arriveSeconds || v.completeSeconds,
    "At least one SLA threshold is required",
  );
export const createSlaPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof slaPolicy>) => slaPolicy.parse(i))
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as any)
      .from("dispatch_sla_policies")
      .insert({
        tenant_id: data.tenantId,
        product_key: data.productKey,
        name: data.name,
        job_type: data.jobType ?? null,
        priority: data.priority ?? null,
        accept_within_seconds: data.acceptSeconds ?? null,
        arrive_within_seconds: data.arriveSeconds ?? null,
        complete_within_seconds: data.completeSeconds ?? null,
        active: true,
        escalation: { humanReviewRequired: true },
      })
      .select("id")
      .single();
    if (r.error) throw new Error(r.error.message);
    return r.data;
  });
export const evaluateSlaOperations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; productKey: string }) =>
    z.object({ tenantId: uuid, productKey: z.string().min(2).max(80) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as any).rpc("evaluate_external_dispatch_slas", {
      _tenant: data.tenantId,
      _product: data.productKey,
    });
    if (r.error) throw new Error(r.error.message);
    return { evaluated: r.data as number };
  });
export const reviewDispatchException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { exceptionId: string; decision: string; note?: string | null }) =>
    z
      .object({
        exceptionId: uuid,
        decision: z.enum(["acknowledged", "resolved", "dismissed"]),
        note: z.string().max(1000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as any).rpc("review_dispatch_exception", {
      _exception: data.exceptionId,
      _decision: data.decision,
      _note: data.note ?? null,
    });
    if (r.error) throw new Error(r.error.message);
    return r.data;
  });
export const generateOperationsIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; productKey: string }) =>
    z.object({ tenantId: uuid, productKey: z.string().min(2).max(80) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as any).rpc("generate_operations_recommendations", {
      _tenant: data.tenantId,
      _product: data.productKey,
    });
    if (r.error) throw new Error(r.error.message);
    return { generated: r.data as number };
  });
export const reviewOperationsRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { recommendationId: string; decision: string; note?: string | null }) =>
    z
      .object({
        recommendationId: uuid,
        decision: z.enum(["approved", "dismissed"]),
        note: z.string().max(1000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as any).rpc("review_operations_recommendation", {
      _recommendation: data.recommendationId,
      _decision: data.decision,
      _note: data.note ?? null,
    });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
const create = z.object({
  tenantId: uuid,
  productKey: z.string(),
  locationId: uuid.nullish(),
  jobType: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  externalRef: z.string().max(200).nullish(),
  stops: z
    .array(
      z.object({
        kind: z.enum(["pickup", "dropoff", "service", "return"]),
        lat: z.number(),
        lng: z.number(),
        address: z.string().optional(),
        contactName: z.string().optional(),
        contactPhone: z.string().optional(),
        instructions: z.string().optional(),
      }),
    )
    .min(1),
});
export const createDispatchJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof create>) => create.parse(i))
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as any).rpc("dispatch_create_job", {
      _tenant: data.tenantId,
      _product: data.productKey,
      _location: data.locationId ?? null,
      _job_type: data.jobType,
      _priority: data.priority,
      _external_ref: data.externalRef ?? null,
      _metadata: {},
      _stops: data.stops,
    });
    if (r.error) throw new Error(r.error.message);
    return { jobId: r.data as string };
  });
export const createTrackingToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { tenantId: string; subjectType: string; subjectId: string; hours?: number }) =>
      z
        .object({
          tenantId: uuid,
          subjectType: z.string().min(1).max(80),
          subjectId: z.string().min(1).max(200),
          hours: z.number().int().min(1).max(168).default(24),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const hash = createHash("sha256").update(token).digest("hex");
    const exp = new Date(Date.now() + data.hours * 3600000).toISOString();
    const { error } = await db.from("public_tracking_tokens").insert({
      tenant_id: data.tenantId,
      subject_type: data.subjectType,
      subject_id: data.subjectId,
      token_hash: hash,
      expires_at: exp,
    });
    if (error) throw new Error(error.message);
    return { token, expiresAt: exp };
  });

const agentSchema = z.object({
  tenantId: uuid,
  productKey: z.string().min(2).max(80),
  name: z.string().trim().min(1).max(160),
  agentRole: z.string().trim().min(1).max(80).default("driver"),
  skills: z.array(z.string().max(80)).max(50).default([]),
  phone: z.string().max(40).nullish(),
});
export const createDispatchAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof agentSchema>) => agentSchema.parse(i))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const { data: row, error } = await db
      .from("dispatch_agents")
      .insert({
        tenant_id: data.tenantId,
        product_key: data.productKey,
        name: data.name,
        agent_role: data.agentRole,
        status: "available",
        skills: data.skills,
        phone: data.phone ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
const vehicleSchema = z.object({
  tenantId: uuid,
  productKey: z.string().min(2).max(80),
  registration: z.string().trim().max(40).nullish(),
  vehicleType: z.string().trim().min(1).max(80),
  capacity: z.number().nonnegative().nullish(),
});
export const createDispatchVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof vehicleSchema>) => vehicleSchema.parse(i))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const { data: row, error } = await db
      .from("dispatch_vehicles")
      .insert({
        tenant_id: data.tenantId,
        product_key: data.productKey,
        registration: data.registration ?? null,
        vehicle_type: data.vehicleType,
        capacity: data.capacity ?? null,
        status: "available",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
export const assignDispatchJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { jobId: string; agentId: string; vehicleId?: string | null }) =>
    z.object({ jobId: uuid, agentId: uuid, vehicleId: uuid.nullish() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as any).rpc("dispatch_assign_job", {
      _job: data.jobId,
      _agent: data.agentId,
      _vehicle: data.vehicleId ?? null,
    });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
export const updateDispatchStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { jobId: string; status: string }) =>
    z
      .object({
        jobId: uuid,
        status: z.enum([
          "unassigned",
          "offered",
          "assigned",
          "accepted",
          "en_route",
          "arrived",
          "in_progress",
          "collected",
          "en_route_dropoff",
          "arrived_dropoff",
          "completed",
          "failed",
          "cancelled",
        ]),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as any).rpc("dispatch_update_status", {
      _job: data.jobId,
      _status: data.status,
    });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
