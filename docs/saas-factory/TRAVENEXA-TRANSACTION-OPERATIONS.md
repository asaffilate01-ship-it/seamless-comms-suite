# TraveNexa transaction activation runbook — 16 October 2026

**Landlord**: TraveNexa inside iTechLounge/Omniqora SaaS Factory. **Tenants**: FlightLounge, MarocWays, BestFares BestRates, Route50, UK-inbound source-market sites and future approved white-label sites. Tenant storefronts do **not** own independent supplier secrets.

## Current implementation boundary

Phase 1 is on main: central API gateway, secure tenant search, operator-specific product filters, verified offer/redirect normalization and read-only Omniqora tools.

Phase 2 adds an **undeployed migration** (`20261016130000_travenexa_transaction_ledger.sql`) and an executable internal transaction repository/guard. No real merchant, supplier API, flight/hotel inventory, PSP account, PNR or ticket is connected. Supplier approval rows are deliberately absent/default-disabled. Existing public travel site APIs still do **not** accept bookings or payments.

### Eight private data tables

| Table | Stored facts | Guard |
| --- | --- | --- |
| `travenexa_supplier_approvals` | Provider/tenant/product scope, merchant of record, 7 approval gates, mode | Active only after verified contract + credentials + market/legal + payment + servicing + redistribution rights |
| `travenexa_live_offers` | Supplier-validated offer, time-to-live, supplier cost, permitted markup, currency | FK to exact tenant/provider/product; real quote not fabricated or re-used past expiry |
| `travenexa_booking_records` | Quote, separate customer terms, seller, idempotency, state, opaque references | Composite tenant/supplier/product FK; no passports or card PAN stored |
| `travenexa_payment_events` | Verified Adyen/supplier payment event references, amounts, currencies | Webhook receipts de-duplicated and tenant-bound |
| `travenexa_supplier_events` | Supplier reprice, booking, ticket, cancellation and refund evidence | Signed/verifiable supplier event and supplier-matched booking |
| `travenexa_booking_state_events` | Monotonic, deduplicated booking-status history | Compare-and-swap transition + independently matched event |
| `travenexa_commission_ledger` | Supplier liabilities, earned markups, receivables, payment/FX fees, refunds and chargebacks | A flight's gross price does not automatically become revenue; only supplier statement evidence |
| `travenexa_supplier_webhook_inbox` | Signature/provenance digest and event receipt | No raw passenger/card data, duplicate external event IDs rejected |

Every table has RLS enabled and denies `anon`/`authenticated` access. Only a server-held `service_role` connection may read/write these tables. Do not put the service key, supplier API keys or webhooks credentials into Lovable/Vite browser env.

## Supplier activation order (commercial before live code)

1. **Flight suppliers: Mystifly, Travelfusion, PKFARE.** Obtain the signed agency/consolidator agreement; fare rights per market/airline; net/commission/service-fee rules; IATA/ATOL agent/exemption assessment; ticketing/accreditation scope; search/reprice/order/PNR/issue/change/refund API specification; sandbox user and webhook signing keys; deposit or credit/funding terms; supplier/merchant identity.
2. **Hotels: Hotelbeds/HBX Group and TBO.** Confirm merchant-of-record, bedbank net rates vs supplier-collected commission, accommodation VAT/tax/fees, room occupancy, hotel property IDs, rate identifiers, booking voucher, cancellation and no-show handling, pay-at-hotel card verification, credit/voucher settlement.
3. **Rail/coach: Omio, rail-licensed partners, Busbud/Distribusion.** Choose their affiliate or approved merchant model; only sell tickets under licences/agency permissions and provide ticket/refund and disruption flows per mode.
4. **Airport transfers/chauffeurs: Mozio, Blacklane, suitable local operators.** Verify the supplier legally accepts the private-hire booking in each jurisdiction. Require meet-and-greet, flight tracking, licence/insurance, accessibility, waiting time and cancellation conditions.
5. **Cars: CarTrawler or DiscoverCars.** Confirm supplier as rental contract counterparty, deposit/security card rules, eligibility/driver age/licence restrictions, insurance excess and pick-up cardholder requirements.
6. **Activities/ferries/eSIM: Viator, TUI Musement, Direct Ferries, Airalo.** Prefer supplier-hosted payment/fulfilment and tracked commission until API booking is authorised.
7. **Third-party holiday packages:** The actual protected licensed organiser owns the package and appropriate guarantees. TraveNexa is only a properly documented agent or referral partner. Do not auto-bundle separate supplier services into a TraveNexa package.

Provider names in `catalog.mjs` are **not evidence that terms, keys, rights or commission rates have been obtained**.

## Payment models, in order of preference

| Mode | Customer pays | Preconditions | Revenue type |
| --- | --- | --- | --- |
| `supplier_checkout` | Supplier / approved ticketing merchant | Supplier is merchant of record and accepts booking, card fraud, change/refund duties contractually | Referral commission or remitted, separately authorised margin |
| `platform_checkout` | TraveNexa approved merchant via Adyen Checkout | Travel licence/ATOL scope, approved merchant account, 3DS/Protect fraud, booked supplier settlement, cash collateral and chargebacks | Clearly disclosed permitted markup/service fee + agreed rebates |
| `platform_split` | Adyen for Platforms routes eligible merchant balances | Each seller is legally onboarded and allowed under Adyen programme; supplier consent and settlement mapping | Approved split of platform fees/commission |

No direct Adyen platform split to Mystifly, TBO or Hotelbeds is assumed. An API credential and a supplier payout bank account do **not** automatically create an Adyen balance-account seller.

A supplier `£200` fare + approved `£10` margin produces gross `£210` only where the merchant/fare rules authorise it. These are illustrative values, not partner rates. The provider/processor charges and refunds must be subtracted from our margin. Supplier-collected prices must not have an unapproved hidden markup.

## Controlled booking lifecycle

`search → supplier reprice → verified offer → idempotent draft → regulatory/merchant/fraud preflight → (supplier checkout OR approved Adyen authorisation) → supplier order submission → supplier confirmation → ticket/voucher issuance → servicing/refund → verified commission reconciliation`.

Our code **stops at preparing a draft**. Live supplier orders and Adyen authorisations are not exposed or attempted.

Future booking execution must use an authenticated, tenant-scoped backend; supplier webhooks must be validated using the provider's actual signature algorithm and immutable event receipt. Only provider-verified PNR/e-tickets/room vouchers/ticket URLs may be shown as confirmed. If supplier ticketing fails after payment authorisation, void the card authorisation if allowed or route to an audited exception/refund workflow; never claim success because an AI agent said so.

Do not require customers to carry the payment card on every trip. Rules vary by airline/car rental and origin; show the provider's specific card-at-check-in and lead-driver payment rules before purchase.

## Operator go-live checklist

- Signed supplier contract for **each brand/market** or a master redistribution clause explicitly naming authorised tenants/domains.
- Source backend provisioned with data-plane migration successfully replayed and checked for RLS; durable secret vault; stable HTTPS origin; tenant token rotation policy.
- Confirm supplier sandbox search, exact live reprice, test booking creation, booking duplicate submission, cancellation/refund, event validation, expired quotes and mismatched tenants.
- Get written legal advice on sale mode, UK ATOL/package obligations, rail retailer accreditation, private-hire operator licences, travel insurance promotion (if offered), international consumer/GDPR rules.
- Obtain Adyen travel merchant acceptance, MCC/rolling reserve terms, 3DS and Protect flow, handling of legitimate third-party travel purchasers, chargeback/risk service.
- Configure per-supplier booking/account IDs, country and currency limits, price/markup permissions, permitted checkout redirect hostnames and tenant entitlements.
- Set verified email/WhatsApp customer support channels; do not promise supplier customer service without an executed contract.
- Confirm balance/ledger reconciliation: customer funds, supplier liabilities, commissions, paid/returned sums, processing/FX fees and chargebacks per booking and per tenant.
- Complete recovery tests for failed ticketing, replayed webhooks, price changes, cross-supplier PNR errors, fraudulent card payments and supplier outage.
- Only then promote the specific approved supplier/tenant/payment-mode scope to production.

### Commands after checking out the repo

```bash
bun run test:travel-core
node verification/control-plane/travenexa-factory.test.mjs
bun run test:travel-sites
```

CI runs the full migration chain and separate real local Supabase replay. **No live project migration or real payment will occur merely because this PR is merged.**
