# Fleetora / FleetPulse SaaS Factory activation

## Binding decision

- `fleetora` is the reusable fleet, 3PL and delivery **landlord product**.
- `fleetpulse-uae` is the first **market/brand experience** beneath Fleetora.
- Customer companies are Omniqora **tenants**, linked to one landlord instance.
- FleetPulse remains the vertical operational data plane during migration.
- Omniqora is the control plane for catalogue, tenant entitlement, branding, domains, provider binding, shared AI/Connect/Geo/Dispatch and migration evidence.

This avoids a country fork. A future UK or partner brand is another experience/landlord instance and reuses the same Fleetora product and Omniqora engines.

## Provisioning order

1. Apply Omniqora migrations through `20261004220000_tenant_domain_authority_v10.sql` and FleetPulse migrations through `20261004163000_omniqora_hierarchy_mapping.sql`.
2. Create or select the landlord organisation.
3. Call `platform_create_landlord_instance(...)` with product `fleetora` and region `ae`.
4. Create the customer tenant with `platform_create_tenant(...)` and blueprint `fleetpulse-ae-starter` or `fleetpulse-ae-growth`.
5. Call `platform_bind_fleetora_tenant(...)`. This applies the blueprint, sets UAE runtime defaults, creates the product connection, creates the tenant brand and starts in `shadow` mode.
6. Issue the connection token with `platform_set_product_credential(...)` and a service credential with `events.write`, `usage.write`, `routing.execute` and `operations.maintain` scope. Add `intelligence.propose` only when the tenant enables governed AI recommendations. Store raw values only in FleetPulse Edge Function secrets.
7. Complete provisioning jobs and verify the version 4 tenant snapshot from FleetPulse. It includes the product-scoped brand, operating-location hierarchy and domain verification state.
8. In FleetPulse **Branches / Locations**, map each active/opening Omniqora location to exactly one local branch. An exact code match is suggested but never applied automatically. FleetPulse branch records and operational data remain local.
9. Run at least ten representative routing shadow comparisons. Any failed comparison blocks cutover eligibility.
10. Request and separately approve the `read` cutover, operate the pilot in read mode, then repeat the request/review process for `write`. The database only permits `shadow → read → write`; either `disabled` or `shadow` remains an immediate rollback target. Tenant Factory exposes these landlord, binding, evidence, approval, feature-authority and rollback controls.

## White-label model

Landlord defaults live in `landlord_instances.branding` and `policy`. Per-customer overrides remain in `tenant_branding`, `tenant_brands` and `tenant_domains`. Tenant-specific business data and customisation do not enter the landlord row.

Tenant Factory now creates a unique `_omniqora-verification.<domain>` DNS TXT challenge. The provisioning worker resolves the public record, compares the complete TXT value, then probes the original hostname over HTTPS. Every observation is appended to `tenant_domain_verification_attempts`; DNS and TLS status cannot be asserted by an authenticated browser client. A domain already claimed by another tenant cannot be reassigned by upsert. Rotate the challenge after a suspected leak or ownership change, then re-run verification. DNS ownership and active HTTPS must both pass before switching the customer's primary hostname.

## Native Omniqora routing and delivery

Jungleworks is not a dependency or integration. Its fleet/routing feature set was used only as a requirements benchmark. Routing, dispatch, driver assignment, tracking, proof of delivery, zones and fleet operations are implemented as native Omniqora services behind the stable `omniqora.dispatch.v1` contract. Migration defaults to `shadow`.

Reusable service ownership is fixed as follows:

- **Omniqora Dispatch:** jobs/tasks/stops, manual and automatic assignment, scheduling, SLA/exceptions and orchestration.
- **Omniqora Fleet:** agents, vehicles, availability, shifts, attendance, capacity, maintenance, driving behaviour, idle monitoring, wallets/earnings and utilisation data.
- **Omniqora Geo:** coordinates, zones/geofences, distance, ETA and native route optimisation.
- **Omniqora Track:** signed expiring customer tracking, status, ETA/location and proof-of-delivery presentation.
- **Omniqora Agent:** one tenant-branded, entitlement-driven workforce app across delivery, food, recovery, engineering, parts, inspection, collection and home services.
- **Omniqora Carrier:** provider-neutral handoff and status contract for optional third-party delivery carriers; this is separate from the native fleet engine.
- **Omniqora Operations Intelligence:** evidence-backed route, capacity, utilisation, SLA and maintenance recommendations. AI-assisted recommendations require human approval and cannot autonomously switch dispatch authority.

The originating product keeps its commercial order and vertical workflow. It creates a Dispatch job and consumes events. Fleetora, Courier Connect, Dishbee, MealDeck, SparesGrid and All-Road-Aid reuse the shared services instead of rebuilding them.

The `routing.optimiseBatch` runtime operation uses `omniqora.native-routing.v2` to create deterministic multi-resource proposals with capacity, skill, availability, priority, service-time and time-window constraints. It reports every unassigned stop with an explicit reason. The API only returns a proposal; it does not mutate a dispatch job or agent assignment.

`routing.proposeBatch` adds the governed path used by FleetPulse. It persists the proposal with an input fingerprint, SHA-256 plan hash and 24-hour expiry. Repeating the same route input returns the same active proposal. A central operator must approve a complete proposal; proposals with unassigned stops cannot be approved. Approval does not apply or dispatch the route.

FleetPulse retrieves the review result with `routing.proposal.get` and applies it locally only when all of these remain true:

- the binding has fresh central `write` authority;
- the proposal is approved and unexpired;
- the local route is still `planned`;
- the proposal contains exactly the same unique stop IDs as the local route;
- the proposal ID, route ID and plan hash still match.

Application only updates stop sequence, leg distances and optimisation metrics. It does not assign an agent, dispatch a route or change route status. A separate dispatch action remains required. The resulting `fleet.route.proposal_applied` event makes the approval single-use and auditable.

Mode semantics:

- `disabled`: FleetPulse local planning and dispatch only.
- `shadow`: send the same de-identified route problem to Omniqora native routing; FleetPulse remains authoritative.
- `read`: show the Omniqora route to operators, but FleetPulse dispatch remains authoritative.
- `write`: FleetPulse may apply one current, centrally approved route ordering. Job creation, agent assignment and dispatch remain local until a separately governed execution contract is built. Use only after evidence review and an approved cutover.

Never send customer names, phone numbers, free-text addresses or payment data in routing comparison events. Use source IDs, coordinates, time windows, capacities and aggregate metrics.

## Agent, Track and proof-of-delivery projection

FleetPulse remains the operational owner of delivery orders, drivers, proof files and customer records. Omniqora receives only the minimum shared-service projection:

- `fleet.job.status_changed`: opaque job ID, status, ETA and progress;
- `fleet.pod.completed`: opaque job ID, proof method names, evidence count and capture time;
- `fleet.route.proposal_applied`: proposal ID, route ID, plan hash and application time.

The control plane projects job status into the existing Track snapshot model and proof completion into `external_pod_receipts`. Customer names, phones, addresses, recipient names, signatures, photos and storage paths never cross this bridge. The universal Omniqora Agent app and customer Track experience consume these shared projections while FleetPulse continues to own its UAE operational records.

## SLA, exceptions and Operations Intelligence

`fleet.job.status_changed` version 2 adds only the lifecycle fields needed for shared operations: opaque job ID, job type, priority, status, source creation time, scheduled time, ETA and progress. Omniqora persists this in `external_dispatch_jobs`; it does not copy the FleetPulse delivery order or customer record.

Tenant/product policies in `dispatch_sla_policies` can set acceptance, arrival and completion thresholds. `evaluate_external_dispatch_slas` chooses the most specific active policy, creates one idempotent breach per job/metric/policy and escalates a warning to critical when lateness exceeds another full threshold. Operators acknowledge, resolve or dismiss through `review_dispatch_exception`; authenticated clients have no direct mutation permission on exception rows.

The runtime operation `intelligence.propose` accepts only aggregate structured evidence references, numeric metrics, enumerated reason codes and an allow-listed advisory action. It rejects raw prompts and arbitrary generated recommendation text. Every AI-assisted proposal records its model, policy, template version, SHA-256 payload hash, expiry and requesting service. It always starts in `review`, requires a human approval or dismissal, and has `automaticApplicationAllowed=false`. Approval records the judgement but cannot dispatch, apply a route, modify an SLA or change tenant authority.

Recommendation creation and review append immutable `operations_recommendation_events`. Authenticated users can read recommendations but cannot change their status directly; all review changes go through the guarded function. `maintenance.run` expires stale proposals/recommendations and evaluates the tenant's projected SLA records. FleetPulse invokes it through the same scoped bridge used by the scheduler.

In `read` or `write` mode, a fresh FleetPulse snapshot consumes Omniqora tenant branding. FleetPulse feature entitlements remain local unless a platform operator explicitly enables the central authoritative feature list in Tenant Factory. Once enabled, FleetPulse's server-side entitlement function accepts or denies gated features from that list; stale, degraded, shadow or disabled bindings fall back to the local subscription safely.

## Brand and operating-location hierarchy

The signed tenant snapshot exposes only product-scoped brand records and their locations. FleetPulse projects these into `omniqora_brand_scopes` and `omniqora_location_scopes`; it does not update or create `branches`. A tenant administrator with AAL2 explicitly maps each current Omniqora location to an active branch, and one branch cannot represent two current central locations.

`get_omniqora_hierarchy_state` reports snapshot health, required locations, mapped locations, exact-code suggestions and readiness. `get_omniqora_pilot_readiness` now includes `hierarchyReady`; a connected bridge with an unmapped active/opening location is not locally ready. Route lifecycle event version 2 adds the mapped opaque Omniqora `locationId`, allowing central Dispatch, Geo, Track and Delivery CRM services to retain location ownership without receiving FleetPulse branch records.

Retired central locations remain visible for audit and keep their historic mapping, but do not block readiness. Stale snapshots never activate new authority; the existing mapping remains visible while the bridge degrades safely.

## Cutover gates

`get_fleetora_migration_readiness(tenant_id, 'fleetpulse-uae')` combines the normal SaaS Factory checks with landlord binding, shadow evidence, critical exceptions and approval state. `platform_request_fleetora_cutover`, `platform_review_fleetora_cutover` and `platform_set_fleetora_migration_mode` enforce separation of request, review and authority change. Approved requests are single-use and become `consumed` during cutover.

`fleet.route.shadow_compared` events are projected into central routing evidence idempotently. `generate_operations_recommendations` creates deterministic maintenance, critical-exception and failed-route recommendations, but every result remains in `review` until a human approves or dismisses it. The Dispatch workspace exposes SLA policy creation, manual evaluation, exception review and recommendation review for the pilot; a scheduler may invoke the same evaluator later without changing its authority boundaries.
