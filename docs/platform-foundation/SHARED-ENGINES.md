# Shared engines and build order

## Principle

Build reusable engines once. A product or tenant enables them through entitlements and adapters; it does not clone their code.

## Engine ownership

| Engine | Canonical ownership | Initial source material | First consumers |
| --- | --- | --- | --- |
| CRM | Omniqora | existing contacts, cases, conversations, reception/customer primitives | Omniqora, Dishbee, Haccora, TaxNuvia, XpertJobs |
| Connect | Omniqora | current multichannel/WhatsApp implementation | all products |
| Payments | Omniqora | existing product payment adapters | SaaS billing, marketplaces, hospitality |
| Journeys | Omniqora | AI intelligence journey pilot + workflow UI | CRM-enabled products |
| Sales | Omniqora | AI intelligence sales pilot + leads products | TaxNuvia, Haccora, Dishbee, marketplaces |
| Feedback | Omniqora | new shared engine | all tenant-facing products |
| Geo | Omniqora | product-specific maps/routing implementations | Dispatch, Dishbee, Fleetora, MotoResQ, BiDrive |
| Dispatch/Fleet | Omniqora | Fleetora, Courier, MotoResQ, hospitality delivery | logistics/mobility/field-service products |
| Marketplace | Syndriva engine on Omniqora control plane | existing marketplaces | SparesGrid, AutoHashi and future marketplaces |
| Agent App | Omniqora | future shared native app | drivers, recovery, field engineers, couriers |
| Intelligence | Omniqora | Business360, RRCI, AI hub, enterprise AI, reference intelligence engine | all entitled products |

## Build order

### Phase A — platform contracts
1. canonical tenant/product/location/workspace identifiers;
2. identity and service identities;
3. entitlements and region packs;
4. event envelope and adapter rules;
5. integration/config/secret references;
6. central audit and observability.

### Phase B — complete CRM first
CRM becomes the common customer/business graph for the portfolio:

- person/contact;
- company/account;
- relationship;
- lead;
- opportunity;
- pipeline and stage;
- activity/timeline;
- task;
- note;
- source link to product records;
- consent/channel preferences;
- tags/segments;
- ownership and team;
- AI summary / next-best-action as optional derived data.

Existing WhatsApp contacts are preserved. CRM extends rather than destroys the current communications model.

### Phase C — automation/growth
Connect CRM to:

- Omniqora Connect;
- Journeys;
- Sales;
- Feedback;
- RFM/segmentation;
- Reception;
- Intelligence/agents.

### Phase D — operational engines
Build provider-neutral Geo, then Dispatch/Fleet. Dispatch consumes Geo; vertical products do not embed their own route engine once migrated.

### Phase E — marketplace
Finish Syndriva Marketplace Engine with vendor/listing/catalogue/inventory/availability/order/booking/commission/payment/payout/review/dispute primitives.

## Composition example

A new home-services SaaS should be mostly configuration:

Tenant + Identity + CRM + Connect + Payments + Geo + Dispatch + Agent + Feedback + Analytics

Only trade-specific jobs, forms, regulations and domain workflows should be new code.
