/**
 * Read-only, signed-out release smoke for the published Omniqora application.
 *
 * Checks public HTML and negative security boundaries only. It does not use
 * customer data, bypass login, send provider messages or mutate production.
 *
 * Usage: OMNIQORA_PUBLIC_URL=https://omniqora.itechlounge.co.uk node scripts/omniqora-public-smoke.mjs
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const releaseChecks = Object.freeze([
  { name: "Homepage", path: "/", method: "GET", kind: "html" },
  { name: "Sign-in page", path: "/auth", method: "GET", kind: "html" },
  { name: "Pricing page", path: "/pricing", method: "GET", kind: "html" },
  { name: "Tenant snapshot requires credentials", path: "/api/control-plane/tenant-snapshot", method: "POST", kind: "reject" },
  { name: "Integration gateway requires credentials", path: "/api/integrations/gateway", method: "POST", kind: "reject" },
  { name: "Platform runtime requires credentials", path: "/api/platform/runtime", method: "POST", kind: "reject" },
]);

function canonicalOrigin(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Public release smoke requires a clean HTTPS origin");
  }
  if (!parsed.hostname || parsed.pathname !== "/") {
    throw new Error("Supply only the HTTPS origin, not a path or tokenised URL");
  }
  return parsed.origin;
}

export async function runPublicSmoke(baseUrl, transport = fetch) {
  const origin = canonicalOrigin(baseUrl);
  const results = [];

  for (const check of releaseChecks) {
    try {
      const response = await transport(new URL(check.path, origin), {
        method: check.method,
        redirect: "manual",
        headers: check.method === "POST" ? { "content-type": "application/json" } : {},
        ...(check.method === "POST" ? { body: "{}" } : {}),
        signal: AbortSignal.timeout(10000),
      });
      // A 404/405 does not prove the protected endpoint exists. 5xx is always a failure.
      const passed = check.kind === "html"
        ? response.status === 200 && (response.headers.get("content-type") || "").includes("text/html")
        : response.status >= 400 && response.status < 500 && response.status !== 404 && response.status !== 405;
      results.push({ name: check.name, path: check.path, status: response.status, passed });
    } catch (error) {
      results.push({
        name: check.name, path: check.path, status: null, passed: false,
        error: error instanceof Error ? error.message : "Network failure",
      });
    }
  }

  return {
    origin,
    checkedAt: new Date().toISOString(),
    scope: "public signed-out pages and protected API negative tests only",
    passed: results.every((result) => result.passed),
    results,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const origin = process.env.OMNIQORA_PUBLIC_URL;
  if (!origin) {
    console.error("Set OMNIQORA_PUBLIC_URL to the published HTTPS origin");
    process.exitCode = 2;
  } else {
    runPublicSmoke(origin).then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.passed) process.exitCode = 1;
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : "Release smoke configuration failed");
      process.exitCode = 2;
    });
  }
}
