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

## Phase 5 — inspections and supervisor-reviewed reports

Adds site-scoped inspection and service-report drafts, up to 30 structured checks (pass/fail/not applicable), findings/corrective-action notes, submission, requests for changes and independent supervisor approval. A failed check requires a finding. Submission requires narrative evidence; inspections also require a checklist. Only the author edits or submits; a different tenant owner/admin reviews with a mandatory decision note. Review cannot alter the submitted evidence. Approved records are terminal. This is review of operator-reported evidence, not certification of safety or closure of corrective work.

The Factory panel supports draft editing, submission and review with source IDs and expandable full revision snapshots. Database triggers enforce the workflow even for direct API clients, override reviewer/time fields, enforce optimistic revisions and atomically record append-only evidence snapshots. Active product membership and assigned-site/engagement visibility are inherited from the custody access boundary, including restricted areas. Cross-tenant site links and viewer authoring are denied. Draft creation uses request UUID retry identification; changed-payload reuse fails closed.

Latest 200 reports and events are displayed with an explicit bounded-history label. No client portal, external report delivery/export, automated incident aggregation, attachment storage, scheduled inspections, assigned remediation workflow, AI inference or live operational activation is included. Reports are manually authored internal records; client-safe redaction and recipient-specific release remain separate work.

Validation: typecheck, production build, 13 focused Aegis tests, complete migration-chain database tests and repository security checks. New database cases exercise invalid/empty evidence, self-approval, review evidence tampering, revision conflict, request-changes/resubmission, approval finality, cross-tenant/restricted/viewer access, snapshot history and product suspension. Browser/staging acceptance and production migration are not performed.

## Phase 6 — finding remediation and independent verification

Adds one corrective action per failed check on an approved, immutable report. Owners/admins assign an eligible tenant member, due date and priority. Agent assignees must already have active access to the source site or engagement; restricted service areas remain supervisor-only. An assignee starts work, records progress and submits remediation evidence. A different owner/admin verifies and closes the action or returns it for further work with a mandatory decision note. Supervisors assigned the work cannot verify their own completion. Review cannot modify the submitted remediation evidence; closed actions are terminal.

The queue supports open, assigned-to-me, overdue, closed and all filters, original finding references and expandable revision snapshots. Due dates use UTC calendar dates and overdue counts describe only the visible window. Reads are bounded to earliest 200 actions by due date, latest 200 source reports and latest 200 events; pagination and complete aggregate counts remain future work. Assignees are currently selected by existing member UUID, consistent with earlier operational forms; a staff directory picker remains a UI improvement. Assignment, due date and priority are immutable in this initial workflow; reassignment and deadline changes need a separately audited lifecycle.

Database rules enforce active product membership, inherited report/site visibility, eligible authoring roles, same-tenant references, unique source checks, initial-state validation, staged transitions, revision checks, immutable identity, independent verification and append-only audit snapshots. Actor/reviewer/time evidence is assigned by the database. Server handlers reuse authenticated user clients, validate strict payloads, identify create retries by request UUID and compare update revisions.

Validation passed: typecheck, production build, 13 focused Aegis tests, full migration-chain PGlite checks and repository security checks (32 PostgreSQL integration checks plus hygiene). New database cases cover unapproved/missing source checks, duplicate action creation, invalid/viewer/unassigned assignees, restricted-site assignment, tenant isolation, assignee-only evidence, role demotion, skipped stages, missing evidence, independent verification including supervisor assignees, review tampering, return/resubmit/close, stale revisions, terminal closure, immutable identity/audit, source snapshots and product suspension.

This records manually reported remediation and human verification. No alert delivery, scheduling, attachment storage, external contractor portal, model inference, device remediation or operational safety certification is activated. Browser/staging acceptance and production migration remain outstanding; no existing PR is merged or published by this phase.

## Phase 7 — shift handover desk

Adds site-scoped handover drafts with a named incoming colleague, shift summary and outstanding-issue/source-reference notes. The outgoing author saves and offers the handover; only the named incoming recipient may acknowledge receipt or return it for clarification with a mandatory response. Returned handovers can be revised and offered again. Responses cannot alter offered evidence; acknowledged records are terminal. Supervisors can read handovers in their existing site scope, but cannot respond for another recipient.

The panel supports preparation, editing, an awaiting-my-response filter and expandable atomic revision snapshots. The latest 200 visible handovers and 200 events are shown. Both participants must be distinct eligible tenant members; recipients independently need current active site/engagement access before reading or responding. Creation validates recipient membership, but does not grant site access or guarantee the recipient is already assigned. Recipient/site identity is immutable. Incoming member selection currently uses the existing member UUID. The workflow records manual transfer of context; source references in notes are manually authored, without automatic incident/custody aggregation.

Database grants/RLS and validation triggers enforce active product membership, tenant/site/participant visibility, authoring roles, immutable identity, matching revisions, permitted stages, recipient-only response and append-only audit snapshots. Strict authenticated server handlers identify create retries and refuse stale updates. No notification delivery, shift scheduling, asset transfer, incident closure, welfare clearance, AI inference or safety certification is activated.

Validation: typecheck, production build, 13 focused Aegis tests, full migration-chain PGlite tests, repository hygiene and 32 PostgreSQL policy/integration checks. Added database cases cover invalid/viewer/foreign recipients, self-handover, restricted/foreign sites, skipped stages, outgoing/recipient authority, evidence tampering, missing response, return/reoffer/acknowledge, stale edits, terminal state, immutable identity, audit forgery/deletion, recipient site denial and product suspension. Browser/staging acceptance and production migrations remain outstanding. This phase is a separate draft PR; prior phases remain unmerged.

## Phase 8 — versioned site instructions and post orders

Owners/admins publish immutable site instructions after explicitly confirming their review in the UI. Each publication receives a database-assigned per-site version, publisher and timestamp; publishers are serialised on the active site row to avoid competing version allocation. New versions supersede prior versions without editing or deleting the historical evidence. A security-invoker status view determines current-version status across all accessible versions, independently of the bounded UI list.

Assigned officers can read instructions and acknowledge the exact current version. Receipt actor and timestamp are server-assigned, with one immutable receipt per officer/version. Superseded versions reject new receipts; existing receipts remain historical evidence and do not acknowledge later publications. A publication concurrent with acknowledgement can leave a receipt for the previously current version; receipt evidence always identifies the exact version, and current-version status never treats it as receipt of a newer version. This is receipt of information, not demonstrated understanding, competency, attendance or safety certification.

RLS inherits active-product, tenant, site/engagement and restricted-area access. Only eligible owner/admin/agent roles can acknowledge. Agents see their own receipts; supervisors see receipts within authorised sites. Both instruction and receipt tables deny updates/deletes. No staff assignment, alert delivery, automatic acknowledgement, model execution, door operation or external document delivery is added. Use operational references rather than access codes, credential secrets or sensitive protection details in instruction text.

The panel supports publication, current/history views, exact-version acknowledgement and supervisor receipt evidence. Reads are limited to 200 versions and 200 receipts; absence from this window is not proof of non-acknowledgement. Full pagination, directory pickers, targeted acknowledgement requirements and automated reminders remain future work.

Validation passed: typecheck, production build, 13 focused Aegis tests, complete migration-chain PGlite checks and repository security checks (32 PostgreSQL policy/integration checks plus hygiene). New database cases verify server-owned version/publisher/time, exact-version receipts, duplicate receipt rejection, viewer/foreign/restricted denial, current-status view isolation, superseded receipt refusal, immutable orders/receipts and product suspension. A pre-existing lockfile mismatch for the already-declared Lovable build-config version was corrected; `npm ci --dry-run --ignore-scripts` succeeds. Browser/staging acceptance and production migrations remain outstanding. No earlier PR is merged or deployment activated by this phase.

## Phase 9 — consolidated control-room attention queue

Adds a read-only overview above the operational workspaces. It combines open/review incidents, open corrective actions, offered/returned handovers, submitted reports and the current instruction versions without a receipt recorded for the signed-in user. Queue items preserve exact source references and link to the appropriate source workspace. Category cards, title/reference search and a my-assigned-work/receipts filter support review. My-work does not infer supervisor ownership of unassigned report reviews.

The authenticated server checks active tenant product membership, then independently reads each source using the user's Supabase client and existing RLS. No privileged client, permission expansion or new tables/migrations are introduced. Source queries filter open states before bounding results to 100 per category, fetching one additional row to disclose truncation. Corrective sources are selected by earliest due date, incidents/handovers/reports by most recently updated, and current instructions by publication time. Current instruction receipts are fetched for the exact loaded order IDs and current user, avoiding inference from a truncated receipt history. Any query failure fails the overview instead of manufacturing zero counts.

Ranking is deterministic within the loaded window: recorded remediation priority plus an overdue increment, then incidents, submitted reports, handovers and instruction receipts. UTC due-today work is not overdue. It is not incident severity inference, SLA assessment, emergency dispatch, AI execution, real-time monitoring or proof of site safety. The user refreshes the snapshot; underlying source reads are not a single transactional snapshot. Source counts and ranking are bounded, with explicit truncation warnings. Links open source workspaces rather than promising a fully paginated record view; full pagination and direct-record navigation remain later improvements.

Validation adds five executable queue cases for priority/due ordering, terminal exclusions, handover responsibility, old-version receipt isolation, source references and deterministic empty/equal-priority results. Browser/staging acceptance remains outstanding; no deployment, production mutation, notification delivery or prior PR merge is performed.

Phase 9 checks passed: typecheck, production build, all 18 focused Aegis tests, full migration-chain PGlite checks, repository hygiene and 32 PostgreSQL policy/integration checks, plus `git diff --check`.

## Phase 10 — exact source inspection and paged evidence

Control-room queue items now open an accessible read-only dialog for the exact incident, corrective action, handover, report or instruction version. Records are fetched by tenant and source UUID independently of the bounded workspace lists. The inspector shows recorded state, narrative/checklist evidence, relevant member/source references and paged history or version receipts. It does not modify workflows or acknowledge instructions. Source workspace links remain available for authorised changes.

The server accepts a strict source-kind whitelist, tenant/source UUIDs and a bounded integer page. It checks authenticated tenant membership and active Aegis product status, then uses the authenticated Supabase client and existing RLS. Table names/history keys are fixed in code, never accepted from the caller. Source and history queries each filter tenant and exact source ID; incident lookup also requires incident kind. Missing and denied records share one response. History is queried only after successful record access, and history failure rejects the inspection instead of presenting incomplete evidence as success.

History pages contain up to 25 entries, with a 26th row detecting another page and deterministic revision/time plus ID ordering. Existing receipt visibility remains unchanged. Reads are separate snapshots, so edits during offset pagination can shift entries. Query caches are scoped by tenant, kind, ID and page and discarded when the inspector unmounts. Errors hide stale record content. The history page limit is 10,001 pages; export/retention workflows and transactional snapshots remain separate work.

A dependency restore also exposed a damaged `package-lock.json` in the previously transferred phase-8 source. This phase restores the intact earlier lockfile and regenerates only the already-declared Lovable build-config version alignment. Published Git tree/blob hashes are checked against the tested local files to catch transfer corruption before creating the PR.

Five new executable inspection cases verify all source mappings and tenant/ID filters, prototype/table-name rejection, page bounds, indistinguishable missing/denied records, no history reads after access failure, pagination boundaries and history failure handling. No new schema, permissions, model calls, notifications or production mutations are introduced. Browser/staging acceptance remains outstanding.

Phase 10 checks passed: typecheck, production build, all 23 focused Aegis tests, full migration-chain PGlite checks, repository hygiene and 32 PostgreSQL integration checks, clean-install dry-run and `git diff --check`. The repaired lockfile blob is independently hash-verified against the tested local file before branch publication. No production migration or earlier PR merge is performed.
