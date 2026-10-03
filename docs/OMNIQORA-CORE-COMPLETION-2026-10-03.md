# Omniqora core completion — 3 October 2026

This branch completes the non-Dishbee Omniqora control-plane tranche. Dishbee, Dishbee Hive and Dishbee+ product-specific migration/cutover work is intentionally handled separately.

## Existing main-branch foundation retained

The implementation builds on the current v2 architecture already on `main`:

- SaaS Factory: organisations, tenants, product/service catalogue, dependency-aware entitlements, blueprints, provisioning, branding, custom domains and product connections.
- Platform Kernel: regions/locales, provider catalogue/bindings, service identities, data-plane routing, event bus, usage events and product readiness.
- CRM & Customer 360.
- Connect reception and assisted ordering primitives.
- Geo, dispatch, fleet/tracking and Universal Agent foundations.
- Syndriva marketplace, inventory, bookings, payments and loyalty.
- Growth: RFM/segmentation, campaigns, journeys, sales sequences, feedback/NPS.
- Platform utilities: automation, documents, forms, support, notifications and tenant search.
- Vertical-package catalogue and base records for accounting, payroll, company-secretarial and compliance.
- Automated Migration Factory with repository audit, adapter/shadow evidence, cutover approval and rollback gates.
- Business360 audit/discovery, transformation, M&A/carve-out/TSA/Day-1 planning and the specialist AI hub.
- RRCI shared RAG/graph retrieval with optional Neo4j.

## Added in this completion branch

### Practice, accounting and tax

The previous vertical catalogue had accounting/tax storage but not the complete runtime. This branch adds:

- Practice clients, engagements and deadlines.
- Nominal ledger, posted journals and journal lines.
- Review-gated document ingestion workflow.
- Balanced proposal posting; AI/extraction output cannot post an unbalanced journal.
- Trial-balance RPC over posted journals.
- Fixed-asset register.
- Accounts-preparation runs and reviewable proposed adjustments.
- Tax knowledge-source register with authority level/effective dates.
- Tax research runs and reviewable position proposals.
- Payroll and company-secretarial remain integrated through the vertical-package layer and can consume the same CRM/documents/automation/intelligence services.

### Governed intelligence runtime

- Typed multi-tenant intelligence job queue with retry/backoff and scoped worker claims.
- AI use-case register with deterministic risk assessment, evidence refs, budget fields and independent approval.
- Bounded agent runs and step records.
- Human-reviewed action proposal queue.
- Scoped machine API at `/api/platform/intelligence` using the existing Omniqora service-credential model.
- Worker capabilities are explicit: job claim, results, steps and proposals. Model output does not automatically grant write authority.

The existing Transformation AI hub remains the provider-neutral specialist layer for OpenAI, Azure OpenAI, Anthropic, Gemini, Bedrock and Ollama. This completion layer gives the rest of Omniqora a common durable job/governance surface.

### RAG / GraphRAG

RRCI retains evidence-grounded RAG, vector/keyword fusion, graph traversal and optional Neo4j. This branch adds model-assisted graph construction:

1. `POST /v1/graph/extract` reads the exact current ingested document revision.
2. The configured model proposes entities and relationships.
3. Every relationship must cite an exact quote from its referenced chunk.
4. The API returns review-required candidates; it does not silently mutate the graph.
5. `POST /v1/graph/apply` rechecks the document revision and quote, then indexes only the reviewed relationships.

This closes the previous “manual graph edge only” gap while retaining evidence and approval boundaries.

### Connector and communications hub

- Connector health checks.
- Per-provider sync state/cursors.
- Webhook inbox with external-event deduplication.
- Reconciliation records with differences/evidence.
- Shared communication identities for WhatsApp/SMS/email/voice/push.
- Reception policy and reception-request queues.

These sit on the current `provider_catalogue` / `provider_bindings` kernel rather than the older parallel connector catalogue.

### Identity and portals

- Tenant identity policy for methods, MFA, passkeys, WhatsApp OTP and SSO configuration.
- Product-scoped customer/client portal invitations.
- Hashed one-time invite tokens.
- Product-scoped portal-user access/revocation.

### Strategic analytics and finance governance

- Cross-product metric points.
- Budgets, forecasts and actuals.
- Evidence-linked benefit register for CFO/audit review.
- Explicit approval/review states.

## New workspaces

- `/app/intelligence` — AI Control & Governance.
- `/app/finance-ai` — Practice, Accounting AI and Tax Intelligence.
- `/app/connector-hub` — connectors, communications and reception.
- `/app/identity` — identity policy and customer portal.

They are added to the main application navigation.

## Deployment truth

“Built in source” is not the same as “live provider activated.”

The following still require environment-specific activation rather than fabricated green status:

- Apply the new Supabase migration in the target project and rerun database/RLS tests.
- Deploy/upgrade the RRCI Python service before using automatic graph extraction.
- Configure real model/provider credentials and approved provider bindings.
- Give intelligence workers narrowly scoped Omniqora service credentials.
- Configure external provider accounts (Companies House, HMRC/e-file, bank feeds, messaging, payment, mapping, ERP/HRIS etc.) before claiming live connectivity.
- Validate live tenant isolation, backup/restore, monitoring, retention/deletion, rate limits and provider reconciliation.

Business360 transaction plans remain planning/control records. A plan does not itself execute an ERP carve-out, cloud migration, payment, filing or production cutover.

## Deliberately separate

Dishbee-specific production migration, Dishbee Hive and Dishbee+ are not changed by this branch. Their runtime/cutover evidence remains managed in the dedicated Dishbee workstream.
