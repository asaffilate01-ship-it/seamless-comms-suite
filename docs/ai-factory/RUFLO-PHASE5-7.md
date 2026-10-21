# Ruflo Phase 5–7: scoped sandbox probe worker and controlled staging rollout

**Status: source and CI only. No production Ruflo worker, vendor credentials,
customer AI swarms or migration deployment are asserted.**
Parent draft PR: Omniqora Ruflo Phase 1–4. This change is a dependent branch.

## What is implemented

### Phase 5 — isolated read-only MCP worker

- services/ruflo-bridge/worker.mjs is a one-shot CLI with an explicit enable
  variable and a required --once switch. It never runs from the public web app.
- services/ruflo-bridge/worker-core.mjs performs a scoped claim, independent
  preflight, pinned Ruflo CLI/MCP handshake, second preflight immediately before
  one allowlisted health tool, then records a metadata-only result. The raw
  upstream tool output is never sent to Omniqora or the console.
- The local fixture and worker-core tests cover zero jobs, legitimate success,
  changed tenant region, version digest mismatch, expired lease, revoked pilot,
  unsafe tool names, and errors that might contain confidential content.
- Do NOT install the upstream package automatically; the entry path and
  immutable SHA-256 must be vetted with transitive dependencies and plugin
  hooks. This source does not attest a real Ruflo installation.

### Phase 6 — server authority, leases and receipts

- The migration creates ai_ruflo_probe_tasks: one active queued/claimed task per
  tenant/product, at most five requests in 24 hours, one idempotency key per
  request, no prompt/tool-argument column and tenant-scoped read-only RLS.
- Only an authenticated owner/admin can request a no-content health probe;
  the pilot must be independently shortlisted and sandbox-verified, with
  current binding digest, region, entitlement and active product.
- The dedicated /api/platform/ruflo-probe server gateway requires an existing
  platform_service_credentials record with exact tenant/product and scoped
  capabilities:
  - ruflo.probe.claim for claim and preflight
  - ruflo.probe.finish for result reporting
  - ruflo.probe.reap for lease cleanup
- Sub-location/brand credentials cannot silently act on the entire product.
  The worker never receives a Supabase service-role credential.
- The SQL claim uses FOR UPDATE SKIP LOCKED, a two-minute lease and a unique
  claim token bound to the credential key ID. Preflight, receipt reporting,
  and expiry reclamation are trusted-service-only functions.
- The server checks tenant region and AI entitlement. SQL independently
  rechecks country, pilot review, verified binding, tool allowlist, product,
  entitlement and freshness at claim, preflight and reporting. Revoked jobs
  are never reported as passed even if a remote probe returned success.
- Receipt contents are limited to tool name, result category, scoped references
  and timestamp; the actual MCP output, model completion and raw errors are
  not persisted.
- Reaper is an explicit trusted action; expired tasks may retry once and become
  timed_out after the second lease. An old token cannot finish a new claim.

### Phase 7 — visible pilot controls

Existing Omniqora /app/intelligence Ruflo area can show the probe queue, tool
selection and status once the migrations are applied and the tenant was
independently approved. Users cannot spawn Ruflo, activate tenants, override
the region, install plugins or claim work from the UI.

## Staged operator procedure (not executed by repository changes)

1. Merge Phase 1–4 after review and green CI; then merge this dependent PR,
   only after the full migration replay and security/tenant negative checks.
2. Apply both Supabase migrations in an isolated Lovable/Supabase staging
   project. Do not apply automatically to production. Confirm separate UK and
   DE tenant isolation and no ability for browser roles to call worker RPCs.
3. Review Ruflo upstream exact commit, dependency lock, licence conditions,
   binary integrity and MCP tool schemas, provenance, outbound endpoints,
   plugin hooks and whether the tool can write hidden local state. Sandbox
   the process with separate filesystem and network egress controls.
4. Create a staging tenant with active product/AI entitlement; request pilot
   from a tenant admin, and have a *different* platform administrator
   shortlist it. Independently attest isolated Ruflo and write its
   ai_ruflo_tenant_bindings evidence using an approved service-role process.
   Never seed fake evidence to enable production.
5. Provision an expiring, hashed, rotated, tenant+product-bound
   platform_service_credentials identity through the existing secure
   service-identity provisioning process. Grant only required
   ruflo.probe.claim / .finish / .reap capabilities to that worker.
6. Run one on-demand synthetic read-only health probe from a dedicated sandbox
   host. Environment fields (populate via a secure secret manager, not Git):

    RUFLO_ENABLE_SANDBOX_WORKER=1
    RUFLO_TENANT_ID=<staging-tenant-uuid>
    RUFLO_PRODUCT_KEY=dishbee
    RUFLO_REGION=GB
    OMNIQORA_RUFLO_GATEWAY_URL=https://<staging-host>/api/platform/ruflo-probe
    RUFLO_WORKER_CREDENTIAL=<scoped-key-id.secret>
    RUFLO_CLI_PATH=/opt/omniqora/vendor/ruflo/bin/cli.js
    RUFLO_BINARY_SHA256=<independently reviewed sha256>
    RUFLO_SANDBOX_DIR=/var/lib/omniqora-ruflo-sandbox

   Command: node services/ruflo-bridge/worker.mjs --once

7. Check the tenant-scoped request, claim and probe receipt and that the
   output contains no customer content. Revoke pilot mid-run to prove
   denied status and no live privileges. Test two-worker contention,
   credential revocation, cross-tenant failure, wrong region, malformed MCP,
   timeout, retry, stale hash and idempotent finish.
8. Only then design a **separate, budgeted agent-execution worker** over the
   canonical Omniqora ai_agent_runs, intelligence_jobs and
   ai_budgeted_run_reservations. It must also verify real model tariffs,
   vendor receipts, tool effects, product data permissions, redaction,
   approval routing and source SaaS access. That real worker does NOT exist
   in this release; the probe worker does not claim customer AI jobs.

## CI verification

    node --test services/ruflo-bridge/ruflo-bridge.test.mjs
    node --test services/ruflo-bridge/worker-core.test.mjs
    node --test verification/control-plane/ruflo-pilot-contract.test.mjs
    node --test verification/control-plane/ruflo-probe-worker-contract.test.mjs
    bun run typecheck
    bun run build

Plus the repository's forced-RLS and full Supabase migration-chain workflows.

## Unmet production gates

No real Ruflo swarm orchestration, persistent tenant memory, customer-specific
agents, automated messaging, writes, payment or regulatory actions. No claim
that the real Ruflo MCP server supports the documented health tools on the
selected binary version until independently observed in an isolated stage.
