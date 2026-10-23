# TraveNexa Core — Phase 1 supplier gateway

This is a **server-side runtime** for TraveNexa inside the existing Omniqora/iTechLounge SaaS Factory repo. TraveNexa is the sole travel landlord. FlightLounge, MarocWays, BestFares BestRates, Route50 and the four inbound-UK local-language sites remain tenants.

**Status:** Authenticated search gateway, Phase 2 durable ledger migration, draft-preparation service and tests. **No live supplier adapter, production database deployment, payment, PNR or ticketing connection exists.** Catalogue names are targets, not active integrations.

## Phase 2 transaction foundation (schema/source, not activated)

- Migration `supabase/migrations/20261016130000_travenexa_transaction_ledger.sql`: eight RLS-protected supplier-approval, offer, booking, payment/supplier evidence, transition journal and commission tables; no public `anon`/`authenticated` access.
- `ledger.mjs` uses a private Postgres `query(sql, params)` adapter for signed offer persistence, immutable provider event IDs, atomic idempotent booking drafts, status journals, tenant-scoped reads and independently confirmed commissions.
- `transactions-policy.mjs` models supplier-managed checkout vs Adyen Checkout vs Adyen for Platforms; all require explicit merchant, ticketing, legal, risk and provider agreements.
- `transaction-orchestrator.mjs` can ask an approved supplier adapter to **reprice** and create an internal draft. No ticket, hotel room, booking confirmation, checkout, authorisation or supplier money transfer is created.
- Node contract tests and actual PGlite lifecycle/tenant-security tests run in existing Verify workflow.
- Activation runbook: [TraveNexa transaction operations](../../docs/saas-factory/TRAVENEXA-TRANSACTION-OPERATIONS.md).

## Included now

- Tenant-scoped server-to-server bearer auth, unique per-tenant tokens (no browser secrets).
- Country, currency, market, product and date validation for both global travel and UK inbound market sites.
- Travel supplier registry: Mystifly, Travelfusion, PKFARE, TBO, Hotelbeds/HBX, Agoda, Omio, coaches, transfers, chauffeurs, cars, activities, ferries and eSIM.
- Supplier eligibility requires *all*: verified credentials, commercial approval, regulatory approval and explicit tenant/product rights.
- Verified live offers only; partner checkout redirects are restricted to supplier-specific HTTPS hostnames.
- Deterministic cost/markup policy with currency minor units; no unsourced exchange conversions, commissions or invented prices.
- Expiring tenant-bound offer references; separate approval gates for any later merchant-of-record, ticketing, ATOL/agent, Adyen/Platforms, refunds and package sales.
- Readiness API and **deliberately blocked** payment/ticketing/booking-preflight flow.
- Read-only Omniqora tool manifest with tenant-scoped `travel.search` and `travel.compare`; no AI booking or payment permissions.
- Node integration/security tests. No dependency or secret is required to run tests.

## Run

Requires Node 22+.

    cd services/travenexa-core
    node --test tests/*.test.mjs
    cp .env.example .env.local   # fill with REAL per-tenant secret tokens on the server only
    node server.mjs

Node does not load .env.local automatically. Set the variables in your deployment secret store (or run via a trusted env loader). The server binds 127.0.0.1:4302 by default; place behind authenticated HTTPS ingress.

### Credentials (server-only)

    TRAVENEXA_TENANT_TOKENS_JSON={"travenexa.uk-inbound.us":"<32+ char secret>","travenexa-flightlounge":"<different secret>"}
    HOST=127.0.0.1
    PORT=4302

Store each tenant bearer token ONLY in the server secret store. On the UK inbound storefront, set TRAVENEXA_API_ORIGIN to the HTTPS origin of this deployed core; set TRAVENEXA_SERVER_TOKEN to the specific inbound-UK site's token. Existing \`X-Travenexa-Market\` header binds the token to the exact source country on the core. Never expose tokens in Vite, browser JS or query strings.

### Routes

| Endpoint | Authentication | Outcome now |
| --- | --- | --- |
| GET /healthz | none | No claim of supplier connectivity |
| GET /v1/travel/readiness | Bearer + X-Travenexa-Tenant | Tenant-scoped enabled products and blocked booking state |
| POST /v1/travel/search | Bearer + X-Travenexa-Tenant | 503 until approved adapters loaded |
| POST /v1/inbound-uk/search | Bearer + X-Travenexa-Market | Compatible with the four existing storefront shells |
| GET /v1/omniqora/tools | Bearer + X-Travenexa-Tenant | Read-only tool manifest (no AI provider activated) |
| POST /v1/omniqora/tool-call | Bearer + X-Travenexa-Tenant | `travel.search` or same-currency `travel.compare` only |
| POST /v1/travel/booking-preflight | Bearer + X-Travenexa-Tenant | 503 with outstanding gates |
| Any booking, charge, settlement or ticket-issuance endpoint | n/a | Not implemented; no user money accepted |

Sample UK-bound transfer search body:

    {"sourceMarket":"US","destinationCountry":"GB","productType":"airport","travelDate":"2026-12-15","travellers":2,"from":"LHR","to":"London","locale":"en-US","displayCurrency":"USD"}

Global tenants use \`/v1/travel/search\` with \`productType\` such as \`flights\`, \`hotels\`, \`coach\`, \`rail\`, \`car_hire\`, \`activities\`, \`transfers\`, etc. Route50 products are not enabled until its commercial scope is verified. No unverified \`third_party_packages\` booking or bundled TraveNexa package may be created.

## Required next stage to transact

1. Approved supplier API documentation/credentials and a signed list of permitted brands, regions, fare models, checkout methods and airline ticketing/servicing duties.
2. A durable Postgres travel data plane (tenant RLS, offer cache, booking lifecycle, idempotency, provider event verification and financial ledger). In-memory offer references are **not** production booking storage.
3. Provider-specific implementations: live search, fare revalidation, booking confirmation, cancellation/refund, settlement and webhook verification, with contract/sandbox certification.
4. Merchant-of-record and relevant UK/other jurisdiction protections, car-hire/private-hire/rail resale rules, PCI scope, fraud/3DS and Adyen account approval.
5. Connect the read-only Omniqora travel tool surface to an approved tenant-scoped Omniqora integration; add consent-based marketing, monitored workflows and commission reconciliations. AI cannot override hard booking policy.

Supplier-hosted checkout should take precedence where contractually available. Direct Adyen and Adyen for Platforms must be separately approved and do not automatically pay an external distributor.
