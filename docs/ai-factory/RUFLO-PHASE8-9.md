# Ruflo Phase 8–9: independently attested MCP and synthetic multi-agent rehearsal

**Status: source implementation; no live Ruflo agents, model inference, plugins,
OAuth or customer data. This PR depends on Ruflo Phase 5–7 and Phase 1–4.**

## Phase 8 — verify actual MCP tool schemas, not just upstream names

- services/ruflo-bridge/manifest-attestation.mjs hashes the canonical JSON
  input schemas of exactly the approved read-only health tools:
  swarm_health, swarm_status and agent_list.
- Rejects duplicate tool names, unexpectedly required arguments, malformed or
  oversized manifests, and tool-signature drift.
- The worker requires BOTH a vetted Ruflo CLI SHA-256 and an independently
  reviewed read-only MCP schema digest. A newly installed version that changes
  either value refuses execution, even if the tool still has the same name.
- The database migration adds probe_manifest_sha256 to
  ai_ruflo_tenant_bindings. A verified sandbox cannot operate without a valid
  recorded digest, a shortlisted tenant pilot, active product and entitlement,
  correct country and fresh independent verification.
- The existing trusted preflight function returns the stored schema digest;
  the worker compares it to its own per-tenant environment pin and to the
  schema actually discovered from the pinned Ruflo process.
- This protects the explicit read-only bridge. It does NOT mean Ruflo's
  plugin ecosystem, hidden hooks, local filesystem writes, network access,
  dependencies or arbitrary AI agents have been audited.

### Pin and smoke procedure

On an isolated host, review exact upstream source commit, lockfiles,
transitive dependencies, licence and file hashes, then run
services/ruflo-bridge/probe.mjs with RUFLO_CLI_PATH, RUFLO_BINARY_SHA256 and
RUFLO_SANDBOX_DIR. It prints the calculated safe-tool schema fingerprint and
nothing from upstream tool outputs. Have an independent reviewer attest this
fingerprint in the sandbox binding using the approved service-role release
process. After recording evidence, give the worker RUFLO_MANIFEST_SHA256 in
its own secure environment, alongside the pinned CLI hash and the restricted
gateway credential. No automatic production installation is authorised.

## Phase 9 — agent-team shadow rehearsal

services/ruflo-bridge/shadow-missions.mjs runs deterministic, offline
coordination of three simulated roles: coordinator, analyst and independent
verifier. The synthetic domains are Dishbee menu indicators, Finvessa
accounting control indicators and Omniqora support KPIs.

- All input fixtures are built into the source and contain no customer data.
- Plans have a fixed three-step dependency chain, zero model and external
  tool calls, no write permissions, and no inference API budget.
- Tampered metrics, missing evidence or skipped independent verification
  produce a blocked outcome, not an "approved" agent result.
- The verifier's check and deterministic evidence digest support future
  policy design, but do NOT constitute live Ruflo swarm execution or
  accurate model-quality evaluation.

## CI and rollout

Run:
  node --test services/ruflo-bridge/manifest-attestation.test.mjs
  node --test services/ruflo-bridge/shadow-missions.test.mjs
  node --test services/ruflo-bridge/worker-core.test.mjs
  node --test verification/control-plane/ruflo-phase8-9.test.mjs
  bun run build
  bun run typecheck

The full existing Supabase replay, RLS/security and Factory suite must also pass.
Merging source commits does not apply database migrations to Lovable or deploy
a worker. In staging, confirm a previously verified binding missing a tool
manifest is rejected; confirm tenant A's verified schema cannot grant access
to tenant B; confirm a changed MCP schema is refused even when the executable
hash matches. Repeat a real pinned isolated Ruflo smoke only after security
review, then implement a separate budgeted customer-agent worker with verified
provider receipts, actual source SaaS permissions and independent action review.
