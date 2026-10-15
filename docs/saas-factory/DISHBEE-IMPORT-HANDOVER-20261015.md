# Dishbee landlord handover — tenant import readiness (15 October 2026)

The SaaS Factory registry now includes a strictly **read-only** three-tenant handover contract:
`src/modules/control-plane/dishbee-import-handover.json`.

The Factory inventory uses historical tenant keys `cafe1stalbans` and `cafe1luton`; the actual Dishbee local slugs are `cafe-1-st-albans` and `cafe-1-luton`. This spelling distinction is intentional and must never be used to infer or auto-create matching customer workspaces. MealDeck uses the same slug on both sides, but still receives a **distinct runtime UUID per platform**.

### Authority and boundaries

- **Omniqora**: product directory, entitlements, linked workspace identity and provisioned service permissions.
- **Dishbee**: landlord tenant UUIDs, real locations, menus, EPOS, KDS, orders, payment and refund records, staged source import, courier provider connections and dispatch.
- **Cafe 1 St Albans and Luton**: two separate Dishbee tenants. Luton has two physical sites (including Futures House). MealDeck has two locations and multiple food brands; its St Albans Cafe1 food brand is not the direct Cafe 1 St Albans tenant.

### Before enabling one real Factory product connection

1. Dishbee staging deployment passed preflight: exact build SHA, validated migration ledger and a real isolated staging DB.
2. The exact Dishbee blueprint was created as a **draft** tenant; capture its actual tenant UUID from the landlord.
3. Cafe 1 server-side source staging or verified v3 offline package passed source identity checks, row counts, finance/KDS reconciliation and staff invitation acceptance. MealDeck uses native catalogue onboarding rather than importing the Cafe 1 source into the MealDeck tenant.
4. Tenant and location UUIDs are explicitly mapped in Omniqora through the existing product binding flow. Credentials are scoped and rotated, not pasted into registry JSON.
5. Provider checks for Uber Direct, Deliveroo Express and Just Eat Go are per physical location, with separate Vault credentials, merchant/site contracts, sandbox verification and production approval. Listing a provider in the directory never makes it available for dispatch.
6. Payment provider selection is separate. St Albans Adyen for Platforms is in preparation; do not assume approved terminals or active settlement.
7. Reconciliation, wrong-tenant RLS denial, staged booking/payment smoke, final delta, operator sign-off and rollback all pass **before production**.

This is not a deployment record. `phase: awaiting_draft_tenant_and_staging` intentionally remains unchanged until actual, externally evidenced onboarding has taken place. No real tenant IDs, customer records or production API keys are checked into this manifest.
