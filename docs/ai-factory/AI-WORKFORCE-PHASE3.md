# Omniqora AI Workforce — Phase 3

**Source-only configuration release candidate; not an active employee runtime.** This extends the SaaS Factory and canonical Agent Factory. It does not integrate ChatGPT Dot, invoke models, connect MCP/OAuth apps, enable a schedule or publish Lovable.

## The ten-step employee wizard

Authenticated path: /app/ai-employees.

1. Create a named employee.
2. Select a role and existing Agent Factory blueprint.
3. Define goals and responsibilities.
4. Record business context without secrets or personal customer data.
5. Request blueprint-defined capabilities (requests are **not** grants).
6. Record instructions, safeguards and SOP references.
7. Propose manual/daily/weekly/event workflow triggers (saved **disabled**).
8. Record a deterministic configuration preview (zero model calls, tool calls or scheduler actions).
9. Submit for a different administrator to review.
10. Approve configuration, pause, resume or retire; monitor history and any future canonical runs.

Statuses: draft, pending_review, approved_configuration, paused, retired. No active status exists in Phase 3. Configuration sign-off does not enable autonomous actions. Editing clears prior approval and adds an immutable profile revision.

## Tenant boundaries and security

The migration only registers the beta, manually provisioned service omniqora.ai-workforce in the catalogue and maps it to Omniqora with default_enabled=false. It does **not** activate any tenant, credentials, billing, connections, model or scheduler. A platform/tenant operator must explicitly enable this add-on in Tenant Factory after staging acceptance.

Authentication and tenant owner/admin roles are enforced in TanStack server functions and independently inside SECURITY DEFINER SQL RPCs. Mutations require an active tenant product and the workforce entitlement. Four tables have owner/admin-only SELECT policies, forced RLS and no browser write grants. Every profile/revision/preview/audit event is scoped to tenant and product via composite foreign keys. The optional employee reference on canonical ai_agent_runs is also product-and-tenant scoped.

Profiles are stored as immutable revisions plus current snapshots. Requested capabilities stay inert. The server validates them against product-specific blueprints; SQL rejects unrecognized profile fields, oversized data and executable triggers. Audit events and previews are append-only via governed RPCs. Independent approval excludes the creator and last editor.

## Source files

- supabase/migrations/20261018110000_ai_workforce_phase3.sql
- src/modules/ai-workforce/functions.ts
- src/modules/ai-workforce/AIWorkforcePanel.tsx
- src/routes/_authenticated/app.ai-employees.tsx
- src/components/app/shell.tsx
- verification/control-plane/ai-workforce-phase3.test.mjs

No duplicate AI run ledger or executable agent scheduler is introduced.

## Validate before any tenant activation

Commands:

    bun install --frozen-lockfile
    node --test verification/control-plane/ai-workforce-phase3.test.mjs
    bun run typecheck
    bun run build
    bun run test:security
    bun run test:control-plane

Require successful isolated-local-Supabase complete migration replay and evidence from the migration-chain workflow. Static contract tests do not replace an actual PostgreSQL negative-access test.

Test cross-tenant query denial for tenant A vs tenant B through REST, direct SQL and RPC; agent/viewer role denial, anonymous calls, forged JSON fields, unapproved capabilities, disabled entitlements and non-active products. Test independent reviewer constraints, paused/retired records, resetting approval after edits and immutable version history. Prove previews record modelCalls=0, toolCalls=0, scheduleEnabled=false, canExecute=false; confirm there is no intelligence_jobs or ai_agent_runs insertion. Check row-level access in a throwaway Supabase database with realistic auth identities. Manually smoke-test in Lovable preview only.

## Next phases

Phase 4: verified hosted worker, approved model/provider/tariff, service credentials, tenant-specific vault/OAuth/MCP grants, idempotent schedules, explicit source authorities, action approvals, revocation and actual usage receipt reconciliation. Reuse the existing queue_budgeted_ai_agent, ai_agent_runs, intelligence_jobs and ai_action_proposals.

Phase 5: supervised teams, delegation, performance analytics, white-label employee packages, commercial subscriptions and evidence-based evaluations.

**Release gate:** a green source PR is not a production migration or publish. Production activation requires explicit approval after real staging security and provider tests.
