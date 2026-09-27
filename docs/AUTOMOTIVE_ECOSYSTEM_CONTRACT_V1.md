# Automotive Ecosystem Contract v1

Status: implementation contract. Provider activation remains disabled until credentials, contracts, signature verification and staging acceptance exist.

## Products and ownership

- AutoHashi owns Japanese auction sourcing, analysis, funded lot reservations, bidding, Japan/UK logistics, compliance milestones and key-in-hand delivery.
- Zivvo UK owns UK consumer/dealer listings, UK auctions, provenance, finance referrals, dealer intelligence and completed-sale evidence.
- Zivvo Germany owns German marketplace workflows and the Germany-to-France opportunity and registration-readiness pipeline.
- SparesGrid owns recycled-parts inventory, fitment, multichannel commerce, wanted-parts sourcing and repair-parts baskets.
- MotResq owns recovery, transport, workshop, mechanic, tyre, MOT/inspection and service-job fulfilment.
- Omniqora owns tenant/product/number routing, WhatsApp, AI-agent orchestration, human handoff and the shared automotive intelligence gateway.

No product may write another product's database directly.

## Identity and tenancy

Every event carries:
- contract_version
- event_id and idempotency_key
- source_product and source_tenant_id
- destination_product and destination_tenant_id
- correlation_id and occurred_at
- vehicle_passport_id when vehicle-related
- actor_type and actor_id
- payload_schema and payload
- signature_id

Vehicle identity may include VIN, UK VRM or Japanese chassis/frame number. Exact identifiers are private unless the receiving tenant is authorised.

## Security boundary

- HMAC signatures, timestamp tolerance and replay protection are mandatory.
- Browser clients never hold shared product secrets.
- Service-role writes remain server-side.
- Tenant mappings are fixed server-side; callers cannot select arbitrary destination tenants.
- Every mutation is idempotent and auditable.
- Failed delivery uses retry and dead-letter handling.
- Precise capture geolocation is not collected for customer/dealer vehicle evidence.
- AI output is labelled as inferred, calculated or provider-verified and cannot approve regulated/compliance gates.

## Core events

- vehicle.identity.created
- vehicle.passport.updated
- appraisal.requested
- appraisal.completed
- auction.lot.reserved
- auction.bid.authorised
- auction.bid.result
- payment.milestone.updated
- logistics.milestone.updated
- vehicle.key_in_hand
- listing.publication.requested
- listing.publication.accepted
- parts.basket.requested
- parts.quote.updated
- service.job.requested
- service.job.updated
- conversation.handoff.requested

## AutoHashi to Zivvo

Publication is dealer-initiated after key-in-hand. Transfer may include identity, specifications, approved evidence, auction sheet, import provenance, mileage evidence, UK registration and dealer-selected media. Purchase cost, margin, internal notes and funding data are excluded by default.

## SparesGrid and MotResq

Repair intelligence may request a SparesGrid parts basket and a MotResq labour/transport/service quote. Responses remain estimates until suppliers/providers accept. Neither service may change a vehicle, auction, payment or listing state.

## Communications

Product workflows emit business events. Omniqora renders approved channel templates, records consent and delivery, and routes replies to the source product. WhatsApp messages never mutate a vehicle/payment/compliance state without server validation and, where required, human approval.

## Market boundaries

UK and German/French compliance, valuation, tax and finance rules remain separate. A German or other EU roadworthiness result is evidence, not automatic French registration approval. Structural/airbag/safety markers or incomplete evidence require qualified review.

## Data-quality rules

Current asking prices are not represented as completed-sale prices. Ninety-day sold evidence must identify its contracted source and comparable count. Provider-unavailable results fail closed and are never replaced with fabricated market data.

## Omniqora implementation profile

Omniqora is the only shared communications and automotive-intelligence control plane. It maintains source-product connections, product/tenant/location/department/number routing, tool permissions, consent, human handoff, metering and provider-neutral adapters. It does not become the system of record for auctions, listings, parts orders or service jobs.
