# Omniqora SaaS Factory control-plane contract

Omniqora is the portfolio control plane. Vertical applications remain responsible for their own domain data and transactional workflows.

## Global identifiers

Every Omniqora workspace has a stable `tenant_id`. A vertical product keeps its own tenant/workspace identifier and is linked through `product_connections`:

- Omniqora tenant ID
- product key
- external tenant/workspace ID
- optional product base URL
- capability list
- connector credential

Do not reuse a product-local UUID as an Omniqora global identifier unless they happen to be the same value.

## Tenant launch

Platform operators create a tenant from **SaaS Factory**:

1. Organisation
2. Tenant/workspace
3. Country, currency and timezone
4. Blueprint
5. Products
6. Services/add-ons
7. Branding and custom domains
8. Product workspace links
9. Provisioning/verification

Blueprints seed products and services but do not bypass service dependencies.

## Entitlements

A feature is enabled centrally through `tenant_services`. A consumer application should treat only `active` and unexpired `trial` services as enabled.

Required service dependencies are installed centrally. Consumers must still fail closed if a central entitlement snapshot is missing, malformed or expired.

Core vertical functionality that is intentionally local to a product may continue to use the product's own entitlement/configuration model.

## Product connector

For a linked product workspace:

1. Create/link the product workspace in SaaS Factory.
2. Generate a connector key.
3. Copy the one-time `oqcp_...` key into the product's secure secret store.
4. The product POSTs to `/api/control-plane/tenant-snapshot` with the key and its product/external tenant identifiers.
5. Omniqora returns the scoped product, tenant branding/domains and central entitlement map.
6. The product caches the snapshot for a short TTL and refreshes it periodically.

Omniqora stores only a SHA-256 digest of connector credentials. Rotating a key invalidates the previous key.

## Provisioning

Every product, service, branding, domain and integration operation is represented by a `provisioning_jobs` record. Product adapters should perform the external action idempotently and report completion through the service-role completion RPC.

Do not mark a product/service active merely because the operator toggled it on; it becomes active after provisioning succeeds.

## Security boundaries

- Platform product/add-on activation is platform-admin only.
- Tenant owners/admins can view their control-plane state and manage permitted branding/domain configuration.
- Product databases remain isolated.
- Connector keys are secrets and must be stored in a server-side vault/secret manager.
- Snapshot endpoints are no-store and scoped to one product/external tenant binding.
- Consumers fail closed for central services if a snapshot expires.
- No vertical application receives access to another tenant or product merely because both are owned by the same organisation.

## Adding another SaaS

A new SaaS needs:

1. Product catalogue entry.
2. Service catalogue entries and dependencies.
3. Optional launch blueprint.
4. A product-local secure connector setting.
5. A snapshot client/cache using the same contract.
6. Local feature gates mapped to Omniqora service keys.
7. A provisioning adapter for actions that require changes in the product.

This is the same pattern used by Dishbee and should be reused for Kindelo, FormationGenie, Omniqora Accounts and later products.
