# TraveNexa Phase 3 — supplier approval and Hotelbeds API sandbox

## Architecture
TraveNexa is the sole travel landlord in Omniqora SaaS Factory; FlightLounge, MarocWays, Route50, BestFares BestRates and source-market sites are its tenants. They never hold independent supplier credentials.

The new supplier-approvals.mjs module queries the real travenexa_supplier_approvals table with tenant, supplier and product identity. The public search engine now REQUIRES this persisted approval as well as a connected adapter. Missing, expired or incomplete approvals fail closed. A catalogue listing or API key does not activate supply.

Supplier-hosted checkout now has a separate approved mode. The provider must be the merchant of record with documented checkout/servicing rights, and the link must use a supplier-specific allowlisted HTTPS hostname. TraveNexa must not insert an unapproved markup into a supplier-controlled price. Platform Adyen checkout is a separate contract and payment/certification decision.

## Hotelbeds/HBX official sandbox client
Official references:
https://developer.hotelbeds.com/documentation/getting-started/
https://developer.hotelbeds.com/documentation/hotels/booking-api/workflow/

Location: services/travenexa-core/hbx-hotels-sandbox.mjs
Implemented official evaluation endpoints:
- GET https://api.test.hotelbeds.com/hotel-api/1.0/status
- POST https://api.test.hotelbeds.com/hotel-api/1.0/hotels (availability by Hotelbeds-specific hotel codes)
- POST https://api.test.hotelbeds.com/hotel-api/1.0/checkrates (recheck a specific rateKey)

Authentication uses private Api-key and X-Signature (SHA256 lowercase hex of apiKey + secret + Unix timestamp seconds). Requests use the fixed test hostname, no redirects, timeouts, bounded response size and no user-supplied API host. There are no booking, cancellation, card, payment or refund methods.

The client returns diagnostic wholesale rates ONLY; it does not generate public customer offers. BOOKABLE and RECHECK are supplier rate types, not proof that TraveNexa may sell the room. Some hotels require rechecking, property-incidental cards, local fees, mandatory selling rates and cancellation terms; these require a separate retail agreement and price presentation compliance.

### Obtain evaluation access
1. Register at https://developer.hotelbeds.com/ and obtain the Hotels API evaluation key and secret.
2. Store both in server-side vault/secrets. Never use VITE_ variables or push credentials to GitHub.
3. Sync contracted Hotelbeds Content API hotel codes. Free-text city searches need a verified destination-to-code mapping before using the booking API.
4. Test sandbox status, room search and CheckRate with authorised property IDs, confirmed tax and rate semantics.
5. Negotiate retail/commission/net fare model, merchant of record, permitted brands and markets, refunds and chargebacks; certify before enabling live fares or booking.

## Next suppliers
- Flights: Mystifly/Travelfusion/PKFARE need their contractual private API docs, fare/ticketing rules, sandbox credentials and a merchant/support model. No endpoints or ticket issuance have been invented.
- Hotels: TBO requires its approved API docs and seller/payment settlement contract.
- Rail/coach: Omio/Busbud/Distribusion support agreed white-label/affiliate routes where available; train ticket issuing rights need separate review.
- Transfers/chauffeurs: Mozio/Blacklane subject to private hire licensing and supplier booking responsibilities.
- Third-party protected packages: organiser/agency-specific legal approval. Never create an undeclared TraveNexa organiser package.

## Verify
bun run test:travel-core
bun run test:travel-sites
bun run typecheck:travel-sites
node verification/control-plane/travenexa-factory.test.mjs

Nothing in this phase deploys live supplier accounts, enables Adyen charges, issues airline tickets or activates booking endpoints. A supplier or API key alone never establishes legal permissions.
