# Omniqora Ruflo Phases 10–12: staging interlock, resilient receipts, operations

**Implementation:** GitHub source and isolated CI. **Not yet:** an installed real
Ruflo worker, active customer agents, staging credentials, live Supabase
migrations, production activation or model spending.

These phases build on the merged Ruflo Phases 1–9, preserve Omniqora's
canonical AI jobs and tenant permissions, and do not change the AI Workforce
or Scrapling development branches.

## Phase 10 — fail-closed staging interlock and emergency stop

Migration: supabase/migrations/20261021073000_ruflo_runtime_interlocks.sql.

The new ai_ruflo_staging_controls table has no seeded rows and defaults to
disabled. It may be set to staging_approved only by the trusted release
process via service-role database write, with an independently reviewed
platform admin identity, non-sensitive evidence reference and an expiry
no more than 24 hours ahead. A separate database trigger confirms
the independently shortlisted pilot, pinned binary and MCP tool schema
hashes, recent sandbox verification, product activation and entitlement.

The existing ruflo_probe_gate is extended so NO probe request, claim,
preflight or result settlement can report passed without this current
staging interlock. An expired or suspended stage denies work even when
the earlier Ruflo binding looks healthy.

Any authorised tenant owner/admin or platform administrator can call
stop_ruflo_sandbox with a reason of 16–500 characters. It revokes the
verified sandbox binding, suspends its staging control and denies queued
probes atomically. In-flight work must fail its next preflight/result
admission check. Stopping does NOT allow an operator to restart the
sandbox via the UI.

## Phase 11 — idempotent and safely retryable receipt delivery

services/ruflo-bridge/worker-core.mjs retries an ambiguous probe.finish
network failure a maximum of once, reusing the SAME immutable receipt ID,
claim token, tool and result. It never reruns Ruflo MCP tools on a report
retry. Provider responses and raw tool errors are not logged, persisted
or echoed. If no trustworthy receipt is acknowledged, the CLI fails
closed and the lease/reaper remain responsible for recovery.

These are only read-only MCP compatibility/health probes, not AI billing
receipts. Customer model execution, provider token reconciliation and
human-approved business actions remain separate future work.

## Phase 12 — tenant-scoped operator readiness and observability

The existing /app/intelligence Ruflo panel now shows the staging-control
state and expiry, an explicit readiness checklist, recent scoped health
probes, result counts, and an emergency-stop reason/action for eligible
operators. Each displayed check is an advisory status, never an executable
permission grant. The server selects tenant/product rows through RLS;
all real admission checks are in the database RPC and scoped worker.

The operator checklist distinguishes:
- independently shortlisted pilot
- recently verified sandbox binding
- pinned read-only MCP tool schema
- matching tenant country
- unexpired staging approval

A green checklist does NOT mean customer agents can run. Customer-agent
execution is always disabled in these phases.

## Acceptance and release plan

1. Review this PR with all three CI workflows green: full app build and
   typecheck, security, control-plane/tenant regressions, Supabase
   migration-chain replay and Dishbee binding.
2. Verify the added isolated PGlite test: no staging approval means denied;
   a synthetic separately reviewed stage permits only a scoped health
   probe; cross-tenant reads/stops are refused; a tenant owner can stop
   and prevent another probe. No real tenant is modified by this test.
3. Confirm Supabase migration history in a clean staging project, use the
   guarded staging workflow and release SHA, and do NOT apply migrations
   to production without a separately authorised release.
4. On a physically isolated, network-restricted staging worker, review
   exact Ruflo upstream commit, transitive dependencies and plugin hooks.
   Independently attest both the CLI hash and actual read-only MCP input
   schema digest. Keep source SaaS credentials and customer prompts out of
   the subprocess.
5. Create a limited, rotated service credential with only the correct
   ruflo.probe.claim, ruflo.probe.finish and ruflo.probe.reap scopes for
   the intended tenant/product. Require separate approval before inserting
   any staging_approved runtime-control row; expiry must be <=24 hours.
6. Request and process one read-only smoke probe. Confirm one receipt,
   no data exfiltration, no mutating tools, no tenant crossover and
   permission rechecks at claim/preflight/finish.
7. Test a tenant-owner emergency stop during a queued probe and after
   worker claim. Verify unapproved task status cannot be reported passed,
   and that re-enabling requires a separately reviewed release.
8. Only after a successfully evidenced sandbox pilot, design and build
   a separate production worker using canonical budgeted AI runs,
   real model-provider receipts, explicit source API permissions, robust
   independent review and tenant-level approvals for write operations.

## Checks

- node --test verification/control-plane/ruflo-phase10-12.test.mjs
- node --test verification/control-plane/ruflo-runtime-interlocks.test.mjs
- node --test services/ruflo-bridge/worker-core.test.mjs
- bun test verification/control-plane/ruflo-readiness.test.ts
- bun run build
- bun run typecheck

No artificial health rating, licence approval, model expense or
customer-agent readiness is asserted by a passing source-only CI run.
