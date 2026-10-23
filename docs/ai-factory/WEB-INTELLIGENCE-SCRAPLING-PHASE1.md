# Omniqora Web Intelligence — Scrapling controlled pilot

**Status:** Review-branch source only. This PR does not deploy Supabase migrations, worker containers, entitlements, credentials, or live source policies.

## Placement

Omniqora is the landlord authority. The existing Connector Hub shows Web Intelligence for the currently selected tenant and product. The service is an optional tenant entitlement: omniqora.web-intelligence. It does not copy other products' tenant data into Omniqora or add a new SaaS tenant by itself.

Scrapling is used for **one reviewed public HTTPS HTML page per queued job**, not bulk crawling. This version deliberately disables JS rendering, stealth, proxy rotation, CAPTCHA solving, login automation and unrestricted URL entry. No third-party MCP server or RAG/GraphRAG pipeline is activated.

The Python worker polls the Omniqora server through a private authenticated endpoint. The server uses its service-role database client for the restricted claim/finish RPCs. The worker does **not** receive Supabase secrets. SQL enforces tenant+product scope, an active tenant product, entitlement and source approval. Documents retain the source URL, content hash, timestamp and untrusted external trust flag.

## Phase 1 files

- Migration and RLS: supabase/migrations/20261018223000_web_intelligence_scrapling_phase1.sql
- Tenant server functions: src/modules/web-intelligence/functions.ts
- UI: src/modules/web-intelligence/WebIntelligencePanel.tsx, embedded in the Connector Hub
- Worker API and auth: src/modules/web-intelligence/worker.server.ts
- HTTP route: src/routes/api.platform.web-intelligence.worker.ts
- Scrapling worker: services/web-intelligence/worker.py
- Container: services/web-intelligence/Dockerfile and compose.yaml
- Offline regression tests: verification/control-plane/web-intelligence.test.mjs and services/web-intelligence/tests/test_worker.py

## Controlled staged activation checklist

1. Validate TypeScript and frontend build, Python tests, security tests, and the complete migration chain on **isolated local Supabase** through existing PR workflows.
2. Confirm the target Supabase environment separately. Apply the reviewed SQL in staging via the controlled database migration workflow; Git sync alone does not apply SQL.
3. Assign **two distinct platform administrators** for proposal and independent source review. Evidence notes must cover rights, website terms, robots policies, copyright/database rights, potential personal information, extraction frequency and region.
4. Issue a random 32+ character WEB_INTELLIGENCE_WORKER_SECRET through a server-only secret manager. Configure identical values on the Omniqora runtime and separate Python worker. Never put secret values in browser, VITE_ variables, Git, logs or docs.
5. Configure OMNIQORA_WEB_INTEL_ENDPOINT to the deployed HTTPS Omniqora server path /api/platform/web-intelligence/worker. Run the worker in an isolated, non-root, read-only container. Do not publish an inbound worker port.
6. **Mandatory before starting live crawling:** implement network-layer egress rules restricting outbound connections to vetted public HTTPS sites and the Omniqora API, explicitly blocking all private/loopback/link-local/metadata and special-purpose addresses on IPv4 and IPv6. DNS checks in Python are not adequate on their own against DNS rebinding.
7. Activate service entitlement omniqora.web-intelligence for a **specific authorised tenant** through Tenant Factory, after checking active product status and regionality. Do not activate the whole portfolio.
8. Use platform admin A to propose one public source and independent admin B to approve it. Tenant owner/admin may then queue a single page. Confirm lease, robot permission, status, stored SHA-256 and source provenance.
9. Revoke the source and verify no further successful snapshots. Test off-tenant access, missing entitlement, inactive product, private DNS resolution, redirects, expired lease, replayed idempotency, oversized evidence, invalid hash and lack of worker secret.

## Pilot use cases

- Dishbee / MealDeck: publicly licensed restaurant menus and price pages.
- Haccora: regulator public announcements and food safety guidance.
- UniPathway: university admissions requirements and course/fee pages.

Each source still needs explicit review. No source is pre-approved and no customer entitlement is created by the migration.

## Security and operational limits

- Two queued/running jobs per tenant; one request per tenant and source per hour.
- Three-minute lease with up to three claims. No arbitrary worker-specified source URL; claim decides it from an approved registry.
- Client SQL privileges are read-only with tenant-scoped row-level security; narrow authenticated RPCs govern mutations.
- Full HTML is not retained; visible plain text is capped at 50,000 chars, and UI previews at 1,000.
- Fetched content remains untrusted. Never render as HTML, follow instructions found inside it, or automatically pass it to AI agents.
- Robots checks fail closed except 404. Robots permission does not establish copyright, contract or GDPR entitlement.
- Reviewers must verify access rights and avoid collecting personal data or confidential information.
- Source revocation blocks new claims and successful receipts. Previous evidence is not automatically erased; an agreed retention/removal mechanism is follow-on work.
- No verified production credentials, live scraping, customer data ingestion, MCP binding, AI training or customer activation is represented by this PR.

## Checks

    python3 -m unittest discover -s services/web-intelligence/tests -v
    node --test verification/control-plane/web-intelligence.test.mjs
    bun run typecheck
    bun run build

Existing GitHub workflows run the full application and isolated Supabase migration replay on pull requests. These are prerequisites, not production launch evidence.

## Next phases (not included)

Source change detection and scheduling; quotas/retention; approved read-only MCP tools; tenant-aware RAG and GraphRAG evidence ingestion; and separate product adapters for Dishbee, Haccora, UniPathway and others.
