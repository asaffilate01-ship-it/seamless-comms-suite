import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const requestSchema = z.object({
  productKey: z.string().min(2).max(80).optional(),
  externalTenantId: z.string().min(1).max(200).optional(),
}).strict();

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function serveTenantSnapshot(request: Request) {
  try {
    const auth = request.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || auth.length > 256) return json({ error: "Invalid control-plane credential" }, 401);
    const token = auth.slice(7);
    if (!token.startsWith("oqcp_") || token.length < 40) return json({ error: "Invalid control-plane credential" }, 401);

    const body = request.headers.get("content-type")?.split(";")[0] === "application/json"
      ? requestSchema.parse(await request.json())
      : {};

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return json({ error: "Control plane is not configured" }, 503);

    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const digest = createHash("sha256").update(token).digest("hex");

    const { data: connection, error: connectionError } = await client
      .from("product_connections")
      .select("id, tenant_id, product_key, external_tenant_id, base_url, status, capabilities, credential_hash, credential_expires_at")
      .eq("credential_hash", digest)
      .maybeSingle();

    if (connectionError || !connection?.credential_hash || !safeEqual(connection.credential_hash, digest)) {
      return json({ error: "Invalid control-plane credential" }, 401);
    }
    if (!["configured", "connected", "degraded"].includes(connection.status)) return json({ error: "Connection is inactive" }, 403);
    if (connection.credential_expires_at && Date.parse(connection.credential_expires_at) <= Date.now()) return json({ error: "Control-plane credential expired" }, 401);
    if (body.productKey && body.productKey !== connection.product_key) return json({ error: "Product binding mismatch" }, 403);
    if (body.externalTenantId && body.externalTenantId !== connection.external_tenant_id) return json({ error: "Tenant binding mismatch" }, 403);

    const [tenantResult, productResult, servicesResult, brandingResult, domainsResult] = await Promise.all([
      client.from("tenants").select("id,name,slug,status,country_code,currency,timezone,organisation_id").eq("id", connection.tenant_id).maybeSingle(),
      client.from("tenant_products").select("product_key,status,plan_key,config,activated_at").eq("tenant_id", connection.tenant_id).eq("product_key", connection.product_key).maybeSingle(),
      client.from("tenant_services").select("service_key,status,valid_from,valid_until,config,updated_at").eq("tenant_id", connection.tenant_id),
      client.from("tenant_branding").select("*").eq("tenant_id", connection.tenant_id).maybeSingle(),
      client.from("tenant_domains").select("product_key,domain,verification_status,ssl_status,is_primary").eq("tenant_id", connection.tenant_id),
    ]);

    if (tenantResult.error || !tenantResult.data) return json({ error: "Tenant is unavailable" }, 404);
    if (servicesResult.error) return json({ error: "Entitlements are unavailable" }, 503);

    await client
      .from("product_connections")
      .update({ status: "connected", last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", connection.id);

    const services = servicesResult.data ?? [];
    const entitlementMap = Object.fromEntries(services.map((service) => [
      service.service_key,
      {
        status: service.status,
        enabled: ["active", "trial"].includes(service.status) && (!service.valid_until || Date.parse(service.valid_until) > Date.now()),
        validFrom: service.valid_from,
        validUntil: service.valid_until,
        config: service.config ?? {},
      },
    ]));

    return json({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      internalTenantId: connection.tenant_id,
      externalTenantId: connection.external_tenant_id,
      productKey: connection.product_key,
      capabilities: connection.capabilities ?? [],
      tenant: tenantResult.data,
      product: productResult.data ?? null,
      entitlements: entitlementMap,
      branding: brandingResult.data ?? null,
      domains: domainsResult.data ?? [],
    });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Invalid snapshot request" }, 422);
    return json({ error: "Control-plane snapshot unavailable" }, 503);
  }
}
