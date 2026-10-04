type DbClient = any;

export type HaccoraSmokeCheck = {
  key: string;
  ok: boolean;
  detail: string;
};

export type HaccoraSmokeResult = {
  tenantId: string;
  countryCode: string;
  checkedAt: string;
  overall: "pass" | "fail";
  checks: HaccoraSmokeCheck[];
  compliance?: {
    reachable: boolean;
    summaryKeys: string[];
  };
};

function check(checks: HaccoraSmokeCheck[], key: string, ok: boolean, detail: string) {
  checks.push({ key, ok, detail });
  return ok;
}

function bridgeEnvironment(countryCode: string) {
  const prefix = countryCode === "GB" ? "HACCORA_UK" : countryCode === "DE" ? "HACCORA_DE" : null;
  if (!prefix) return { ok: false as const, reason: `Unsupported Haccora country ${countryCode}` };
  const functionUrl = process.env[`${prefix}_FUNCTION_URL`];
  const syncSecret = process.env[`${prefix}_SYNC_SECRET`];
  if (!functionUrl) return { ok: false as const, reason: `${prefix}_FUNCTION_URL is not configured` };
  let url: URL;
  try {
    url = new URL(functionUrl);
  } catch {
    return { ok: false as const, reason: `${prefix}_FUNCTION_URL is invalid` };
  }
  if (url.protocol !== "https:") return { ok: false as const, reason: `${prefix}_FUNCTION_URL must use HTTPS` };
  if (!syncSecret || syncSecret.length < 32) {
    return { ok: false as const, reason: `${prefix}_SYNC_SECRET is not configured` };
  }
  return { ok: true as const, functionUrl: url.toString(), syncSecret };
}

async function entitlement(db: DbClient, tenantId: string, service: string) {
  const result = await db.rpc("has_tenant_entitlement", { _tenant: tenantId, _service: service });
  return !result.error && result.data === true;
}

export async function runHaccoraReadOnlySmoke(
  db: DbClient,
  tenantId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HaccoraSmokeResult> {
  const checks: HaccoraSmokeCheck[] = [];
  const checkedAt = new Date().toISOString();

  const [tenantResult, productResult, connectionResult] = await Promise.all([
    db.from("tenants").select("id,country_code").eq("id", tenantId).maybeSingle(),
    db.from("tenant_products").select("status,config").eq("tenant_id", tenantId).eq("product_key", "haccora").maybeSingle(),
    db.from("product_connections")
      .select("status,external_tenant_id,base_url,last_verified_at")
      .eq("tenant_id", tenantId)
      .eq("product_key", "haccora")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (tenantResult.error || !tenantResult.data) throw new Error("Tenant is unavailable");
  const countryCode = String(tenantResult.data.country_code ?? "");

  check(
    checks,
    "product",
    !!productResult.data && !["failed", "cancelled"].includes(productResult.data.status),
    productResult.data ? `Haccora product: ${productResult.data.status}` : "Haccora product is not requested",
  );

  const connected = connectionResult.data?.status === "connected";
  check(
    checks,
    "connection",
    connected,
    connectionResult.data
      ? `Connection: ${connectionResult.data.status} · ${connectionResult.data.external_tenant_id ?? "no external workspace"}`
      : "No Haccora product connection",
  );

  const [syncReady, aiCopilot, intelligenceRuntime] = await Promise.all([
    entitlement(db, tenantId, "haccora.dishbee-sync"),
    entitlement(db, tenantId, "haccora.ai-copilot"),
    entitlement(db, tenantId, "omniqora.intelligence-runtime"),
  ]);
  check(checks, "dishbee-sync", syncReady, syncReady ? "Dishbee ↔ Haccora entitlement active" : "haccora.dishbee-sync is not active");
  check(checks, "ai-copilot", aiCopilot, aiCopilot ? "Haccora AI Copilot entitlement active" : "Haccora AI Copilot entitlement is not active");
  check(checks, "intelligence-runtime", intelligenceRuntime, intelligenceRuntime ? "Omniqora intelligence runtime active" : "Omniqora intelligence runtime is not active");

  const env = bridgeEnvironment(countryCode);
  check(checks, "bridge-config", env.ok, env.ok ? "Country bridge URL and sync secret configured" : env.reason);

  let compliance: HaccoraSmokeResult["compliance"];
  if (connected && syncReady && env.ok) {
    try {
      const response = await fetchImpl(env.functionUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-omniqora-sync-secret": env.syncSecret,
        },
        body: JSON.stringify({
          action: "compliance_summary",
          omniqoraTenantId: tenantId,
        }),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      const reachable = response.ok;
      check(
        checks,
        "compliance-summary",
        reachable,
        reachable ? "Haccora compliance summary responded successfully" : `Haccora compliance summary returned HTTP ${response.status}`,
      );
      compliance = {
        reachable,
        summaryKeys: reachable ? Object.keys(payload).sort().slice(0, 30) : [],
      };
    } catch (error) {
      check(
        checks,
        "compliance-summary",
        false,
        error instanceof Error ? `Haccora endpoint failed: ${error.message}` : "Haccora endpoint failed",
      );
      compliance = { reachable: false, summaryKeys: [] };
    }
  } else {
    check(checks, "compliance-summary", false, "Skipped until connection, sync entitlement and bridge configuration are ready");
    compliance = { reachable: false, summaryKeys: [] };
  }

  return {
    tenantId,
    countryCode,
    checkedAt,
    overall: checks.every((item) => item.ok) ? "pass" : "fail",
    checks,
    compliance,
  };
}
