# Omniqora Finance Connectors Factory — UK pilot (13 October 2026)

**Authoritative landlord repo:** `asaffilate01-ship-it/seamless-comms-suite`.
**Status of this change:** catalogue, central policy, tenant management UI, read-only SaaS API and test scaffolding. **Not** 23 production API integrations. No API credentials, merchant finance agreements or lending approvals have been provisioned.

## Architecture

iTechLounge SaaS Factory → Omniqora control plane → product landlord → tenant / brand / location → contracted finance partner.

- Omniqora owns the provider catalogue, UK pilot policy, tenant/product finance programme approvals, operator experience, RLS and centrally scoped credentials.
- Each SaaS remains authoritative for real merchant trading data, seller-of-record, order/payment, consent, loan offer response, KDS/fulfilment and refunds. **Do not clone product databases into Omniqora.**
- Zoryn Pay is an optional acquiring/distribution layer, not a lender. Adyen is a prospective shared payment rail where the relevant merchant account and payment methods are independently approved.
- Separate merchant-funding providers from consumer checkout financing and business buyer trade credit. Never treat a Klarna programme as YouLend working capital, or vice versa.

### Catalogue (23 providers, all uncontracted candidates)

Merchant capital (10): YouLend, Liberis, Wayflyer, iwoca, 365 Finance, Capify, Funding Circle, Capitalise, Swoop Funding, Funding Options by Tide.

Consumer checkout (10): Klarna, PayPal Pay Later, **separate** PayPal Credit, Clearpay, Affirm (proposed Adyen orchestration); Zopa Retail Finance, Snap Finance, V12 Retail Finance, Novuna Consumer Finance and Newpay (proposed direct partners).

B2B trade credit (3): Kriya, Billie, Mondu (proposed direct partner integrations).

**No provider catalogue entry is a live API connector.** Contracts, API schema and credentials are needed before individual lender-specific adapters can be implemented, tested and certified.

## Mapping to SaaS families

| SaaS landlord | Tenant/brand where relevant | Candidate functions | Safety boundary |
| --- | --- | --- | --- |
| Dishbee / Hive / One | Cafe 1, ChefzHub, individual kitchens | Merchant capital | Funding per verified merchant, not pooled revenue |
| Dishbee | MealDeck and hospitality brands | Consumer checkout **only when permitted** | Food category and multi-brand seller-of-record approval; no automatic Pay Later enablement |
| Dishbee+ | Marketplace sellers | Checkout / B2B credit | Restricted product categories excluded; merchant splits require agreement |
| Merqano | Dulcis, Kalëthon, Meyzaar, Alstero | Checkout, B2B and merchant capital at landlord level | Brand inheritance is not credit approval; cakes/made-to-order need additional approval |
| Merqora | Retail marketplace vendors | Checkout / merchant capital / B2B | Individual vendor/seller approval |
| Craftvaro | Trades and wholesale | Higher-value checkout / B2B / merchant funding | Service deposits and deferred fulfilment require underwriting approval |
| TraveNexa | FlightLounge, MarocWays, Route50, local inbound sites | Checkout and travel-business capital | One travel landlord; provider sector, locale and refund approval; no independent brand supplier API |
| Eventplanr | Event suppliers | Checkout / merchant funding | Event cancellation, deposit and later fulfilment rules |
| Formation Genie / TaxNuvia | Established corporate clients | Business finance introduction | No assumption that newly formed companies qualify |
| Lawquo | Chambers, firms and practitioners | Eligible business capital | No client money deductions or unapproved legal client financing |
| Kindelo | UK childminder operations | Established childminder SME funding | No child/parent personal information shared for lending |
| Zoryn Pay | Approved merchant accounts | Checkout methods and SME finance distribution | Adyen merchant permissions and legal/payment responsibility |

Brand tenancy is resolved from the existing actual parent landlord and brand IDs. Table inserts for unavailable product keys are skipped rather than inventing applications or tenants.

## Implemented paths

- `src/modules/finance-connectors/catalogue.ts` — 23 providers, family categorisation, product/brand recommendation registry.
- `src/modules/finance-connectors/engine.ts` — transaction fail-closed requirements (tenancy, country, category, funding/legal-entity, current verification, consent, programme, seller-of-record, provider returned payment method).
- `src/modules/finance-connectors/functions.ts` — authenticated, membership-scoped dashboard read API.
- `src/modules/finance-connectors/catalogue.server.ts` + `src/routes/api.finance.catalogue.ts` — read-only service-to-service provider candidate list.
- `src/routes/_authenticated/app.finance-connectors.tsx` — finance connectors control centre, reached by Omniqora sidebar.
- `supabase/migrations/20261013193000_finance_connector_registry.sql` — real platform-kernel provider catalogue and product requirements (all optional), service-only programme approvals, tenant-scoped RLS.
- `adapters/finance-connectors/client.mjs` — package-neutral source-server consumer.
- `verification/control-plane/finance-connectors.test.mjs` and `adapters/finance-connectors/client.test.mjs` — guard, catalogue, PGlite, RLS and adapter tests.

### Cross-SaaS read-only API

`POST /api/finance/catalogue`

Requires a distinct server-to-server `oqsvc_<id>.<secret>` credential scoped to exact tenant, landlord product and `finance.catalogue.read` capability; do not use it in client browsers or mobile/PWA bundles.

Input (tenant/product from actual Omniqora provisioning):
```json
{"tenantId":"<tenant-uuid>","productKey":"dishbee","brandId":"<optional-actual-tenant-brand-uuid>","countryCode":"GB"}
```

The API checks the credential hash, expiry, capability and tenant/product/brand scope and the actual active `tenant_products` row. If a brand is supplied, its name is resolved by the trusted database and matched to the parent landlord registry. It returns **candidate-only** options and explicitly `enabledProviderKeys: []`, `confirmedCustomerOffers: []`, `liveFinance: false`. A consumer checkout must **not** show these entries as available finance plans.

The client-side dashboard is not allowed to update `finance_programme_approvals`. The trusted operations service must separately verify contractual, regulatory, provider, finance merchant and funds-flow evidence and independent verification before production activation is engineered.

## Important UK regulation

The FCA regulates third-party lenders offering Deferred Payment Credit from 15 July 2026. Broking DPC agreements is exempt from regulation under the specific rules described by the FCA, **but** this does not exempt all consumer credit referrals, longer-term regulated credit arrangements, financial promotions or unrelated credit-broking activity. PayPal Credit must be assessed separately from PayPal Pay in 3 or Pay in 30. Legal review required before customer promotions.

Sources:
- https://www.fca.org.uk/firms/regulating-buy-now-pay-later
- https://www.fca.org.uk/publications/policy-statements/ps26-1-regulation-deferred-payment-credit
- https://docs.adyen.com/payment-methods/klarna
- https://docs.adyen.com/payment-methods/paypal
- https://docs.adyen.com/payment-methods/clearpay
- https://docs.adyen.com/payment-methods/affirm

## Required from you / operators before provider-specific API implementation

1. Group/merchant entity and regulator-approved partnership agreements: YouLend, Liberis, iwoca and others, plus Adyen, PayPal, Klarna, Clearpay, Affirm, Kriya etc. Confirm whether we are an introducer, broker, technical distributor, seller-of-record or other regulated actor for each product.
2. Independent sandbox credentials per provider, exact partner spec, legal country/sector/brand/currency scope, approved methods, webhooks/signature algorithms, expiry, rate limits, commissions and merchant-funding reconciliation.
3. Business onboarding: legal entities, KYB, tenant IDs and real Adyen merchant accounts (no secret values in Git).
4. Checkout: trusted itemised basket, refundable/cancellable statuses, method discovery, actual shopper consent/disclosures, PCI boundary, session and redirect states, approved PSP split rules and settlement ledger.
5. Business capital: merchant consent to share verified historical transaction data, prequalification, formal application, offers, signed contract, disbursement/repaid balances and ledger reconciliation.
6. Signed webhook/replay safety, per-merchant dispute and complaint process, audit trail, retries, idempotency, rollback plan, UK GDPR and data-retention reviews.
7. Run CI and staging migrations and simulate two tenants with negative cross-tenant accesses and no false provider activation.
8. On production activation, reconcile with the earlier **Zoryn Nexus finance sandbox PR #3**. That branch is not proof that funding already works. Port only independently verified provider-specific logic into Omniqora without duplicating tenancy tables.

## Verify

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run test:finance
bun run test:control-plane
bun run test:security
```

Do not run live lender requests or apply migrations to production as part of these validations. Confirm GitHub CI and staging deployment independently. No secrets, simulated lender offers or fabricated rates are in the catalogue.
