# Syndriva Marketplace Engine audit and build status — 5 October 2026

## Executive status

The repository already contained a substantial reusable marketplace and commerce data layer before this branch:
multi-vendor sellers, listings, catalogue/categories, stock, availability, orders, bookings, RFQ/quotes,
offers/auctions, payments/refunds, settlements, reviews, disputes, promotions, vendor plans, connector runtime,
geo/dispatch and Omniqora event/integration primitives.

The missing architectural layer was configuration-driven marketplace instantiation. This branch adds that layer
under the **Syndriva Marketplace Engine** name without duplicating the existing Omniqora primitives.

## Status definitions

- **BUILT**: schema/RPC/source exists.
- **WIRED**: application/server layer calls the capability rather than it being catalogue-only.
- **CONNECTED**: there is a defined connection to shared Omniqora/provider/vertical systems.
- **VERIFIED**: repository tests exercise the capability.
- **LIVE PROVED**: production migration, credentials and real traffic/device/provider flow have been observed.

## Current matrix

| Area | Built | Wired | Connected | Verified | Live proved | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Tenant / organisation / product control plane | Yes | Yes | Yes | Yes | No | SaaS Factory is mature; production migration remains a release gate. |
| RLS / tenant isolation | Yes | Yes | N/A | Yes | No | Marketplace tables and Syndriva instance tables are tenant scoped. |
| Vendors / vendor memberships | Yes | Partial | Partial | Yes | No | Data model is strong; dedicated generic vendor workspace UI is still required. |
| Branch / location model | Yes | Partial | Yes | Partial | No | Existing tenant locations + vendor/branch semantics; generic Syndriva branch UI is outstanding. |
| Listings | Yes | Partial | Partial | Yes | No | Reusable listing model exists; generic operator/customer listing UI is outstanding. |
| Catalogue / categories | Yes | Partial | Partial | Yes | No | Shared catalogue/category primitives exist. |
| Inventory | Yes | Partial | Partial | Yes | No | Balances, reservations, movements and locations are implemented. |
| Availability / capacity | Yes | Partial | Partial | Yes | No | Listing availability + booking resources/services exist. |
| Search / filters | Partial | Partial | Partial | Partial | No | Search platform exists, but a dedicated marketplace facet/search contract still needs consolidation. |
| Orders / multi-vendor cart | Yes | Database/RPC | Yes | Yes | No | MealDeck verification covers multi-vendor totals, stock reservation and vendor settlement. |
| Bookings | Yes | Database/RPC | Yes | Yes | No | Generic booking services/resources and create RPC exist. |
| RFQ / requests / matching / quotes | Yes | Database/RPC | Partial | Yes | No | Marketplace Core v3 provides reusable request, match and quote primitives. |
| Offers / auctions | Yes | Database/RPC | Partial | Yes | No | Shared auction/offer primitives exist; product-specific execution remains separate. |
| Payments / refunds | Yes | Partial | Provider adapters partial | Yes | No | Provider abstraction exists; live payment credentials/webhooks remain unproved. |
| Commission / vendor settlement | Yes | Database/RPC | Partial | Yes | No | Commission basis points and vendor settlement are exercised in tests. |
| Payouts | Partial | No generic payout runner | Provider pending | Partial | No | Entitlement/settlement records exist; production payout execution/reconciliation is outstanding. |
| Delivery | Yes | Yes | Yes | Yes | No | Delivery broker/dispatch/geo primitives exist; provider activation is environment-specific. |
| Reviews / disputes | Yes | Database/RPC | Partial | Yes | No | Generic trust primitives exist. |
| Promotions / referrals / credits | Yes | Partial | Yes | Yes | No | Growth-ops migrations/tests cover these gaps. |
| Messaging / WhatsApp / voice | Yes | Yes | Yes | Yes | No | Omniqora Connect/order intake exists; provider secrets and live webhook traffic remain gates. |
| Omniqora AI / automation | Yes | Yes | Yes | Yes | No | Governed AI, events, recommendations and actions are platform capabilities. |
| White-label branding / domains | Yes | Yes | Yes | Yes | No | Tenant Factory owns branding/domain controls; marketplace-specific theme composition UI remains to build. |
| Marketplace capability registry | **Yes (new)** | **Yes (new server functions)** | Yes | **Yes (new test)** | No | Syndriva capability catalogue is now canonical. |
| Marketplace templates | **Yes (new)** | **Yes** | N/A | **Yes** | No | Products, services, bookings, delivery, consultations, freelancer, rental, P2P, RFQ and hybrid. |
| Marketplace instance provisioning | **Yes (new)** | **Yes** | **Omniqora connection auto-created** | **Yes** | No | One RPC creates/reconciles instance and installs template capabilities. |
| Per-marketplace capability overrides | **Yes (new)** | **Yes** | N/A | **Yes** | No | Operator overrides are stored separately from template defaults. |
| Generic Marketplace Factory UI | No | No | N/A | No | No | Highest-priority next UI phase. |
| Generic vendor app shell | Partial platform pieces | No Syndriva shell | Partial | No | No | Needs capability-driven menus/screens. |
| Generic customer marketplace shell | Partial platform pieces | No Syndriva shell | Partial | No | No | Needs listing/search/cart/booking composition. |
| Vertical adapters (SparesGrid/RoadAid/KinderStars/Dishbee) | Partial | Partial | Partial | Product-dependent | No | Must be migrated one vertical at a time using adapters/shadow parity. |

## Existing marketplace foundations found in main

Relevant migrations already on main include:

- `20261002130000_commerce_marketplace_v2.sql`
- `20261003152000_marketplace_core_v3.sql`
- `20261003160000_suite_marketplace_commerce_core.sql`
- `20261003194500_dishbee_plus_marketplace_factory.sql`
- `20261003211000_marketplace_growth_ops_gaps.sql`
- geo/dispatch/tracking and connector-runtime migrations

Relevant verification already on main includes:

- `commerce-marketplace.test.mjs`
- `marketplace-growth-ops.test.mjs`
- dispatch/tracking tests
- SaaS Factory/control-plane tests

This means the correct strategy is **promotion and orchestration**, not reimplementation.

## Added in this phase

### 1. Syndriva capability catalogue

Canonical reusable capabilities now include:

vendors, branches, listings, catalogue, inventory, availability, search, orders, bookings, RFQ,
auctions, rentals, subscriptions, pricing, commission, payments, payouts, delivery, reviews, disputes,
promotions, messaging, Omniqora AI, Omniqora automation, geo, dispatch, white-label, vendor app,
customer app, webhooks and analytics.

### 2. Marketplace templates

The engine seeds:

- Product Marketplace
- Service Marketplace
- Booking Marketplace
- Delivery Marketplace
- Consultation Marketplace
- Freelancer Marketplace
- Rental Marketplace
- Peer-to-Peer Marketplace
- RFQ Marketplace
- Hybrid Marketplace

Templates are configuration, not copied source code.

### 3. Marketplace instances

`syndriva_marketplaces` records a configured marketplace for one tenant/product with:

- template
- modes
- seller model
- branch model
- country/currency/timezone
- brand
- configuration
- lifecycle status

### 4. Capability installation/override

`syndriva_marketplace_capabilities` copies template defaults and allows operator/vertical overrides.

Application code should now check capability state rather than brand names.

### 5. Connections

`syndriva_marketplace_connections` records the marketplace's connection to Omniqora and external/shared systems.

The creation RPC automatically records Omniqora as the connected platform layer.

### 6. Server runtime

`src/modules/syndriva/marketplace.functions.ts` provides authenticated server functions to:

- list templates/capabilities/instances
- create/reconcile a marketplace instance
- enable/disable/configure capabilities
- register a marketplace connection

### 7. Verification

`syndriva-marketplace-engine.test.mjs` exercises:

- seeded templates
- canonical capability catalogue
- marketplace creation from configuration
- template capability installation
- capability override
- Omniqora connection
- RLS isolation from an unrelated user

It is part of `test:control-plane`.

## What is still not wired

### Generic Marketplace Factory UI

Tenant Factory currently provisions tenants/products/services, but it does not yet expose a first-class Syndriva wizard.

Required screens:

1. Choose marketplace template/modes.
2. Select seller model and branch model.
3. Enable/disable capabilities.
4. Configure brand/domain/currency/country/timezone.
5. Connect payments, delivery, geo, messaging and vertical systems.
6. Preview generated customer/vendor experiences.
7. Provision and run readiness checks.

### Generic vendor experience

Build a capability-driven vendor workspace where menus are generated from enabled capabilities rather than product-name checks.

Core screens:
vendor profile, branches, catalogue/listings, inventory, availability, orders, bookings, RFQs/quotes,
payments/settlements, fulfilment, reviews/disputes, promotions and analytics.

### Generic customer experience

Build reusable customer components for category/search/filter, listing detail, vendor profile, cart/order,
booking, RFQ, messaging, reviews and account/order history.

### Marketplace event contract

The platform already has events/webhooks, but Syndriva should formalise event names and payload contracts such as:

- marketplace.vendor.created
- marketplace.listing.published
- marketplace.inventory.low
- marketplace.order.created
- marketplace.booking.confirmed
- marketplace.rfq.created
- marketplace.quote.submitted
- marketplace.payment.captured
- marketplace.payout.payable
- marketplace.dispute.opened

Omniqora should consume these events rather than vertical code calling communications/AI directly.

### Payout execution

Settlement calculation exists, but generic payout execution requires provider adapters, idempotent payout jobs,
webhook reconciliation and failed-payout operations.

### Dedicated marketplace search contract

Consolidate full-text/facet/location/availability/price/rating filters behind one Syndriva search API.

### Vertical migration

Do not big-bang rewrite verticals.

Recommended order:

1. SparesGrid: catalogue + inventory + RFQ/quotes + delivery.
2. All-Road-Aid: services + geo + dispatch + availability.
3. KinderStars: provider + availability + recurring bookings + documents/compliance adapter.
4. Dishbee/MealDeck: food extension + menus/modifiers/KDS/EPOS + multi-brand marketplace.

Each vertical should pass shadow sync, parity/reconciliation and explicit authority switch before Marketplace Engine becomes authoritative.

## Definition of done for Syndriva v1

Syndriva Marketplace Engine v1 is not production-complete until:

- this branch is green in CI and merged;
- production Supabase migration dry-run and apply succeed;
- Marketplace Factory UI can create one marketplace without SQL/manual inserts;
- one generic vendor workspace reads the created capability set;
- one generic customer shell renders the created marketplace;
- event contracts flow to Omniqora;
- one payment provider and one fulfilment/provider flow pass live smoke tests;
- SparesGrid completes a shadow/parity pilot as the first non-food consumer;
- RLS isolation and provider webhook reconciliation pass production smoke tests.
