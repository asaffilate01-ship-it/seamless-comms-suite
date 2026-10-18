# Dishbee family — hosted SaaS Factory catalogue deployment audit (18 October 2026)

**Purpose:** non-mutating, operator-approved inspection of the actual **Omniqora SaaS Factory** database versus checked-in Dishbee One, Hive, Stay, Plus, Buzz and Court service/blueprint migrations.

Run `verification/control-plane/dishbee-hosted-catalogue-audit.sql` in the **correct Factory project** SQL inspector with authorised read access. Do not run Factory migrations on the standalone DISHBEE operational Supabase project. This is a SELECT-only query: it creates no business, tenant, domain, location, payment account, provider connection or provisioning job.

## Expected result and interpretation
- `catalogue_deployed=true` requires every expected *product*, core *service*, *blueprint* and selected product-service entitlement to exist and be active/valid. Missing rows are returned as named reason arrays.
- Hive and Buzz are Dishbee services, not separate landlord businesses. Cafe 1 St Albans, Cafe 1 Luton and MealDeck remain separate operating tenants, never generated from this report.
- `production_accepted=false` is constant even when the catalogue is complete. The report **cannot** establish staging migration provenance, merchant/provider authorisation, customer isolation, signed payment/refund handling, KDS/device acceptance, or external delivery certification.
- `assigned_tenant_products` and `dishbee_connections` are aggregate counts only. No tenant UUID, customer data or provider secret is returned.

## Snapshot observed on 18 October 2026 (read-only)
The connected Factory database returned `catalogue_deployed=false`: missing product registrations `dishbee-one`, `dishbee-plus`, `dishbee-stay`; seven service registrations; seven Hive/One/Plus/Stay/Court blueprints; and three selected entitlement rows. There were no assigned tenant products and no Dishbee runtime connections. The source repository has earlier migrations containing these definitions, but **source-code presence is not hosted deployment evidence**.

## Required release workflow
1. Verify Factory project identity, deployed release SHA, existing schema and the actual `supabase_migrations.schema_migrations` ledger before touching migrations.
2. Run this SELECT-only audit; save the result with environment, release SHA and time (no private credentials).
3. Replay the complete reviewed migration history in a **disposable isolated staging database**; compare product keys, service dependencies and RLS.
4. Prepare only the minimal **reviewed additive** catalogue correction for the intended staging project after provenance is reconciled; do not blindly rerun historic migrations against a populated live database.
5. Rerun the audit, then independently prove external Dishbee landlord draft binding, tenant A/B isolation, per-location entitlements and commerce/provider acceptance. Existing customer systems remain untouched until a separately approved cutover.

Companion PRs: Omniqora #115 (unsafe pilot bootstrap disabled), Omniqora #118 (provider account contract) and Dishbee #73 (combined import/integrations, still blocked on runners/schema acceptance).
