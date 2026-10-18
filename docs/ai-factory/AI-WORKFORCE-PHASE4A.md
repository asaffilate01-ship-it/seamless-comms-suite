# Omniqora AI Workforce — Phase 4A: supervised task desk and access proposals

**Stacked on PR #138 / Phase 3.** Source-only addition; still **no live AI employee execution**.

## Delivered

- A tenant/product/employee-scoped Task Desk embedded in step 10 of the AI Workforce wizard.
- Admin-created task briefs with an objective, output spec, acceptance criteria, proposed tool capabilities and disabled timing. Jobs are never enqueued by these APIs.
- Independent task review, immutable event history. Approved briefs do not execute anything.
- Employee-level connector access proposals, limited to capabilities already proposed in the saved employee profile. A different admin may shortlist metadata. This never connects OAuth, MCP, source data, secrets, or provider tools.
- Deterministic read-only preflight reports checking configuration/version, use-case review, budget, entitlement and access review. Execution remains unconditionally blocked by employee_execution_not_deployed and capability_grants_not_verified. Results always contain canExecute=false, modelCalls=0, toolCalls=0 and queuedJobs=0.
- Canonical AI run employee association is temporarily blocked in the database, including existing tenant-writable run APIs, until a separately certified employee worker is available.
- Forced PostgreSQL RLS, tenant/product composite foreign keys, admin-only SELECT, and privileged role-checked write RPCs. No authenticated user can directly mutate new tables.
- Proposed manual/daily/weekly/event workflows with strict values, all disabled. No scheduler, webhook subscription or cron executor.
- Regression tests for the new source and checks.

## Architecture / authority

The platform continues to use existing SaaS Factory tenant/role/entitlement and Agent Factory templates. The Intelligence core owns AI use cases, the canonical ai_agent_runs and intelligence_jobs ledgers, action proposals and budget reservations. Phase 4A adds only a reviewed *manual brief* ledger, not a competing run ledger or actual model worker.

The access proposal status shortlisted_metadata is specifically NOT a verified connector grant. A valid-looking provider identifier cannot confer MCP tools or data access.

## Pre-release checklist

1. Reconcile and merge parent Phase 3 PR #138 to current main.
2. After review, merge the stacked Phase 4A PR, requiring build, TypeScript typecheck, security tests, dedicated Phase 3/4A tests and isolated full Supabase migration-chain replay.
3. In disposable staging, test: foreign tenant data, anonymous/agent/viewer access, direct table INSERT/UPDATE/DELETE, unauthorized capability keys, forged enabled triggers, unsafe event keys, replayed idempotency, independent review, changed employee versions, paused/retired employee and cancelled briefs.
4. Verify normal ai_agent_runs insertion with NULL employee ID remains possible while any non-NULL employee attribution is rejected, even for service_role.
5. Activate the manually gated omniqora.ai-workforce add-on only for an explicitly approved pilot tenant.
6. Preview the UI in Lovable. Do not publish or apply production migrations from this PR automatically.

## Next gated phase — 4B

Introduce a separately authenticated, revocable read-only worker with real per-employee capability attestations, approved model/provider pricing, source permissions, regional rules and bounded reservations. The future workforce admission RPC must atomically confirm employee status, revision, task approval, tenant grants, source API trust, idempotency, spending limits and independent action approval before sending a job to existing canonical ledgers. Maintain human approval for external messages, money movement, regulatory filings, employment decisions and safeguarding actions.

A code merge does not prove live provider credentials, customer tenant activation or worker readiness.
