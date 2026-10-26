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

`createLiveFlightSearch` now implements the official Duffel offer-request protocol and `createServer` exposes authenticated `POST /v1/flights/search`. The default instance remains unavailable, with zero supplier calls. Host injection requires a current persisted supplier/tenant/product approval function, tenant-scoped live secret and durable audit sink. No default approval flags or keys are supplied. Duffel is not yet wired into the existing persisted supplier catalogue, so production activation remains blocked until that integration is reviewed.

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
