# Migration guardrails

## Default rule

No existing SaaS is changed merely because a shared engine exists.

Migration is product-by-product and capability-by-capability.

## Safe sequence

1. Inventory the product's current data model and behaviour.
2. Define adapter and canonical mapping.
3. Connect read-only / observe-only first.
4. Emit test events in staging.
5. Validate tenant and location scope.
6. Dual-read or shadow-compare where appropriate.
7. Enable the shared capability for selected test tenants only.
8. Verify rollback.
9. Migrate data only if required.
10. Retire duplicated product logic after parity and acceptance.

## Prohibited migration shortcuts

- no direct cross-product database access as an integration contract;
- no wildcard tenant bindings;
- no browser-held service credentials;
- no shared secret reused across products;
- no country fork when a region pack is sufficient;
- no tenant repository clone;
- no unreviewed destructive schema migration;
- no production activation merely because source has merged;
- no claim that a reference/pilot module is live until deployed and tested.

## First pilot families

Recommended proving sequence:

1. Omniqora itself — CRM + Connect + Intelligence;
2. Dishbee / Cafe 1 — tenant/location model and hospitality integration;
3. Haccora UK/Germany — one landlord core + region packs + compliance integration;
4. XpertJobs/StellenXpert — one recruitment core + regional brand;
5. Fleetora/Qatnov — operational landlord consuming future Geo/Dispatch.

Only after these patterns are proven should the wider portfolio be migrated in waves.
