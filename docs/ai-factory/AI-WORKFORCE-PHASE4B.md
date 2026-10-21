# Omniqora AI Workforce Phase 4B — synthetic fixture sandbox

**Source-only and OFF by default.** This provides a safe rehearsal lifecycle for the existing Phase 3 / Phase 4A employee builder. It does not run a real language model, third-party MCP tools, OAuth connections, scheduling or external business actions.

## Built

The AI Employee task desk includes a Sandbox panel. An owner/admin may choose an independently approved task with no tool capabilities and one of three **synthetic** datasets: CRM funnel, Dishbee order counts or cash-flow figures. Admission requires an explicitly approved, expiring pilot configured by a trusted operator.

The manual Node worker claims only dedicated ai-workforce.fixture jobs through a service-role-only PostgreSQL RPC. The existing generic intelligence claim function excludes these jobs. The sole data input is the fixture identifier and scoped task/revision identifiers. No business context, customer records, attachments, secrets, arbitrary URLs or model prompts are given to the worker.

Outputs are deterministic, cite synthetic fixture identifiers and always report: synthetic_fixture origin, customerDataRead=false, modelCalls=0, toolCalls=0, costMinor=0 and reviewRequired=true.

Rehearsals use the canonical intelligence_jobs ledger; the separate ai_workforce_sandbox_admissions table is only an admission/lease/receipt control record. No ai_agent_runs, provider budgets or billed tokens are created. The Phase 4A employee-attribution lock remains intact.

## Tenant and worker safety

- Sandbox pilot is disabled by default. It can be enabled only by a service-role operator, with a recorded operator reference, maximum seven-day expiry and daily cap 1–20.
- New tables have forced RLS, administrator-only read policies and no browser write grants.
- Admission requires active employee/product, the workforce entitlement, independently reviewed employee profile and task brief, current employee revision and an independently approved Agent Factory use case.
- Requests are idempotent under a tenant-level daily quota lock.
- Claimer is service-role-only, scopes by tenant/product and worker reference, checks current approvals, only one attempt and a 30-minute job window.
- Settlement rechecks pilot and task/employee revision; revocation prevents a successful result.
- Worker makes only an allowlisted HTTPS connection to the specifically configured Supabase database and rejects redirects. It does not execute user-supplied scripts or invoke external providers.
- Neither PR merge nor tests activate a pilot, run a worker, publish Lovable, apply migrations to production, or change existing customer data.

## Source files

supabase/migrations/20261018210000_ai_workforce_fixture_sandbox_v4b.sql
services/ai-workforce-sandbox/fixtures.mjs
services/ai-workforce-sandbox/worker.mjs
src/modules/ai-workforce/sandbox.functions.ts
src/modules/ai-workforce/AIWorkforceSandboxPanel.tsx
verification/control-plane/ai-workforce-phase4b.test.mjs

## Verification

Run:

    bun install --frozen-lockfile
    node --test verification/control-plane/ai-workforce-phase4b.test.mjs
    bun run typecheck
    bun run build
    bun run test:security

Also require real local Supabase full migration replay, tenant/RLS/role tests, provider/worker revocation tests and all existing integration regression checks.

## Operator-only staging activation

The code is dormant. To rehearse on an approved disposable staging Supabase instance, a trusted service-role operator must call configure_ai_workforce_sandbox_pilot for an active staging tenant/product with an expiry within seven days. No pilot is seeded.

Run the worker only with securely configured, server-only variables:

AI_WORKFORCE_SANDBOX_RUNNER_ENABLED=true
AI_WORKFORCE_TENANT_ID=approved tenant UUID
AI_WORKFORCE_PRODUCT_KEY=approved product
AI_WORKFORCE_WORKER_REF=approved opaque worker identifier
AI_WORKFORCE_ALLOWED_DATABASE_HOST=exact Supabase host
SUPABASE_URL=HTTPS Supabase URL
SUPABASE_SERVICE_ROLE_KEY=server-only secret, never sent to browsers or Git

Command:

    node services/ai-workforce-sandbox/worker.mjs

The worker terminates after a single pass. Do not run it in a public CI job or production cron.

## Next — Phase 4C live read-only model pilot

A real provider-backed employee requires a per-tenant vault-backed credential, independently attested read-only permissions, region/data processing clearance, model evaluation and tariffs, atomic budget reservations through the **existing** AI Agent Factory, a certified authenticated worker with revocation and receipt reconciliation, and adversarial RLS/tool/prompt-injection tests. The synthetic sandbox does **not** prove any of those integrations live.
