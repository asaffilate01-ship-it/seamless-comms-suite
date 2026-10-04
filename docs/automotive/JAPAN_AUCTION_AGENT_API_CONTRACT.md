# Japan Auction Execution Agent Contract v1

Status: procurement and integration contract. **No live bidding is enabled by this document.**

AutoHashi owns the customer mandate and bid ceiling. Omniqora owns provider routing, intelligence, idempotency and the audit trail. A licensed Japan-side agent executes only an explicitly authorised instruction.

## Required agent capabilities

The production execution provider must support:

- `bid.submit`
- `bid.amend` before the provider/auction cut-off
- `bid.cancel` where the auction permits it
- `bid.status`
- `results.read`
- `invoice.read`
- `payment.status`
- `transport.status`
- `export.status`
- `shipping.status`
- `documents.read`

The inventory feed may be supplied by a different provider. Read access never implies authority to bid.

## Minimum API

### POST /v1/bids

Request must contain:

- `idempotency_key`
- `instruction_id`
- `provider_lot_id`
- `auction_house`
- `auction_date`
- `max_bid_jpy`
- `customer_authorised_at`
- `autohashi_reference`
- `callback_url`

The agent must reject a duplicated `idempotency_key` without creating a second bid.

The response must return:

- `provider_reference`
- `status` = accepted or rejected
- the exact accepted maximum bid
- provider timestamp
- rejection reason where applicable

### GET /v1/bids/{provider_reference}

Must return the current immutable instruction, auction status and result state.

### Webhooks

Required events:

- `auction.bid.accepted`
- `auction.bid.rejected`
- `auction.bid.won`
- `auction.bid.lost`
- `auction.invoice.created`
- `auction.payment.updated`
- `vehicle.transport.updated`
- `vehicle.export.updated`
- `vehicle.shipping.updated`
- `vehicle.documents.updated`

Every webhook requires an HMAC signature, timestamp, event ID and idempotency key. Replayed events must be safe.

## Safety and commercial controls

- The provider must never exceed `max_bid_jpy`.
- AutoHashi must retain a human-auditable customer authorisation record.
- A result reported by an inventory reseller is not a confirmed hammer price unless the execution provider or auction result feed verifies it.
- Provider credentials are server-side only.
- No browser automation or member-site scraping is accepted as a production integration.
- Production activation requires sandbox/staging evidence for duplicate requests, timeouts, retries, result webhooks and provider outages.
- Emergency manual execution may exist as a separately logged operating procedure; it must not masquerade as an API success.

## Procurement questions

Ask each candidate agent for:

1. Auction houses covered (USS, TAA, CAA, JU, ARAI, AUCNET and others).
2. Whether API/webhook access is first-party or their own member-facing integration.
3. Lot/image/auction-sheet display and redistribution rights.
4. Bid cut-off rules and latency expectations.
5. Deposit/credit requirements and failed-payment rules.
6. Inland transport, storage, export and shipping capabilities.
7. Invoice and result data retention.
8. Service levels, support hours and disaster recovery.
9. Data-processing/security terms.
10. A sandbox account before production approval.


## Webhook signature profile

Provider webhooks POST the exact JSON request body to the callback URL with:

- `x-auction-timestamp`: Unix epoch milliseconds
- `x-auction-signature`: lower-case hex HMAC-SHA256 of `<timestamp>.<raw-body>`
- shared secret: `AUTOHASHI_AUCTION_AGENT_WEBHOOK_SECRET`

The receiver rejects timestamps outside a five-minute window and de-duplicates by both provider event ID and idempotency key.

A reported `auction.bid.won` hammer price above the authorised `max_bid_jpy` is treated as a provider safety violation and must not be silently accepted as a valid win.
