# Lovable handoff — Omniqora platform engines v1

## Branch

Work from `omniqora-platform-engines-v1`.

The branch is intentionally additive. Do not apply migrations to production or merge into main until the migration chain, typecheck, security tests and product-boundary review pass.

## What backend/foundation is now defined

### Platform
- canonical product/module/region registry;
- landlord / tenant / tenant-product / location model;
- module entitlements;
- integration bindings and secret references;
- locale and region packs;
- SaaS Factory provisioning planner;
- canonical signed/event-envelope shape;
- event delivery and provisioning persistence;
- provider-neutral plugin catalogue.

### CRM
- companies;
- people;
- existing WhatsApp contact linkage;
- leads;
- pipelines/stages;
- opportunities;
- tasks;
- activity timeline.

### Communications
- existing Omniqora Connect;
- multi-number tenant/location hierarchy;
- provider-neutral message contracts;
- masked-call sessions;
- Twilio/SIP/provider plugin boundary.

### AI & compliance
- existing Business360, Enterprise AI, RAG/GraphRAG and agent work retained;
- AI-first generic regulatory engine;
- pack model for FCA, CQC, Ofsted, Aramco, NCA, SAMA, ISO and custom packs.

### Geo and Dispatch
- geocoding/routing/optimisation contracts;
- agent, vehicle, job, stops and POD contracts;
- persistence foundation for agents/vehicles/jobs/POD.

### Syndriva Marketplace
- vendor/listing/order primitives;
- reusable marketplace types and features;
- persistence foundation.

### Voxentri Creative
- shared product registered as a portfolio engine;
- brand kits, briefs and creative assets;
- product/tenant/brand/locale scoping.

### Growth and management
- Marketing/audiences/campaigns;
- Sales sequences;
- Journeys/RFM;
- Feedback/NPS/CSAT/CES;
- Analytics/metric definitions and points;
- Financial actuals/budgets/forecasts/benefits.

### Mobile
- shared mobile capability contract;
- universal Agent profile for courier, recovery, engineer, inspector, delivery and similar roles.

## Lovable UI tasks

Lovable can build UI without changing the canonical domain contracts:

1. Platform Console
   - Products
   - Tenants
   - Tenant products
   - Locations
   - Modules/add-ons
   - Region/language
   - Integrations
   - Domains
   - Provisioning plans/runs

2. CRM workspace
   - Customer 360
   - Companies
   - Leads
   - Pipeline
   - Opportunity
   - Tasks
   - Timeline

3. Growth workspace
   - Audiences
   - Campaigns
   - Sales sequences
   - Journey builder
   - RFM
   - Feedback
   - Analytics
   - Financials

4. Operations workspace
   - Dispatch board
   - Agents
   - Fleet
   - Jobs
   - Map/route view
   - Tracking
   - POD

5. Marketplace workspace
   - Vendors
   - Listings
   - Catalogue
   - Orders
   - Commission/payout views

6. Voxentri Studio
   - Brand kit
   - Creative brief
   - Asset library
   - Review/approval
   - Locale variants

7. Compliance workspace
   - Applications/assessments
   - Requirements
   - Evidence
   - AI drafts
   - Findings/remediation
   - Inspections
   - Ongoing monitoring

## UI rules

- never let the browser select or widen a tenant it is not authorised for;
- UI visibility is not entitlement enforcement: server/database checks remain authoritative;
- do not store provider secrets in client state or VITE variables unless explicitly browser-safe;
- all country differences use region/locale packs rather than product forks where possible;
- all new shared capability uses the existing module registry and entitlement keys;
- keep product-specific domain records in the product until an explicit migration maps them to a shared engine;
- do not directly query another SaaS database from a UI.

## Merge sequence

1. run typecheck/build and security/service suites on the feature branch;
2. review migrations in a disposable database;
3. fix contract/schema differences;
4. merge foundation to Omniqora;
5. apply migrations in staging only;
6. build/polish UI in Lovable;
7. prove Omniqora as its own first tenant;
8. onboard one test landlord/tenant family through adapters;
9. migrate the wider portfolio in waves.

No existing SaaS needs to be merged into the Omniqora repository to consume these engines.
