# Omniqora Jungleworks-gap closure and SaaS Factory completion

This checkpoint records the reusable platform contract. Vertical SaaS products consume these engines through entitlements/adapters rather than cloning them.

## Reusable platform coverage

| Capability | Omniqora implementation | State |
| --- | --- | --- |
| Customer 360 / CRM | people, companies, leads, opportunities, activities, tasks, source links | built |
| Customer intelligence | RFM plus LTV, AOV, engagement, churn/repurchase scores, channel preference, segments | built |
| Connect | WhatsApp, SMS, email, voice, push, masked calls | built |
| Journeys | trigger/condition/action/delay/branch runtime and enrolments | built |
| Sales engagement | sequences, enrolments, steps/events, calls/tasks/message channels | built |
| Feedback | NPS/CSAT/CES, public response tokens, sentiment and recovery inputs | built |
| Geo | reusable routing/ETA/geospatial service boundary | built |
| Dispatch/Fleet | jobs, stops, assignment, shifts, attendance, wallets, positions, maintenance, behaviour, idle, geofences, utilisation, POD | built |
| Universal Agent | tenant/product capability profiles, sessions, offline-ready event IDs and job actions | built |
| Marketplace / Syndriva | vendors, listings, inventory, availability, booking/order bridge, commissions, reviews, disputes | built |
| Marketplace commercials | per-vendor commission/reserve/settlement rules and payout ledger | built |
| Identity | platform/tenant identities, SSO boundaries, WhatsApp OTP/passkey policy | built |
| White label | brand profiles, surfaces, domains, communication identities, SEO/legal/social metadata | built |
| Localisation | country/region packs, locale packs, tenant translation overrides, RTL-ready configuration | built |
| Mobile | app profiles, devices and tenant-branded capabilities | built |
| Payments | provider-neutral payments with Stripe/Adyen/SumUp boundaries | built |
| Analytics | event fanout, metrics, financials and shared analytics primitives | built |
| AI / Intelligence | governed jobs, RAG/agent boundaries, human approval controls | built |
| Compliance | reusable regulatory packs with vertical/jurisdiction extensions | built |
| Connector Hub | provider catalogue, bindings, webhooks, sync state and reconciliation | built |
| SaaS Factory | versioned blueprints, modules, roles, UI schema, country packs and provisioning | built |
| Launch readiness | required launch checks and a single ready/not-ready contract per tenant product | built |

## Landlord / tenant / marketplace composition

Canonical hierarchy:

```
Omniqora platform
  -> product family / landlord
     -> country/product variant
        -> tenant/operator
           -> business unit / location / workspace
              -> staff identities

Marketplace identities remain separate:
  -> vendor/provider
  -> customer/guardian/buyer
```

A provider does not become an Omniqora tenant merely because it sells through a marketplace. A tenant is an operating boundary with its own entitlements, brand, data scope and administration.

## SaaS Factory launch contract

A launch should not become active merely because a tenant row exists. Each tenant product must carry launch checks across:

- identity and roles;
- branding and domains;
- localisation/country configuration;
- entitlements and dependencies;
- payment/provider setup where required;
- email/SMS/WhatsApp/voice identity where required;
- marketplace/vendor setup where required;
- mobile profile where required;
- compliance packs and approvals;
- data migration/parity state;
- RLS/security validation;
- audit/observability.

`saas_factory_ready(tenant_product_id)` returns true only when the tenant product is active and all required checks are pass/not-applicable.

## Universal Agent model

One Agent app supports multiple vertical job types. The signed-in tenant/product determines branding and capabilities.

Examples:

- food/courier: accept -> pickup -> collect -> dropoff -> POD;
- roadside: accept -> arrive -> start service -> complete -> evidence;
- field engineer: arrive -> start -> pause/resume -> complete -> notes/POD;
- parts delivery: collect -> depart -> deliver -> POD.

Client event IDs are unique per tenant so offline replays can be idempotent.

## Customer intelligence model

RFM remains deterministic and product/currency-scoped. The richer profile adds:

- lifetime value;
- average order value;
- purchase/refund counts;
- engagement score;
- churn score;
- repurchase score;
- discount sensitivity slot;
- profit contribution slot;
- preferred channel;
- preferred products;
- reusable segments;
- model/version and explanation metadata.

The deterministic refresh is safe as a baseline. ML-derived values can later replace/augment fields through governed Intelligence jobs without changing the product-facing contract.

## Product examples

### Kindelo
Product family -> Kindelo UK / Germany variants -> agency/operator tenants -> childminder/provider vendors -> parent/guardian customers.

### Dishbee / MealDeck
Landlord/product -> restaurant/kitchen tenant -> locations/brands -> customers; Dispatch, Agent, Connect, Payments, Loyalty and Journeys are entitlements.

### SparesGrid / AutoHashi
Marketplace landlord -> seller/vendor -> listings/inventory/orders; Geo/Dispatch/CRM/Connect can be enabled without duplicating the marketplace core.

## Migration rule

Existing vertical databases remain authoritative until an explicit migration wave reaches shadow-sync, parity and cutover. The control plane may provision entitlements and receive events before moving domain data.
