import { z } from "zod";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "@/modules/platform/service-identity";
import { growthProductSchema } from "./studio.contract";

const MAX_BODY_BYTES = 65_536;
const uuid = z.string().uuid();
const scope = z.object({
  tenantId: uuid,
  productKey: growthProductSchema,
  // Every operation addresses one Studio brand. Omitting this must never turn
  // a brand-restricted credential into a product-wide credential.
  brandId: uuid,
});
const sourceUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  });
const requestSchema = z
  .discriminatedUnion("operation", [
    scope
      .extend({
        operation: z.literal("evidence.ingest"),
        externalRef: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(200),
        content: z.string().trim().min(3).max(12_000),
        sourceUrl: sourceUrl.nullish(),
        kind: z.enum([
          "brand_fact",
          "competitor_ad",
          "customer_feedback",
          "product_data",
          "affiliate_offer",
        ]),
        validUntil: z.string().datetime({ offset: true }).nullish(),
      })
      .strict(),
    scope.extend({ operation: z.literal("campaigns.export"), runId: uuid }).strict(),
    scope.extend({ operation: z.literal("campaigns.get"), runId: uuid }).strict(),
  ])
  .superRefine((value, ctx) => {
    if (value.operation !== "evidence.ingest") return;
    if (["product_data", "affiliate_offer"].includes(value.kind) && !value.validUntil) {
      ctx.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "A validity date is required.",
      });
    }
    if (value.validUntil && Date.parse(value.validUntil) <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Evidence must still be valid.",
      });
    }
  });

const credentialScopes = z
  .array(
    z.object({
      tenantId: uuid,
      productKey: z.string().min(2).max(80),
      brandIds: z.array(uuid).max(500).optional(),
      locationIds: z.array(uuid).max(500).optional(),
      capabilities: z.array(z.string().max(120)).max(100),
    }),
  )
  .max(500);

class GatewayError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

/** Bound bytes while streaming; Content-Length alone is not a trustworthy limit. */
async function readBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new GatewayError("unsupported_media_type", 415, "Use application/json.");
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new GatewayError("payload_too_large", 413, "The request exceeds 64 KiB.");
  }
  if (!request.body)
    throw new GatewayError("invalid_json", 400, "A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new GatewayError("payload_too_large", 413, "The request exceeds 64 KiB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new GatewayError("invalid_json", 400, "The request body must be valid JSON.");
  }
}

async function authenticate(request: Request) {
  let parsed: ReturnType<typeof parseServiceAuthorization>;
  try {
    parsed = parseServiceAuthorization(request.headers.get("authorization"));
  } catch {
    throw new GatewayError("growth_access_denied", 403, "Growth service access was denied.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as import("@supabase/supabase-js").SupabaseClient;
  const { data: row, error } = await db
    .from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes")
    .eq("key_id", parsed.keyId)
    .maybeSingle();
  if (error)
    throw new GatewayError("growth_unavailable", 503, "Growth service is temporarily unavailable.");
  try {
    if (
      !row ||
      typeof row.secret_hash !== "string" ||
      !verifyServiceSecret(parsed.secret, row.secret_hash)
    )
      throw new Error();
    if (row.status !== "active") throw new Error();
    if (
      row.expires_at &&
      (!Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now())
    )
      throw new Error();
    const scopes = credentialScopes.parse(row.scopes);
    const credential: ServiceCredentialRecord = {
      id: uuid.parse(row.id),
      keyId: row.key_id,
      secretHash: row.secret_hash,
      status: "active",
      expiresAt: row.expires_at,
      scopes,
    };
    return { db, credential };
  } catch {
    throw new GatewayError("growth_access_denied", 403, "Growth service access was denied.");
  }
}

function rpcFailure(error: { code?: string } | null) {
  if (!error) return;
  if (["28000", "42501"].includes(error.code ?? "")) {
    throw new GatewayError("growth_access_denied", 403, "Growth service access was denied.");
  }
  if (error.code === "P0002")
    throw new GatewayError(
      "growth_not_available",
      404,
      "The requested Growth item is not available.",
    );
  if (error.code === "40001")
    throw new GatewayError(
      "growth_stale",
      409,
      "Campaign inputs changed or expired. Regenerate and approve the campaign.",
    );
  if (["22023", "22007", "23514"].includes(error.code ?? "")) {
    throw new GatewayError(
      "invalid_growth_request",
      422,
      "The request does not meet the Growth contract.",
    );
  }
  // Never forward SQL text, internal schema names, provider payloads or secrets.
  throw new GatewayError("growth_unavailable", 503, "Growth service is temporarily unavailable.");
}

/** Server-to-server ingress and approved output only; this handler never publishes. */
export async function serveGrowthService(request: Request) {
  try {
    const input = requestSchema.parse(await readBody(request));
    const { db, credential } = await authenticate(request);
    const capability =
      input.operation === "evidence.ingest" ? "growth.evidence.write" : "growth.campaigns.read";
    try {
      // Studio brands do not yet have a verified mapping to product locations.
      // Discard location-restricted scopes instead of treating an omitted
      // location as permission to access the entire brand.
      authoriseServiceScope(
        {
          ...credential,
          scopes: credential.scopes.filter((item) => !item.locationIds?.length),
        },
        {
          tenantId: input.tenantId,
          productKey: input.productKey,
          brandId: input.brandId,
          capability,
        },
      );
    } catch {
      throw new GatewayError("growth_access_denied", 403, "Growth service access was denied.");
    }
    const args = {
      _credential: credential.id,
      _tenant: input.tenantId,
      _product: input.productKey,
      _brand: input.brandId,
    };
    // Both service-role-only RPCs recheck current credentials, scope, product
    // activation and dated entitlement inside the transaction. No user ID or
    // impersonated auth context is accepted from the caller.
    if (input.operation === "evidence.ingest") {
      const { data, error } = await db.rpc("growth_studio_ingest_product_evidence", {
        ...args,
        _external_ref: input.externalRef,
        _data: {
          title: input.title,
          content: input.content,
          sourceUrl: input.sourceUrl ?? null,
          kind: input.kind,
          validUntil: input.validUntil ?? null,
        },
      });
      rpcFailure(error);
      if (!data)
        throw new GatewayError(
          "growth_unavailable",
          503,
          "Growth service is temporarily unavailable.",
        );
      return reply(data, data.created === true ? 201 : 200);
    }
    const { data, error } = await db.rpc("growth_studio_export_product_campaign", {
      ...args,
      _run: input.runId,
    });
    rpcFailure(error);
    if (!data)
      throw new GatewayError(
        "growth_not_available",
        404,
        "The requested Growth item is not available.",
      );
    return reply(data);
  } catch (error) {
    if (error instanceof z.ZodError)
      return reply(
        {
          error: "invalid_growth_request",
          message: "The request does not meet the Growth contract.",
        },
        422,
      );
    if (error instanceof GatewayError)
      return reply({ error: error.code, message: error.message }, error.status);
    return reply(
      { error: "growth_unavailable", message: "Growth service is temporarily unavailable." },
      503,
    );
  }
}
