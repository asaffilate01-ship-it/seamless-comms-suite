# Lovable handoff — Omniqora platform engines v1

## Branch and safety boundary

Work from `omniqora-platform-engines-v1`.

The foundation is additive. Do not apply migrations to production or switch live provider/domain/auth/billing configuration merely because the branch merges. Activate in staging first, then migrate landlords and tenants in controlled waves.

The backend checkpoint before this handoff passed the full repository verification suite: build, TypeScript, migration/RLS security, product bridges, mobile, procurement, services, ecosystem tests, native PostgreSQL/forced RLS and standalone build.

## Platform model

```text
Omniqora
  -> Product / SaaS landlord
      -> Tenant / client organisation
          -> Brand
          -> Location / workspace
          -> Users
          -> Plan + modules + provider bindings
```

A new SaaS should normally be a product blueprint plus selected shared modules, country/language packs, branding, navigation and genuinely vertical objects/workflows.

## Backend-ready shared platform

### Control plane / SaaS Factory
- canonical product, module, region and locale registries;
- landlord operators, tenant membership and tenant-product/location hierarchy;
- plans, subscriptions, add-ons, entitlements and tenant module requests;
- provisioning planner/executor and dynamic SaaS blueprints;
- region/country and language/RTL packs;
- white-label brand/app profiles and tenant runtime config;
- custom domains with DNS TXT ownership verification;
- service identities, API credentials and server SDK;
- provider/plugin bindings, secret references, routing and health history;
- data-plane routing for shared/regional/dedicated databases;
- usage/metering;
- canonical event backbone, fan-out, workers and projections;
- scheduled canonical events;
- import/export/data jobs;
- expiring public tracking links;
- tenant identity policy: password, magic link, SMS/WhatsApp OTP, Google, Apple, Microsoft and passkeys.

### CRM / Customer 360
- companies and people;
- WhatsApp contact linkage;
- leads, pipelines, stages and opportunities;
- tasks;
- activity/timeline;
- source-product/external-reference adapters.

### Omniqora Connect and AI Reception
- WhatsApp, SMS, email, voice and push abstraction;
- tenant/location number hierarchy;
- call masking;
- provider-neutral communications contracts;
- Reception settings by product/location;
- CRM caller recognition;
- phone/WhatsApp/web/app/API request intake;
- reviewed message/order/booking handoff;
- strict source acknowledgements for accepted orders, reserved bookings and KDS acknowledgement;
- business hours and escalation fields.

### Ordering / Hospitality / EPOS Intelligence
- direct and conversational order intents;
- WhatsApp/phone/web/app ordering boundary;
- source catalogue/price/availability validation receipts;
- source-authoritative order/KDS handoff;
- normalized EPOS transaction/item facts;
- sales/daypart/channel summaries;
- discount/refund/margin/COGS/waste/inventory insight foundations;
- AI insight storage with evidence references.

### Geo / Dispatch / Fleet / Tracking
- geocode/reverse-geocode/routes/distance/ETA abstraction;
- Google/Mapbox provider boundary;
- optimisation contracts;
- generic jobs/stops/agents/vehicles;
- shifts/skills/capacity foundations;
- assignment/tracking/POD;
- universal public tracking links;
- universal Agent/mobile configuration.

### Syndriva Marketplace
- marketplace types;
- vendors and listings;
- catalogue/inventory/availability;
- orders and bookings;
- commissions/payout foundations;
- reviews/disputes;
- shared inventory dependency.

### Inventory
- shared items and stock locations;
- balances and immutable movements;
- atomic reservations;
- transfers/low-stock/valuation contracts;
- event-driven projections from product systems.

### Bookings / Scheduling
- services and resources;
- capacity;
- availability rules;
- holds/appointments;
- collision-safe booking RPC;
- reminders/waitlist contracts.

### Loyalty / Zoryn Rewards
- programmes/accounts;
- points/stamps/credit;
- immutable ledger;
- tiers/rewards/referrals contracts;
- event-driven earning rules;
- atomic balance mutation.

### Growth
- Marketing audiences/campaigns/offers;
- Sales sequences/tasks/callbacks/meetings/lead scoring;
- visual Journeys + RFM;
- Feedback/NPS/CSAT/CES/reviews/sentiment;
- Voxentri content/creative integration points.

### Analytics / Metrics / Financials
- canonical metrics;
- metric points/dashboards;
- revenue/cost/margin/budget/forecast/unit economics;
- variance/benefits;
- event-driven financial actuals;
- tenant reporting functions.

### Voxentri Creative Studio
- portfolio-wide product/tenant/brand/locale context;
- brand kits;
- creative briefs;
- copy/image/video/audio/web-asset records;
- localisation/variants;
- review/approval and asset-library foundations.

### Documents / Forms / Search / Notifications / Support
- shared document library;
- immutable document versions and entity links;
- templates/generation/signature/evidence-pack contracts;
- versioned dynamic forms and submissions;
- tenant-safe full-text global search;
- per-user notification centre and preferences;
- shared helpdesk using cases plus queues, SLA metadata, escalation and satisfaction.

### Automation
- event-triggered workflow definitions;
- trigger, condition, branch, delay, AI-decision, action, approval and outcome nodes;
- acyclic/reachable graph validation;
- durable runs;
- typed action queue;
- human approvals;
- protected workflow/action workers;
- typed internal actions rather than arbitrary SQL/network/model access.

### Intelligence
- GenAI/RAG/GraphRAG/agents retained as first-class Omniqora services;
- governed typed Intelligence job queue;
- tenant-scoped machine job claims;
- result contracts;
- budgets/governance/audit boundaries;
- no arbitrary model side effects.

### Compliance-as-a-Service / RegulaOS
- generic regulatory application/assessment engine;
- evidence, findings, remediation, reviews and monitoring;
- FCA, CQC, Ofsted, Aramco, NCA, SAMA, ISO and custom regulatory-pack model;
- AI intake/evidence mapping/application drafting/inspection preparation;
- human review gates;
- can be sold as self-service SaaS, managed service, consultant workspace or white-label.

### Business360 / Transactions
- business discovery/audit/assessment;
- evidence/RAG/GraphRAG;
- improvement planning;
- M&A/due diligence;
- carve-out/separation;
- TSA/Day-1/100-day;
- IMO/workstreams;
- benefits ledger/finance review;
- entitlement-based access rather than the legacy environment allowlist.

### Practice Operations
Shared foundation for TaxCenda, IQ Practice Cloud, TaxNuvia and future professional practices:
- clients;
- engagements;
- deadlines;
- document requests;
- e-sign tracking;
- time/WIP/fees;
- client portal;
- generic submission/receipt/status records.

### AI Bookkeeping & Accounts Prep
Resellable per practice client:
- commercial modes: included, free, fixed monthly, fixed annual, usage or custom;
- client portal users without separate Omniqora tenants;
- mobile/scanner/PDF/CSV/XLSX opening-file and ongoing-file intake;
- short-lived signed uploads scoped to practice/client/batch;
- document evidence registration;
- provider-neutral document/vision extraction;
- staging proposals for supplier/date/amount/tax/nominal/treatment;
- revenue expense vs capital expenditure/asset proposals;
- duplicate and bank-matching review flags;
- factual client “unsure” question queue;
- accountant-only treatment/journal approval;
- balanced double-entry posting RPC;
- nominal ledger;
- trial balance;
- fixed asset register;
- prior-TB/prior-accounts references;
- governed Accounts Prep AI run;
- reviewable year-end adjustments;
- owner/admin final accounts-prep approval;
- client add-on charge ledger/invoice status.

The vertical accounting product still owns statutory presentation, UK VAT/CT600/SA/payroll/RTI/HMRC submission and US federal/state forms/computation/e-file.

### Tax Intelligence
- tax research issues by client/jurisdiction/tax type/period;
- authoritative-source catalogue with effective dates/version/supersession;
- scoped tax-source ingestion service;
- UK legislation/case-law/HMRC provider boundaries;
- US IRS-authority/Tax-Court provider boundaries;
- grounded research jobs;
- contrary-authority/uncertainty recording;
- relief/treatment proposals;
- estimated tax impact;
- risk grading;
- owner/admin/specialist approval for high-risk positions.

Objective: lowest lawful tax supported by verified facts, evidence and current authority. AI cannot invent facts/deductions, conceal income, backdate, approve positions or file a return.

### Payments
- provider-neutral payment-intent runtime;
- Stripe PaymentIntents;
- Adyen Checkout Sessions;
- SumUp hosted checkout;
- manual capture where supported;
- concurrency-safe refunds;
- provider-bound capture/refund;
- idempotent provider-event reconciliation;
- tenant UI functions and SaaS service API.

Raw card data is not accepted by Omniqora; payment collection remains hosted/client-provider based.

## Provider activation still required

Backend-ready does not mean external providers are configured. Activation may require tenant/product credentials and live verification for:
- Meta WhatsApp;
- Twilio/SIP/Telnyx;
- Stripe/Adyen/SumUp;
- Google Maps/Mapbox or other mapping providers;
- OpenAI/Anthropic/Gemini/other model providers;
- document-extraction/OCR providers;
- HMRC/Companies House;
- IRS/e-file provider;
- authoritative legislation/case-law source adapters;
- e-sign providers;
- Open Banking/bank feeds;
- Xero/QuickBooks/Sage;
- push/mobile store credentials.

Provider secrets remain server-side secret references.

## Lovable UI work

Lovable should compose/polish UI against these backend contracts, not redefine ownership.

Suggested workspaces:
1. Platform Console — Products, landlords, tenants, locations, plans, modules/add-ons, countries, languages, integrations, domains, credentials, provisioning, usage and health.
2. CRM / Customer 360.
3. Connect + Reception + call masking.
4. Marketing, Sales, Journeys/RFM, Feedback and Notifications.
5. Analytics + Financials.
6. Geo/Dispatch/Fleet/Tracking.
7. Syndriva Marketplace + Inventory + Bookings.
8. Zoryn Loyalty.
9. Voxentri Studio.
10. Documents + Forms + Global Search + Support.
11. Automation builder/run/approval queues.
12. Compliance/RegulaOS.
13. Business360 + M&A/carve-out/Day-1/TSA.
14. Practice Operations.
15. AI Bookkeeping — client scanner/upload, opening/ongoing file, review queue, ledger/TB/assets/accounts prep.
16. Tax Intelligence — research issue, sources, AI draft, contrary authority, proposed positions and human approval.
17. Payments.

## UI/security rules

- never let the browser widen tenant/product/client scope;
- server/database entitlements remain authoritative;
- hide unavailable modules in navigation, but never use UI hiding as access control;
- provider secrets never live in client state or browser-safe environment variables;
- country differences use region/locale/regulatory packs before product forks;
- product-specific domain data stays in the product until explicitly mapped;
- no direct cross-product database queries from a SaaS UI;
- AI output remains proposed/draft evidence until deterministic or authorised human action makes it authoritative;
- tax/accounting regulatory filing logic remains in the correct vertical/provider module.

## Staging/migration sequence

1. Keep PR as draft until review.
2. Review/apply the migration chain in staging only.
3. Configure one platform operator and staging data plane.
4. Configure only test provider credentials.
5. Complete/polish UI in Lovable.
6. Prove Omniqora itself.
7. Register Dishbee as the first landlord without moving its source database.
8. Connect Dishbee through service credentials/SDK/events.
9. Provision Cafe 1 as the pilot tenant and its locations.
10. Shadow/dual-read shared modules before making them authoritative.
11. Repeat landlord -> pilot tenant -> remaining tenants for Haccora, XpertJobs, Fleetora, TaxNuvia, TaxCenda, IQ Practice Cloud and the rest.

No existing SaaS needs to be merged into the Omniqora repository to consume these engines.
