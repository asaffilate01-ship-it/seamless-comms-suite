# Controlled staging migration rehearsal

This gate supplements, and does not replace, Dishbee's paired SaaS Factory handover.

## Automated checks

`node --test verification/staging/guard.test.mjs` runs without credentials or a database.

`Verify complete Supabase migration chain` checks every SQL filename, rejects duplicate versions and symlinks, records SHA-256 content hashes, then copies the complete migration chain (and custom roles, when present) into a disposable CLI-generated local Supabase project. It executes the real migrations with standard Supabase services, not simplified schema fixtures. No hosted project is linked, no source/customer export is copied, no repository seed script is run and no deployment credentials are supplied. The CLI is pinned to 2.119.0.

The replay uses generated local configuration rather than the hosted project's configuration. Passing it proves that the checked-in SQL chain replays on that local stack. It does not prove a populated hosted upgrade, production Vault behaviour, cross-tenant session isolation, frontend deployment, provider acceptance or safe live trading. A failure is a deployment blocker to investigate, not permission to remove migrations or mark them applied.

Evidence includes the actual checked-out SHA (a merge-preview SHA on pull-request runs), the full migration manifest, local ledger when successful and an explicit result. `stagingDeployed` and `productionAccepted` remain false. Failure artifacts do not turn a failed job green. Raw environment variables, credentials, full database dumps and tenant rows are not uploaded.

## Hosted staging workflow

`Supabase staging migration` first calls the complete-chain workflow at the same event revision. The hosted job cannot start unless replay succeeds. It then requires these trusted variables in the GitHub **staging** environment:

- `SUPABASE_STAGING_PROJECT_REF`: the approved staging project for this repository.
- `SUPABASE_PRODUCTION_PROJECT_REF`: the real production project to exclude; both refs must be present and different.

Retain `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` as staging environment secrets. Do not put secrets into dispatch inputs, browser settings, PR comments or this file. Protect the staging environment with approved reviewers/branches in GitHub settings; this commit does not configure those protections.

Dispatch with the selected branch, its full `expected_sha`, the approved `project_ref` and `mode=dry-run` first. The checked-out commit must exactly match `expected_sha`. Review the proposed migration list. For a controlled apply, repeat against the same reviewed revision with `mode=apply` and `confirmation=MIGRATE-STAGING`. Every input enters shell steps through an environment variable, never interpolated into a shell program. No reset, migration-repair or bypass path exists in the hosted workflow.

A dry-run is a migration plan, not SQL execution. The separate local replay executes the complete chain; the approved staging apply must still be tested against the hosted schema and its real data state. No production workflow is changed by this work.

## Paired order and first tenant

Keep provisioning paused through the existing operational controls. This workflow does not itself pause any scheduler, deploy web handlers, set runtime secrets, provision tenants, import records or activate products.

1. Approve backups, real project identities, release SHAs and complete migration ledgers.
2. Rehearse/apply Dishbee database changes, then deploy its corrected provisioning handler.
3. Rehearse/apply Omniqora database changes, then deploy its matching worker. Resume controlled provisioning only after both sides are compatible.
4. Bind the real **draft Cafe 1 St Albans** tenant and location. Require current accepted binding and Factory readiness, then test authenticated isolation, import reconciliation, staff access, runtime snapshot/shadow order, payment/KDS/refund, monitoring and rollback.
5. Repeat for **Cafe 1 Luton**, preserving **Luton Crown Court** and **Futures House** as distinct locations; then **MealDeck** as its own business tenant. Keep existing systems trading until each operational acceptance is approved.

Reuse the existing Dishbee landlord. Product enablement must not duplicate the business tenant. External connectors are accepted individually; optional modules must not be switched on to make a report appear complete.

## Current boundary

This directory contains executable guard tests and CI/deployment controls, not completed hosted-staging evidence. Actual Supabase/Lovable deployment, tenant IDs and pilot results must come from those environments. Do not replace unknown values with invented IDs or claim that green CI moved a tenant.
