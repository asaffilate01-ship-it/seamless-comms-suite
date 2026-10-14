# Finance Hub Commercial Ownership: Zoryn Pay versus Omniqora

**Group policy, October 2026.** This document establishes intended economics, NOT legal incorporation, signed provider contracts, actual invoices, revenue recognition or regulated permissions.

## Responsibilities

| Function | Zoryn Pay | Omniqora |
| --- | --- | --- |
| External lender and BNPL commercial agreements | Commercial counterparty through its verified contracting legal entity | Technology integration supplier only |
| Lender origination, funding and renewal commissions | **Earns / receives** agreed partner payments | No lender commission or automatic share |
| Pay Later/PSP platform commercial income | **Earns** contractually permitted payment margin/partner share | No processor margin or commission |
| B2B trade finance referral fee | **Earns** contractual partner commission | No external referral fee |
| Personal loan referral commission | **Earns** only through an appropriately authorised/permitted arrangement | No borrower finance commission |
| Connector API, hosting, maintenance | Customer/consumer of shared technology if needed | **Licenses and invoices SaaS add-on subscriptions** |
| One-time SaaS connector setup services | Not lender fee | **Invoices agreed implementation fees** |
| Originating client order/merchant records | Uses approved referral references only | Provider-neutral routing and permissioned metadata, not domain authority |
| Lending balance, credit underwriting and funds | Lender/acquirer remains responsible under contract | No credit decisions or funding |

**No default revenue share** goes to the originating SaaS business. Any source SaaS referral reward must be separately documented and accounted for by Zoryn Pay, not silently deducted or duplicated in Omniqora billing.

## SaaS business model

Omniqora's connector product is an **optional subscription add-on** to each SaaS landlord or tenant product. Price is **quote required** until an owner agrees contractual pricing. The three draft packages are Access, Pro and Enterprise.

- Access: connector candidate discovery/status; no live finance.
- Pro: enterprise-grade connector API integration, finance application draft management and reconciliation exports.
- Enterprise: multi-brand/location scope, API support, reporting and enterprise onboarding.

The subscription table `finance_connector_addon_subscriptions` stores one plan request per authorised tenant/product, Zoryn commissions excluded. Only authorised SaaS tenant owners/admins can request a quote. No payment or invoice is automatically created by requesting a quote. Pricing stays null until negotiated; active status requires documented billing references, billing legal entity and commercial agreement. Omniqora is the only permitted payee in this table.

## Zoryn Pay ledger

Zoryn Pay holds the separately authorised partner contracts and commercial ledger in its own product/domain database:

- `zorynpay_finance_partner_agreements`: verified legal contracting entity, provider, country, commercial terms, contract status.
- `zorynpay_finance_provider_receipts`: provider event reference, income type, originating SaaS/tenant, reported commission, actually received payment and clawback evidence.

Provider advances, BNPL GMV and payment acceptance volume are operational metrics, **not** group revenue. Commission due and cash received are different measures. Recognised accounting revenue must still follow the actual agreement, appropriate accounting policies and reconciliation evidence. Do not record internal subscription revenue again as external Zoryn Pay income.

## Example — illustrative only

A Dishbee merchant receives a £20,000 funded advance, generating an *assumed* £300 contracted lender payment to Zoryn Pay. The advance is lender capital, not income. Zoryn Pay records its provider evidence and commission cash receipt; Dishbee is attribution only. Separately, the participating SaaS subscribes to an Omniqora connector add-on at its agreed price, invoiced by Omniqora as technology revenue.

If separate group companies are involved, produce proper intercompany technology licence/service agreements and appropriate VAT and transfer-pricing accounting. A marketing name is not itself a contracting entity.

## Before any earnings can start

1. Confirm the **actual legal entity that will trade as Zoryn Pay**. Only a correctly permitted contracting entity may enter into lender introductions, credit broking or payment-service commercial agreements.
2. Obtain written partner contracts clearly naming Zoryn Pay's legal contracting party and specifying commissions, reversals/clawbacks, renewal provisions, exclusions and advertising/promotional rights.
3. Arrange UK consumer credit permissions/exemptions as applicable, including PayPal Credit vs qualifying Deferred Payment Credit, and personal-loan credit-broking.
4. Obtain Adyen/Klarna/PayPal/other provider credentials, approved market/MCC programme and settlement terms.
5. Complete signed webhook certification, reconciliation, refunds, consent/privacy and operational controls.
6. Connect contracted subscription plans to **Omniqora's existing authorised billing** separately from the Zoryn commission ledger; do not enable test-code/registry alone as a live lender API.

The group-level finance factory remains a candidate-only and internal-draft platform pending completion of the above.
