# Ruflo orchestration in Omniqora — Phase 1–4 guarded pilot

**Status (18 October 2026): source implementation and isolated tests only, NOT live customer execution.**

Upstream: https://github.com/ruvnet/ruflo ; main Ruflo repository has an MIT licence. Audit third-party components and plugins separately.

## Phase 1 — isolated MCP adapter

The CLI smoke harness under services/ruflo-bridge/ connects to an independently reviewed, already-installed Ruflo CLI with MCP stdio JSON-RPC. It refuses npm/npx downloads, arbitrary shell commands, inherited SaaS credentials and non-allowlisted tool execution. Only swarm_health, swarm_status and agent_list may be probed. No customer data, real tenant work, model billing, Ruflo memory writes or source SaaS APIs are exposed.

Operator smoke from an isolated host with vetted package lockfile and dedicated workspace:

    RUFLO_CLI_PATH=/opt/omniqora/vendor/ruflo/bin/cli.js \
    RUFLO_BINARY_SHA256=REVIEWED_LOWERCASE_SHA256 \
    RUFLO_SANDBOX_DIR=/var/lib/omniqora-ruflo-sandbox \
    node services/ruflo-bridge/probe.mjs

Do not use a floating @latest installer in production. The CLI-entry hash alone does not attest transitive dependencies or hooks. The host must have a dedicated HOME, OS/container isolation, deny-by-default network egress, storage/CPU quotas and audited package provenance.

## Phase 2 — integration with existing AI Factory

- Existing /app/intelligence shows tenant/product-scoped Ruflo pilot status, reviews and safe probe receipts, plus a request-for-review action.
- Existing /app/mcp-review shows independent platform reviewer decisions.
- Existing Omniqora ai_use_cases, ai_agent_runs, intelligence_jobs, ai_agent_steps, ai_action_proposals, ai_budgeted_run_reservations, provider tariffs, RLS and tenant membership remain authoritative. No second customer-agent ledger or direct SaaS write path is introduced.
- Shortlisting a request is only permission to pursue engineering review; it is not installed, connected, funded or authorised to run a model.

## Phase 3 — tenant controls

Migration: supabase/migrations/20261018231500_ruflo_orchestrator_pilot.sql

The schema adds scoped pilot requests, unseeded and disabled-by-default Ruflo tenant bindings and metadata-only probe receipts. Row-level access is limited to the tenant/product and platform administrators. Only a trusted service-role deployment process may write independently verified sandbox binding evidence. The schema allows no production-active state. An independent platform administrator must review requests; the author may not self-approve. Probe receipts reject references to other tenants' runs/jobs.

services/ruflo-bridge/sandbox-policy.mjs provides **planning only**. It requires matching tenant/product/run/job, vetted read-only tools, independently reviewed binding, reserved budget, queued job, active entitlement, matching region, standard-risk classification and zero customer content. Any missing condition blocks the probe. The future runtime must re-authorise all of these from trusted sources before each step.

## Phase 4 — AI employee/workflow strategy

Ruflo will coordinate only approved existing Omniqora blueprints across executive/analytics, CRM/support, finance/accounting, compliance/legal/HR and technology/creative areas. During this pilot, each category is metadata/health-check only: no personal/regulated data, outbound messages, financial transactions, payroll, tax filings, automatic publication, memory sharing or unrestricted agent execution.

**Not delivered:** real Ruflo swarm execution on tenant data, GraphRAG/RuVector tenant memory, credential vault/OAuth, provider cost settlement, customer opt-in, external autonomous workflows, deployed worker, applied Lovable/Supabase migration or live tenant activation.

## Go-live acceptance steps

1. Review the feature PR and pass Bun build/typecheck, security, Node tests, migration-chain SQL and forced-RLS checks.
2. Apply migration only through staged Lovable/Supabase release controls; verify cross-tenant and non-admin denials in a real database.
3. Inspect and pin exact Ruflo version, plugin/hook dependencies, licences, tool schemas, data retention, session persistence, network egress and reproducible security evidence.
4. Launch a per-region, per-tenant isolated sandbox and independently attest safe MCP probes. Record verified immutable evidence using only the trusted service role, never a browser.
5. Implement the future job worker against existing scoped service identity and only the existing budgeted intelligence job queue. Recheck active product, entitlement, approved blueprint, reserved spend, provider tariff, source permissions, tenant/region and tool scopes on every step.
6. Keep all model calls on the governed model gateway. Agent writes must become reviewed Omniqora action proposals executed via product APIs, never direct Ruflo DB writes. Validate tool-output prompt injection, secrets, SSRF, revocation and approvals.
7. Settle actual provider receipts through trusted workers. Negative-test claim races, cancellation, replay/idempotency, overage, rate limits, leaked scopes, region changes, tenant changes and worker restarts.
8. Pilot with synthetic data for Dishbee analytics and accountant-reviewed Finvessa drafts before opt-in production deployment.

## Verification

    node --test services/ruflo-bridge/ruflo-bridge.test.mjs
    node --test verification/control-plane/ruflo-pilot-contract.test.mjs
    bun run typecheck
    bun run build

The included fake MCP fixture proves local protocol and safety gates only. It does not establish compatibility with a real upstream Ruflo release.
