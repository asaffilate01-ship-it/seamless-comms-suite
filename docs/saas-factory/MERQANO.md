# Merqano in Omniqora SaaS Factory

Merqano is a **landlord SaaS product** governed by the Omniqora SaaS Factory. The Factory provisions Merqano product workspaces and shared services; Merqano provisions and operates individual commerce tenants.

## Ownership boundary

### Omniqora SaaS Factory owns
- Merqano product catalogue registration and product connection.
- organisation/global tenant identity.
- central entitlements and billing.
- connector credentials and secret lifecycle.
- shared add-on entitlement: Omniqora AI, MarktPass, Merqora and shared Marketing.
- product-level branding/domain authority where centrally managed.
- provisioning jobs, verification and portfolio audit.
- product health/observability.

### Merqano owns
- commerce tenant workspace and tenant-local RBAC.
- tenant shop configuration, catalogue, variants, inventory, pricing, baskets, checkout, orders and returns.
- tenant-specific domain/shop theme state received from or reconciled with Factory authority.
- tenant launch gates specific to commerce operations.

## Hierarchy
Omniqora platform tenant -> Merqano product connection -> Merqano external tenant/workspace -> Alstero / Kalëthon / Dulcis / Meyzaar shop.

## Connector
Merqano must use the existing Omniqora control-plane snapshot contract. The connector secret stays server-side. A snapshot supplies central branding/domain authority and entitled shared services. Missing/expired/malformed snapshots fail closed for central add-ons.

## Provisioning
Factory creates a product/integration provisioning job. The Merqano adapter idempotently creates or links the external tenant workspace, records the external tenant ID, and reports completion. Factory must not mark Merqano active before the adapter succeeds.

## Shared services
- MarktPass: product market-access/compliance gate.
- Merqora: marketplace growth OS.
- Syndriva: infrastructure behind Merqora, not directly provisioned as a normal merchant UI add-on unless needed by architecture.
- Omniqora AI: tenant-scoped intelligence profile.
- Marketing: central entitlement can activate Merqano's first-party marketing capability.

No shared service bypasses its own approval, compliance or consent controls.
