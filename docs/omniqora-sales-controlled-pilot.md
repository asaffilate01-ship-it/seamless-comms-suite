# Omniqora Sales — controlled pilot

## Scope and release boundary

This phase extends the existing shared CRM, prospect lists, sales sequences and enrollment tables. It adds an authenticated `/app/sales` workspace and an Omniqora Sales sidebar entry. It is NOT an enabled outbound-sales service. No tenant entitlement, production migration, real call, outbound message, calendar event, AI generation job or vertical-product connection is activated by this change.

The service gate is `omniqora.sales-engagement`. The older `omniqora.sales` catalogue entry and legacy Growth rows are not automatically migrated or treated as equivalent entitlements. Managed sequences and enrollments have `runtime_version=1`; existing legacy data remains unchanged and is not silently activated.

## Implemented workflow

1. Select a tenant and optionally a product view. Search existing CRM people; this is not a second CRM or an imported prospect database.
2. Create a prospect list and add/update a person's membership. Fit, intent and engagement are manually reviewed scores, averaged with recorded evidence. They are not AI propensity predictions.
3. Build an ordered cadence with 1–30 call, task, email, WhatsApp or SMS steps. Delays are in whole minutes from enrollment or completion of the preceding step. Draft creation does not activate it; an owner, administrator or platform administrator must activate the sequence.
4. Enroll an existing CRM person. The runtime checks tenant identity, optional lead/person consistency and persistent sales suppression. Retrying the same sequence/person enrollment returns the existing record, including terminal records. It never implicitly restarts one.
5. Prepare due actions. This is an explicit, authenticated tenant-wide batch (maximum 50 in the UI, 100 via RPC), NOT a deployed scheduler. Call/task steps create linked CRM tasks. Message steps create content for review. Already-prepared drafts and unfinished tasks cannot starve later batches.
6. Complete manual work in Sales with an outcome note to complete its linked CRM task and advance once. A task completed/cancelled in CRM is reconciled on the next preparation call. Delays are not replaced by fabricated delivered events.
7. Review a message as an administrator. Its status becomes `approved_blocked`. It is not sent, its enrollment does not advance, and no user-facing RPC can mark a message as delivered or sent. Content review is not a consent or channel-policy decision.
8. Pause, resume or cancel an enrollment; archive a sequence to cancel its pending managed work. Terminal records cannot restart.
9. Manually record a sourced reply, external meeting booking or sales opt-out. Active and paused managed cadences for that CRM person stop across the tenant, including already-approved blocked drafts. Scheduled records inserted/updated in `sales_meetings` also stop follow-up; this is not a Google/Outlook calendar integration.

## Security and data boundaries

Managed mutations run through Zod-validated authenticated server functions and independently checked database RPCs. Database checks cover membership, write role, Sales Engagement entitlement, administrator-only activation/content review, canonical tenant references, immutable enrollment snapshots and allowed transitions. Direct authenticated REST writes cannot edit/downgrade managed sequence/enrollment rows, approve action records, clear suppression or execute private helpers.

New action/event/suppression tables have row-level security and no authenticated direct-write grants. Composite foreign keys bind action enrollments, linked tasks and outcome people to the same tenant. Security-definer functions use an empty search path; default PUBLIC/anonymous execution is revoked. Tenant-scoped advisory transaction locks, unique enrollment/action keys and row locks protect managed mutations. These are implementation controls; the PGlite suite is not a multi-process production load test.

Suppression is keyed by tenant and canonical CRM person, not by every possible duplicate email/phone identity. Recipient normalization, duplicate-person resolution and channel/address-level suppression are mandatory before enabling real delivery. A reviewed re-permission workflow is not implemented. Product keys tag a sales context inside a tenant; they do not establish live Haccora, Dishbee, Syndriva, SparesGrid, FastRemit, TaxNuvia or Lawquo data bridges, nor separate per-product ACLs.

The UI is deliberately bounded and labels counts as loaded records. Large-team pagination, queue-level totals and portfolio revenue reporting are not provided by these counters. Product filters affect the view; batch preparation and stop outcomes are tenant-wide. Changing tenants resets local drafts, selected people and evidence.

## Verification and controlled deployment

CI runs the full repository migration chain in isolated PGlite databases, the sales runtime regressions, the queue-fairness regression, then the existing build, type, security, bridge, control-plane, automotive and service checks. The normal Vite build generates the new TanStack route before type checking.

Local/CI commands (from the repository root):

```sh
bun install --frozen-lockfile
node verification/control-plane/sales-runtime.test.mjs
node verification/control-plane/sales-queue-fairness.test.mjs
bun run build
bun run typecheck
bun run test:security
bun run test:control-plane
```

New migrations, in order:

- `20261005090000_sales_workspace_runtime_v1.sql`
- `20261005091000_sales_runtime_fair_queue.sql`

Before publishing: review the target environment, back up its database, apply migrations through the normal approved deployment process, explicitly enable the correct Sales Engagement entitlement for a controlled pilot tenant, and verify `/app/sales` with test CRM contacts. Test owner/admin, agent, viewer and foreign-tenant sessions. Confirm opt-out and booking stop behavior, task completion, duplicate retries and the delivery-blocked state. Do not seed real prospects or enable providers as part of a schema smoke test.

If a rollout must stop, pause/archive pilot sequences or revoke their tenant Sales Engagement entitlement through the control plane. Do not delete historical CRM tasks or run destructive down-migrations against populated tables. Keep an operational route for recording real opt-outs even when paid sales access is suspended; production ingestion must not depend on a salesperson's paid entitlement.

## Next phases — still required

- Connect-governed outbound dispatch: per-channel permission evidence and sender policies, verified identities, frequency caps, local quiet hours, WhatsApp template/session rules, provider bindings, signed webhooks, idempotent provider sends, delivery receipts, retries and dead-letter handling. Stop/cancel checks must run again immediately before dispatch, not only during preparation.
- Authenticated inbound reply/opt-out processing. This phase offers manual outcome recording and sales-meeting database triggers, not live inbox webhook wiring. Test the race between provider delivery claims and stop events with real PostgreSQL workers and controlled provider sandboxes.
- Evidence-backed AI research and draft generation through the existing governed AI service, with model/cost traces and approval. No template in this phase is presented as AI-generated.
- Actual calendar availability, round-robin booking, reminders and no-show flows; automatic meeting/opportunity linkage where appropriate.
- Haccora or Dishbee end-to-end pilot, then explicitly configured product bridges and commercial handoff for the remaining portfolio. FastRemit sales qualification must remain separate from regulated account approval.
- Cursor pagination, normalized recipient suppression, reviewed re-permission, multi-process concurrency/load tests and authenticated browser acceptance tests before production-scale use.
