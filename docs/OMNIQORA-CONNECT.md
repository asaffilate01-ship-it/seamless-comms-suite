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

## Twilio masked voice — platform-controlled pilot (11 October 2026)

Source: `src/modules/connect/masked-voice.server.ts`, `masked-voice.functions.ts`,
`/api/public/twilio/masked-voice` and the `20261011181000` migration.

**This is a guarded relay foundation, not a certified production masking product.**
The existing direct Meta WhatsApp provider and Twilio assisted-ordering channel remain separate.
The new masked voice endpoint must **not** be used as a generic inbound or WhatsApp webhook.

### Pilot lifecycle
1. Platform operator owns and verifies a Twilio voice number and the exact account SID,
   tests that it supports outbound caller ID, and explicitly allocates it to one Omniqora
   tenant/product in `order_intake_channels`. The channel must have provider `twilio`,
   channel `voice`, `enabled=true`, `routing.masking_mode="enabled"` and
   `metadata.twilioAccountSid` equal to the approved SID. Do not let a tenant choose
   any number merely by typing it into an input field.
2. Enable the separately deployed server environment with all of
   `OMNIQORA_MASKED_VOICE_ENABLED=true`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_MASKED_VOICE_ACCOUNT_SID`, `TWILIO_MASKED_VOICE_NUMBERS` (comma-separated
   allowlisted E.164 numbers) and a clean `OMNIQORA_PUBLIC_URL` HTTPS origin.
   These are **server secrets/config**; never use `VITE_` or check them into git.
3. Activate the tenant/product and a valid `omniqora.voice` entitlement. An authenticated
   **platform administrator** can then call `createMaskedVoiceSession` with the
   approved channel ID, two distinct E.164 numbers, an explicit statement that both
   parties have consented, and a TTL between 1 and 60 minutes. The database independently
   checks authority, the channel's current mapping, entitlement, expiry and whether
   that mask number is already in use. It retains a consent-attestation timestamp.
4. Configure the approved Twilio voice number webhook as **POST**
   `https://omniqora.itechlounge.co.uk/api/public/twilio/masked-voice`.
   The endpoint verifies the Twilio signature against the fixed public URL, ensures
   the account and relay number match the allowlist and active private session,
   rechecks live channel approval, and routes only the two authorised participants
   through TwiML `<Dial callerId="...">` with recording disabled.
5. Expired/revoked/unapproved/unknown numbers or callers receive only `<Reject/>`.
   Call SID receipts are idempotent and retained in a service-role-only table without
   participant numbers. Platform administrators can revoke a session even after
   the feature switch is disabled.

### Mandatory controls before any external customer use

- **Caller-ID spoofing:** a signed Twilio webhook authenticates Twilio as the sender,
  not the true identity of the PSTN caller. The pilot currently matches the inbound
  `From` number against pre-approved participants; **do not** use it to protect
  sensitive communications until caller identity/PIN verification is added.
- Verify provider number ownership and voice caller-ID permission by a real Twilio
  account API check; database `metadata` is operator evidence, not independent
  account verification.
- Do not advertise this as anonymising all data. Both participant phone numbers are
  stored in a private table and are sent to Twilio when it connects calls. Restrict
  access, configure deletion after retention expiry and document the call-provider DPA.
- Consent, opt-out, non-emergency use, UK call-recording rules, incident response and
  abuse/rate limits need live policies. The pilot disables Twilio recording by default.
- Add a provider-side verified number inventory, a real caller identity challenge,
  production usage caps, call status callbacks and an operator audit view before
  self-service customer provisioning. Session issuance creates routing permission;
  it does **not** initiate outbound calls itself.
- Production feature switch must remain **false** until a staged end-to-end
  voice session, renewal/revocation, unknown-caller, cross-tenant and replay test pass.

See [Twilio signed webhooks](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
and [TwiML Dial](https://www.twilio.com/docs/voice/twiml/dial).
