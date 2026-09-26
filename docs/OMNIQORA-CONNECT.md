# Omniqora Connect

Omniqora Connect is the shared communications add-on for the portfolio. Source SaaS products keep ownership of their operational records; Omniqora owns the communications channel, number registry, inbox, WhatsApp delivery, AI routing metadata and human handoff.

## Number hierarchy

A workspace can attach many WhatsApp Business numbers:

- product/platform number
- B2B tenant number
- tenant location/branch number
- tenant department number

Each number has its own product key, source tenant, optional scope, primary flag, inbound/outbound switches, AI enablement and human-handoff setting.

A conversation keeps the channel ID that received it, so staff replies leave from the same number.

## SaaS add-on contract

Source systems call:

`POST /api/integrations/connect/events`

with their configured Omniqora bridge bearer token, a 13-digit `X-Event-Timestamp`, and a stable `Idempotency-Key`.

Example:

```json
{
  "tenantId": "courier-broker-main",
  "scopeId": "drivers",
  "eventType": "courier.driver.offer",
  "recipient": {
    "phone": "+447700900101",
    "name": "Example Driver"
  },
  "message": {
    "kind": "template",
    "templateName": "courier_driver_offer",
    "language": "en_GB",
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Luton → Birmingham" },
          { "type": "text", "text": "£142.00" },
          { "type": "text", "text": "18:30" }
        ]
      }
    ],
    "fallbackText": "New route: Luton → Birmingham · £142.00"
  },
  "metadata": {
    "offerId": "O-123",
    "jobIds": ["J-1001"]
  }
}
```

Bindings are deny-by-default through `OMNIQORA_BRIDGES_JSON`; each source gets its own secret and explicit `communication_event` contract.

## Inbound WhatsApp

The Meta webhook identifies the receiving `phone_number_id`, which resolves the internal workspace, product, source tenant and scope.

When a number is AI-enabled, inbound messages also create a queued `communication_events` record with direction `connect_to_source`. This is the safe handoff point for each SaaS-specific AI/tool adapter.

The source SaaS remains authoritative for actions. Omniqora should not invent stock, routes, bookings, fitment, valuations, compliance status or other domain facts.

## First-wave product manifests

### Courier Broker OS
Events include driver offers/reminders, collection, out-for-delivery, delivery completion, delivery exceptions and compliance expiry. Tool manifest includes quote, booking, tracking, rescheduling, cancellation, driver ETA and issue reporting.

### SparesGrid
Vehicle/part identification, fitment, supplier search, quote request, ordering and tracking.

### AutoHashi
Vehicle/auction search, inspection, landed-cost, shipping and document workflows.

### Zivvo
Vehicle lookup, stock search, valuation, lead qualification, appointment, inspection and CRM workflows.

### Dishbee
Menu, ordering, order tracking, table booking and order support.

### Haccora
Alerts, compliance status, temperature, checks and incident workflows.

## WhatsApp sending rules implemented

- outbound messages are disabled per-number when required
- conversations reply from the same number that received them
- proactive SaaS events use a configured template
- free-form text through the Connect event API is conservatively blocked unless there has been a recent inbound message
- Meta webhook payloads are signature-verified
- source events are idempotent

## Still required for a live number

1. Meta WhatsApp Business account/app and approved phone number.
2. Permanent access token and app secret saved through the secured channel setup.
3. Webhook subscription.
4. Approved templates for proactive event types.
5. Active Omniqora source binding/secret.
6. Source-specific inbound AI/tool adapter before AI may take operational actions.
7. Usage/billing metering and packaging for the paid add-on.
