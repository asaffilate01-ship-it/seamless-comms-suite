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
