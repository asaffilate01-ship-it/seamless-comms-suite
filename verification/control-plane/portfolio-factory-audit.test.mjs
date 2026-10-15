import assert from "node:assert/strict";
import test from "node:test";
import {
  auditPortfolioRegistry,
  canonicalGithubRepo,
  renderMarkdown,
  verifyGithubRepositories
} from "../../scripts/factory-portfolio-audit.mjs";

const fixture = () => ({
  schemaVersion: "1.0",
  sourceRowCount: 4,
  products: [
    { productKey: "omniqora", lifecycle: "established", repositories: ["https://github.com/owner/platform.git"] },
    { productKey: "dishbee", lifecycle: "candidate", repositories: [] }
  ],
  tenants: [
    { tenantKey: "meal-deck", parentLandlord: "dishbee", provisioning: "not_activated" }
  ],
  aliases: [{ alias: "Control plane", canonicalProductKey: "omniqora" }]
});

test("canonical repository parser accepts GitHub URLs and rejects non-GitHub domains", () => {
  assert.equal(canonicalGithubRepo("https://github.com/Owner/Platform.git"), "owner/platform");
  assert.equal(canonicalGithubRepo("Owner/Platform"), "owner/platform");
  assert.equal(canonicalGithubRepo({ url: "https://github.com/Owner/Platform" }), "owner/platform");
  assert.equal(canonicalGithubRepo("https://github.com.evil.example/Owner/Platform"), null);
  assert.equal(canonicalGithubRepo("https://github.com/Owner/Platform?token=abc"), null);
  assert.equal(canonicalGithubRepo("https://github.com/Owner/../../private"), null);
});

test("audit separates product inventory and tenant activation without claiming production readiness", () => {
  const result = auditPortfolioRegistry(fixture());
  assert.equal(result.status, "source_inventory_only");
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.products, 2);
  assert.equal(result.counts.productLifecycle.candidate, 1);
  assert.equal(result.counts.mappedProducts, 1);
  assert.equal(result.counts.unmappedProducts, 1);
  assert.equal(result.counts.tenants, 1);
  assert.equal(result.counts.tenantProvisioning.not_activated, 1);
  assert.deepEqual(result.repositories, ["owner/platform"]);
  assert.deepEqual(result.unmappedProductKeys, ["dishbee"]);
  assert.match(renderMarkdown(result), /not a live-deployment or tenant-activation report/i);
});

test("duplicate products and tenants, wrong parents and aliases are structural errors", () => {
  const registry = fixture();
  registry.products.push({ productKey: "omniqora", repositories: [] });
  registry.tenants.push({ tenantKey: "meal-deck", parentLandlord: "missing", provisioning: "activated" });
  registry.aliases.push({ alias: "Missing", canonicalProductKey: "missing" });
  const result = auditPortfolioRegistry(registry);
  assert.equal(result.status, "invalid_source_registry");
  assert.ok(result.errors.some((message) => message.includes("Duplicate productKey")));
  assert.ok(result.errors.some((message) => message.includes("Duplicate tenantKey")));
  assert.ok(result.errors.some((message) => message.includes("unknown parentLandlord")));
  assert.ok(result.errors.some((message) => message.includes("references missing product")));
});

test("remote GitHub checks never present a 404 as confirmed deletion", async () => {
  const seen = [];
  const mockFetch = async (url, options) => {
    seen.push({ url, hasToken: Boolean(options.headers.Authorization) });
    if (url.endsWith("owner/ok")) return { status: 200 };
    if (url.endsWith("owner/private")) return { status: 404 };
    return { status: 403 };
  };
  const result = await verifyGithubRepositories(
    ["owner/private", "owner/ok", "owner/restricted", "owner/ok"],
    { fetchImpl: mockFetch, token: "fake-test-only" }
  );
  assert.equal(result.length, 3);
  assert.equal(result.find((r) => r.repository === "owner/ok")?.status, "accessible");
  assert.equal(result.find((r) => r.repository === "owner/private")?.status, "not_found_or_not_authorised");
  assert.equal(result.find((r) => r.repository === "owner/restricted")?.status, "access_or_rate_limit_unknown");
  assert.ok(seen.every((call) => call.hasToken));
});
