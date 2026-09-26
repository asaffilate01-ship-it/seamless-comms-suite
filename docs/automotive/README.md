# Omniqora Automotive Add-ons

Omniqora is the shared automotive intelligence and integration layer for **Zivvo**, **Autohashi** and **SparesGrid**. Each SaaS keeps its own customer experience and domain workflow, while shared vehicle identity, evidence, intelligence and add-on entitlements are exposed through one contract.

## Product model

- **Zivvo**: UK marketplace/dealer OS. Core use: UK provenance, appraisal, valuation, compliance and finance adapter.
- **Autohashi**: Japan/JDM auction and import SaaS. Core use: auction intelligence, auction-sheet parsing, landed cost, maximum bid and cross-border vehicle passport.
- **SparesGrid**: parts SaaS. Core use: vehicle/chassis decode, factory specification, parts identification and compatibility.
- Any non-core module can be enabled as an add-on in any of the three products, subject to tenant entitlement and provider/data licensing.

## Shared add-ons

Vehicle Intelligence, Vehicle Passport, Verified Media, Vision Inspection, Remote Appraisal, UK Provenance, Factory Specification, Service History, Valuation, Market Intelligence, JDM Intelligence, Auction Sheet AI, Landed Cost, Maximum Bid, Parts Intelligence, Parts Compatibility, Compliance Centre, Finance Adapter and API Access.

## Vehicle identity

Use a single Omniqora `vehicleId` across products. UK VRM, VIN and Japanese frame/chassis identifiers are aliases of that identity. Shared identity does **not** imply shared commercial data: source-product records remain tenant- and purpose-scoped.

Examples:
- Autohashi auction purchase price can remain visible only to an authorised importer tenant.
- Zivvo retail margin can remain within the dealer workspace.
- SparesGrid supplier quotes can remain within the parts workspace.

## Verified Media and Dokuvera adapter boundary

The evidence contract is provider-neutral so Dokuvera, or another approved evidence provider, can be connected without changing Zivvo/Autohashi/SparesGrid APIs.

For customer/dealer vehicle photos and videos:
- preserve the original object;
- calculate/store SHA-256;
- store capture-session creation time and server receipt time;
- store provider timestamp/seal where supplied;
- create watermarked/display derivatives separately;
- record immutable evidence/audit IDs;
- **do not capture or persist precise geolocation**;
- strip GPS EXIF from display derivatives and reject provider payloads that require latitude/longitude for this workflow.

Location is intentionally excluded because vehicle storage/home location is not required for appraisal evidence.

## API pattern

Zivvo, Autohashi and SparesGrid can use the source-SaaS gateway:

`POST /api/automotive/v1/gateway/:connectionId`

Connections are server-configured with a fixed tenant, fixed product, independent bearer secret and explicit scopes. Supported v1 operations are `vehicle.create`, `vehicle.get`, `appraisal.create`, `passport.get` and `passport.snapshot`. Mutations require an idempotency key and are persisted in the API request ledger.

Commands use synchronous authenticated APIs; state changes use signed webhooks.

Recommended command surface:

```
POST /api/automotive/v1/vehicles
GET  /api/automotive/v1/vehicles/:vehicleId
POST /api/automotive/v1/appraisals
POST /api/automotive/v1/appraisals/:id/media-request
POST /api/automotive/v1/provenance
POST /api/automotive/v1/valuations
POST /api/automotive/v1/vision/jobs
POST /api/automotive/v1/jdm/auction-sheet
POST /api/automotive/v1/jdm/landed-cost
POST /api/automotive/v1/jdm/max-bid
POST /api/automotive/v1/parts/identify
POST /api/automotive/v1/parts/compatibility
POST /api/automotive/v1/compliance/packs
```

Every request must include authenticated tenant/product context and an idempotency key for mutations.

## Webhooks

Event names are defined in `src/modules/automotive/contracts.ts`.

Examples:
- `appraisal.created`
- `media.requested`
- `media.received`
- `media.capture_completed`
- `vision.analysis.completed`
- `provenance.completed`
- `valuation.completed`
- `vehicle.passport.updated`
- `auction.sheet.parsed`
- `auction.history.completed`
- `landed_cost.updated`
- `max_bid.updated`
- `auction.won`
- `vehicle.arrived_uk`
- `vehicle.registered_uk`
- `part.identified`
- `compatibility.completed`
- `compliance.pack.updated`

Delivery requirements:
1. HMAC-SHA256 signature over `timestamp.rawBody`.
2. Five-minute replay window.
3. Event UUID as idempotency key.
4. At-least-once delivery with exponential retry.
5. Consumer must persist processed event IDs.
6. Endpoint secrets stored server-side only and rotated independently per tenant/integration.
7. Dead-letter failed deliveries after the configured retry policy and surface them to an operator.

## Remote appraisal capture

Default UK seller/PX policy:
- fresh guided capture preferred;
- library upload disabled for mandatory evidence unless explicitly allowed;
- photo/video originals retained;
- no precise geolocation;
- completeness checks before submission;
- duplicate/hash checks;
- optional AI detection of visible damage, warning lights, mismatched colour/spec and missing requested views;
- AI findings are observations requiring appropriate human review, not mechanical or structural certification.

## Security and tenancy

- Add-on entitlements are per tenant + product + module.
- API scopes are purpose-specific.
- Webhook secrets are not shared across products.
- Vehicle identity can be common while confidential price, finance, seller and supplier data remain separately authorised.
- Finance adapters must not expose lender/customer financial data to Autohashi or SparesGrid unless that tenant and workflow are explicitly authorised.
- Evidence access must be auditable.
- External data-provider licensing/terms remain a separate activation requirement.

## Build status

This module establishes shared contracts, product/add-on rules, tenant UI, vehicle registration, remote appraisal creation, passport snapshots, scoped source-SaaS APIs, webhook signing/verification, inbound idempotency, outbound retry/dead-letter delivery, provider-job records and the integration architecture. Provider adapters (DVLA/MOT/provenance, Codeweavers, Japanese auction feeds, Dokuvera and parts data) still require credentials, provider-specific mapping and live contract tests before production activation.
