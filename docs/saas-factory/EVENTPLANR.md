# EventPlanr UK and Germany — Factory connection foundation

## Implemented

The existing `eventplanr` product identity and two source repositories are retained. The Factory directory now displays GB/GBP/en-GB/Europe-London and DE/EUR/de-DE/Europe-Berlin as separate market connections. No customer workspace is created by this source inventory.

`adapters/eventplanr/control-plane.mjs` consumes the existing `/api/control-plane/tenant-snapshot` schema-v4 endpoint. It checks the internal tenant UUID, external workspace ID, product, country, currency, timezone, active tenant/product and `tenant.snapshot` capability before accepting a response. Source applications retain their domain records and their own role checks. This foundation does not yet provision workspaces, replace authentication, or wire application features to central entitlements.

The server-only adapter denies expired snapshots after five minutes, future-dated service grants, expired or unbounded trials, wrong bindings and invalid responses. Requests have an eight-second timeout, a 256 KiB response limit, HTTPS host allowlisting and redirects disabled. Remote errors are redacted. No stale-cache fallback grants access.

## Protected configuration — configure independently per deployment

- `EVENTPLANR_FACTORY_ENABLED=true` only after an operator has created the correct product connection.
- `OMNIQORA_FACTORY_ORIGIN`: exact approved HTTPS origin, with no path or query.
- `OMNIQORA_FACTORY_ALLOWED_HOST`: separately approved hostname.
- `OMNIQORA_FACTORY_TENANT_ID`: existing Omniqora tenant UUID.
- `EVENTPLANR_FACTORY_EXTERNAL_TENANT_ID`: actual product-local workspace identifier, not a country-wide tenant guessed from a name.
- `OMNIQORA_FACTORY_KEY`: scoped `oqcp_` connection credential, in the server secret store only. Never use a `VITE_` variable.

Run `node adapters/eventplanr/preflight.mjs GB` or `DE` on a trusted server. Each product repository exposes its pinned country through `npm run verify:factory`. The command deliberately fails when unconfigured and returns only connection-check flags; it never logs the snapshot, key, locations or customer data. The existing Factory snapshot endpoint records a connection verification timestamp; this is not a pure database-read operation. It does not activate products or provision workspaces.

Product-local code must resolve the current user's authorised workspace on the server before choosing a binding. Do not reuse one operator connection for every organiser or vendor, or accept binding configuration from a client. `serviceEnabled` is for trusted server snapshots only, and is not an authorisation endpoint. Match service keys against the deployed service catalogue before wiring consumers. A successful connection check does not establish that AI, payments or provider workers are running.

## Existing work and release boundary

UK PR #10 already implements an optional supplier-intelligence adapter on a stack of PRs #1, #6, #7 and #9. Its protocol is different from the central Factory snapshot contract. This change does not duplicate it or claim the two protocols are interoperable. Germany PRs #1 and #12 remain independently reviewable.

No schema migration, credential issuance, production endpoint change, customer data transfer, payment or live entitlement activation is included. Keep both country deployments and legal/payment settings separate. The source registry remains not activated; the ecosystem catalogue remains source-adapter-required until an authenticated application integration passes acceptance.

## Acceptance still required

1. Reconcile and review existing country PR stacks before integration.
2. Verify the real EventPlanr databases and local workspace/role model; do not infer tenancy from an event or user UUID.
3. Create staging bindings through the existing Factory operator workflow; verify country/tenant mismatch and key rotation denial with two independent workspaces.
4. Wire a server-side application consumer to the validated snapshot and exact service entitlement, then test revocation and failure behaviour.
5. Implement idempotent workspace provisioning and source acknowledgement before enabling automatic provisioning.
6. Run staged migrations, full application tests, UI/mobile checks, role/RLS tests, payment/refund/payout scenarios, backup restore and operator/legal release checks.

## Validation

`node --test verification/eventplanr/*.test.mjs`
`node --test verification/control-plane/portfolio-factory-audit.test.mjs`
`node scripts/factory-portfolio-audit.mjs --strict`

Application typecheck/build and security checks remain required; this document is not a production readiness certificate.
