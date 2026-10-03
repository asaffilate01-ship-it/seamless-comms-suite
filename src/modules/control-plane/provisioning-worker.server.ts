import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { decideProvisioning } from "./provisioning-policy";

function secureEqual(a: string, b: string) {
  const aa = createHash("sha256").update(a).digest();
  const bb = createHash("sha256").update(b).digest();
  return timingSafeEqual(aa, bb);
}

class ProvisioningBlock extends Error {}

function requiredHttps(name: string) {
  const value = process.env[name];
  if (!value) throw new ProvisioningBlock(`${name} is not configured`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new ProvisioningBlock(`${name} must use HTTPS`);
  return url.toString().replace(/\/$/, "");
}

function haccoraEnvironment(countryCode: string) {
  if (countryCode === "GB") return {
    functionUrl: requiredHttps("HACCORA_UK_FUNCTION_URL"),
    appUrl: requiredHttps("HACCORA_UK_APP_URL"),
    secret: process.env.HACCORA_UK_PROVISIONING_SECRET ?? "",
  };
  if (countryCode === "DE") return {
    functionUrl: requiredHttps("HACCORA_DE_FUNCTION_URL"),
    appUrl: requiredHttps("HACCORA_DE_APP_URL"),
    secret: process.env.HACCORA_DE_PROVISIONING_SECRET ?? "",
  };
  throw new ProvisioningBlock(`Haccora country ${countryCode} is not supported`);
}

async function haccoraRequest(config: ReturnType<typeof haccoraEnvironment>, body: Record<string, unknown>) {
  if (config.secret.length < 32) throw new ProvisioningBlock("Haccora provisioning secret is not configured");
  const response = await fetch(config.functionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-omniqora-provisioning-secret": config.secret,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ error: "invalid_haccora_response" }));
  if (!response.ok) {
    const reason = typeof data?.error === "string" ? data.error : `haccora_${response.status}`;
    if ([409, 422].includes(response.status)) throw new ProvisioningBlock(reason);
    throw new Error(reason);
  }
  return data as any;
}

async function provisionHaccora(db: any, job: any) {
  const tenantResult = await db.from("tenants")
    .select("id,name,slug,country_code,metadata")
    .eq("id", job.tenant_id).maybeSingle();
  if (tenantResult.error || !tenantResult.data) throw new Error("Tenant is unavailable");
  const tenant = tenantResult.data;
  const config = haccoraEnvironment(tenant.country_code);
  const origin = requiredHttps("OMNIQORA_PUBLIC_URL");
  const [stateResult, dishbeeResult, connectionResult] = await Promise.all([
    db.from("tenant_products").select("status,external_tenant_id,config")
      .eq("tenant_id", job.tenant_id).eq("product_key", "haccora").maybeSingle(),
    db.from("tenant_products").select("status")
      .eq("tenant_id", job.tenant_id).eq("product_key", "dishbee").maybeSingle(),
    db.from("product_connections").select("*")
      .eq("tenant_id", job.tenant_id).eq("product_key", "haccora")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (stateResult.error || connectionResult.error) throw new Error("Haccora tenant state is unavailable");
  if (connectionResult.data?.status === "connected") return connectionResult.data;

  const mode = dishbeeResult.data && !["failed","cancelled"].includes(dishbeeResult.data.status)
    ? "dishbee-addon" : "standalone";
  let organizationId = connectionResult.data?.external_tenant_id
    ?? stateResult.data?.external_tenant_id
    ?? stateResult.data?.config?.haccoraOrganizationId
    ?? null;

  if (!organizationId) {
    const provisioned = await haccoraRequest(config, {
      action: "provision_workspace",
      omniqoraTenantId: job.tenant_id,
      businessName: tenant.name,
      slug: tenant.slug,
      mode,
      existingOrganizationId: mode === "standalone" ? stateResult.data?.config?.haccoraOrganizationId ?? null : null,
      locationName: tenant.metadata?.locationName ?? tenant.name,
      address: tenant.metadata?.address ?? {},
    });
    organizationId = provisioned.organizationId;
  }
  if (!organizationId) throw new Error("Haccora did not return an organization id");

  const connectorKey = `oqcp_${randomBytes(32).toString("hex")}`;
  const credentialHash = createHash("sha256").update(connectorKey).digest("hex");
  const capabilities = [
    "tenant.snapshot",
    "intelligence.run.start",
    "intelligence.run.read",
    "haccora.compliance.read",
    ...(mode === "dishbee-addon" ? ["dishbee.projection.write"] : []),
  ];
  const connectionValues = {
    tenant_id: job.tenant_id,
    product_key: "haccora",
    external_tenant_id: organizationId,
    base_url: config.appUrl,
    status: "provisioning",
    capabilities,
    credential_hash: credentialHash,
    credential_suffix: connectorKey.slice(-8),
    credential_created_at: new Date().toISOString(),
    credential_expires_at: null,
    metadata: { mode, countryCode: tenant.country_code, provisionedBy: "omniqora" },
    updated_at: new Date().toISOString(),
  };
  let connection = connectionResult.data;
  if (connection) {
    const updated = await db.from("product_connections").update(connectionValues)
      .eq("id", connection.id).select("*").single();
    if (updated.error) throw new Error(updated.error.message);
    connection = updated.data;
  } else {
    const inserted = await db.from("product_connections").insert(connectionValues).select("*").single();
    if (inserted.error) throw new Error(inserted.error.message);
    connection = inserted.data;
  }

  const bind = await haccoraRequest(config, {
    action: "bind_control_plane",
    omniqoraTenantId: job.tenant_id,
    organizationId,
    controlPlaneUrl: `${origin}/api/control-plane/tenant-snapshot`,
    intelligenceUrl: `${origin}/api/platform/intelligence`,
    controlPlaneKey: connectorKey,
  });
  if (bind.status !== "connected") throw new Error("Haccora control-plane bind was not confirmed");

  const verified = await db.from("product_connections").update({
    status: "connected",
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id).select("product_key,external_tenant_id,status").single();
  if (verified.error) throw new Error(verified.error.message);
  await db.from("tenant_products").update({
    external_tenant_id: organizationId,
    base_url: config.appUrl,
    config: { ...(stateResult.data?.config ?? {}), mode, countryPack: tenant.country_code },
    updated_at: new Date().toISOString(),
  }).eq("tenant_id", job.tenant_id).eq("product_key", "haccora");
  return verified.data;
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

export async function serveProvisioningWorker(request: Request) {
  const expected = process.env.CONTROL_PLANE_WORKER_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!expected || expected.length < 32) return json({ error: "Provisioning worker is not configured" }, 503);
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  if (!secureEqual(auth.slice(7), expected)) return json({ error: "Unauthorized" }, 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: claimed, error: claimError } = await db.rpc("server_claim_provisioning_jobs", { _limit: 20 });
  if (claimError) return json({ error: claimError.message }, 503);

  const results: Array<{ id: string; outcome: string; reason: string }> = [];

  for (const job of claimed ?? []) {
    try {
      let product: any = null;
      let service: any = null;
      let connection: any = null;

      if (job.target_kind === "product") {
        const response = await db.from("product_catalogue")
          .select("product_key,deployment_mode,implementation_status,product_role")
          .eq("product_key", job.target_key).maybeSingle();
        if (response.error) throw new Error(response.error.message);
        product = response.data;
        const link = await db.from("product_connections")
          .select("product_key,external_tenant_id,status")
          .eq("tenant_id", job.tenant_id).eq("product_key", job.target_key)
          .eq("status", "connected").limit(1).maybeSingle();
        if (link.error) throw new Error(link.error.message);
        connection = link.data;
        if (job.target_key === "haccora" && !connection && ["provision","update","resume","verify"].includes(job.action)) {
          connection = await provisionHaccora(db, job);
        }
      } else if (job.target_kind === "service") {
        const response = await db.from("service_catalogue")
          .select("service_key,provisioning_mode,implementation_status,owner_product_key")
          .eq("service_key", job.target_key).maybeSingle();
        if (response.error) throw new Error(response.error.message);
        service = response.data;
        if (service?.owner_product_key === "haccora") {
          const haccoraLink = await db.from("product_connections")
            .select("product_key,external_tenant_id,status")
            .eq("tenant_id", job.tenant_id).eq("product_key", "haccora")
            .eq("status", "connected").limit(1).maybeSingle();
          if (haccoraLink.error) throw new Error(haccoraLink.error.message);
          connection = haccoraLink.data;
          if (job.target_key === "haccora.dishbee-sync") {
            const dishbeeLink = await db.from("product_connections")
              .select("id").eq("tenant_id", job.tenant_id).eq("product_key", "dishbee")
              .eq("status", "connected").limit(1).maybeSingle();
            if (dishbeeLink.error) throw new Error(dishbeeLink.error.message);
            if (!dishbeeLink.data) connection = null;
          }
        }
      } else if (job.target_kind === "integration") {
        const [productKey, ...externalParts] = String(job.target_key).split(":");
        const externalTenantId = externalParts.join(":");
        const response = await db.from("product_connections")
          .select("product_key,external_tenant_id,status")
          .eq("tenant_id", job.tenant_id)
          .eq("product_key", productKey)
          .eq("external_tenant_id", externalTenantId)
          .maybeSingle();
        if (response.error) throw new Error(response.error.message);
        connection = response.data;
      }

      const decision = decideProvisioning({ job, product, service, connection });
      if (decision.outcome === "succeed") {
        const complete = await db.rpc("server_complete_provisioning_job", {
          _job: job.id,
          _succeeded: true,
          _detail: { worker: "omniqora-control-plane", reason: decision.reason },
          _error: null,
        });
        if (complete.error) throw new Error(complete.error.message);
      } else {
        const blocked = await db.rpc("server_block_provisioning_job", {
          _job: job.id,
          _reason: decision.reason,
          _detail: { worker: "omniqora-control-plane" },
        });
        if (blocked.error) throw new Error(blocked.error.message);
      }
      results.push({ id: job.id, outcome: decision.outcome, reason: decision.reason });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Provisioning worker failed";
      if (error instanceof ProvisioningBlock) {
        await db.rpc("server_block_provisioning_job", {
          _job: job.id,
          _reason: reason,
          _detail: { worker: "omniqora-control-plane", adapter: "haccora" },
        });
        results.push({ id: job.id, outcome: "block", reason });
        continue;
      }
      await db.rpc("server_complete_provisioning_job", {
        _job: job.id,
        _succeeded: false,
        _detail: { worker: "omniqora-control-plane" },
        _error: reason,
      });
      results.push({ id: job.id, outcome: "failed", reason });
    }
  }

  return json({ claimed: (claimed ?? []).length, results });
}
