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

## Phase 2 — full-suite operations foundation

The suite scope now has fourteen service areas: static/building guarding; close protection; access/visitors; mobile patrol/response; events; control rooms; retail loss prevention; industrial/construction/logistics; residential/estate security; protective travel/journey coordination; investigations/evidence; life safety/resilience; workforce/compliance; clients/contracts/commercial.

Additional benchmark: Genetec Security Center unifies access control, video, ALPR and communications (https://www.genetec.com/products/unified-security/security-center). Hardware capability is a future adapter requirement, not implemented by this change. The service list is Aegis product scope; it is not a claim that every comparator offers every area.

Phase 2 implements the shared **site → engagement → incident** record chain inside Factory with tenant-aware parent/assignee foreign keys, owner/admin lifecycle changes, request UUID retry identification, revision checks and atomic trigger-written audit events. Its operations panel creates and reads actual database records after migration and separately approved product activation. The latest-200 list is explicitly bounded; comprehensive pagination/search remains future work.

The migration inserts only an internal candidate product, never an active tenant entitlement. All table operations require an active tenant product and authenticated membership. Owner/admin sees the agency's records; agents see only created/assigned nonrestricted records and may report incidents against a visible same-area parent. Viewers cannot create. Close protection, protective travel and investigations are initially restricted to owner/admin; per-engagement cleared-team access is not yet implemented. Client portal identities and client-site visibility are not enabled in this phase.

Do not store principal identity, routes, itineraries, credential secrets or sensitive investigative evidence in the generic notes field. That requires separately encrypted protected storage, reviewed retention, redaction and approved specialist access. The present workflow stores operational references only. Checkpoint scanning, timekeeping evidence, live access/CCTV/alarms, patrol dispatch, SOS, workforce decisions and model inference remain later, separately verified integrations.

Database validation runs the complete migration chain in disposable PGlite and checks cross-tenant/restricted-area denial, agent assignment visibility, viewer insert denial, audit forgery rejection, invalid/skipped stages, stale revisions, tenant reassignment and product suspension. Hosted staging and operational safety acceptance remain required; this does not apply production migrations or deploy customer operations.

## Phase 3 — field reporting and supervisor source brief

Adds site checkpoints and append-only field events for attendance-in/out, checkpoint observation and welfare check. Database checks require an active, visible engagement and assigned officer (or owner/admin recording as themselves). Checkpoints must belong to the engagement's site and be active. Checkpoint/welfare reports require an open attendance session. Attendance-in/out is once per officer per engagement; repeated shifts require distinct engagements. The server assigns actor and recorded time, rejects duplicate attendance through a unique index, and does not permit event updates/deletes. Request UUIDs support retries; reusing one with different evidence is rejected by the server handler.

The Aegis field panel captures actual records after separately approved migrations/product activation. Owners/admins can add checkpoint labels; agents record only their own activity. Client/viewer write access is not introduced. Evidence stays explicitly `operator_reported`: the implementation has no GPS, selfie, QR, NFC, background location, offline capture or independent proof of physical presence. It does not transmit SOS or welfare alerts.

The supervisor brief is a deterministic, source-linked input adapter for future governed Omniqora Intelligence. It counts reports and unclosed starts within the latest 300 visible field events, with a warning that this bounded window can be incomplete. It is not a payroll calculation, compliance finding, welfare clearance, AI inference or an emergency monitoring service. Model use still requires approved tenant scope, minimal source adapters, provider evaluation, budget and human review.

Validation adds executable source-brief regressions and full-chain database tests for clock-out ordering, repeated clock-in, assigned/foreign/viewer access, disabled checkpoints, actor/server-time evidence, open attendance requirements, event immutability and product suspension. No production migration, model call or live provider activation is included.

## Phase 4 — visitors and asset custody

Adds site-scoped visitor, key and equipment registers with a review/handover panel and atomic append-only custody history. Visitor workflow: expected → supervisor-approved → onsite → departed (supervisor cancellation before arrival). Asset workflow: available/returned → issued → returned, with supervisor-reviewed maintenance and loss states. Every transition requires a note and matching revision. Issued assets require an existing same-tenant custodian; lost assets retain their last custodian. History preserves the actor, previous/new stages, previous/new custodian, note and server time. Asset labels, site and identity fields are immutable.

Owners/admins create entries at active sites. Assigned agents may record arrival/departure and issue/return within their authorised site/active engagement. They cannot approve/cancel visits, mark loss, or clear maintenance. Restricted service areas inherit the earlier owner/admin boundary. Active product membership, parent-site constraints, custodian membership and RLS are enforced in the database; direct event modifications are denied. Revoking the product removes access. Requests use stable UUIDs to identify retries; updates use optimistic revisions to avoid duplicate handovers.

Records are manual operational evidence only: no identity-document storage/verification, visitor credentials, badge provisioning, door operation, device integration, recipient electronic acceptance or external notification is implemented. Use references instead of sensitive visitor identity data, key codes or credentials. Latest 200 visible resources/history events are shown; full pagination and long-term retention controls remain later phases. Checkpoint, attendance and supervision records remain operator-reported.

Validation extends the full-chain database tests with supervisor visitor approval/cancellation restrictions, skipped-stage rejection, custodian validation, stale update refusal, handover notes, previous-custodian history, immutable resource identity, protected event deletion/forgery, restricted resources, cross-agency site references and product suspension. Three new custody action tests run in the existing Aegis CI step. No production migration or hardware/provider activation is performed.
