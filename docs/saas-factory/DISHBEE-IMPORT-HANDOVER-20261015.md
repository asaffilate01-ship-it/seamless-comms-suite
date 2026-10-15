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


## Next-stage delivery activation inventory — five physical sites

The Factory handover now carries a **zero-approval, no-credentials planning matrix**
for Uber Direct, Deliveroo Express and Just Eat Go for the following five sites:
St Albans Crown Court, Luton Crown Court, Futures House, MealDeck Luton and
MealDeck St Albans. See each `deliveryLocationPlans[]` in
`src/modules/control-plane/dishbee-import-handover.json`.

Each planned provider entry defaults to unconnected, unverified and disabled.
This is *not* a connection record; provider credential secrets, actual UUIDs,
onboarding observations, courier jobs and payment data must stay in Dishbee.

The imported tenant may become a draft with no courier account configured.
To actually publish a **delivery** service, the Dishbee operator must identify
the real tenant and physical location UUIDs and pass these gates for at least
one approved courier:

1. Country/provider partner agreement and merchant/location authorisation.
2. Per-merchant approved external collection point, Vault credentials and webhook setup.
3. Safe API host and documented fee units (especially Deliveroo Express).
4. Successful sandbox quote, test dispatch, status/failed delivery and cancellation.
5. Dishbee `delivery_provider_onboarding` explicitly `live` and
   `production_enabled`, all required checks satisfied, and platform UK
   partner approval returned by `partner_approval_ready`.
6. Payment-confirmed order, no accidental marketplace courier replacement,
   customer/merchant pricing reconciliation and idempotent booking.

In the Dishbee landlord, use **Delivery provider onboarding → Check Uber /
Deliveroo / JET** for each location. This check is read-only and displays
missing approvals instead of implying that adding a provider to the SaaS
Factory means the location can make real deliveries.

Factory tenant and location mappings must only be activated after the staged
source import has passed its independent identity/RLS checks and the exact
Dishbee location UUIDs have been validated. This contract does not create or
link a tenant automatically and does not approve a payment switch.
