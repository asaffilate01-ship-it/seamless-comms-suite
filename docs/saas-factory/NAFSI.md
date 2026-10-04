# Nafsi in the Omniqora SaaS Factory

Nafsi is an external vertical product. Omniqora is the landlord/control plane; Nafsi remains authoritative for its consumer accounts and domain data.

## Initial hierarchy

- Product: `nafsi`
- Factory blueprint: `nafsi-gb-consumer`
- First external workspace: `nafsi-gb`
- Product-owned core: `nafsi.core`
- Required shared service: `omniqora.ai`
- Default shared service: `omniqora.analytics`
- Optional shared services: `omniqora.connect`, `omniqora.journeys`, `omniqora.payments`

Individual Nafsi consumers are not Omniqora tenants. A future mosque, employer, health partner or white-label deployment receives its own Factory tenant and product connection.

## Data boundary

Nafsi owns journals, mood/check-in data, wellbeing plans, dua catalogue records, recitation assets, content reviews, user consent and subscription state. Omniqora receives only scoped control-plane state, aggregate operational telemetry and approved events. Prompt, journal, mood and free-text wellbeing content must not be included in Factory events.

## Intelligence policy

The `nafsi-islamic-wellbeing-v1` profile is fail-closed:

- never invent Qur'an, hadith or dua citations;
- never fabricate or silently alter Arabic text;
- never present model audio as a human recitation;
- never issue a fatwa, diagnosis or medical treatment claim;
- retrieve only reviewed evidence and published dua content;
- use rights-cleared, reviewed human recitation only;
- route safety signals and disputed content to human review;
- keep all external action and messaging behind consent and entitlement checks.

The rollout order is `local authority -> shadow comparison -> reviewed parity -> per-capability cutover`. A Factory toggle does not make a product connection healthy. The connector must be verified and provisioning must succeed.

## Product connection

1. Create the workspace from `nafsi-gb-consumer`.
2. Link `product_key=nafsi` to `external_tenant_id=nafsi-gb` and the Nafsi base URL.
3. Generate a connector key and store the one-time `oqcp_...` value only in Nafsi's server-side secret store.
4. Nafsi fetches `/api/control-plane/tenant-snapshot` and caches it for a short TTL.
5. Nafsi fails closed for Omniqora-owned services when the snapshot is missing, invalid or expired.
6. Keep `omniqora.ai` in shadow mode until reviewed parity and safety evidence are accepted.

## Connect contract

The Connect manifest exposes operational events and read/draft tools only. It intentionally excludes raw personal wellbeing text. Publishing a dua, accepting recitation rights, or approving disputed religious content remains a Nafsi human-review action.

## Phase 27–28 routes

- `POST /api/control-plane/nafsi/intelligence-shadow` accepts only the first three low-risk capabilities: `daily-plan`, `flow-ai-slot` and `weekly-report`.
- The request is structured and bounded. Free-form journal, mood, prompt and wellbeing text is not accepted.
- The configured private runtime returns a review-only draft. Omniqora verifies the evidence references and refuses Arabic output, fatwa/medical authority and external actions.
- `POST /api/control-plane/nafsi/events` accepts only manifest-listed operational events with a five-minute HMAC replay window and idempotency key.
- Event payloads are validated per event type and recursively rejected if they include prompt, message, journal, mood, content, transcript, contact or response fields.
- Intelligence usage is metered without storing draft text. Human parity approval remains mandatory before cutover.

Omniqora deployment also requires `OMNIQORA_NAFSI_AI_SHADOW_URL`, `OMNIQORA_NAFSI_AI_SHADOW_KEY`, `OMNIQORA_NAFSI_AI_PROVIDER`, `OMNIQORA_NAFSI_AI_MODEL` and `OMNIQORA_NAFSI_AI_POLICY_VERSION` on the Factory server. The runtime URL must be HTTPS.

## Phase 29 authority controls

Nafsi owns the per-capability `disabled -> shadow -> canary -> active` decision. Omniqora exposes both shadow and live Intelligence routes, but the live route also requires the server-only `OMNIQORA_NAFSI_AI_CUTOVER_ENABLED=true` switch. The first canary is capped at 25%; every decision must be release-bound and reversible.

## Phase 30 Connect pilot

The optional `omniqora.connect` entitlement provides approved-template WhatsApp opt-in and a normalized source-event queue. Nafsi inbound events contain only an opaque `wa-contact:<uuid>` reference plus `START`, `STOP`, `HELP`, or delivery metadata. Raw wellbeing messages, names and phone numbers are not returned to Nafsi. Unsupported inbound messages are redacted.

Required routes:

- `POST /api/control-plane/nafsi/connect`
- `POST /api/control-plane/nafsi/connect-events`
- `POST /api/control-plane/nafsi/intelligence`
