# Omniqora Platform Consolidation

## Objective

Omniqora becomes the shared platform layer behind the iTechLounge SaaS portfolio. Product apps retain their own brand, domain workflows, authoritative domain data, publication decisions and regulated actions. Shared infrastructure is consumed through versioned APIs, events, SDKs and embeddable components.

The goal is to stop re-building tenant, identity, communications, CRM, AI, marketplace, dispatch, payments, automation and analytics primitives independently inside every SaaS.

## Platform principles

1. **One shared platform, many products.**
   Omniqora owns cross-cutting capabilities. Vertical SaaS products own their specialist domain workflows.

2. **No database transplanting.**
   Each product keeps its authoritative domain database. Omniqora stores only the data necessary for shared services and cross-product intelligence.

3. **Tenant-first isolation.**
   Every shared record is scoped by tenant/workspace, guarded by server-verified membership, RLS or equivalent service-side enforcement.

4. **Server-to-server integration by default.**
   Product secrets never ship to browsers. Integrations use signed webhooks, short-lived identity assertions, versioned APIs and idempotent events.

5. **Human approval for consequential actions.**
   AI may recommend, draft, classify and orchestrate. Regulated, financial, legal, employment, compliance or externally consequential actions remain governed by explicit permissions and approvals.

6. **Capability entitlements.**
   Products and tenants receive only the modules they are licensed and configured to use.

7. **Provider abstraction.**
   Mapping, messaging, payments, models, telephony and external data providers sit behind Omniqora interfaces so providers can be swapped without changing every SaaS.

## Existing capabilities to promote into platform services

### Omniqora Identity
Build on the existing Supabase identity, tenant membership, role, entitlement and service-principal model.

Responsibilities:
- users
- organisations / tenants
- workspaces
- roles and permissions
- service principals
- MFA / passkeys
- SSO/OIDC later
- entitlement checks
- session and machine identity assertions
- consent and policy acceptance

### Omniqora Tenant
Formalise the current tenant and product-binding layer.

Responsibilities:
- tenant registry
- locations / branches / departments
- product subscriptions
- module entitlements
- environment and provider bindings
- source application connections
- feature flags
- tenant configuration
- residency / region metadata

### Omniqora Connect
Promote the existing communications stack.

Responsibilities:
- WhatsApp
- SMS
- email
- voice
- shared inbox
- conversations
- number registry
- templates
- message routing
- delivery receipts
- cases
- channel policies
- contact resolution

### Omniqora AI
Promote the current agent, transformation, Business360, RRCI, enterprise AI and provider-control work.

Responsibilities:
- agent orchestration
- model/provider registry
- tool registry
- knowledge/RAG
- evidence
- approvals
- policy packs
- usage metering
- AI audit
- bounded actions
- specialist vertical agents
- evaluation and guardrails

### Omniqora Ecosystem
Retain and harden the existing shared ecosystem/referral platform.

Responsibilities:
- product registry
- business account linking
- cross-sell catalogue
- referrals
- subscription eligibility
- partner entitlements
- signed subscription events
- discounts
- ecosystem webhooks

## New/restructured platform services

### Omniqora CRM
One canonical cross-product customer and relationship service.

Core entities:
- account
- contact
- person
- company
- lead
- opportunity
- pipeline
- activity
- task
- note
- document reference
- conversation link
- appointment
- quote reference
- invoice reference
- ticket reference
- campaign membership
- consent
- tag
- segment

CRM does not replace vertical records. Products attach domain context using external references.

### Omniqora Customer 360
Read-optimised customer profile assembled from CRM plus product events.

Outputs:
- unified timeline
- purchases/bookings/orders
- support history
- communication history
- loyalty / value
- complaints
- preferences
- consent
- predicted next action
- account health
- cross-sell eligibility

### Omniqora Engage
Marketing automation and journey builder.

Capabilities:
- segments
- triggers
- journeys
- campaigns
- templates
- channel selection
- delay/branch nodes
- frequency caps
- consent enforcement
- attribution
- abandoned-flow recovery
- reactivation
- lifecycle messaging

### Omniqora Intelligence
Shared commercial/customer intelligence layer.

Capabilities:
- RFM
- cohorts
- LTV
- churn risk
- engagement scoring
- propensity
- anomaly detection
- demand forecasting
- customer health
- merchant/driver/vendor performance
- explainable recommendations

### Omniqora Marketplace
Generic marketplace engine used by products such as Dishbee Hive, SparesGrid, All-Road-Aid and future marketplaces.

Core entities:
- vendor
- location
- listing
- catalogue
- category
- option/modifier
- inventory
- availability
- price
- commission
- order
- booking
- payment reference
- payout reference
- review
- dispute
- promotion

Supported marketplace modes:
- products
- services
- bookings
- delivery
- consultations
- freelancer
- rental
- peer-to-peer
- multi-brand / multi-branch

### Omniqora Geo
Provider-neutral geospatial layer.

APIs:
- /geo/geocode
- /geo/reverse
- /geo/distance
- /geo/eta
- /geo/routes
- /geo/optimize
- /geo/geofence
- /geo/territories
- /geo/live-track

Provider adapters:
- Google Maps
- Mapbox
- HERE
- OpenStreetMap-based providers
- TomTom

### Omniqora Dispatch
Reusable delivery/fleet/job allocation engine.

Capabilities:
- jobs/tasks
- pickup/drop-off
- multi-stop routes
- scheduled/immediate work
- manual dispatch
- auto-dispatch
- nearest-agent assignment
- skill/capability assignment
- vehicle capacity
- shifts
- service areas
- SLA timers
- route optimisation
- live tracking
- geofencing
- POD
- photos
- signatures
- barcode/QR
- driver wallets
- driver performance
- fleet behaviour

### Omniqora Agent
Universal worker/driver/field-agent application consuming Dispatch + Geo + Connect.

Modes:
- courier
- roadside recovery
- installer
- engineer
- inspector
- field sales
- service professional

Features:
- assigned jobs
- shift status
- navigation
- location updates
- chat/call
- job checklist
- proof capture
- signatures
- expenses
- wallet/earnings
- incident reporting
- offline queue
- push notifications

### Omniqora Pay
Shared payment orchestration, not a pooled-customer-funds wallet.

Responsibilities:
- PSP abstraction
- payment intents
- checkout
- subscriptions
- invoices
- refunds
- split-payment instructions
- marketplace commissions
- payout instructions
- reconciliation
- ledger references
- webhook normalisation
- billing entitlements
- tax/VAT metadata

Any regulated money movement remains with licensed payment providers.

### Omniqora Automate
Deterministic workflow engine shared across products.

Capabilities:
- triggers
- conditions
- actions
- delays
- approvals
- retries
- schedules
- webhooks
- queues
- dead letters
- human tasks
- audit
- versioning

AI may be invoked as one governed step inside a workflow rather than owning the workflow itself.

### Omniqora Analytics
Central event and analytics layer.

Responsibilities:
- event collection
- canonical event schema
- product/tenant/customer dimensions
- warehouse ingestion
- operational dashboards
- embedded analytics
- funnel analysis
- cohorts
- attribution
- RFM
- LTV
- retention
- performance metrics
- governed exports

Initial architecture can use Postgres/Supabase operational stores with a separate analytics store introduced as volume grows.

## Shared contract

Every product integration should carry, where applicable:

- product_id
- tenant_id
- workspace_id
- actor_id
- service_principal_id
- correlation_id
- event_id
- event_type
- occurred_at
- schema_version
- source_object_type
- source_object_id
- permissions context
- consent/policy context

## Canonical event families

- identity.*
- tenant.*
- crm.*
- conversation.*
- message.*
- call.*
- lead.*
- opportunity.*
- campaign.*
- order.*
- booking.*
- payment.*
- payout.*
- dispatch.*
- agent.*
- geo.*
- ticket.*
- review.*
- feedback.*
- compliance.*
- document.*
- ai.*
- workflow.*
- subscription.*
- product.*

## Product ownership boundaries

Products retain:
- specialist domain models
- authoritative transactional records
- product-specific permissions
- regulated business decisions
- customer-facing domain UX
- product branding
- product-specific pricing and packaging

Omniqora owns:
- common identity and tenant controls
- communications
- reusable CRM
- customer graph
- generic marketplace primitives
- dispatch/geo
- workflow
- shared AI
- shared analytics
- cross-sell and ecosystem connectivity
- payment orchestration interfaces

## Initial product mappings

### Dishbee / MealDeck
Use:
Identity, Tenant, Connect, CRM, Customer360, Engage, Marketplace, Geo, Dispatch, Agent, Pay, Analytics, Automate, AI.

Keep domain-owned:
restaurant operations, menu/EPOS domain logic, KDS, kitchen workflow, venue-specific configuration.

### SparesGrid
Use:
Identity, Tenant, Connect, CRM, Customer360, Marketplace, Pay, Analytics, Automate, AI.

Optional later:
Geo + Dispatch for parts delivery.

Keep domain-owned:
vehicle/parts compatibility, RFQ logic, supplier-specific domain workflows.

### All-Road-Aid
Use:
Identity, Tenant, Connect, CRM, Marketplace, Geo, Dispatch, Agent, Pay, Analytics, Automate, AI.

Keep domain-owned:
roadside-assistance service rules, provider qualification and recovery-specific workflows.

### Haccora
Use:
Identity, Tenant, Connect, CRM, Customer360, Engage, Analytics, Automate, AI, Ecosystem.

Keep domain-owned:
HACCP/compliance records, inspections, regulatory evidence and domain rules.

### Lawquo
Use:
Identity, Tenant, Connect, CRM, Customer360, Analytics, Automate, AI, Ecosystem.

Keep domain-owned:
matter/case records, legal workflows, legal permissions, filing and client-money boundaries.

### TaxNuvia
Use:
Identity, Tenant, Connect, CRM, Customer360, Engage, Analytics, Automate, AI, Ecosystem.

Keep domain-owned:
accountant eligibility, tax-domain workflows and regulated advice boundaries.

## Build order

### Phase 0 — Foundation consolidation
1. Publish module registry and ownership boundaries.
2. Standardise identity/tenant/service-principal claims.
3. Standardise API/event envelope and schema versioning.
4. Standardise idempotency, signatures, retries and audit.
5. Introduce shared SDK packages for product integrations.

### Phase 1 — CRM + Customer 360 + event layer
This unlocks the largest number of products without depending on mapping/dispatch.

### Phase 2 — Automate + Engage + RFM/Intelligence
Build the marketing and lifecycle layer on top of canonical CRM/events.

### Phase 3 — Marketplace Core + Pay
Extract generic marketplace primitives from existing product implementations.

### Phase 4 — Geo + Dispatch + Agent
Build the reusable hyperlocal/field-service stack.

### Phase 5 — Analytics warehouse
Move cross-product events into governed analytics models and embedded dashboards.

### Phase 6 — SSO/passkeys and external developer platform
Add mature federated identity, public API keys/OAuth, developer docs, metering and partner marketplace.

## Non-goals

- Do not merge all SaaS databases into Omniqora.
- Do not replace product-specific domain logic with generic abstractions when that reduces correctness.
- Do not let browser clients hold cross-product service credentials.
- Do not let AI bypass product permissions or approval requirements.
- Do not treat a configured integration as live-verified until staged against the actual product/provider.
