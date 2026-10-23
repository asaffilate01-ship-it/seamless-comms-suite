# Aegis Command — SaaS Factory implementation

Reviewed 23 October 2026. This is the canonical Factory build track inside `asaffilate01-ship-it/seamless-comms-suite`. The earlier ChatGPT Sites app is a separate prototype, not an Omniqora integration or the production authority. No D1 data, identity or customer tenancy is imported automatically.

## Competitor scope

Vendor-published pages were reviewed; claims are not independent performance verification or a complete audit of every market vendor.

| Benchmark | Published capability focus | Aegis delivery requirement |
|---|---|---|
| Ctrl Room | Geofenced/selfie attendance, QR tours, SOS, incidents, payroll and invoices | Verified field evidence and accountable operations |
| TrackTik / Trackforce | Command, patrol/mobile workforce, billing/payroll, lone-worker and AI reporting | Connected operational-to-commercial chain and governed intelligence |
| GuardsPro | Dispatch, geofences, tours, visitors, tasks, leave/swaps, client portals and invoicing | Full agency, supervisor, officer and client workflows |
| Silvertrac | Guard tours, incident reporting and client visibility | Evidence capture, maintenance/parking and approved client reports |
| Connecteam | Workforce scheduling and mobile operations | Clear officer shift/availability and supervisor planning flows |

Sources: https://mexilet.com/products/ctrl-room/ ; https://www.trackforce.com/products/tracktik/ ; https://www.guardspro.com/features ; https://www.trackforce.com/products/silvertrac/ ; https://connecteam.com/industries/security-app/ . Feature availability and regional/provider conditions need separate commercial verification.

## Implemented in this PR

- Candidate product source registration: `aegis-command`, no active customer tenants.
- Authenticated `/app/aegis` implementation workspace and navigation.
- Nine capability families with explicit gaps and shared-service ownership.
- Read-only server check of tenant membership, admin role, active product, governance/runtime entitlements and fresh provider metadata.
- Four product-specific, read-only-input draft agent blueprints: incident evidence, coverage advice, client briefs and patrol evidence quality.
- Existing AgentFactoryPanel handles governance assessment, independently approved use cases, reviewed tariffs/budgets and queued tasks when separately authorised. A blueprint is not an active source connector or model connection.

## Architecture

Omniqora Factory → Aegis product landlord → country/region configuration → security agency tenant → client/site scope → officers and client contacts. Officers and client contacts are users/portal identities, not extra Factory tenants by default.

Reuse existing identity/entitlements, Geo, dispatch/routing, Connect communications, private documents, cases, audit, analytics, Intelligence jobs and human approval gates. Keep security operations domain records in a dedicated versioned module/data plane with tenant+site authorisation. Do not copy Sites authentication or its D1 API into the Factory. No direct cross-product database reads.

## Next implementation sequence

1. Add reviewed product/service provisioning migration and country/role/retention configuration; prove two-tenant isolation in staging.
2. Typed site/officer/shift/checkpoint/incident model and permissions. Connect assignment-based visibility; preserve incident evidence custody.
3. Field check-in/out and QR/NFC evidence, geofence accuracy review, replay protection, private uploads and secure offline queue.
4. Signed minimal outbox events → shared Dispatch/Connect. Validate SOS delivery, acknowledgement and escalation independently before operational reliance.
5. Scoped read adapters → governed Intelligence with record citations, privacy minimisation, evaluations and human-reviewed proposals. No autonomous discipline, licence eligibility, emergency decisions, payroll or external messages.
6. Contract/rate/attendance reconciliation, country-specific payroll exports, client-site portal, inspections, visitor/key/asset custody, reporting and sandbox provider acceptance.

## Verification and release

Run focused tests, portfolio registry tests/strict audit, application typecheck/build and security tests. Source-only checks do not establish authenticated database correctness. No production migration, provider secret, budget consumption, tenant activation, Lovable publication or automatic merge is authorised by this PR. Staging RLS, real source binding, provider evaluation and operational acceptance remain release prerequisites.
