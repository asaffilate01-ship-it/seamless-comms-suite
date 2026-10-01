# WhatsApp ordering and EPOS intelligence

## Boundary

Omniqora owns shared communication, conversational intake, customer context, order-intent state, analytics and AI insight.

Dishbee / the source EPOS remains authoritative for:

- live menu availability and prices;
- accepted orders;
- payment confirmation;
- stock reservations;
- kitchen/KDS tickets;
- refunds/cancellations;
- fiscal/EPOS records.

## WhatsApp order flow

1. inbound WhatsApp arrives through Omniqora Connect;
2. tenant/location number binding establishes the exact source product scope;
3. CRM/customer lookup retrieves permitted context;
4. Ordering source adapter retrieves the current menu/catalogue revision;
5. AI/conversation layer interprets the request into typed item/option references;
6. deterministic validation checks item IDs, quantities, options, availability, price, fulfilment and policy;
7. customer receives a structured confirmation;
8. payment is handled through the source-approved payment flow where required;
9. the same source order API used by web/app ordering receives the validated intent;
10. source EPOS returns the authoritative order reference;
11. KDS acknowledgement is recorded separately;
12. canonical events feed CRM, analytics, financials, RFM, feedback and dispatch.

AI text never creates an order merely by saying it has.

## EPOS intelligence

Normalize source facts into:

- transaction/order facts;
- item/category facts;
- gross/net sales;
- discounts;
- refunds;
- tax where supplied;
- COGS where supplied;
- channels and order types;
- dayparts;
- inventory movements;
- waste;
- stock adjustments.

Deterministic analytics calculate totals and ratios. AI explains trends, exceptions and opportunities using those calculated facts.

Initial insights:

- sales trend and daypart;
- item/category mix;
- contribution/margin where COGS exists;
- discount leakage;
- refund anomalies;
- menu engineering;
- waste hotspots;
- stock movement anomalies;
- forecast/demand suggestions;
- customer/RFM links.

Do not infer statutory accounting figures from incomplete EPOS data.
