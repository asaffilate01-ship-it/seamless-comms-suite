# Omniqora AI Workforce Phase 4D — real, approved CRM aggregate read-only pilot

**Release state: source implementation + staged test contracts. NOT live production.**

Phase 4D is the first actual business-data read-only employee workflow. It targets the **first-party Omniqora CRM lead-count aggregates only**; Dishbee, Zivvo, Kindelo, Finvessa and other products need their own independently reviewed source adapters. It extends Phases 3, 4A, 4B and 4C.

## Data security

A tenant administrator requests permission to read source key **omniqora.crm.leads-summary.v1**. A different administrator approves it for at most 24 hours. The request and approval are tenant/product scoped and versioned; revocation invalidates new admissions and worker claims. Employee setup, task brief and Agent Factory use-case approvals are separately required.

A trusted database RPC reads only **COUNTs of CRM leads** from first-party Omniqora records belonging to the authenticated tenant. It never exports customer names, email, phone numbers, CRM IDs, notes, text or individual rows. There must be at least 10 leads; status groups smaller than 5 are returned as null. The snapshot includes a source digest and freshness timestamp.

Unlike the synthetic Phase 4B worker, the new worker is capable of sending this approved and minimised **real aggregate** to a paid model. However no model credentials, product entitlements, pilot flags or customer data are activated by a Git merge. The operator must make a separate time-limited staging activation decision.

## Budget and canonical engine

The admission transaction checks the tenant/product and workforce entitlement, source consent, independent human approvals, current employee/task revisions, no tool capabilities, independent approved Agent Factory use case, model/provider binding, verified tariffs, country clearance, 24-hour provider health, model input/output token bounds and tenant monthly budget.

It calls the EXISTING queue_budgeted_ai_agent function in the same PostgreSQL transaction, reserves the budget and creates one canonical ai_agent_runs, ai_budgeted_run_reservations and intelligence_jobs record. It then marks that job as ai-workforce.readonly, stores the minimal frozen CRM snapshot and associates the task/employee by tenant-safe foreign keys. The generic intelligence claimer is explicitly denied both ai-workforce.fixture and ai-workforce.readonly job types.

The dedicated service-role-only worker claims at most one task, rechecks the pilot, consent and approvals, receives only the already-minimised numeric snapshot and invokes a single fixed OpenAI Responses endpoint with store=false, no tools and no external actions. It does not run arbitrary SQL, visit untrusted URLs, look up contacts or send communications.

The provider's token usage is checked against the approved ceiling; the database calculates token-metered cost against the exact approved tariff version and calls settle_budgeted_ai_agent within the same transaction. The status becomes **waiting_review**, not completed. A different administrator must explicitly accept/reject the written analysis; neither action posts it externally. Model usage metering is provider-reported, token/rate based, **not independent invoice reconciliation**.

If a provider call might have incurred cost but no trustworthy completion receipt is available, the system marks reconciliation_required and **retains** the budget reservation for operator review rather than misreporting a zero-cost failure. A queued task may be cancelled through the existing atomic budget release path.

## New files

- supabase/migrations/20261020210000_ai_workforce_readonly_consent_v4d.sql
- supabase/migrations/20261020211000_ai_workforce_readonly_admission_v4d.sql
- supabase/migrations/20261020212000_ai_workforce_readonly_worker_v4d.sql
- services/ai-workforce-readonly/business-crm.mjs
- services/ai-workforce-readonly/business-worker.mjs
- src/modules/ai-workforce/readonly.functions.ts
- src/modules/ai-workforce/AIWorkforceReadonlyPanel.tsx
- verification/control-plane/ai-workforce-phase4d.test.mjs
- verification/staging/ai-workforce-phase4d-access.sql

## Operator-run staging procedure — not executed by this source PR

1. Require parent PRs #138, #143, #147 and #149 merged in order and a full migration dry-run/replay, plus a successful full main CI.
2. Complete GDPR processing, lawful-basis, region, source contract, DPA and customer consent reviews. Use a disposable pilot tenant/product initially.
3. Configure omniqora.ai-workforce and omniqora.intelligence-runtime entitlements for that **specific** pilot tenant. No existing tenant gets automatic activation.
4. Register a real OpenAI provider binding in the target environment and independently verify its credential health, model version, approved region, tariff and quality evaluation. Do not seed fake approval/health timestamps in production.
5. Set the tenant's monthly AI budget, request/review the CRM source, approve employee configuration, task brief and Agent Factory use case with different reviewers.
6. A privileged service-role operator invokes configure_ai_workforce_readonly_pilot with enabled=true, an expiry within 24 hours, daily_limit up to 8, maximum per-run minor-unit budget and an audit reference.
7. Run only a single manual worker pass in **staging** after supplying server-only environment variables. Never run this worker in public CI or an arbitrary SaaS tenant context.

Required server environment for the manual worker:

    AI_WORKFORCE_READONLY_PILOT_ENABLED=true
    AI_WORKFORCE_READONLY_CONFIRM=CONSENTED_AGGREGATE_APPROVED
    AI_WORKFORCE_TENANT_ID=<approved staging tenant UUID>
    AI_WORKFORCE_PRODUCT_KEY=omniqora
    AI_WORKFORCE_WORKER_REF=<approved worker identifier>
    AI_WORKFORCE_MODEL_ID=<approved versioned Responses model>
    AI_WORKFORCE_ALLOWED_DATABASE_HOST=<exact approved staging project host>
    AI_WORKFORCE_PROVIDER_TOKEN=<server-only verified provider key>
    SUPABASE_URL=<staging Supabase HTTPS URL>
    SUPABASE_SERVICE_ROLE_KEY=<server-only staging credential>

Command: node services/ai-workforce-readonly/business-worker.mjs

The worker refuses NODE_ENV=production and does not schedule itself. Do not include key values in Git, logs, model input, email or screenshots. No live keys or customers have been configured by this task.

## Test requirements

    node --test verification/control-plane/ai-workforce-phase4d.test.mjs
    bun run typecheck
    bun run build
    bun run test:security

Plus a complete disposable Supabase migration-chain replay, real tenant A/B and viewer negative tests, source revocation, real SQL count suppression, a mocked external model response, metered receipt settlement, monthly quota, independent output review, no-tools and no-actions tests. The Phase 4D staging test is invoked as part of the parent local PostgreSQL test transaction and rolls all fixture data back.

## Next: production certification and product expansion

Phase 4D does **not** certify a live paid model invocation or production readiness. The next gate is an operator-run staging smoke with verified credential and real usage receipts, followed by invoiced-cost reconciliation and a separate architecture/security release sign-off. Subsequent sector-specific adapters must enforce original SaaS source authority, country, role, consent, scopes, tool contracts and independent data protection.
