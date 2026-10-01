# Omniqora migration control plane

The SaaS Factory control plane turns the portfolio architecture workbook into executable, tenant-scoped migration state.

## Source inventory

`src/modules/control-plane/portfolio-seed.json` preserves the 120 rows from the Portfolio Classification sheet, including duplicate names where the source workbook intentionally contains separate records. `sourceRow` is immutable provenance and is the seed/upsert key inside a tenant.

The seed retains repository/live URLs, proposed role, parent/landlord, migration notes, common services, audit status and derived topology traits. Site-only entries are not assigned a new repository by default: they can be moved to `site_native` and implemented as Omniqora product/tenant/landlord/marketplace configuration unless specialist domain logic justifies a separate codebase.

## Migration state machine

`inventory -> repo_audit -> decision -> adapter -> shadow_sync -> cutover_ready -> cutover -> complete`

`blocked` is available from any stage. Progress is explicit rather than inferred from UI state.

## Topology targets

The control plane supports `platform_landlord`, `landlord`, `tenant`, `regional_variant`, `shared_module`, `marketplace`, `merge`, `site_native` and `retain_product`. This lets the source workbook's descriptive role remain untouched while the migration team records the executable destination.

## Security and tenancy

The tables are scoped by the existing Omniqora tenant model and RLS helpers. Members can read portfolio state; only owner/admin roles can seed or change it. Every update is appended to `portfolio_migration_events` and mirrored into the shared `audit_log`.

## UI

The authenticated `/app/control-plane` workspace shows the full seeded inventory, role/stage KPIs, marketplace and site-only classifications, repo/live links, target-mode controls, migration-stage controls and progress. Filters operate locally; writes are server-validated and tenant-scoped.

## Integration path

This control plane coordinates the existing shared services rather than replacing them:

- Omniqora Connect and product manifests remain the communications/connector surface.
- Ecosystem bridges remain compatibility adapters for legacy SaaS products.
- RRCI/Neo4j and enterprise-AI services can attach evidence and graph context during repo-audit and decision stages.
- Transformation/Business360 can consume the canonical product/tenant decision instead of maintaining a separate migration inventory.
- Later automation can create repo-audit jobs, adapters and cutover gates directly from `portfolio_assets` and append evidence to `portfolio_migration_events`.
