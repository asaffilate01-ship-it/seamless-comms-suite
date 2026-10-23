# CRM and routing recovery — 23 October 2026

## Phase 1 — reconcile the existing implementation

- PR #113: merged current main without rewriting history; preserved the current Factory/AI work and all 11 CRM/routing tests. Replaced four calls to the disabled production bootstrap with the existing disposable test fixture. Regenerated the route tree.
- PR #114: merged the repaired parent without rewriting history; preserved the two batching tests and repaired the fifth obsolete bootstrap call. Contains the bounded 16-location road-matrix and reviewed-assignment extension.
- Local evidence: application build, TypeScript, security (32 disposable PostgreSQL checks), full parent control-plane suite, routing unit tests, driver/matrix database regressions and Dishbee binding tests passed. The 16-location build, TypeScript and batch database test passed separately. Required GitHub checks remain authoritative for each exact head.
- These source changes do not install migrations in the Lovable database or activate providers.

## Phase 2 — hosted schema reconciliation (current work)

The project identified by this repository's README is Lovable project `4d8eec5e-9d37-4819-9b0c-0a8c2300d4a1`. A read-only inspection on 23 October found:

- 19 recorded migration versions; 82 public tables.
- 1 tenant, 0 active tenant products, 0 active provider bindings; 3 CRM people and 0 CRM leads. No customer rows or secrets were exported.
- Against the repaired #114 source tree: 118 source migration versions absent from the hosted ledger, and three hosted-only versions: `20260723193652`, `20260723193744`, `20261023073521`.
- All 18 required dispatch, tracking, fleet-shift and routing tables were absent. Nine required routing/driver functions were absent. The required tables that existed had RLS enabled; policy correctness and grants were not certified.

**Do not apply the 118 files blindly.** Missing ledger versions do not prove missing effects, and matching versions do not prove matching SQL contents. Retrieve and reconcile the three hosted-only migrations, compare schema definitions and grants, and rehearse a reviewed forward migration plan against an isolated database. Preserve all existing hosted records and Lovable history. Never repair the ledger simply to make counts match.

### Hosted-only versions investigated

Read-only SHA-256 checks of the stored SQL identified two timestamp aliases:

| Hosted version | Source version | Exact SQL SHA-256 match |
| --- | --- | --- |
| `20260723193652` | `20260723193650` | `d3a9081583f66d2ff7a71d15365d0d14bcde7ac4d532793cea80936e59e3f737` |
| `20260723193744` | `20260723193737` | `6cd7695165f10c48b04666b6ea929e1a5f010f75fc2eccdf71b3c164a5a6b22d` |

These two files are already represented under different ledger versions and must not be replayed blindly. The third version, `20261023073521`, is named `craftvaro_factory_readiness` (3,549 SQL bytes; SHA-256 `4b2de12d5de28451abd457e43a8a04eab6cae5f3be18e67141cf16185eed1dd6`). It is separate product work and must be preserved and reconciled with its owning change. The automated inventory deliberately still reports all version differences; this handover is not an instruction to rewrite the hosted ledger.

### Repeat the inventory

From the selected source checkout:

```sh
node scripts/routing/schema-preflight.mjs --sql
```

Run the printed SELECT through the approved database connection. Save only the returned `snapshot` JSON object locally; it contains schema metadata and migration versions, not customer data. Then:

```sh
node scripts/routing/schema-preflight.mjs --snapshot snapshot.json EXACT_40_CHARACTER_RELEASE_SHA
```

The SHA labels the source release selected by the operator; independently confirm the checkout and database identity. Reports expire after 24 hours. Exit 0 means inventory alignment only; exit 2 means drift; exit 1 means invalid input or unreadable evidence. The command never connects to a database, applies SQL, creates tenants or activates providers. Every result keeps `pilotAccepted` and `productionAccepted` false. Presence checks are intentionally not policy, function-signature or runtime certification.

Use the existing guarded `supabase-staging.yml` workflow only after identifying the approved **separate staging project** and pinning its expected release SHA. Its dry-run/apply separation and full migration replay must remain intact. The current Lovable project is not implicitly the staging target.

## Phase 3 — authenticated pilot acceptance

Use synthetic accounts in the approved staging environment. Record the release, target, timestamp and evidence for each step:

1. Factory grants the intended product/services to one pilot tenant; a second tenant and revoked member cannot access its records.
2. A product-scoped service credential synchronises a CRM person, lead and opportunity; repeated requests do not duplicate records or link another product's customer.
3. A real source job reaches Dispatch with a traceable customer/job reference.
4. An independently qualified ORS binding calculates actual road times. Verify request-volume limits and provider billing controls separately; a 16-location matrix consumes 256 elements, the entire default daily element quota.
5. The operator reviews and applies the route; changed stops, missing tiles, stale evidence, suspended drivers and missing entitlements reject assignment.
6. The assigned driver completes the lifecycle and the customer tracking link reflects it. Driver attestation must remain labelled unverified by recipient.
7. Delivery completion reaches the customer's CRM timeline through an actual authorised event path. Do not simulate this with a manual CRM insert and call it integrated.
8. Exercise retries, revocation, invalid signatures, tenant isolation, mobile/browser flow and operational error recovery. Retain no credentials or customer PII in test reports.

## Phase 4 — remaining operational functionality

- Verified recipient PIN/signature/photo proof of delivery.
- Background/offline driver operation and device QA.
- Larger-fleet batching, caching, monetary budget controls and reviewed dynamic rerouting.
- Durable cross-product CRM delivery-event synchronisation and retry monitoring.
- Real carrier bindings, communications channels, scheduled workers and reporting.

Expand to further SaaS tenants only after the first pilot has demonstrable end-to-end evidence. Publication and production activation are separate from source merges and inventory reports.
