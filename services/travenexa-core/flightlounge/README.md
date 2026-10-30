# FlightLounge provider boundary — source only

This module adds read-only Claude, Gemini and Google Routes adapters beside the existing TraveNexa engine. It does not replace existing Omniqora AI infrastructure, register a public route, activate suppliers or issue tickets. No API key or live provider test was used.

The authenticated host constructs `{tenantId, actorId}`; never accept those fields as authority from browser JSON. Supply `authorize(context, {product, provider, action})` backed by current tenant membership, product entitlement, persisted provider approvals, budget/rate limits and regional policy. The grant must return the same tenant and provider. Supply a tenant-scoped server secret reader and durable audit sink. Missing dependencies fail closed. Models are chosen from server configuration; browser input cannot select arbitrary endpoints or model paths. Responses are untrusted guidance and must be escaped in the UI.

`run(context, {provider:'claude'|'gemini', input:{question}})` returns labelled non-authoritative text. `run(context, {provider:'google_routes', input:{origin:{latitude,longitude},destination:{latitude,longitude}}})` returns ground-route distance/duration. It does not establish minimum connecting time or transfer pricing. Keys go in headers; requests have a 15s deadline and redirects are rejected. No booking/payment tool is exposed.

FlightLounge passenger integration contract to implement next:

- POST flight search: 1–6 date-ordered legs with IATA origin/destination, cabin, baggage quantities and weights, stop and min/max layover constraints; passenger ages; requested currency; seller selection; self-transfer/overnight/airport-change policy.
- Server-side airport resolution must replace the prototype's 50-airport fixtures. Unsupported requirements must be rejected, never silently dropped by the current simpler travel-search-v1 schema.
- Each normalized offer needs operating/marketing carriers, exact segments and timezone-aware times, ticket structure, seller, source, quoted currency, price timestamp/expiry, known mandatory fees, per-segment baggage and unknown-cost flags.
- Compare only equivalent whole journeys, party sizes and requested extras. Compare same currency or explicitly timestamped FX. Rank fully known totals separately from incomplete costs. Never infer the cost of an individual flight sector by dividing a through-fare.
- Return attempted/succeeded/failed/timed-out provider IDs. Label “lowest among queried suppliers”, never lowest worldwide. Empty and failed supplier responses must be distinguishable.
- Reprice all tickets and verify availability before any seller handoff. Allowlist offer-specific URLs. Independent tickets require explicit self-transfer disclosure. No hidden-city fares.

Required activation: deploy host integration and authenticated routes; configure approved model IDs and credentials securely; verify tenant isolation/rate limits/audit and retention; contract flight suppliers (Travelfusion/Mystifly/Duffel/Skyscanner etc.); implement official supplier response normalization and reprice; connect the passenger site to the backend; run live staging acceptance. Existing OpenAI routing must be verified and reused, not duplicated. Mapbox, Amadeus and FX are planned catalogue entries only.

Sources reviewed 26 October 2026: https://docs.anthropic.com/en/api/messages ; https://ai.google.dev/api/generate-content ; https://developers.google.com/maps/documentation/routes/compute_route_directions ; https://developers.skyscanner.net/docs/flights-live-prices/overview ; https://duffel.com/docs/api/offer-requests ; https://support.google.com/travel/answer/9074247 ; https://www.kayak.com/news/hacker-fare/ .

## Phase 2: live flight search

`createLiveFlightSearch` now implements the official Duffel offer-request protocol and `createServer` exposes authenticated `POST /v1/flights/search`. The default instance remains unavailable, with zero supplier calls. Host injection requires a current persisted supplier/tenant/product approval function, tenant-scoped live secret and durable audit sink. No default approval flags or keys are supplied. Duffel is now wired into the persisted supplier catalogue by the optional authorised runtime composition documented at the end of this file; production activation remains blocked by its deployment and acceptance prerequisites.

Accepted input is strictly `{legs:[{origin,destination,departure_date}], adults, cabin, maxConnections, checkedBags}`. Unknown filters are rejected rather than silently ignored. Original supplier currencies are retained. Checked-bag requirements annotate offers; missing or insufficient baggage is not priced as zero. All amounts are supplier fares, not final checkout totals. No offers are bookable from this route. Tests use synthetic responses only and do not establish live supplier access.

### Connector/MCP audit, 26 October 2026

- Duffel REST: concrete read-only search adapter in this phase; supplier account, commercial approval and live token still needed. Official reference: https://duffel.com/docs/api/offer-requests .
- Travelfusion/Mystifly: existing travel catalogue and approval/transaction boundaries; no verified live flight adapters found in this checkout. Use supplier-provided contracts/specifications before implementation.
- Skyscanner: partner live metasearch API is another seller-comparison source; access not connected here. https://developers.skyscanner.net/docs/flights-live-prices/overview .
- Google Maps Grounding Lite: official MCP-supported places/weather/routes data, separate from Maps Code Assist documentation tooling. https://developers.google.com/maps/ai/grounding-lite . No MCP transport was installed or activated in this phase.
- FlightAware AeroAPI: REST flight status/tracking/alerts; not a fare source. https://www.flightaware.com/commercial/aeroapi/ .
- OpenAI: existing server Responses API usage found in services/ai-workforce-readonly/business-crm.mjs and model-probe.mjs; no FlightLounge entitlement/wiring established. Reuse through the shared authorized gateway.
- Claude/Gemini/Google Routes: adapters prepared here; no live credentials or execution verified.
- ChatGPT plugin discovery returned no suitable flight supplier integration. This is not an exhaustive provider directory and does not establish product runtime rights.

MCP can expose approved `travel.search` and comparison tools to models, but is not itself a supplier or licence. All model calls must inherit server tenant scope, budget controls and audit; search does not grant book/pay/refund permissions.

## Phase 3: browser boundary, practical filters and GitHub reuse

`createFlightBrowserBridge` is a Fetch Request/Response handler ready to mount on the passenger application's server at a same-origin path such as `/api/flights/search`. It is source code, not a deployed route. Configure exact HTTPS `siteOrigin` and `gatewayOrigin`, a `resolveAccess(request)` function backed by verified sessions/current membership/FlightLounge entitlement/rate-budget-region controls, a tenant-scoped server `secretReader`, and durable `audit`. Access is rechecked before returning a result. The handler fixes the tenant and `/v1/flights/search` endpoint, enforces POST + JSON + exact Origin, caps bodies, rejects redirects, applies a deadline, redacts upstream failures and never forwards browser cookies or authorization. Missing dependencies fail closed. Do not substitute a constant allow grant in production. Host request deadlines must also protect incoming slow bodies.

The bridge deliberately follows the existing adapters/product-bridges access-resolution pattern. The generic adapters/omniqora-server-client run/task API does not implement travel search, so no competing generic AI client was introduced. No dependency installation, arbitrary MCP execution, or public transport activation occurred.

The search contract now additionally accepts `maxDurationMinutes` (60–4320, optional, per leg), `includedBagsOnly` (boolean, default false) and `allowAirportChanges` (boolean, default false). Limits use supplier ISO elapsed duration; missing duration fails a requested duration limit. Airport changes are identified from adjacent airport codes and excluded unless explicitly allowed. Allowing a change does not establish ground-transfer availability, cost, minimum connecting time, visa eligibility or ticket protection. Baggage remains quantities only. These filters are applied to returned supplier offers, so coverage is still limited to the requested provider response, not an exhaustive global fare search.

### Reviewed GitHub sources (26 October 2026)

| Source | Role | Current integration |
| --- | --- | --- |
| https://github.com/duffelhq/duffel-api-javascript | Official Duffel server SDK | Candidate; existing bounded REST adapter retained |
| https://github.com/anthropics/anthropic-sdk-typescript | Official Claude client | Candidate; existing REST adapter retained |
| https://github.com/googleapis/js-genai | Official Gemini client | Candidate; existing REST adapter retained |
| https://github.com/modelcontextprotocol/typescript-sdk | Official MCP server/client SDK | Candidate; no transport installed or exposed |
| https://github.com/googlemaps/google-maps-services-js | Official Maps Node client, including legacy APIs | Candidate; modern Routes REST retained; review newer routing package for SDK adoption |

Review and pin compatible versions, licences and transitive dependencies before installation. Repository availability and ChatGPT connector access confer no supplier contract, API credential or customer-runtime permission. Existing repository source evidence: adapters/product-bridges, adapters/omniqora-server-client, services/ai-workforce-readonly. Their production deployment is not established by this change.

Activation still requires the host session integration, actual BFF/gateway deployment, persisted Duffel approval catalogue integration, contracted live supplier account and staging acceptance. Never set the passenger `flightSearchPath` until its route is deployed and tested. Broader build/typecheck are unavailable without this checkout's dependencies/Bun; access-controls database check is blocked by missing @electric-sql/pglite.


## Phase 8: bounded flexible-date fare search

Authenticated `POST /v1/flights/flexible-search` accepts `{query, dateOffsets}`. `query` uses the existing flight-search schema; `dateOffsets` has one array per leg, containing integer shifts from -3 to +3 days. Zero is automatically included for every leg so the original complete itinerary is always searched first. The Cartesian product must contain at most nine candidates; excessive requests are rejected, not silently truncated. Invalid date combinations are labelled and not sent. Independent shifts may change stay length. This is whole-itinerary pricing, never a sum or allocation of through-fares to sectors.

Construct `createFlexibleFlightSearch({flightSearch, authorize, reserveBudget, audit})` and inject it as `flexibleFlightSearch` into `createServer`. Reuse the approved `createLiveFlightSearch` adapter. The default service remains unavailable. `authorize` must resolve current authenticated access and return `{allowed:true,tenantId}`; it is called before reservation, each candidate and delivery. `reserveBudget({tenantId,calls})` must atomically reserve the worst-case supplier-call allowance using durable host-side user/tenant limits and return the same grant shape. Do not use constant approvals or the in-memory HTTP request limiter as the supplier budget. Audit failures fail closed. Hooks must be bounded by the host deadline. Account context must come from authenticated host wiring, never browser JSON.

Candidates run sequentially within a 45-second supplier deadline. The Duffel adapter now accepts an optional AbortSignal and combines it with its existing per-call timeout. Client disconnect cancels the flexible HTTP request. A host-injected search adapter must honor this signal. The response distinguishes invalid dates, not-searched/cancelled, unavailable and successful zero-result candidates; coverage explicitly reports partial completion. Expired offers are removed again before delivery. Provider exceptions are redacted. Audit stores counts rather than credentials or passenger details.

Savings summaries compare original supplier currencies separately and require the requested checked-bag quantity to be met. They identify the candidate and offer; baseline failure or missing same-currency baseline gives null savings, not invented savings. `supplierFareSaving` is only a fare difference: `finalTotalKnown:false`, no FX, no bag-weight assurance, no ground cost, no seller-fee estimate and no booking permission. Unknown extras remain unresolved. Nearby airports, paid ancillaries/repricing, additional suppliers and booking are not implemented in this phase.

Validation: 74 travel-core tests pass, including 12 new flexible-search tests covering candidate expansion, immutability, invalid dates, bounded calls, budget refusal, revocation, cancellation, same-currency/included-bag savings, redaction, real Duffel-adapter composition with fixture transport, and HTTP authentication/default refusal. No live supplier credential or supplier call was used. This is an unmerged source implementation, not a live fare activation. The passenger bridge still targets single-search only; do not set its live endpoint or expose this batch route until the durable host hooks and live staging acceptance are complete.

## Phase 9: selected-offer refresh and checked-bag options

Authenticated `POST /v1/flights/refresh` accepts only `{offerRef}`. Inject `createOfferRefresh({authorize,loadOffer,secretReader,audit})` as `offerRefresh` into `createServer`. The default route refuses service. `loadOffer(context)` must resolve an opaque reference to a server-stored `{tenantId,offerRef,query,offer}` snapshot from a prior approved live search, enforcing the authenticated actor's ownership, retention and current access. The current search routes do not yet persist these snapshots. Host wiring must supply that store and actor context; never derive them from browser-supplied snapshots or constant grants.

The adapter checks the stored tenant, provider, expiry and query, then calls Duffel GET /air/offers/{id}?return_available_services=true with server-only live credentials, redirect refusal and a 15-second deadline. Authorization must include supplier approval, user access and refresh-call budget; it is checked before lookup and before delivery. Audit failure suppresses output. HTTP disconnect propagates cancellation. The supplier offer must retain its ID and match the stored route/filter requirements. Price, currency, flight/time and included-baggage differences are explicitly flagged for review. No order, payment or reservation is created, and a successful refresh does not guarantee availability at booking.

Supported optional checked-bag services retain supplier amount strings, currency, maximum quantity, reported weight/dimensions and indexed passenger/segment scope. Unknown, malformed or unsupported services are omitted, not treated as free. Passenger names and other personal fields are excluded. Available services are never automatically selected or added to the fare. The cost breakdown labels supplier fare as tax-inclusive, keeps selected extras empty and finalTotal null, and identifies unresolved fees/extras/ground costs. This is refreshed fare disclosure, not a complete ancillary-pricing or checkout implementation.

Official contract reviewed 26 October 2026: https://duffel.com/docs/api/offers/get-offers . Validation: 84 travel-core tests pass, including ten refresh tests for authorization, stored ownership, expiry, malicious fields, supplier identity/mode, changes, service scope, redaction and HTTP defaults. Syntax checks pass. Full application build/typecheck/security and live staging remain unverified (partial checkout, no Bun/application dependencies or live supplier access). Passenger BFF/UI refresh wiring, persisted offer references and deployed access/budget/audit integrations remain outstanding. The code remains in draft PR #189, not merged or deployed.

## Phase 10: selected checked-baggage subtotal

The refresh request now optionally accepts `selectedBaggage:[{id,quantity}]` alongside `offerRef`. No browser amount, currency or scope is accepted. At most 12 unique service IDs with integer quantities 1–9 are allowed. The refresh adapter resolves each ID against the newly fetched supplier services and rejects missing options, quantities above the current limit and mixed currencies. Overlapping passenger/segment services are conservatively rejected because alternatives may be incompatible; this is not an automatic bag optimizer. Changed/invalid service selections return a 409 reselection response.

The response adds `baggageSubtotal` with original fare, selected bag amount, line items and known subtotal using exact four-decimal fixed-point arithmetic. A service price is multiplied by quantity only, not again by its covered passengers/segments. No settlement rounding or FX conversion is performed. The returned supplier offer amount remains unchanged; available services remain distinct from selected subtotal lines. `finalTotal` remains null, and payment/seller fees, other extras and ground costs remain unresolved. This arithmetic subtotal is not supplier-confirmed ancillary/payment-method repricing, inventory reservation, proof of required bag coverage, or permission to book. Always revalidate with the supplier before purchase.

Validation: 94 travel-core tests pass, including eight subtotal tests and two refresh integration tests. Coverage includes precise decimal arithmetic, multi-segment scope, tampered inputs, duplicates, stale offers, unknown services, quantities, overlapping services and currency mismatch. JavaScript syntax checks pass. Full application build/typecheck/security checks and live supplier acceptance remain blocked by the previously documented partial-checkout/runtime/credential limitations. Passenger selection UI, secure offer store and live deployment remain outstanding. This phase updates draft PR #189 only.

## Phase 11: private offer references and traveller session composition

`createFileOfferStore({directory})` implements persistent single-host storage for trusted normalized live-search snapshots. It requires an absolute private directory (0700), creates exclusive 0600 files, flushes writes, generates random opaque references, and hashes tenant/actor/reference into filenames. Records expire at the earlier of supplier expiry and 30 minutes. Reads enforce tenant and actor ownership, reject symlinks/malformed/oversized records, and delete expired records when accessed. Scoped removal is supported. Provision a private persistent volume and a separate expired-file retention job before production; this implementation does not provide distributed storage, scheduled cleanup, encryption at rest or per-user disk quotas. Only pass normalized server query/offer records, never raw supplier passengers or credentials.

`createTravellerFlightSession` composes existing single-search and refresh services with the store. A trusted session context supplies tenantId and actorId. Current actor access is checked before search, before saving and before delivery. Each returned offer receives an offerRef. Partial persistence failures and final revocation trigger cleanup and suppress results. Refresh binds the resolver to the authenticated actor, preventing cross-user reference lookup. Supplier authorization, budgets and audit remain mandatory in the underlying services. The context MUST be supplied by a verified server session, never browser JSON or an actor header. This wrapper is not mounted on the existing tenant-token HTTP routes, because those routes do not establish end-user identity. Flexible-search persistence and a production passenger session resolver still require integration.

Validation: 102 travel-core tests pass, including eight new tests covering store recreation, actor/tenant isolation, private permissions, TTL, invalid scope/references, concurrent writes, cleanup on revocation, storage errors and cross-user refresh refusal. No live supplier calls occurred. Full application build/typecheck/security checks and deployed acceptance remain unverified under the previously documented environment limitations. This phase is source-only in draft PR #189; it does not activate the passenger Site.

## Phase 12: flexible-search traveller references

The traveller-session wrapper now accepts `flexibleSearchService` and exposes `flexibleSearch(context,raw,options)`. It validates the requested expansion and checks returned candidate identity, baseline and exact query against that expansion. Each current live offer is stored under the traveller with its own candidate query, so later refresh uses the correct alternative dates. Savings summaries are recalculated after storage and include the selected best offerRef. Failed candidates remain empty; expired offers are removed before delivery. Access is rechecked between candidates and before delivery; cancellation, inconsistent candidates and storage failures suppress results and clean up references created by the operation.

The batch remains bounded by nine candidates and 200 offers per candidate. Production requires disk quotas, retention cleanup and durable budget/session integration described above. No endpoint accepts actor identity from browser JSON; this wrapper still needs mounting by an authenticated host. No live supplier or passenger UI activation occurred.

Validation: 108 travel-core tests pass, including six tests for date/reference association, savings references, candidate tampering cleanup, access revocation, failed/expired candidates and cancellation/default refusal. Syntax checks pass. Broader application/security and live staging checks remain unverified under the earlier environment limitations.

## Phase 13: authenticated traveller HTTP handler

`createTravellerFlightHandler({siteOrigin,resolveAccess,session,audit})` routes POST /api/flights/search, /api/flights/flexible-search and /api/flights/refresh to the in-process traveller-session implementation. It requires an exact HTTPS origin and a verified host session, rejects cross-site requests, validates JSON against the supported schemas, limits request bodies to 8 KB with a five-second body deadline, and suppresses results if the actor changes or access is revoked. Caller identity headers are not used. Service operations receive cancellation with a 50-second response deadline; injected services must honor the signal. Host authentication and audit hooks also need bounded execution and durable rate/budget enforcement.

Responses are no-store, capped at 4 MB and limited to supported top-level result fields. The injected session is trusted in-process code, not an arbitrary remote response; nested offer fields rely on the existing normalized service contracts. Errors are redacted and no booking endpoint is exposed. Mount this handler only after connecting the real session resolver, entitlements, budgets, audit and persistent offer store. The legacy tenant-token bridge is not a substitute for traveller identity. This phase does not mount or deploy the handler, enable the passenger Site, or provision credentials.

Validation: 115 travel-core tests pass; seven new HTTP tests cover all routes, verified actor dispatch, origin checks, malformed/oversized requests, identity/price injection, revocation, no-store/error redaction and booking refusal. Focused HTTP tests rerun after tightening the body-timeout check. Full application checks and live staging remain unverified under the earlier documented environment limitations.

### Merge validation — 28 October 2026

The integration was reconciled with current main without rewriting history. Supplier normalization now rejects malformed slices, segments and passenger baggage structures per offer, retaining valid sibling offers. Traveller single-search rejects an already-cancelled request before invoking the supplier service and removes references for offers that expire during persistence.

Validation on the reconciled source: 118 travel-core tests; application build and TypeScript check; repository hygiene and 41 PostgreSQL access-policy checks; 17 bridge tests; six market-site tests; and the TraveNexa factory/database integration check passed. These package scripts were run with npm/Node against the matching installed dependencies because Bun was unavailable locally. The passenger Site separately passed 73 tests at source commit 104b60690515858a28afaec94151238b27c47a71.

Merge is source integration, not supplier activation. Production credentials/approvals, verified session resolution, durable budgets/audit/storage and hosting must be configured and tested before connecting the passenger Site. No live calls, payments or bookings were performed.

### Whole-request deadlines

`createTravellerFlightHandler` now bounds the complete request, including authentication, body reading, request audit, supplier/session execution, access recheck and delivery audit. The default deadline is 50 seconds. A server-only `timeoutMs` option can shorten it; invalid values cannot extend it. Caller cancellation and expiry return a redacted, no-store HTTP 408 response.

The verified request and the optional second argument to `resolveAccess(request, {signal})` and `audit(event, {signal})` carry the same cancellation signal supplied to session operations. Existing one-argument hooks remain compatible. Hosts should honour this signal and use bounded database/network calls: JavaScript cannot forcibly terminate a dependency that ignores cancellation. Late authentication or audit completion cannot advance to supplier dispatch, and late supplier completion cannot deliver a successful response. No automatic retry occurs.

Six regression cases cover stalled authentication, stalled request/delivery audit, cancellation during service execution, cancellation before authentication, and incomplete body streams. Travel-core total: 124 tests. Live supplier access is not activated by this change.

## Current integration status — authorised runtime composition

This section supersedes the historical phase notes above. Duffel is now a `catalogue_only`
entry and `createFlightLoungeRuntime` reads its current approval through the existing
`createPostgresSupplierApprovalReader`. No approval rows are seeded or changed. Existing
approval requirements (including payment/servicing fields) are deliberately preserved;
read-only search does not grant booking/payment rights or relax commercial policy.

The runtime composes the existing search, nine-itinerary flexible comparison, private
actor-owned offer store, fare refresh, checked-baggage subtotal and bounded passenger
HTTP handler. It creates request-local closures so concurrent actors cannot share identity
or reserved budget. Supplier approval and passenger access are checked before credentials,
before outbound dispatch, and before delivery. Flexible searches reserve their worst-case
allowance once; candidate dispatches consume that request-local reservation. Single search
and refresh reserve one call at dispatch. Denied quotas return 429. Reservations are
conservatively consumed even on supplier errors, cancellation or unused candidates; no
implicit refunds or automatic retries can exceed the allowance.

`createPostgresFlightControls({db})` implements atomic tenant+actor allowance debits and
redacted durable audit records. `db.query(sql,params,{signal})` and
`db.transaction(async tx => ..., {signal})` are **host adapter contracts**, not an assertion
that arbitrary PostgreSQL drivers accept these signatures. Transactions must pin one
connection, commit on success and roll back on throw, with statement/lock deadlines and
cancellation. Apply `sql/runtime-controls.sql` explicitly to the gateway's private database
before use; it is not an automatic Supabase migration or startup action. The tables have
RLS, no public policies/grants, no default quotas and no seeded approvals. Provision a
private runtime DB identity with reviewed access (the fixture uses the database owner),
and ensure anon/authenticated roles have neither schema nor table privileges. Audit payloads
allow only numeric counters/statuses, event name and authenticated scope; no supplier body,
credential, itinerary or passenger names. This is a durable sink, not tamper-proof archival.

`createServer({travellerHandler,passengerOrigin})` can mount this Fetch handler on
`/api/flights/search`, `/api/flights/flexible-search` and `/api/flights/refresh`. Exact HTTPS
origin, JSON, body limits, full-request deadline and no-store protections remain in the
existing handler. Missing mount configuration returns unavailable. Existing `/v1/flights/*`
tenant-token routes remain separate and disabled by default. The legacy browser bridge
cannot supply a verified passenger identity and is not used for this passenger composition.
Do not expose a second route with weaker authorization.

### Host wiring and precise activation prerequisites

1. Establish legitimate Duffel live API access and commercial/compliance approval. Record
   the approved tenant/supplier/product row in `public.travenexa_supplier_approvals` with
   all existing required evidence/flags, expiry and servicing arrangements. Revocation
   and expiry must be visible on every read; do not cache an allow grant.
2. Implement `resolveAccess(request,{signal})` using the deployed application's verified
   session, with revocation handling. Implement `authorizePassenger(context,{signal})`
   using current tenant membership, FlightLounge entitlement and regional policy. Both
   must return the exact authenticated `{allowed,tenantId,actorId}`. Caller JSON, actor
   headers, decoded-but-unverified JWTs and tenant gateway tokens are not identity proof.
   These deployment-specific resolvers are still unverified; no auth provider was invented.
3. Provision the private PostgreSQL tables and transactional adapter above; establish
   database statement/lock deadlines. Create explicit tenant (`subject='*'`) and actor
   allowance rows with `remaining` and `valid_until`. Operate reviewed quota renewal,
   request-rate protection, retention, monitoring and alerts. Missing/expired rows deny.
4. Supply `secretReader(tenantId,'duffel',{signal})` from a tenant-bound server secret
   manager. Configure a legitimate live token only in that manager, never in browser code,
   Git, logs or this document. No credential was obtained or verified in this change.
5. Provision `createFileOfferStore` on a private persistent single-host volume, with
   encryption at rest, disk quotas, retention cleanup and recovery procedures. For multiple
   gateway instances provide an equivalent shared actor-scoped store before scaling.
6. Construct the runtime with these dependencies and mount it in the existing gateway,
   behind a same-origin trusted reverse proxy for the passenger site. Set `passengerOrigin`
   and `siteOrigin` to the exact verified HTTPS passenger origin. Secure cookies/session
   forwarding, TLS, incoming request limits and disconnect propagation require hosted tests.
7. Establish controlled, authorised staging acceptance before public enablement: session
   revocation/expiry, cross-user references, persisted approval revocation, concurrent
   budget exhaustion, audit/database failures, 429/5xx/timeouts, cancellation, partial dates,
   expired/repriced offers and baggage discrepancies. Fixture tests are not live acceptance.
   Any controlled live acceptance probe itself requires legitimate access and separate
   operator authorization; this task performs none.
8. Only after that evidence exists, supply the explicit server activation object with
   `commercialApproval`, `secureConfiguration`, `hostedStagingAccepted` and
   `liveSearchEnabled` all true. They default off and are additional deployment attestations,
   never substitutes for the persisted approval or session checks. Connect Journeys' search
   path only after the real route is deployed and accepted. Leave booking/payment disabled.

Reproduction: `npm run test:travel-core` runs adapter, flexible-search, refresh/baggage,
offer-store, HTTP deadline and the new PostgreSQL-backed runtime integration regressions.
All supplier transports in tests are synthetic. No live searches, booking, payment,
production schema application or deployed endpoint has been verified by this change.

Local validation for this integration: 137 travel-core tests (13 new PostgreSQL-backed
runtime tests), application TypeScript check and production build, repository hygiene and
41 PostgreSQL security checks, 23 bridge/market-site tests and the TraveNexa factory/database
integration suite passed. Tests ran with npm/Node and installed declared dependencies;
no dependency manifests or lockfiles were changed. Hosted CI/review and live staging are
separate release gates.

Authentication inspection: `src/integrations/supabase/auth-middleware.ts` verifies claims
for Omniqora server functions, but does not itself establish a FlightLounge passenger's
current membership, entitlement or session revocation. It was not modified or treated as
proof of a deployed Journeys identity integration.

### Delivery and baggage integrity follow-up

The passenger handler rechecks authenticated access after the final audit and checks all
returned fare expiries immediately before delivery. A quote expiring during audit/access
work returns 409 with no fare or savings payload; the passenger must search/refresh again.
The final access check remains inside the existing request deadline. The runtime also
rechecks the supplier's shorter cancellation deadline immediately before transport.

Baggage parsing skips malformed ancillary entries while retaining valid siblings. Missing
or duplicate supplier passenger/segment IDs suppress ancillary pricing; duplicate scopes
within a baggage service are rejected. A selected option that cannot be resolved safely
requires reselection (409), rather than being treated as free or assigned to the wrong
passenger. These source changes do not enable live supplier access.

Follow-up verification: all 144 travel-core tests passed (seven additional regressions),
alongside application typecheck/build, 41 PostgreSQL security checks and 17 bridge tests.
Synthetic supplier fixtures only; no production activation or schema changes.

### Bounded supplier-response processing

Search and refresh share `supplierJson`, which bounds transport plus response-body reading
with a 15-second deadline and a 4,000,000-byte limit. Native Fetch response bodies are read
incrementally; oversized bodies are cancelled before further accumulation. UTF-8 is decoded
strictly after bounded collection. Error bodies are discarded, not parsed or returned.
Caller cancellation interrupts stalled reads; late responses are discarded, and a stalled
fetch implementation cannot hold the caller indefinitely. No automatic retries are added.

Production transport adapters must return native Fetch Responses/byte streams. The existing
text-only adapter fallback is for trusted in-process adapters/fixtures: it enforces returned
UTF-8 byte size and elapsed time, but cannot control how that adapter buffers text internally.
Database/authentication hook deadlines remain the host's responsibility and are still covered
by the separate whole-passenger-request deadline.

Search coverage records failed transport attempts, including thrown/oversized/malformed
responses. Flexible-date candidates retain this failure list. An attempted transport call is
not proof that a supplier received a request; durable dispatch/response audit remains separate.
Successful zero-result searches remain distinguishable from failures. Existing approval,
passenger isolation, budgets, offer refresh and activation gates remain unchanged.

Validation: 158 travel-core tests (14 new response-boundary regressions), application
build/typecheck, repository hygiene with 41 PostgreSQL policy checks, and 17 bridge tests
passed locally. Supplier fixtures only. No credentials, live requests, schema changes,
bookings, payments or deployment were performed.

## Shared PostgreSQL offer storage

`createPostgresOfferStore({db})` is an optional alternative to `createFileOfferStore`, using
the same `put/get/remove` contract. Inject it as `offerStore` into `createFlightLoungeRuntime`;
separate gateway instances can then resolve the same passenger-owned offer references.
No passenger route or supplier protocol changes are needed. The file store remains available
for a single host; this change neither copies its existing records nor changes its defaults.

Explicitly provision `sql/offer-store.sql` in the private gateway database. It creates
`flightlounge_private.offers` and `offer_quotas`, enables RLS and revokes public access.
It is not automatically applied at startup or through Supabase migrations. Establish a
reviewed private runtime database role and the same transactional adapter used by budgets,
with connection-pinned transactions, rollback on throw, statement/lock deadlines and
cancellation. Browser roles must not have private schema/table privileges. No quotas are
seeded. Administrators must provision both the tenant `subject='*'` row and each verified
passenger's subject row with an explicit `max_records` (0 denies new writes).

Writes lock the tenant quota before the passenger quota. Counts include expired records,
so a stopped cleanup job cannot allow unbounded storage growth. A failed quota check or
cancelled transaction stores no record; traveller-session cleanup removes partially saved
batches. Records are limited to 128 KB and expire at the earlier of supplier expiry or
30 minutes from the database clock. Reads/removal always match tenant, passenger and opaque
reference. Supply normalized server snapshots only, never raw supplier bodies or credentials.
Quotas are storage controls, not supplier-call budgets or a substitute for access revocation.

A trusted maintenance worker can call `purgeExpired({tenantId,limit:500})`, which deletes
only expired records for that tenant, up to 1,000 per call, using `SKIP LOCKED` for competing
workers. Repeat bounded batches on a host-managed schedule. The result contains only the
number deleted. No passenger endpoint exposes cleanup. Monitor quota denials and maintenance
lag; provision encryption, backups and retention for backups/audit separately. Changes to
quota configuration are administrator operations outside the passenger API.

Example host composition (all existing auth/approval/activation dependencies remain required):

```js
const offerStore = createPostgresOfferStore({db});
const handler = createFlightLoungeRuntime({...verifiedHostDependencies, db, offerStore});
const server = createServer({travellerHandler: handler, passengerOrigin: verifiedSiteOrigin});
```

This supplies the shared storage implementation previously listed as a multi-instance
prerequisite. Actual database provisioning, runtime role grants, maintenance scheduling,
failover/load testing and hosted passenger acceptance remain outstanding. No existing live
data was migrated or deleted, and no live supplier search, booking or payment was activated.

Validation: 168 travel-core tests, application build/typecheck, repository hygiene with 41
PostgreSQL policy checks and 17 bridge tests passed. The final 24 shared-store/runtime tests
were rerun after tightening quota locking. Tests use disposable PGlite and synthetic supplier
responses; they do not establish hosted multi-connection load/failover acceptance. Storage
quota failures suppress results and clean up partial batches; supplier-call budgets already
consumed by the search are not refunded or retried automatically.

### Node passenger response boundary

The optional Node gateway mount now gives the entire injected passenger handler and its
response body a 55-second deadline (hosts may lower `passengerTimeoutMs`, never raise it).
This outer limit complements the handler's existing 50-second authentication/audit/search
budget. It propagates client disconnects and timeout cancellation, discards late response
bodies, and does not wait for a stalled stream cancellation hook. Hosts must still use
cancellation-aware database, session and secret providers; a JavaScript deadline cannot
forcibly terminate arbitrary injected code or undo an already completed external operation.

Responses are buffered up to 4,000,000 bytes before any status or headers are written.
Oversized, failed or stalled bodies produce the generic no-store gateway 503, with no partial
fare delivered. Stale content-length/transfer-encoding headers are removed and private
response headers are enforced. This bounds gateway response buffering, not allocations made
inside a custom handler. Upstream proxy request/header/write deadlines, connection limits
and hosted load/disconnect acceptance remain deployment prerequisites.

Regression tests cover stalled handlers, late bodies, stalled body cancellation, declared
and streamed size limits, pre-cancellation, invalid deadlines, response framing, partial
response failures and real Node client disconnects. No route, activation flag, supplier
permission, booking or payment capability is enabled by this boundary.
