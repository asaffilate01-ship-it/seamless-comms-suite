# Omniqora AI Workforce Phase 4E — pilot operations and model-charge safety

Status: **source implementation / review required. No live activation.**

This phase extends the read-only Omniqora CRM aggregate pilot introduced in Phase 4D. It does not give AI employees permission to edit SaaS records, contact users, book services, spend money, access regulated data or run unattended.

## What is new

**1. Operator-controlled worker allowlist.** Even the service-role-only Phase 4D claim now fails without an explicitly approved worker reference bound to one tenant, the Omniqora product and one model version. Every allowlist entry has a limited claim quota, an expiry no more than two hours ahead and a reviewed evidence reference. It is **disabled by default**. The database enforces and decrements capacity in the claim transaction, rather than relying on a browser or worker preference.

This is an additional database allowlist, **not independent cryptographic per-worker authentication**. Phase 4F must replace reliance on a shared Supabase service-role credential with short-lived worker identities and granular attested rights before any production launch.

**2. Revocation right up to settlement.** A revoked or expired permit blocks a successful model-result settlement. If an API call may already have been billed, the worker places the reservation into the existing reconciliation-required state, rather than inventing a zero-cost result.

**3. Stale-job quarantine.** A manual service-role-only function detects read-only model workers stalled for at least 15 minutes. It moves the matching canonical AI job and run to waiting review and the corresponding admission to reconciliation-required. The budget **remains reserved** until independently verified provider usage is reconciled.

**4. Emergency stop.** A privileged operator can disable the pilot and revoke all currently active worker allowlist entries for that tenant/product in one transaction, with an audit event. It never sends customer messages and never erases or silently releases uncertain charges.

**5. Tenant safety dashboard.** The AI employee CRM panel now displays active permits, quota slots, stalled workers, unreviewed outputs, uncertain charges and held amounts **separated by currency**. Operators' receipts and safety events are visible only to authorized tenant admins or platform administrators.

## Code inventory

- supabase/migrations/20261021073000_ai_workforce_operator_safety_v4e.sql
- src/modules/ai-workforce/operations.functions.ts
- src/modules/ai-workforce/AIWorkforceOperationsPanel.tsx
- src/modules/ai-workforce/AIWorkforceReadonlyPanel.tsx
- services/ai-workforce-readonly/operator-ops.mjs
- verification/control-plane/ai-workforce-phase4e.test.mjs
- verification/staging/ai-workforce-phase4e-operator.sql

## Staging verification and activation controls

Run source tests, TypeScript, build and the complete disposable PostgreSQL migration replay. Tests must prove viewer and foreign-tenant RLS denial, service-role permit expiry/claim quota enforcement, forged-worker claim refusal, independent model review, quarantine reservation retention, emergency-stop revocation and audit events.

For a human-approved staging-only operator action, supply secret variables **outside Git**, for a single execution:

    AI_WORKFORCE_OPS_ENABLED=true
    AI_WORKFORCE_OPS_CONFIRM=MANUAL_STAGING_APPROVED
    AI_WORKFORCE_OPS_ACTION=allow|disable|quarantine|stop
    AI_WORKFORCE_TENANT_ID=<approved staging tenant UUID>
    AI_WORKFORCE_PRODUCT_KEY=omniqora
    AI_WORKFORCE_ALLOWED_DATABASE_HOST=<exact staging Supabase hostname>
    AI_WORKFORCE_OPERATOR_REFERENCE=<written operator approval>
    SUPABASE_URL=<approved staging HTTPS URL>
    SUPABASE_SERVICE_ROLE_KEY=<server-side credential>

For allow/disable, additionally set AI_WORKFORCE_WORKER_REF, AI_WORKFORCE_MODEL_ID, AI_WORKFORCE_MAX_WORKER_CLAIMS and AI_WORKFORCE_EVIDENCE_URL. For quarantine, optionally set AI_WORKFORCE_STALE_MINUTES (15–1440) and AI_WORKFORCE_QUARANTINE_LIMIT (1–20). Do not put API keys in prompts, logs, browser state or public CI.

Execute once:

    node services/ai-workforce-readonly/operator-ops.mjs

The operator tool refuses production mode and does not run automatically.

## Release requirements and remaining gaps

A green GitHub PR does not prove a live provider integration or tenant activation. Production needs model-provider credentials, real staging requests, independent provider invoice comparison, GDPR/DPA/region/legal review, a dedicated short-lived worker identity, least-privilege token storage, human sign-off, and an explicit rollout. No migrations, SaaS tenant grants, provider tokens or site publishes are performed by this feature build.

Next planned phases: attested per-worker identities with narrow database RPC access; independently reconciled vendor invoices; read-only tenant connectors beyond CRM; and shadow-mode team planning before allowing supervised multi-employee collaboration.
