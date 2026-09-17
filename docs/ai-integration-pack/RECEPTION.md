# Reception add-on: intake and source-system handoff

The pilot records and tracks enquiries, order requests and booking requests. It does not answer live calls, reserve slots, collect payment, place an order or dispatch a KDS ticket. Those operations belong to connected phone, ordering, booking and EPOS services. No phone provider is configured.

Configure reception per product under Receptionist → Reception settings. Enable intake, set approved instructions and record an escalation contact. Configuration is restricted to company owners/admins. Operators can record requests and release reviewed orders/bookings to the source app; viewers are read-only.

Customer content is evidence, not executable instructions. Never pass free-text summaries straight into privileged actions. The phone adapter should resolve menu/service IDs against the source catalogue, validate prices and availability, and obtain customer confirmation. Use the existing payment flow; do not collect card numbers in the request summary or transcript.

## Source of truth

Online orders should continue through the ordering system's existing deterministic acceptance and KDS pipeline. Omniqora observes receipts and escalates exceptions. It does not need an AI run on each online order. Phone orders should use the same ordering API and validation rules as the website.

For bookings, the source booking API must atomically reserve the slot before returning confirmation. AI text or a receptionist's request record is not proof of availability or reservation.

## Product-scoped API

All calls use the product key generated in Connections, stored only on the source application's server:

```http
Authorization: Bearer <product-key>
Content-Type: application/json
```

POST calls also require `x-event-timestamp` as current Unix milliseconds within five minutes. This freshness header is not a provider signature. The server-side adapter must verify the telephony provider's actual webhook signature before calling Omniqora; clients must not hold product keys. The private Site gateway may prevent machine access until a suitable integration deployment is configured.

### Capture a request

`POST /api/integrations/reception`

Add `idempotency-key: <stable-event-id>` (at most 80 characters). Do not regenerate it on retries. It is scoped to the workspace/product and persists across product-key rotation.

```json
{
  "action": "receive",
  "kind": "order",
  "channel": "online",
  "customer": "Customer name",
  "contact": "Customer-provided contact",
  "summary": "Requested items, quantities and preferences"
}
```

Kinds: `message`, `order`, `booking`. Channels: `phone`, `online`, `manual`. The company/product comes from the bearer credential; body fields cannot select another tenant. HTTP 202 returns `{ "item": { ... } }`. Reusing a key with the same payload returns the saved item; different details conflict.

Online API orders/bookings enter `queued` automatically. Phone/manual requests enter `new` for review. This is an intake policy; it is not order acceptance. The staff UI always creates `new` requests, regardless of the selected channel, and labels them as staff-recorded.

### Retrieve handoffs

`GET /api/integrations/reception` returns up to 100 oldest `queued`/`accepted` items, plus the product's reception instructions and escalation rules. Intake must be enabled. Queued orders/bookings await the source app. Accepted orders await a KDS acknowledgment.

Delivery is at least once. Store each Omniqora request ID durably in the adapter and pass it as the source API's idempotency key. Deduplicate using both request ID and the source order/booking reference before executing. There is no delivery lease or guaranteed exactly-once execution across external services.

### Acknowledge a validated order

`POST /api/integrations/reception`

```json
{
  "action": "acknowledge",
  "id": "reception-request-id",
  "status": "accepted",
  "sourceRef": "source-order-id",
  "receipt": {
    "accepted": true,
    "priceValidated": true,
    "availabilityValidated": true,
    "paymentState": "paid"
  }
}
```

`paymentState` may also be `pay_later_authorized` when the source application has accepted its pay-later policy. These fields must describe verified source results. They are assertions from the credentialled source adapter, not an independent payment verification performed by Omniqora. The model has no tool that can issue these acknowledgments.

After the source EPOS receives the KDS acknowledgment, send:

```json
{
  "action": "acknowledge",
  "id": "reception-request-id",
  "status": "delivered",
  "sourceRef": "source-order-id",
  "receipt": { "kdsAcknowledged": true }
}
```

The source reference must match. `delivered` means the KDS acknowledged the ticket; it does not mean the meal was cooked, delivered to the customer or refunded.

### Acknowledge a booking

After successful reservation, send `status: "confirmed"`, a non-empty `sourceRef`, and `receipt: { "slotReserved": true }`. The API rejects this for an order or message. Customer notifications still belong to the source application; Omniqora does not send them.

### Exceptions and retries

The source app can move a queued request or accepted order to `failed` with `receipt: { "reason": "..." }`. An operator can review and retry a failed request by releasing it again, using the same request ID and any saved source reference. Before retrying, reconcile the source order/booking and its KDS state to prevent duplicate fulfillment.

Repeated matching acknowledgments at the current status, and matching delayed order acceptance after KDS delivery, are harmless. Other stale, out-of-order or conflicting transitions return 409; reconcile the saved/source state rather than starting a new order. Unfulfilled `new`/`failed` requests can be closed; this does not cancel or refund anything externally. Messages can be marked handled after staff follow-up.

Unresolved reception counts appear in My day. The reception inbox is shared with authorised workspace members. Personal daily check-ins are stored separately per user.

## Before enabling live phone service

Connect the chosen telephony and voice agent providers, validate their signed webhooks, bind each phone number to the correct company/product, configure business hours and escalation/transfer, and integrate the source catalogue/order/booking APIs. Set recording/consent and retention rules appropriate to the business and jurisdiction. Exercise a real inbound call, accepted and rejected orders, slot contention, payment failure, KDS timeout and repeated webhook delivery before rollout. These live checks have not been performed in this pilot.

## Speech and customer recognition

The staff form now supports reviewed dictation, caller-number lookup, saved customer profiles and linked history. See [Voice review](VOICE-REVIEW.md) for browser support, deployment status and remaining live-call work. Staff customer operations use `POST /api/customers`; only owners/admins/operators can call it. Payloads use `action: lookup | history | save` and `productId`; customer phone data is kept out of URL query strings.

Server adapters use `POST /api/integrations/customers` with the same product bearer key. The company/product always comes from that key, never body fields. Reception must be enabled, the product must be enabled and the workspace must not be paused. A customer match never authorises a sensitive business operation by itself. The owner-private hosting gateway still needs an appropriate integration ingress before external machines can reach these routes.

```json
{ "action": "lookup", "phone": "+44 20 7946 0123" }
```

Returns `status: matched | ambiguous | unknown | withheld | invalid`, canonical `phone`, up to 20 `matches`, `more` and `identityVerified: false`. A profile includes its stable `id`, `external_ref`, name, phone and revision. Use a full international number; local country guessing, extensions and number suffix matching are rejected. Shared numbers are allowed and must be disambiguated.

```json
{ "action": "save", "externalRef": "crm-customer-123", "name": "Customer name", "phone": "+442079460123" }
```

A save requires `x-event-timestamp` within five minutes. Same reference and same details are idempotent. Changing an existing profile requires its current `revision`; stale changes return 409. The API does not merge profiles solely because their numbers match.

```json
{ "action": "history", "customerId": "saved-customer-id" }
```

Returns the profile, up to 20 linked reception requests and `lastHuman` when recorded. Staff availability is `null`, and `stillOnTeam` only indicates membership. Source CRM history is not connected. For a customer record without a known phone number, record an unlinked reception request and confirm the customer through the source app.

Add these optional fields to a reception `receive` event:

```json
{
  "callerNumber": "+442079460123",
  "customerId": "saved-customer-id",
  "customerConfirmed": true,
  "humanHandlerId": "workspace-team-user-id",
  "handoffNote": "What was discussed, agreed and remains outstanding.",
  "preferredHandlerId": "workspace-team-user-id"
}
```

`customerConfirmed` means the operator/adapter has obtained the caller's profile selection/confirmation; it is not proof of identity. The saved name must match the profile and any supplied caller number must match its stored number. Foreign profiles and invalid team IDs are rejected. Omit `humanHandlerId` unless that person actually spoke to the customer. `preferredHandlerId` records the customer's choice for follow-up, requires a confirmed profile and does not execute a call transfer. `GET /api/integrations/reception` also returns current team identifiers; number/extension mappings and live presence still need the phone adapter.

The staff inbox uses `/api/reception?productId=...&filter=all|open|order|booking|message`, returns 100 items and an opaque `nextCursor`, and accepts that cursor URL-encoded as `before`. Counts use the chosen product scope. History is not capped at the first 500 inbox records.

A matching delayed `accepted` receipt after `delivered` returns the delivered item unchanged. Contradictory references/payment states still return 409. Readiness indicators describe configured keys or recorded source acknowledgments, not current external health.
