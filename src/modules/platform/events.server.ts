import { z } from "zod";
import { parseEventEnvelope } from "./events";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "./service-identity";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

type ServiceCredentialRow = {
  id: string;
  key_id: string;
  secret_hash: string;
  status: "active" | "disabled" | "expired";
  expires_at: string | null;
  scopes: unknown;
};

function toCredential(row: ServiceCredentialRow): ServiceCredentialRecord {
  const scopes = z.array(z.object({
    tenantId: z.string().uuid(),
    productKey: z.string().min(1),
    tenantProductId: z.string().uuid().optional().nullable(),
    locationIds: z.array(z.string().uuid()).optional(),
    capabilities: z.array(z.string().min(1)),
  })).parse(row.scopes);

  return {
    id: row.id,
    keyId: row.key_id,
    secretHash: row.secret_hash,
    status: row.status,
    expiresAt: row.expires_at,
    scopes,
  };
}

export async function servePlatformEvent(request: Request) {
  try {
    const { keyId, secret } = parseServiceAuthorization(request.headers.get("authorization"));
    const raw = await request.text();
    if (raw.length > 262_144) return response({ error: "Event payload too large" }, 413);

    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return response({ error: "Invalid JSON" }, 400);
    }

    const event = parseEventEnvelope(input);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from(table: string): {
        select(columns: string): any;
        insert(values: unknown): any;
        update(values: unknown): any;
      };
    };

    const { data: row, error } = await db
      .from("platform_service_credentials")
      .select("id,key_id,secret_hash,status,expires_at,scopes")
      .eq("key_id", keyId)
      .maybeSingle();

    if (error || !row) return response({ error: "Service credential refused" }, 401);
    const credential = toCredential(row as ServiceCredentialRow);
    if (!verifyServiceSecret(secret, credential.secretHash)) {
      return response({ error: "Service credential refused" }, 401);
    }

    authoriseServiceScope(
      credential,
      {
        tenantId: event.scope.tenantId,
        productKey: event.source.productKey,
        tenantProductId: event.scope.tenantProductId,
        locationId: event.scope.locationId,
        capability: "events.write",
      },
    );

    const { data: existing } = await db
      .from("platform_events")
      .select("id")
      .eq("tenant_id", event.scope.tenantId)
      .eq("product_key", event.source.productKey)
      .eq("idempotency_key", event.idempotencyKey)
      .maybeSingle();

    if (existing?.id) {
      await db
        .from("platform_service_credentials")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", credential.id);
      return response({ id: existing.id, status: "accepted", idempotent: true }, 200);
    }

    const { error: insertError } = await db.from("platform_events").insert({
      id: event.id,
      tenant_id: event.scope.tenantId,
      tenant_product_id: event.scope.tenantProductId ?? null,
      product_key: event.source.productKey,
      event_type: event.type,
      event_version: event.version,
      occurred_at: event.occurredAt,
      environment: event.source.environment,
      subject_type: event.subject?.type ?? null,
      subject_id: event.subject?.id ?? null,
      location_id: event.scope.locationId ?? null,
      workspace_id: event.scope.workspaceId ?? null,
      actor_user_id: event.scope.userId ?? null,
      correlation_id: event.correlationId ?? null,
      causation_id: event.causationId ?? null,
      idempotency_key: event.idempotencyKey,
      data_classification: event.dataClassification,
      payload: event.payload,
    });

    if (insertError) return response({ error: "Event could not be accepted" }, 503);

    await db
      .from("platform_service_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", credential.id);

    return response({ id: event.id, status: "accepted" }, 202);
  } catch (error) {
    if (error instanceof z.ZodError) return response({ error: "Invalid event contract" }, 422);
    const message = error instanceof Error ? error.message : "Platform event refused";
    if (/credential|scope|authorization|expired/i.test(message)) return response({ error: message }, 403);
    return response({ error: "Platform event service unavailable" }, 503);
  }
}
