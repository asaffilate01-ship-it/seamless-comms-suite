# Omniqora AI Workforce Phase 5A — supervised shadow teams

**Built in source. This is NOT autonomous multi-agent execution.**

Phase 5A creates the first reusable team composition capability for AI employees already configured in the SaaS Factory. The feature lives within the existing authenticated AI Workforce dashboard and uses the same tenant/product authority, entitlements and review process.

## Included

- Each tenant administrator can define a named shadow team and its mission purpose.
- Plans contain **2–8 distinct, independently approved AI employee configurations** in an explicit handoff order. First step is the lead, followed by analysts, researchers, reviewers or reporters.
- Each handoff records its assigned employee, responsibility and written deliverable. The database validates all members belong to exactly the current tenant and SaaS product.
- Every edit increments the team revision, clears prior sign-off and returns the plan to draft.
- An independent administrator (neither creator nor last editor) reviews and approves the current plan. A paused or retired member blocks new approval/resume. Plans can be returned for edits, paused, resumed or retired.
- A deterministic team preview shows members and ordered handoffs, but always returns **canExecute=false, modelCalls=0, toolCalls=0, customerActions=0, scheduled=false**.
- All team, step and audit tables have forced RLS with admin-only read and no browser direct write grants. Four scoped SECURITY DEFINER RPCs govern changes.
- No independent AI run ledger, schedule, MCP connector, cross-tenant data access, autonomous tool or paid model call is created.

## Source files

- supabase/migrations/20261021083000_ai_workforce_shadow_teams_v5a.sql
- src/modules/ai-workforce/teams.functions.ts
- src/modules/ai-workforce/AIWorkforceTeamsPanel.tsx
- src/modules/ai-workforce/AIWorkforcePanel.tsx (new Team Studio)
- verification/control-plane/ai-workforce-phase5a.test.mjs
- verification/staging/ai-workforce-phase5a-teams.sql

## Review/acceptance

Source CI must include:
- npm/bun build and TypeScript checking of the tenant-facing team UI and server RPCs
- existing Omniqora control-plane and Dishbee regression tests
- the full isolated Supabase schema replay
- real role-based PostgreSQL negative access tests: other tenant, viewer, self-review, duplicate employee member, stale/revised plan, unapproved member and no unexpected AI runs or queued jobs

Run a Lovable **preview-only** operator walkthrough after the feature has been merged. Do not publish the site or activate tenants as part of this PR.

## Next Phase 5B — supervised work outputs

Later, independently approved read-only employee outputs can be attached as evidence to individual handoffs and reviewed by a human manager. Before any real collaborative execution, Phase 5B must bind task/source revisions, canonical run receipts, privacy and country restrictions, verified tool grants and model budgets in a single governed admission transaction. No implicit delegation of privileges across teammates is permitted.

Production model workers, live source connectors, autonomous job scheduling, external communications, account changes, regulated decisions and payments remain separately controlled and **off**.
