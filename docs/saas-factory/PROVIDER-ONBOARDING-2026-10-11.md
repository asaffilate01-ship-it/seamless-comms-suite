# Omniqora provider onboarding & pilot acceptance — 11 October 2026

## Scope and current implementation reality

Omniqora is the landlord/control plane: tenant, product, brand and location boundaries; entitlements, least-privilege provider bindings; event/audit history; human approval before consequential agent actions. Operational vertical databases remain authoritative. A catalogue row, API key, health observation or successfully compiled adapter does **not** prove a provider is connected, authenticated, working or safe to activate.

The authenticated **/app/connector-hub** now includes an operator setup directory. The provider links and credential requirements live in `src/modules/connectors/onboarding-catalogue.ts`; they are static guidance, **not** a vault or a verification service.

**Important security closure (11 Oct)**: Previously any workspace operator permitted to use the health function could press *Mark healthy*, which inserted a successful health check and set `provider_bindings.status=active` without making a provider API call. That has been replaced with an admin-only, tenant/product/binding-scoped **unverified observation**. Only an independently authenticated provider probe and completion receipt may establish healthy service. Do not interpret `status=active` alone as proof of live operation without fresh verified evidence.

## Deploy the shared control plane first

1. Synchronise the approved `main` revision to the Lovable runtime. Do not infer deployment from a Git merge.
2. Run the complete migration chain in the isolated environment; compare the hosted production migration ledger to the checked-in migrations, and use a reviewed production dry-run. Do **not** apply undocumented database fixes or paste production DB passwords into GitHub.
3. Configure server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CONTROL_PLANE_WORKER_SECRET` and `OMNIQORA_PUBLIC_URL`. Configure only `VITE_SUPABASE_URL` and the publishable key client side. Never expose service-role or provider keys through `VITE_*`.
4. Manually dispatch **SaaS Factory provisioning worker** with `operation=preflight` and verify the **deployed** read-only endpoint. Keep scheduled drainage disabled until tenant/schema/environment acceptance passes.
5. Create a pilot organisation, tenant and product; confirm exact identity and active entitlement in the tenant snapshot and verify a second tenant cannot view, write or provision the first.
6. When source credentials, local-to-external tenant IDs, product locations and permitted origins are installed, approve a manual drain and retain all job receipts, external idempotency keys, failures and retries.

## AI agents versus model providers

The Agent Library, business roles and individual agents are Omniqora-controlled software. You do **not** need a separate vendor API key for each agent. For the first pilot, **one** OpenAI project/key with explicit budgets, allowed models, per-tenant product scopes, PII controls and human action approval is enough. Add secondary models only when latency, cost, language, redundancy or data residency demand them.

**Current implementations:**
- Growth writer has **OpenAI, Anthropic and Gemini** provider routes, but requires a tenant/product-scoped `provider_bindings` record, model ID, `growth_enabled`, and exact server secret `OQ_SECRET_GROWTH_<TENANT_WITHOUT_DASHES>_<PRODUCT_UPPERCASE>_<OPENAI|ANTHROPIC|GEMINI>`. The secret reference must match `env:<NAME>`. A configured secret is not a completed generation.
- The separate Python Transformation/Business360 agent hub supports **OpenAI, Azure OpenAI, Anthropic, Gemini, Amazon Bedrock and private Ollama** through a private `OQ_AI_CONFIG` file and selected `OQ_SECRET_*` entries. It also needs `TRANSFORMATION_URL`, `TRANSFORMATION_SIGNING_KEY`, hosted storage/`TRANSFORMATION_DATABASE_URL`, and tenant entitlement. Git/Lovable sync does not deploy the Python service.
- RAG/GraphRAG uses the RRCI service, optional Neo4j or a private model host. `RRCI_BINDINGS_JSON`, `KNOWLEDGE_*`, `NEO4J_*` configuration is service-owned, not a browser setting.
- ElevenLabs, fal.ai and Runway are **catalogued/optional**, not certified as production AI voice/image/video workers. Service endpoints, consent, quotas, recording and reviewer gates need their own acceptance.

For each AI workflow test: authorised agent -> entitled model -> cited approved context -> bounded model output -> reviewed draft -> approved action (when allowed) -> receipt -> audit and revocation test. An AI role label, tool catalogue entry or provider key is not this end-to-end chain.

## Twilio, WhatsApp and masking: choose delivery mode explicitly

**Twilio WhatsApp path (planned unified channel):** Create Twilio account; upgrade from trial; register sender through Meta Business Portfolio and WABA; complete business verification and template approval; configure Messaging Service and signed inbound/status webhooks; maintain a map of account/subaccount, tenant, product, sender, conversation and opt-in windows. For an ISV onboarding many customers, apply for the Meta/Twilio tech-provider flow. Test 24-hour conversation-window behavior, outbound templates, media and delivery statuses.

**Current Omniqora reality:** `src/lib/whatsapp.functions.ts` implements **direct Meta WhatsApp Cloud API** using per-number phone ID, WABA, access token, verify token and Meta app secret. Separately `/api/public/twilio/order-intake` receives signature-verified Twilio WhatsApp/SMS/voice events and creates reception sessions. Selecting Twilio in a provider catalogue **does not migrate direct Meta outbound into Twilio**, create Messaging Services, set status callbacks or unify those two transports. Build a provider-neutral Connect transport with separate Meta and Twilio adapters and explicit cutover per sender.

**Masking:** Twilio Proxy supports temporary voice/SMS number pools but is documented as **Public Beta** without a normal Twilio SLA. Do not build a safety-critical transport that only depends on Proxy. A Programmable Voice/TwiML relay with verified company caller IDs can be an alternative. Never expose underlying caller/agent/customer numbers through unauthenticated lookup, call logs, voicemail greetings, API responses, SMS callback values or web analytics. Masking requires short-lived tenant-scoped sessions, permissions for both participants, expiry, consent, signed provider callbacks, audit, rate limits and explicit session revocation. **Existing call forwarding is not a complete privacy-safe masking engine.**

For initial inbound order calls: the existing Twilio endpoint uses `TWILIO_AUTH_TOKEN` to verify signatures, requires a configured `order_intake_channels` row, then sends a TwiML response/human handoff. The operator still needs an actual number, valid webhook, a signed live callback and real order adapter evidence. The voice AI agent and direct WhatsApp provider switch are **not** declared complete.

Twilio links:
- Console: https://console.twilio.com/
- Register WhatsApp: https://www.twilio.com/docs/whatsapp/self-sign-up
- ISV onboarding: https://www.twilio.com/docs/whatsapp/isv/register-senders
- Masking / Proxy: https://www.twilio.com/docs/proxy
- Voice caller IDs/TwiML Dial: https://www.twilio.com/docs/voice/twiml/dial
- WhatsApp Sandbox: https://www.twilio.com/docs/whatsapp/quickstart

## Pilot account/approval order

| Gate | Account/provider | Minimum operator evidence |
|---|---|---|
| P0 | Supabase / Lovable / GitHub | Deployed main revision, hosted schema ledger, server-only vault, tenant snapshot, read-only worker preflight |
| P0 | OpenAI API | One scoped project/key and authorised model; real successful governed agent run |
| P0 | Twilio and Meta WhatsApp | Approved sender, 2-way real message and signed webhooks, opt-in and templates |
| P0 | Twilio Programmable Voice | Inbound phone/verified business forwarding, signed request, consent and human handoff |
| P0 | Google Routes / Geocoding | Restricted Cloud keys, valid route/geocode request, usage and quota controls |
| P0 | Adyen *or* another pilot PSP | Merchant sandbox, authorisation, signed webhook, refund and reconciliation; split payouts require platform approval |
| P0 | Dishbee carrier (Uber Direct / Just Eat Go) | Provider test client, merchant/store mapping, quote/delivery status callback, certification as applicable |
| P1 | Business360 / RRCI / Neo4j | Separately deployed services, database and permissions, signed bridge, evidence-cited output |
| P1 | SendGrid / push | Verified domain, SPF/DKIM, unsubscribe/bounce receipts, push project |
| P1 | Accounting / Microsoft Graph | OAuth/delegated scopes, grants, audit, tenant consent and compliance/filing approvals |
| P2 | ElevenLabs / Runway / fal.ai | Approved voice and media generation service with storage/retention tests |
| P2 | Other carriers and payment providers | Each provider's sandbox and certification, contract, production switch, funds reconciliation |

No provider should be marked green until it has: **tenant scope + server secret + live-authorised API probe + verified signed webhook where applicable + fresh receipt + negative/revocation tests**.

## Provider links

The complete directory for AI, voice, WhatsApp, masking, payment, routes, carriers, tax/accounting, e-sign, knowledge and infrastructure is stored in `src/modules/connectors/onboarding-catalogue.ts` and linked in `/app/connector-hub`. It is maintained separately from production `provider_bindings` so new providers can be evaluated without accidentally activating customer-facing features.

## External activation still required

- Create/approve business accounts and obtain keys in each provider's console. Do not post secret values to chat, issues, Pull Requests or source files.
- Set credentials in their corresponding server-only secrets/vault, with per-country/tenant restrictions and separate test/production.
- Deploy Omniqora and independent Python services, verify production migration ledger, scheduled worker and signed endpoints.
- Run two isolated tenant pilots and one live approved workflow for each provider before any production-authority cutover.
