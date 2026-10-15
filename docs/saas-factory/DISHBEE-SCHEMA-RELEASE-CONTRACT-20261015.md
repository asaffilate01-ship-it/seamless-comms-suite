# SaaS Factory ⇄ Dishbee landlord — schema release contract

**Recorded 15 October 2026.** This contract is **read-only and forward-looking**, not a production connection claim.

The Factory is the source of truth for product subscriptions, cross-product entitlements
and Omniqora workspace bindings. **Dishbee** controls the actual hospitality tenant UUID,
physical site UUIDs, menus, KDS, payment and last-mile provider accounts.

`src/modules/control-plane/dishbee-import-handover.json` identifies **three independent
tenants, five physical locations and 15 separate courier-provider preparation entries**.
Every provider account remains uncommissioned until the actual location and merchant
has passed its own checks.

## Required prerequisite

Run Dishbee's committed **read-only** `verification/landlord/schema-capability-audit.sql`
on the real destination **staging** project and verify the exact release build SHA
and migration history first.

The Factory must not infer live schema from its own product catalogue. The
landlord needs its tenant, import, per-site provider-onboarding and webhook/booking
tables; factory-binding RPCs and a traceable migration ledger. If **any** critical
capability is absent, no factory tenant is automatically provisioned, and no import,
delivery or payment cutover is authorised.

### Environment audit from 15 October

An authenticated, read-only inspection of the connected `DISHBEE` Supabase project
showed a healthy management status and **255 public tables**, but **zero customer
tenants, orders, brands, source import batches or delivery jobs**. Core import tables
existed. Seven of 17 launch capabilities were not present:

- `public.delivery_provider_onboarding`
- `public.delivery_provider_webhook_events`
- `public.delivery_booking_attempts`
- Delivery-provider go-live RPC
- Server-side duplicate-booking guard RPC
- Factory's Omniqora tenant-binding RPC
- The standard Supabase migration history relation

The result must be refreshed after database changes. It **does not** indicate that the
project is empty of schemas, nor prove a clean migratable source state. The repository
has migration files for the capabilities, but applying them out of order without a
history/DDL review is unsafe.

### Rollout gate

1. Inspect the actual staging DB's migration history, tenant identity table and RLS.
2. Reconcile checked-in migrations with hosted schema without destructive rebuilds.
3. Deploy the approved build and run the migration/schema capability audit.
4. Create only the three independent **draft** Dishbee tenants under platform-admin
   privileges and capture their actual UUIDs. Do not guess UUIDs from names.
5. Stage and reconcile Cafe 1 source data; configure MealDeck native brands/locations.
6. Link to the three Factory tenant templates only with explicit identity/location mapping.
7. Obtain each site's courier merchant and partner approval and signed sandbox booking.
8. Verify payment, kitchen, settlement, physical site controls and rollback; only then
   arrange a separate human-approved live cutover.

The Factory registry deliberately has no provider credentials, customer data, live
tenant IDs, or automatic release actions. Existing Cafe 1 SumUp operations remain
unchanged while St Albans' Adyen for Platforms switch is independently staged.
