/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase generated types lag the dispatch migrations. */
import { z } from "zod";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "@/modules/platform/service-identity";

const base = z.object({
  tenantId: z.string().uuid(),
  productKey: z.string().min(2),
  agentId: z.string().uuid(),
});
const schema = z.discriminatedUnion("operation", [
  base.extend({ operation: z.literal("jobs.list") }),
  base.extend({
    operation: z.literal("position.update"),
    jobId: z.string().uuid().nullish(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMetres: z.number().nonnegative().nullish(),
    speedKph: z.number().nonnegative().nullish(),
    headingDegrees: z.number().min(0).max(359.999).nullish(),
    observedAt: z.string().datetime(),
  }),
  base.extend({
    operation: z.literal("job.status"),
    jobId: z.string().uuid(),
    status: z.enum([
      "accepted",
      "en_route",
      "arrived",
      "in_progress",
      "collected",
      "en_route_dropoff",
      "arrived_dropoff",
      "completed",
      "failed",
    ]),
  }),
]);

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
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
        productKey: z.string(),
        brandIds: z.array(z.string()).optional(),
        locationIds: z.array(z.string()).optional(),
        capabilities: z.array(z.string()),
      }),
    )
    .parse(row.scopes);
  return {
    db,
    credential: {
      id: row.id,
      keyId: row.key_id,
      secretHash: row.secret_hash,
      status: row.status,
      expiresAt: row.expires_at,
      scopes,
    } as ServiceCredentialRecord,
  };
}

export async function serveAgent(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { db, credential } = await authenticate(request);
    const capability =
      input.operation === "jobs.list"
        ? "agent.jobs.read"
        : input.operation === "position.update"
          ? "agent.location.write"
          : "agent.jobs.write";
    authoriseServiceScope(credential, {
      tenantId: input.tenantId,
      productKey: input.productKey,
      capability,
    });
    const agent = await db
      .from("dispatch_agents")
      .select("id")
      .eq("id", input.agentId)
      .eq("tenant_id", input.tenantId)
      .eq("product_key", input.productKey)
      .maybeSingle();
    if (agent.error || !agent.data) throw new Error("Agent scope refused");

    if (input.operation === "jobs.list") {
      const { data, error } = await db
        .from("dispatch_jobs")
        .select("*,stops:dispatch_job_stops(*)")
        .eq("tenant_id", input.tenantId)
        .eq("product_key", input.productKey)
        .eq("assigned_agent_id", input.agentId)
        .not("status", "in", "(completed,failed,cancelled)")
        .order("scheduled_at");
      if (error) throw new Error(error.message);
      return reply({ jobs: data ?? [] });
    }

    if (input.operation === "position.update") {
      if (input.jobId) {
        const scopedJob = await db
          .from("dispatch_jobs")
          .select("id")
          .eq("id", input.jobId)
          .eq("tenant_id", input.tenantId)
          .eq("product_key", input.productKey)
          .eq("assigned_agent_id", input.agentId)
          .maybeSingle();
        if (scopedJob.error || !scopedJob.data) throw new Error("Assigned agent job scope refused");
      }
      const { error } = await db.from("dispatch_agent_positions").insert({
        tenant_id: input.tenantId,
        product_key: input.productKey,
        agent_id: input.agentId,
        job_id: input.jobId ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy_metres: input.accuracyMetres ?? null,
        speed_kph: input.speedKph ?? null,
        heading_degrees: input.headingDegrees ?? null,
        observed_at: input.observedAt,
      });
      if (error) throw new Error(error.message);
      if (input.jobId) {
        const tracked = await db.from("tracking_snapshots").upsert(
          {
            tenant_id: input.tenantId,
            subject_type: "dispatch_job",
            subject_id: input.jobId,
            status: "en_route",
            latitude: input.latitude,
            longitude: input.longitude,
            heading: input.headingDegrees ?? null,
            revision: Date.now(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,subject_type,subject_id" },
        );
        if (tracked.error) throw new Error(tracked.error.message);
      }
      return reply({ ok: true });
    }

    const { error } = await db.rpc("service_dispatch_update_status", {
      _tenant: input.tenantId,
      _product: input.productKey,
      _agent: input.agentId,
      _job: input.jobId,
      _status: input.status,
    });
    if (error) throw new Error(error.message);
    const tracked = await db.from("tracking_snapshots").upsert(
      {
        tenant_id: input.tenantId,
        subject_type: "dispatch_job",
        subject_id: input.jobId,
        status: input.status,
        revision: Date.now(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,subject_type,subject_id" },
    );
    if (tracked.error) throw new Error(tracked.error.message);
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return reply({ error: "Invalid agent contract" }, 422);
    const message = error instanceof Error ? error.message : "Agent request refused";
    return reply({ error: message }, /credential|scope|assigned agent/i.test(message) ? 403 : 503);
  }
}
