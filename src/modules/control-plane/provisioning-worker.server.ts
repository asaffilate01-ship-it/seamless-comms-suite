import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { decideProvisioning } from "./provisioning-policy";
import { verifyDomainOwnership } from "./domain-verification.server";
import { approvedOrigin, FactoryBindingError, provisionDishbeeFactory } from "./dishbee-binding.server";

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
  if (countryCode === "GB")
    return {
      functionUrl: requiredHttps("HACCORA_UK_FUNCTION_URL"),
      appUrl: requiredHttps("HACCORA_UK_APP_URL"),
      secret: process.env.HACCORA_UK_PROVISIONING_SECRET ?? "",
    };
  if (countryCode === "DE")
    return {
      functionUrl: requiredHttps("HACCORA_DE_FUNCTION_URL"),
      appUrl: requiredHttps("HACCORA_DE_APP_URL"),
      secret: process.env.HACCORA_DE_PROVISIONING_SECRET ?? "",
    };
  throw new ProvisioningBlock(`Haccora country ${countryCode} is not supported`);
}

async function haccoraRequest(
  config: ReturnType<typeof haccoraEnvironment>,
  body: Record<string, unknown>,
) {
  if (config.secret.length < 32)
    throw new ProvisioningBlock("Haccora provisioning secret is not configured");
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
  const tenantResult = await db
    .from("tenants")
    .select("id,name,slug,country_code,metadata")
    .eq("id", job.tenant_id)
    .maybeSingle();
  if (tenantResult.error || !tenantResult.data) throw new Error("Tenant is unavailable");
  const tenant = tenantResult.data;
  const config = haccoraEnvironment(tenant.country_code);
  const origin = requiredHttps("OMNIQORA_PUBLIC_URL");
  const [stateResult, dishbeeResult, connectionResult] = await Promise.all([
    db
      .from("tenant_products")
      .select("status,external_tenant_id,config")
      .eq("tenant_id", job.tenant_id)
      .eq("product_key", "haccora")
      .maybeSingle(),
    db
      .from("tenant_products")
      .select("status")
      .eq("tenant_id", job.tenant_id)
      .eq("product_key", "dishbee")
      .maybeSingle(),
    db
      .from("product_connections")
      .select("*")
      .eq("tenant_id", job.tenant_id)
      .eq("product_key", "haccora")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (stateResult.error || connectionResult.error)
    throw new Error("Haccora tenant state is unavailable");
  if (connectionResult.data?.status === "connected") return connectionResult.data;

  const mode =
    dishbeeResult.data && !["failed", "cancelled"].includes(dishbeeResult.data.status)
      ? "dishbee-addon"
      : "standalone";
  let organizationId =
    connectionResult.data?.external_tenant_id ??
    stateResult.data?.external_tenant_id ??
    stateResult.data?.config?.haccoraOrganizationId ??
    null;
  let initialLocationId: string | null = null;

  if (!organizationId) {
    const provisioned = await haccoraRequest(config, {
      action: "provision_workspace",
      omniqoraTenantId: job.tenant_id,
      businessName: tenant.name,
      slug: tenant.slug,
      mode,
      existingOrganizationId:
        mode === "standalone" ? (stateResult.data?.config?.haccoraOrganizationId ?? null) : null,
      locationName: tenant.metadata?.locationName ?? tenant.name,
      address: tenant.metadata?.address ?? {},
    });
    organizationId = provisioned.organizationId;
    initialLocationId = typeof provisioned.locationId === "string" ? provisioned.locationId : null;
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
    status: "configured",
    capabilities,
    credential_hash: credentialHash,
    credential_suffix: connectorKey.slice(-8),
    credential_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    metadata: { mode, countryCode: tenant.country_code, provisionedBy: "omniqora" },
    updated_at: new Date().toISOString(),
  };
  let connection = connectionResult.data;
  if (connection) {
    const updated = await db
      .from("product_connections")
      .update(connectionValues)
      .eq("id", connection.id)
      .select("*")
      .single();
    if (updated.error) throw new Error(updated.error.message);
    connection = updated.data;
  } else {
    const inserted = await db
      .from("product_connections")
      .insert(connectionValues)
      .select("*")
      .single();
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

  await provisionHaccoraLocations(db, job, config, organizationId, connection, initialLocationId);

  const verified = await db
    .from("product_connections")
    .update({
      status: "connected",
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .select("product_key,external_tenant_id,status")
    .single();
  if (verified.error) throw new Error(verified.error.message);
  await db
    .from("tenant_products")
    .update({
      external_tenant_id: organizationId,
      base_url: config.appUrl,
      config: { ...(stateResult.data?.config ?? {}), mode, countryPack: tenant.country_code },
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", job.tenant_id)
    .eq("product_key", "haccora");
  return verified.data;
}

function isUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function externalProductUrl(value: unknown, envName: string) {
  const origin = approvedOrigin(process.env[envName], envName);
  if (value && approvedOrigin(value, "Product connection URL") !== origin) {
    throw new ProvisioningBlock("Product connection URL differs from the deployment-approved origin");
  }
  return origin;
}

function dishbeeEnvironment(baseUrl?: string | null) {
  const secret = process.env.DISHBEE_PROVISIONING_SECRET ?? "";
  if (secret.length < 32) throw new ProvisioningBlock("DISHBEE_PROVISIONING_SECRET is not configured");
  return {
    appUrl: externalProductUrl(baseUrl, "DISHBEE_APP_URL"),
    secret,
  };
}

async function dishbeeRequest(
  config: ReturnType<typeof dishbeeEnvironment>,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${config.appUrl}/api/platform/provisioning`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      "content-type": "application/json",
      "x-omniqora-provisioning-secret": config.secret,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ error: "invalid_dishbee_response" }));
  if (!response.ok) {
    const reason = `dishbee_provisioning_http_${response.status}`;
    if ([400, 404, 409, 422].includes(response.status)) throw new ProvisioningBlock(reason);
    throw new Error(reason);
  }
  return data as any;
}

function newProductCredential(prefix = "oqcp") {
  const token = `${prefix}_${randomBytes(32).toString("hex")}`;
  return {
    token,
    hash: createHash("sha256").update(token).digest("hex"),
    suffix: token.slice(-8),
  };
}

async function activeTenantLocations(db: any, tenantId: string) {
  const result = await db
    .from("tenant_locations")
    .select("id,name,code,timezone,address,status")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("name");
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

async function productLocationLinks(db: any, connectionId: string) {
  const result = await db
    .from("product_location_links")
    .select("id,tenant_location_id,external_location_id,status")
    .eq("product_connection_id", connectionId)
    .neq("status", "disabled");
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

async function requireCompleteLocationLinks(
  db: any,
  tenantId: string,
  connection: any,
  productLabel: string,
) {
  const locations = await activeTenantLocations(db, tenantId);
  if (!locations.length) throw new ProvisioningBlock(`${productLabel} requires an active tenant location`);
  const links = await productLocationLinks(db, connection.id);
  const byTenantLocation = new Map<string, Record<string, unknown>>(
    links.map((link: any) => [link.tenant_location_id, link] as const),
  );
  const missing = locations.filter((location: any) => !byTenantLocation.has(location.id));
  if (missing.length) {
    throw new ProvisioningBlock(
      `${productLabel} location mapping is incomplete: ${missing.map((x: any) => x.name).join(", ")}`,
    );
  }
  return {
    locations,
    links: locations.map((location: any) => ({
      ...byTenantLocation.get(location.id),
      tenantLocation: location,
    })),
  };
}

async function provisionDishbee(db: any, job: any) {
  return provisionDishbeeFactory(db, job);
}

async function provisionHaccoraLocations(
  db: any,
  job: any,
  config: ReturnType<typeof haccoraEnvironment>,
  organizationId: string,
  connection: any,
  initialLocationId?: string | null,
) {
  const locations = await activeTenantLocations(db, job.tenant_id);
  const existing = await productLocationLinks(db, connection.id);
  const mappedIds = new Set(existing.map((link: any) => link.tenant_location_id));
  let canUseInitial = Boolean(initialLocationId) && existing.length === 0;

  for (const location of locations) {
    if (mappedIds.has(location.id)) continue;
    let haccoraLocationId: string;
    if (canUseInitial && initialLocationId) {
      haccoraLocationId = initialLocationId;
      canUseInitial = false;
    } else {
      const provisioned = await haccoraRequest(config, {
        action: "provision_location",
        omniqoraTenantId: job.tenant_id,
        organizationId,
        omniqoraLocationId: location.id,
        name: location.name,
        address: location.address ?? {},
        timezone: location.timezone ?? "Europe/London",
      });
      haccoraLocationId = String(provisioned.haccoraLocationId ?? "");
    }
    if (!isUuid(haccoraLocationId)) throw new Error("Haccora did not return a valid location id");

    const stored = await db.rpc("server_upsert_product_location_link", {
      _connection: connection.id,
      _tenant_location: location.id,
      _external_location: haccoraLocationId,
      _metadata: { provisionedBy: "haccora-adapter" },
      _verified: true,
    });
    if (stored.error) throw new Error(stored.error.message);
  }
}

async function bindHaccoraDishbeeRuntime(db: any, tenantId: string) {
  const [dishbeeResult, haccoraResult, tenantResult] = await Promise.all([
    db.from("product_connections").select("*")
      .eq("tenant_id", tenantId).eq("product_key", "dishbee").eq("status", "connected")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("product_connections").select("*")
      .eq("tenant_id", tenantId).eq("product_key", "haccora").eq("status", "connected")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("tenants").select("country_code").eq("id", tenantId).maybeSingle(),
  ]);
  if (dishbeeResult.error || haccoraResult.error || tenantResult.error) {
    throw new Error("Dishbee/Haccora product connection state is unavailable");
  }
  const dishbee = dishbeeResult.data;
  const haccora = haccoraResult.data;
  if (!dishbee) throw new ProvisioningBlock("Dishbee product connection must be connected");
  if (!haccora) throw new ProvisioningBlock("Haccora product connection must be connected");
  if (!isUuid(dishbee.external_tenant_id) || !isUuid(haccora.external_tenant_id)) {
    throw new ProvisioningBlock("Dishbee and Haccora external tenant IDs must be valid UUIDs");
  }

  const [dishbeeMap, haccoraMap] = await Promise.all([
    requireCompleteLocationLinks(db, tenantId, dishbee, "Dishbee"),
    requireCompleteLocationLinks(db, tenantId, haccora, "Haccora"),
  ]);
  const haccoraByLocation = new Map(
    haccoraMap.links.map((link: any) => [link.tenant_location_id, link.external_location_id]),
  );
  const locations = dishbeeMap.links.map((link: any) => {
    const haccoraLocationId = haccoraByLocation.get(link.tenant_location_id);
    if (!haccoraLocationId) throw new ProvisioningBlock("Haccora location mapping is incomplete");
    return {
      dishbeeLocationId: link.external_location_id,
      haccoraLocationId,
    };
  });

  const haccoraConfig = haccoraEnvironment(String(tenantResult.data?.country_code ?? "GB"));
  const dishbeeConfig = dishbeeEnvironment(dishbee.base_url);
  const runtimeToken = newProductCredential("dbhr").token;

  const haccoraBind = await haccoraRequest(haccoraConfig, {
    action: "bind_dishbee_runtime",
    omniqoraTenantId: tenantId,
    organizationId: haccora.external_tenant_id,
    dishbeeTenantId: dishbee.external_tenant_id,
    runtimeToken,
    locations,
  });
  if (haccoraBind.status !== "connected") throw new Error("Haccora Dishbee runtime bind failed");

  const dishbeeBind = await dishbeeRequest(dishbeeConfig, {
    action: "bind_haccora",
    tenantId: dishbee.external_tenant_id,
    haccoraBaseUrl: haccoraConfig.appUrl,
    haccoraRuntimeToken: runtimeToken,
    haccoraOrganizationId: haccora.external_tenant_id,
  });
  if (dishbeeBind?.status?.haccoraRuntimeBound !== true) {
    throw new Error("Dishbee Haccora runtime bind was not confirmed");
  }

  await db.from("product_connections").update({
    metadata: {
      ...(haccora.metadata ?? {}),
      dishbeeRuntimeBound: true,
      dishbeeExternalTenantId: dishbee.external_tenant_id,
      runtimeBoundAt: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  }).eq("id", haccora.id);

  return { dishbee, haccora, locations };
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
  if (!expected || expected.length < 32)
    return json({ error: "Provisioning worker is not configured" }, 503);
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  if (!secureEqual(auth.slice(7), expected)) return json({ error: "Unauthorized" }, 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: claimed, error: claimError } = await db.rpc("server_claim_provisioning_jobs", {
    _limit: 20,
  });
  if (claimError) return json({ error: claimError.message }, 503);

  const results: Array<{ id: string; outcome: string; reason: string }> = [];

  for (const job of claimed ?? []) {
    try {
      let product: any = null;
      let service: any = null;
      let connection: any = null;
      let domain: any = null;
      const enabling = ["provision", "update", "resume", "verify"].includes(job.action);

      if (job.target_kind === "product") {
        const response = await db
          .from("product_catalogue")
          .select("product_key,deployment_mode,implementation_status,product_role,parent_product_key,metadata")
          .eq("product_key", job.target_key)
          .maybeSingle();
        if (response.error) throw new Error(response.error.message);
        product = response.data;
        const runtimeProductKey = String(
          product?.metadata?.runtimeProductKey ?? job.target_key,
        );
        const link = await db
          .from("product_connections")
          .select("id,product_key,external_tenant_id,base_url,status,metadata")
          .eq("tenant_id", job.tenant_id)
          .eq("product_key", runtimeProductKey)
          .eq("status", "connected")
          .limit(1)
          .maybeSingle();
        if (link.error) throw new Error(link.error.message);
        connection = link.data;
        if (runtimeProductKey === "haccora" && !connection && enabling) {
          connection = await provisionHaccora(db, job);
        }
        if (runtimeProductKey === "dishbee" && !connection && enabling) {
          connection = await provisionDishbee(db, job);
        }
      } else if (job.target_kind === "service") {
        const response = await db
          .from("service_catalogue")
          .select("service_key,provisioning_mode,implementation_status,owner_product_key")
          .eq("service_key", job.target_key)
          .maybeSingle();
        if (response.error) throw new Error(response.error.message);
        service = response.data;
        if (service?.owner_product_key && service.owner_product_key !== "omniqora") {
          const owner = await db
            .from("product_catalogue")
            .select("product_key,parent_product_key,metadata")
            .eq("product_key", service.owner_product_key)
            .maybeSingle();
          if (owner.error) throw new Error(owner.error.message);
          const runtimeProductKey = String(
            owner.data?.metadata?.runtimeProductKey ?? service.owner_product_key,
          );
          const runtimeLink = await db
            .from("product_connections")
            .select("id,product_key,external_tenant_id,base_url,status,metadata")
            .eq("tenant_id", job.tenant_id)
            .eq("product_key", runtimeProductKey)
            .eq("status", "connected")
            .limit(1)
            .maybeSingle();
          if (runtimeLink.error) throw new Error(runtimeLink.error.message);
          connection = runtimeLink.data;

          if (!connection && runtimeProductKey === "dishbee" && enabling) {
            connection = await provisionDishbee(db, job);
          }
          if (!connection && runtimeProductKey === "haccora" && enabling) {
            connection = await provisionHaccora(db, job);
          }

          if (job.target_key === "haccora.dishbee-sync" && enabling) {
            await bindHaccoraDishbeeRuntime(db, job.tenant_id);
            const refreshed = await db
              .from("product_connections")
              .select("id,product_key,external_tenant_id,base_url,status,metadata")
              .eq("tenant_id", job.tenant_id)
              .eq("product_key", "haccora")
              .eq("status", "connected")
              .limit(1)
              .maybeSingle();
            if (refreshed.error) throw new Error(refreshed.error.message);
            connection = refreshed.data;
          }
        }
      } else if (job.target_kind === "integration") {
        const [productKey, ...externalParts] = String(job.target_key).split(":");
        const externalTenantId = externalParts.join(":");
        const response = await db
          .from("product_connections")
          .select("product_key,external_tenant_id,status")
          .eq("tenant_id", job.tenant_id)
          .eq("product_key", productKey)
          .eq("external_tenant_id", externalTenantId)
          .maybeSingle();
        if (response.error) throw new Error(response.error.message);
        connection = response.data;
        // Product/location mapping controls queue integration verification jobs.
        // Run the binding adapter for that exact workspace, even on receipt re-checks.
        if (productKey === "dishbee" && job.action === "verify") {
          connection = await provisionDishbee(db, job);
        }
      } else if (job.target_kind === "domain") {
        const response = await db
          .from("tenant_domains")
          .select(
            "id,domain,verification_record_name,verification_record_value,verification_status,ssl_status,failure_reason",
          )
          .eq("tenant_id", job.tenant_id)
          .eq("domain", job.target_key)
          .maybeSingle();
        if (response.error) throw new Error(response.error.message);
        if (!response.data) throw new ProvisioningBlock("Tenant domain is unavailable");
        const evidence = await verifyDomainOwnership({
          domain: response.data.domain,
          recordName: response.data.verification_record_name,
          recordValue: response.data.verification_record_value,
        });
        const report = await db.rpc("service_report_domain_verification", {
          _tenant: job.tenant_id,
          _domain: response.data.domain,
          _dns_verified: evidence.dnsVerified,
          _ssl_active: evidence.sslActive,
          _observed_txt: evidence.observedTxt,
          _http_status: evidence.httpStatus,
          _failure_reason: evidence.failureReason,
        });
        if (report.error) throw new Error(report.error.message);
        domain = {
          ...response.data,
          verification_status: report.data.verificationStatus,
          ssl_status: report.data.sslStatus,
          failure_reason: evidence.failureReason,
        };
      }

      const decision = decideProvisioning({ job, product, service, connection, domain });
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
      if (error instanceof ProvisioningBlock || error instanceof FactoryBindingError) {
        await db.rpc("server_block_provisioning_job", {
          _job: job.id,
          _reason: reason,
          _detail: { worker: "omniqora-control-plane", adapter: error instanceof FactoryBindingError || job.target_key === "dishbee" ? "dishbee" : "haccora" },
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
