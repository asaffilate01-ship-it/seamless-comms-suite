# P0: Block unsafe legacy Dishbee pilot bootstrap (16 Oct 2026)

The historical `platform_bootstrap_dishbee_pilot()` routine in
`20261001194500_dishbee_landlord_hierarchy.sql` creates **active**
Cafe 1 Luton, Cafe 1 St Albans and MealDeck tenants, assigns owner membership
to an assumed `313-brands` organisation, applies services and opens physical
court sites. That bypasses source import, identity reconciliation, authorised
Dishbee tenant UUIDs, merchant/processor approvals and hardware readiness.

The forward-only migration `20261016083000_dishbee_pilot_bootstrap_lockdown.sql`
replaces that dangerous mutating function with a fail-closed tombstone and
revokes all execution privileges. It also provides admin-only read-only
`platform_preview_dishbee_pilot()`, which reports the three historical
Factory slugs, their canonical Dishbee slugs, existing tenant IDs/status,
organisation slug and count of external Dishbee bindings. Preview **always**
returns `safeToActivate:false` and makes no DB writes, reservations, payments
or provider calls. Platform admin auth is checked **inside** the SECURITY
DEFINER preview, and EXECUTE is explicitly revoked from PUBLIC/anon.

## Applying safely

1. Check the actual Factory Supabase project's migration ledger. This is
   a **new migration**, not an edit of the historical one; do not replay
   a previously applied legacy bootstrap. A connected DISHBEE database
   is a different project and **must not** receive Factory migrations.
2. Run `node verification/control-plane/dishbee-factory.test.mjs` and full
   Factory integration tests on an isolated fresh database, plus migration
   replay and privilege audit. CI passing on source does not prove a deployed
   project has the migration.
3. Explicitly inventory any existing `cafe1-st-albans`,
   `cafe1-luton` or `mealdeck` Factory tenants created earlier; the
   lockdown **does not deactivate, delete or modify existing rows**.
   Reconcile organisation ownership and canonical external Dishbee
   UUIDs individually before changing existing status.
4. Only provision a **draft/blocked** scoped tenant via the approved Factory
   -> Dishbee idempotent handover after real schema/RLS, source financial
   reconciliation, staff identity, device, provider settlement and court
   acceptance. Do not reuse the legacy pilot helper to do this.
5. Verify rollback on isolated staging and preserve existing live Cafe 1
   websites/SumUp until an approved final delta / Adyen transition.

Tracking: Factory issue #109 and Dishbee go-live #42. No real Factory
database has been changed by this pull request.
