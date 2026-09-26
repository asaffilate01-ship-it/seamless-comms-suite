import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { automotiveProduct, automotiveWebhookEnvelopeSchema } from "./contracts";
import { verifyAutomotiveWebhook } from "./webhooks.server";

const inboundConfigSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/),
  tenantId: z.string().uuid(),
  product: automotiveProduct,
  secretEnv: z.string().regex(/^OQ_AUTOMOTIVE_[A-Z0-9_]+$/),
  enabled: z.boolean(),
}).strict();

type InboundConfig = z.infer<typeof inboundConfigSchema>;

function configs(): InboundConfig[] {
  return z.array(inboundConfigSchema).max(500).parse(
    JSON.parse(process.env.OMNIQORA_AUTOMOTIVE_WEBHOOKS_JSON ?? "[]"),
  );
}

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function rawJsonBody(request: Request, maxBytes = 1024 * 1024) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    throw Object.assign(new Error("JSON content type required"), { status: 415 });
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw Object.assign(new Error("Payload too large"), { status: 413 });
  }
  return body;
}

function configFor(connectionId: string) {
  const match = configs().find((item) => item.id === connectionId && item.enabled);
  if (!match) throw Object.assign(new Error("Unknown or inactive automotive connection"), { status: 401 });
  const secret = process.env[match.secretEnv];
  if (!secret || secret.length < 32) {
    throw Object.assign(new Error("Automotive connection credential is unavailable"), { status: 503 });
  }
  return { ...match, secret };
}

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error("Automotive persistence is unavailable"), { status: 503 });
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function receiveAutomotiveWebhook(request: Request, connectionId: string) {
  try {
    const connection = configFor(connectionId);
    const raw = await rawJsonBody(request);
    const envelope = verifyAutomotiveWebhook(connection.secret, raw, request.headers);
    automotiveWebhookEnvelopeSchema.parse(envelope);

    if (envelope.tenantId !== connection.tenantId || envelope.product !== connection.product) {
      return response({ error: "Webhook tenant or product does not match connection" }, 403);
    }

    const client = serviceClient();
    const record = {
      tenant_id: envelope.tenantId,
      event_id: envelope.id,
      connection_id: connection.id,
      product: envelope.product,
      event_type: envelope.type,
      occurred_at: envelope.occurredAt,
      payload: envelope,
      status: "received",
    };

    const { error } = await client.from("automotive_inbound_events").insert(record);
    if (error) {
      // Duplicate event IDs are deliberately acknowledged so retries are idempotent.
      if (error.code === "23505") return response({ accepted: true, duplicate: true, eventId: envelope.id }, 200);
      throw error;
    }

    return response({ accepted: true, duplicate: false, eventId: envelope.id }, 202);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error
      ? Number((error as { status: unknown }).status)
      : error instanceof z.ZodError
        ? 422
        : 401;
    const safeStatus = [400,401,403,413,415,422,503].includes(status) ? status : 503;
    return response({ error: safeStatus === 503 ? "Automotive webhook service unavailable" : "Automotive webhook rejected" }, safeStatus);
  }
}
