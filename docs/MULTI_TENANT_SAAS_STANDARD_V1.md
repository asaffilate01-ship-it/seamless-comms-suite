# iTechLounge Multi-Tenant SaaS Standard v1

Applies to DishBee, Zivvo, SparesGrid, Haccora and every platform that has a platform-owner/tenant relationship.

## Principle

The platform operator provisions and approves tenants. A public form may create an application only. It must not create an active tenant, grant production entitlements, provision credentials, publish content or expose another tenant's data.

Each SaaS remains its own system of record with its own database, RLS, storage boundaries, audit history and product-specific workflows. Omniqora supplies reusable identity/entitlement/communications contracts and scoped integrations; it is not a shared unrestricted database.

## Hierarchy

platform
- tenant
  - legal entity/trading identity
  - one or more locations/sites/branches
  - departments or operational units
  - users, roles and memberships
  - subscription and add-on entitlements
  - domains/storefronts/portals
  - provider connections and channel assignments

Tenant and location identifiers are server-resolved. Browser input cannot select an arbitrary tenant boundary.

## Operator provisioning

Platform staff configure:
- legal/trading names, identifiers and addresses
- primary contacts, support/sales/compliance email and phone
- approved logos, assets, colour tokens, typography and layout template
- domains/subdomains and verified ownership
- plan, billing references, limits and add-ons
- authorised tenant owner and initial roles
- locations and operational configuration
- integration endpoints and server-only encrypted credentials
- Omniqora numbers/channels and automation policies
- activation, suspension, transfer and offboarding state

Secrets never appear in public configuration, browser bundles, logs, exports or ordinary admin screens. Secret replacement is audited and old values are not recoverable.

## Isolation and RLS

Every tenant-owned row contains tenant_id. Location-scoped rows also contain location_id. Access is derived from authenticated membership and role/capability checks.

Isolation must cover:
- database reads and writes
- object-storage paths and signed URLs
- realtime subscriptions
- search indexes and vector/graph namespaces
- caches and background jobs
- analytics and exports
- notifications and conversations
- webhooks and integrations
- logs, errors, audit records and support tools

Cross-tenant access is denied by default. Platform support access is time/role scoped and audited. Tests must prove that Tenant A cannot enumerate, infer, mutate, subscribe to or export Tenant B data.

## Roles and capabilities

Common roles:
- platform_owner
- platform_admin
- platform_support
- tenant_owner
- tenant_admin
- location_manager
- finance
- compliance
- operator/staff
- viewer

Products may add roles, but authorisation is capability-based and enforced server-side. Tenant admins manage only their tenant and cannot grant platform roles.

## Subscriptions and entitlements

Plans and add-ons control product-specific quotas including users, locations, records/listings/items, storage, transactions, integrations, channels, AI usage, reports, exports, custom domain/site and API/webhook access.

Enforcement is transactional on the server/database. UI hiding is not enforcement. Upgrades apply safely; downgrades block new over-limit activity without silently deleting records. Suspension and expiry follow a defined read/export/retention policy.

## Tenant dashboard

Every tenant receives a product-specific dashboard for:
- operational records and workflows
- staff, roles and invitations
- locations
- subscription usage and add-ons
- appearance/content controls allowed by template
- integrations and channel health
- tasks, notifications and conversations
- reports and exports allowed by plan
- audit history
- support and privacy requests

Dangerous configuration remains restricted to the platform operator.

## Sites, portals and branding

Optional tenant sites/portals are operator-built and maintained where that is the product model. Tenant CRM/inventory/catalogue data may publish through an approval workflow.

Allowed configuration:
- verified custom domain/subdomain
- approved assets
- design tokens
- curated templates
- section visibility/order
- contact/location information
- SEO and product-specific content

No arbitrary executable code, unreviewed scripts or tenant-controlled secret injection.

## Integrations and Omniqora

Each product connection is explicitly scoped to product, tenant, location/department, allowed operations and one or more assigned numbers/channels.

Server-to-server events require:
- versioned schema
- fixed source/destination mapping
- HMAC signature
- timestamp/replay checks
- idempotency
- least-privilege scopes
- retry/dead-letter handling
- audit correlation

AI agents operate only through approved tools, disclose uncertainty internally, and cannot cross tenant boundaries or approve regulated/high-risk actions without the required controls.

## Product profiles

- DishBee: restaurant/franchise tenants; strict separation between Cafe 1 Luton, Cafe 1 St Albans and every other operator/site; EPOS, KDS, ordering, menu, stock and hospitality operations.
- Zivvo: dealer tenants; stock, listings, marketplace, leads, offers, provenance, storefronts and approved automotive add-ons.
- SparesGrid: dismantler/salvage/parts tenants; vehicle intake, part inventory, locations, multichannel publication, orders, wanted parts, supplier/breaker workflows and optional tenant sites.
- Haccora: food-business tenants; HACCP, compliance, premises, tasks, evidence, audits, suppliers and approved hospitality add-ons.
- Other landlord/tenant SaaS: must define its tenant-owned resources, roles, plan limits, high-risk actions, evidence retention and cross-platform scopes before activation.

## Lifecycle

application -> due_diligence -> configured -> staging -> approved -> active -> suspended -> offboarding -> retained/deleted

Activation requires RLS tests, role tests, domain verification, billing/entitlement validation, secret-store setup, audit logging, backup/restore evidence and a tenant-specific acceptance checklist.
