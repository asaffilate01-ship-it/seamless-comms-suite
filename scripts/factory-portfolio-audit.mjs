#!/usr/bin/env node
/**
 * Read-only source inventory for Omniqora's SaaS Factory.
 *
 * This script reports what the canonical portfolio registry claims, not what is
 * deployed or running. Optional GitHub lookups verify repository accessibility
 * only; they do not prove source quality, production health or integrations.
 *
 * Usage:
 *   node scripts/factory-portfolio-audit.mjs
 *   node scripts/factory-portfolio-audit.mjs --markdown
 *   node scripts/factory-portfolio-audit.mjs --strict
 *   GH_TOKEN=... node scripts/factory-portfolio-audit.mjs --github
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const REGISTRY = new URL("../src/modules/control-plane/portfolio-factory-registry.json", import.meta.url);
const OWNER_REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/;

export function canonicalGithubRepo(value) {
  const raw = typeof value === "string" ? value
    : value && typeof value === "object"
      ? (value.url ?? value.repositoryUrl ?? value.repositoryFullName ?? value.name ?? "")
      : "";
  if (typeof raw !== "string" || !raw.trim()) return null;
  const input = raw.trim();
  let normalized;
  if (/^https:\/\//i.test(input)) {
    const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/?$/i.exec(input);
    if (!match) return null;
    normalized = match[1] + "/" + match[2].replace(/\.git$/i, "");
  } else {
    normalized = input.replace(/\.git$/i, "");
  }
  if (!OWNER_REPO.test(normalized) || normalized.includes("..")) return null;
  return normalized.toLowerCase();
}

export function auditPortfolioRegistry(registry) {
  const errors = [];
  const warnings = [];
  const products = Array.isArray(registry?.products) ? registry.products : [];
  const tenants = Array.isArray(registry?.tenants) ? registry.tenants : [];
  const aliases = Array.isArray(registry?.aliases) ? registry.aliases : [];
  if (products.length === 0) errors.push("Product registry is missing or empty");
  if (!Array.isArray(registry?.tenants)) errors.push("Tenant array is missing");
  const seenProducts = new Set();
  const seenTenants = new Set();
  const repoSet = new Set();
  const noRepositories = [];
  const unverifiedRepoEntries = [];
  const lifecycle = {};
  const provisioning = {};

  for (const product of products) {
    const key = product?.productKey;
    if (typeof key !== "string" || !key.trim()) {
      errors.push("Product without a stable productKey");
      continue;
    }
    if (seenProducts.has(key)) errors.push("Duplicate productKey: " + key);
    seenProducts.add(key);
    const state = typeof product.lifecycle === "string" ? product.lifecycle : "unspecified";
    lifecycle[state] = (lifecycle[state] || 0) + 1;
    const declared = Array.isArray(product.repositories) ? product.repositories : [];
    if (!declared.length) noRepositories.push(key);
    for (const entry of declared) {
      const repo = canonicalGithubRepo(entry);
      if (repo) repoSet.add(repo);
      else unverifiedRepoEntries.push({ productKey: key, repository: String(typeof entry === "string" ? entry : "[unsupported reference]") });
    }
  }

  for (const tenant of tenants) {
    const key = tenant?.tenantKey;
    if (typeof key !== "string" || !key.trim()) {
      errors.push("Tenant without a stable tenantKey");
      continue;
    }
    if (seenTenants.has(key)) errors.push("Duplicate tenantKey: " + key);
    seenTenants.add(key);
    // Tenant-owned applications remain discoverable after landlord consolidation.
    for (const entry of Array.isArray(tenant.repositories) ? tenant.repositories : []) {
      const repo = canonicalGithubRepo(entry);
      if (repo) repoSet.add(repo);
      else unverifiedRepoEntries.push({ tenantKey: key, repository: String(typeof entry === "string" ? entry : "[unsupported reference]") });
    }
    if (seenProducts.has(key)) errors.push("Tenant is also registered as a SaaS product: " + key);
    if (!tenant?.parentLandlord || !seenProducts.has(tenant.parentLandlord)) {
      errors.push("Tenant " + key + " references an unknown parentLandlord: " + String(tenant?.parentLandlord));
    }
    const state = typeof tenant.provisioning === "string" ? tenant.provisioning : "unspecified";
    provisioning[state] = (provisioning[state] || 0) + 1;
  }

  for (const alias of aliases) {
    if (!seenProducts.has(alias?.canonicalProductKey)) {
      errors.push("Alias " + String(alias?.alias) + " references missing product: " + String(alias?.canonicalProductKey));
    }
  }

  if (unverifiedRepoEntries.length) warnings.push("Some repository references require manual correction or verification");
  if (noRepositories.length) warnings.push("Some product identities have no repository mapping");
  if (tenants.some((t) => t.provisioning !== "activated")) {
    warnings.push("Some or all tenant templates are not marked activated; do not treat these as live tenants");
  }
  return {
    generatedAt: new Date().toISOString(),
    status: errors.length ? "invalid_source_registry" : "source_inventory_only",
    source: { schemaVersion: registry?.schemaVersion ?? null, sourceRows: registry?.sourceRowCount ?? null },
    counts: {
      products: products.length,
      productLifecycle: lifecycle,
      tenants: tenants.length,
      tenantProvisioning: provisioning,
      mappedProducts: products.length - noRepositories.length,
      unmappedProducts: noRepositories.length,
      distinctRepositories: repoSet.size
    },
    repositories: [...repoSet].sort(),
    unmappedProductKeys: noRepositories.sort(),
    unverifiedRepoEntries,
    errors,
    warnings
  };
}

export async function verifyGithubRepositories(repositories, options = {}) {
  const request = options.fetchImpl || fetch;
  const token = options.token || "";
  const unique = [...new Set(repositories)].sort();
  const results = new Array(unique.length);
  const workers = Math.min(4, unique.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < unique.length) {
      const index = cursor++;
      const name = unique[index];
      try {
        const response = await request("https://api.github.com/repos/" + name, {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(token ? { Authorization: "Bearer " + token } : {})
          },
          signal: AbortSignal.timeout(9000)
        });
        results[index] = {
          repository: name,
          status: response.status === 200 ? "accessible"
            : response.status === 404 ? "not_found_or_not_authorised"
              : response.status === 401 || response.status === 403 ? "access_or_rate_limit_unknown"
                : "http_" + response.status
        };
      } catch {
        results[index] = { repository: name, status: "request_failed_unverified" };
      }
    }
  }));
  return results;
}

export function renderMarkdown(report) {
  const c = report.counts;
  const lines = [
    "# Omniqora portfolio source audit",
    "",
    "Generated: " + report.generatedAt,
    "",
    "**Scope:** Source registry and optional GitHub visibility only. Not a live-deployment or tenant-activation report.",
    "",
    "| Measure | Count |",
    "|---|---:|",
    "| Product identities | " + c.products + " |",
    "| Products with repository references | " + c.mappedProducts + " |",
    "| Products without repository references | " + c.unmappedProducts + " |",
    "| Distinct referenced GitHub repositories | " + c.distinctRepositories + " |",
    "| Draft/known tenant templates | " + c.tenants + " |",
    "",
    "## Lifecycle (source labels only)",
    ...Object.entries(c.productLifecycle).map(([key, n]) => "- " + key + ": " + n),
    "",
    "## Tenant provisioning (source labels only)",
    ...Object.entries(c.tenantProvisioning).map(([key, n]) => "- " + key + ": " + n),
    "",
    "## Products without repository mapping",
    ...(report.unmappedProductKeys.length ? report.unmappedProductKeys.map((key) => "- " + key) : ["None"]),
    "",
    "## Registry errors",
    ...(report.errors.length ? report.errors.map((error) => "- " + error) : ["None"]),
    "",
    "## Warnings",
    ...(report.warnings.length ? report.warnings.map((warning) => "- " + warning) : ["None"]),
    ""
  ];
  if (report.githubVerification) {
    lines.push("## GitHub visibility (not code or production health)", "");
    lines.push(...report.githubVerification.map((r) => "- " + r.repository + ": " + r.status), "");
  }
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => !["--markdown", "--strict", "--github"].includes(arg));
  if (unknown.length) throw new Error("Unknown options: " + unknown.join(", "));
  const registry = JSON.parse(await readFile(REGISTRY, "utf8"));
  const report = auditPortfolioRegistry(registry);
  if (args.includes("--github")) {
    report.githubVerification = await verifyGithubRepositories(report.repositories, {
      token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ""
    });
  }
  process.stdout.write(args.includes("--markdown") ? renderMarkdown(report) + "\n" : JSON.stringify(report, null, 2) + "\n");
  if (args.includes("--strict") && report.errors.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    // Never log credentials or the environment on error.
    process.stderr.write("Portfolio audit failed: " + error.message + "\n");
    process.exitCode = 1;
  });
}

