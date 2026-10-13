# Omniqora Finance Factory — four product families (UK 2026)

## What the code actually delivers
- **Merchant capital:** 10 candidate lenders/marketplaces with typed prequalification, application and offer interfaces.
- **Consumer checkout finance:** 10 candidates (Klarna, PayPal Pay Later, separate PayPal Credit, Clearpay, Affirm, Zopa, Snap, V12, Novuna, Newpay). Checkout must honour provider/merchant/product approval and actual acquirer methods.
- **B2B trade credit:** Kriya, Billie, Mondu; buyer and supplier identity, invoice and programme agreement required.
- **Personal finance:** Monevo (personal loans comparison marketplace/REST API) and ClearScore Partner API (redirect integration). Separate credit-broking regulation and customer protection arrangements are required; neither is integrated or contracted.

**25 candidates in all; 25 fail-closed provider adapter slots. None are verified live.** The shared generic Omniqora provider selector additionally refuses all four finance families, so a manually changed provider binding cannot bypass the dedicated certification workflow.

## SaaS distribution and security boundaries
- Omniqora is the platform-level landlord: central candidate registry, applicability, legal/technical approval evidence and scoped service identity.
- Zoryn Pay can be the regulated-PSP integration surface for approved checkout methods; **Zoryn Personal** is the intended personal-finance presentation once the product is correctly provisioned. Do not show personal loans on unrelated B2B SaaS apps.
- Dishbee, MealDeck, Cafe 1 and ChefzHub should prioritise eligible **merchant working capital**, not automatic food BNPL.
- Craftvaro, Merqano, Merqora and wholesale marketplace tenants can show approved finance methods **only after** category- and merchant-specific confirmation.
- TraveNexa travel and its brands require travel-sector underwriting, refunds/cancellation policies and seller-of-record approval.
- Formation Genie, TaxNuvia and Lawquo introductions involve different credit-broking and confidentiality considerations from checkout financing.
- Kindelo childminder finance must not send a parent's or child's records.

## Persisted draft case model
`finance_case_drafts` stores: tenant UUID, existing SaaS product key, optional brand UUID, provider candidate key, one opaque UUID for a source-owned record, amount in **integer GBP minor units**, status (`draft` or `withdrawn`), idempotency key, creator user UUID and timestamps. No name, email, DOB, income, NI number, credit file, bank details or offered APR.

Functions:
- `finance_create_draft(tenant, product, provider, source_uuid, amount_minor, idempotency_uuid, optional brand)` accepts only a current verified tenant owner/admin or platform admin and an existing active tenant/product. Rejects unmapped providers and brand crossover. Serialised idempotency with payload comparison. Persists event.
- `finance_withdraw_draft(tenant, case)` permits only the original creator currently a tenant member and keeps an audit event.
- Read-only UI and server functions let that same authenticated user see only their own cases. No submission-to-provider action exists.

**Creating a draft is not lender consent, an application, an eligibility decision or a regulatory authorisation.** The authorised source SaaS retains original data and separately secures customer information and consent.

## Personal-finance next phase (gated)
1. Confirm FCA consumer-credit broking scope (likely full-permission for primary broker activity, depending on actual operating model), appointed representative/firm structure if relevant, financial promotions and Consumer Duty.
2. Contract with Monevo and/or ClearScore; negotiate licensed API usage, white-label rights, data processing, offer ranking/commission transparency, lender availability and complaints.
3. Obtain sandbox tokens through authorised channels. Browser must never hold API keys. Only the licensed platform transmits sensitive customer financial data through approved flows after explicit consent.
4. Implement secure comparison and redirect using actual lender-provided quotes, representative APR, eligibility accuracy, disclosure, repeat-consent controls and handling of vulnerable customers.
5. Store only minimum authorised non-sensitive references in Omniqora; borrower financial details remain in appropriately segregated regulated infrastructure. Integrate verified audit events with no secrets or borrower information.
6. Pass adversarial tenant access tests, lifecycle/webhook certification and human regulatory sign-off before changing a provider programme from disabled to production.

## Compliance
The FCA began regulating third-party Deferred Payment Credit lenders on **15 July 2026**. Broking qualifying DPC agreements is exempt from regulation, but that exemption does **not** cover all personal-loan credit broking or longer-term consumer credit promotion.

Official references:
- https://www.fca.org.uk/firms/authorisation/consumer-credit-brokers
- https://www.fca.org.uk/firms/authorisation/consumer-credit-brokers/primary-credit-brokers
- https://www.fca.org.uk/firms/regulating-buy-now-pay-later
- https://www.monevo.com/uk/partners/deliver/
- https://apidocs.everywhere.clearscore.io/reference/integrating-with-clearscore

## Test & release
`bun run test:finance`; `bun run test:control-plane`; `bun run typecheck`; `bun run build`; `bun run test:security`.
Apply migrations to staging first; test cross-tenant, unauthorised and idempotency behaviours. Do not deploy as live finance while adapters are disabled. Never imply every UK lender is connected: partnerships vary.
