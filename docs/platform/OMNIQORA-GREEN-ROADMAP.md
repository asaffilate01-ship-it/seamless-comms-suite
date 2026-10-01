# Omniqora green-roadmap — current main as canonical

This roadmap converts the current mixed state into a fully integrated Omniqora Cloud without merging the old platform branch wholesale.

## Rule

Current `main` is canonical. Donor branches are mined in small dependency-safe slices. A capability is only marked green when its source is merged into main, migrations are compatible with the current SaaS Factory, CI passes, and any required external provider/adaptor boundary is explicit.

## Hospitality pilot hierarchy

```
Omniqora platform
└─ Dishbee — hospitality landlord/product family
   ├─ Cafe 1 St Albans — tenant/operator
   │  └─ St Albans Crown Court — location
   ├─ Cafe 1 Luton — tenant/operator
   │  ├─ Luton Crown Court — location
   │  └─ Futures House — location
   └─ MealDeck — tenant/operator + branded experience
      └─ MealDeck product experience (parent product: Dishbee)
```

MealDeck remains a customer-facing product/experience but consumes Dishbee as its landlord/core. Its tenant may therefore hold both the Dishbee and MealDeck product keys.

## Phase 1 — harden main and finish the factory kernel

- remove tracked local environment files and require safe secret storage;
- distinguish catalogue availability from real implementation readiness;
- landlord/product-family hierarchy;
- tenant brands and locations;
- idempotent Dishbee pilot bootstrap;
- provisioning worker that only activates capabilities implemented on current main;
- explicit blocking of draft/catalogue/external capabilities until adapters exist;
- remove generated-type bypasses as schemas are regenerated/reconciled;
- add DNS/SSL verification and production observability after the safe worker baseline.

## Phase 2 — platform kernel extraction from PR #9

Extract/reconcile, do not overwrite the newer control plane:

- location/workspace hierarchy depth;
- product variants and region/locale packs;
- full identity policies and service identities;
- plans/subscriptions/quotas;
- provider/plugin registry and secret references;
- canonical events and worker/fan-out contracts;
- schedule engine;
- data-plane routing;
- usage/metering;
- readiness/health/observability;
- product SDK.

## Phase 3 — CRM / Customer 360 + Practice

Donors: PR #9 then PR #10.

- people, companies, relationships;
- leads/opportunities/pipelines;
- tasks/activities/source links;
- consent/preferences/tags;
- customer 360;
- replace current basic Contacts-only model progressively;
- Practice Today/jobs/client portal/recurring work from PR #10;
- replace mock Partners where CRM/partner entities are authoritative.

## Phase 4 — Connect completion + Reception + assisted ordering

Donors: PR #9 and PR #11.

- SMS, email, voice and push abstraction;
- call masking;
- AI Reception;
- caller recognition through CRM;
- phone/WhatsApp manual order intake;
- provider webhook signatures and idempotency;
- payment-link handoff;
- staff RLS/UI and expiry controls;
- real Dishbee/MealDeck order adapter.

## Phase 5 — Geo + Dispatch/Fleet + Tracking + Universal Agent

Donor: PR #9.

- geocode/routes/distance/ETA/zones;
- jobs/stops/assignment;
- drivers/agents/vehicles/shifts/skills/capacity;
- live positions/geofences/utilisation/maintenance;
- POD/evidence;
- signed public tracking;
- shared Agent app capability contract and polished PWA/native shell.

## Phase 6 — Syndriva + Inventory + Bookings + Payments + Loyalty

Donor: PR #9.

- marketplace vendors/listings/catalogue/availability/orders;
- commissions/reserves/payouts/reviews/disputes;
- shared inventory and reservations;
- booking resources/capacity/holds/appointments;
- Stripe/Adyen/SumUp provider-neutral payment runtime;
- refunds/reconciliation;
- Zoryn Rewards shared ledger.

## Phase 7 — Growth engines

Donor: PR #9.

- real campaigns replacing mock data;
- Journeys visual/runtime;
- RFM/LTV/churn/segments;
- Sales Engagement;
- Feedback/NPS/CSAT/CES/review recovery;
- richer cross-product analytics/financials.

## Phase 8 — shared platform utilities

Donor: PR #9.

- Automation runtime and approval queues;
- Documents;
- Forms;
- Search;
- Support/SLA;
- Notifications;
- Connector/provider hub;
- complete audit/health/usage observability.

## Phase 9 — vertical shared packages

Donors: PR #9, PR #10 and PR #6.

- Accounting AI and Tax Intelligence;
- payroll engine (new build);
- Kindelo/childcare shared layer;
- automotive shared platform from PR #6;
- FormationGenie Companies House/company-secretarial adapters;
- RegulaOS reusable compliance packs;
- vertical provider contracts and production activation.

## Phase 10 — automatic migration factory

Turn the 120-row inventory into executable migrations:

- repository scanner and capability inventory;
- duplicate/shared-engine detection;
- canonical target mapping;
- adapter templates;
- schema/data mapping;
- shadow sync and dual read/write where appropriate;
- parity checks and evidence;
- DNS/domain cutover gates;
- rollback/forward-fix plan;
- controlled cutover;
- retirement/archive decision.

No product is considered migrated merely because it appears in the portfolio registry.

## Green definition

A capability is green only when:

1. source is merged to current main;
2. schema/migrations pass the full test chain;
3. tenant/product/role/entitlement isolation is enforced;
4. the UI is data-backed rather than mock/static;
5. provider/adaptor requirements are explicit and fail closed;
6. production activation has a documented readiness gate.
