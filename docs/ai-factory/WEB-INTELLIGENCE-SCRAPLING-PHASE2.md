# Omniqora Scrapling Web Intelligence — Phase 2 monitoring

**Status:** Reviewable source only; stacked on Phase 1 PR #145. **NOT deployed, enabled, or published**.

## New capabilities

1. Tenant/product-specific approved-source monitors, initially paused.
2. Explicit tenant owner/admin schedule enablement: every 24h, 72h, or 168h.
3. Reuse of the private Phase 1 claim endpoint: with the worker online, each polling claim transaction performs a bounded retention cleanup and schedules at most 10 due monitors.
4. Two outstanding jobs per tenant, one request per tenant/source per hour and a maximum of 10 monitors per tenant. The same reviewed source and active-product/entitlement gates apply to both manual and scheduled jobs.
5. Snapshot comparison by SHA-256, **within the same tenant, product and source only**, identifying baseline, changed, and unchanged text content.
6. In-app change evidence and provenance, no automatic customer alerts, AI ingestion or business mutations.
7. Snapshot body retention: 7, 30, or 90 days for scheduled jobs, 30 days for manual jobs. Expired content becomes unreadable through RLS even if the worker is offline. Pruning physically removes expired text in bounded batches on later polls. Hash-only change metadata lasts at most 120 days.

## Where to find it

Existing Connector Hub > Omniqora Web Intelligence > Phase 2 Source monitoring and changes. This is the *existing tenant/product context*: no parallel customer record or new SaaS tenant.

## Security / permissions

- Only independently approved public HTTPS sources can be scheduled.
- Source proposal and independent review remain landlord-admin actions.
- Tenant owner/admin (or platform admin) can configure monitors only for an active product with the Web Intelligence entitlement. No direct browser INSERT/UPDATE/DELETE table grants.
- The configure_web_intel_monitor RPC validates interval, retention, source, tenant, role and entitlement in PostgreSQL.
- The internal scheduler and purge functions are SECURITY DEFINER with EXECUTE revoked from browser roles; the private API credential remains the only route to triggering worker polls.
- The scheduler does not accept URLs, selectors, tenants or credentials from workers. It queues jobs from the separately approved source registry only.
- Browser change feeds are row-level scoped to tenant and product. No external HTML is displayed; extracted text is rendered as ordinary text and remains untrusted.
- A "changed" event is evidence of a new normalized text fingerprint, **not** a verified change in pricing, law or eligibility. Any future RAG/GraphRAG or AI action needs a separate approved, cited, validated pipeline.
- Source revocation prevents future claims and successful receipts. Pausing a schedule does not cancel already queued work.
- Deploying a worker still requires network-layer outbound restrictions against private/link-local/metadata addresses and DNS rebinding, as detailed in Phase 1.

## Pilot acceptance scenarios

Use a disposable local/staging Supabase with test users and a permitted controlled web fixture; never test against arbitrary customer websites.

1. User A submits a source; distinct platform reviewer B approves it. A cannot self-approve.
2. Tenant alpha gets the service entitlement and an active product; tenant beta does not. Alpha can configure a monitor, beta cannot.
3. Monitor starts paused and cannot auto-queue. Explicit enablement makes it due at the next authenticated worker poll. Confirm job idempotency, per-tenant quotas and 24h/72h/168h cadence.
4. Initial content creates an initial event. Repeated identical content creates unchanged; modified content creates changed. Alpha cannot see beta's documents, changes or monitors even when both have the same source.
5. Stop the worker; expired documents should no longer be readable to normal users. Start the worker: expired content is physically deleted, leaving bounded hash-only metadata.
6. Revoke a source, suspend a tenant service, inactivate a product and pause a monitor in turn: no new job should be claimed for those disabled conditions. Confirm that an already queued job is not automatically cancelled.
7. Test lease replay, invalid receipts, SQL RPC denial for unauthorised browsers and changes made concurrently by two tenants.
8. Review the SQL migration replay and the full Omniqora build/typecheck/security/regression suite. Record staging acceptance evidence and outbound egress validation separately.

## Files and verification

- Migration: supabase/migrations/20261018235300_web_intelligence_monitoring_phase2.sql
- Tenant server functions: src/modules/web-intelligence/functions.ts
- UI: src/modules/web-intelligence/WebIntelMonitoringPanel.tsx linked from WebIntelligencePanel.tsx
- Contract regression: verification/control-plane/web-intelligence-phase2.test.mjs
- CI: existing .github/workflows/verify.yml and migration-chain workflow

Suggested commands:

    node --test verification/control-plane/web-intelligence-phase2.test.mjs
    bun run build && bun run typecheck && bun run test:security

Full local Supabase migration-chain replay takes place through the pull request workflow.

## Remaining before live release

Independent RLS/SECURITY DEFINER review; full SQL scenario tests with staging identities; actual deploy of the Python worker and firewall; source legal/robots checks; operational ownership; throttling and retention sign-off; monitoring/alerts for failed jobs; and subsequent AI integration review.

Next possible phases: opt-in notification routing through Omniqora Connect, review-only RAG/GraphRAG ingestion with source citations, quality-scored extraction, and product-specific read APIs.
