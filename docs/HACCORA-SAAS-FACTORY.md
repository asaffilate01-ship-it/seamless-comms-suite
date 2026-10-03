# Haccora on the Omniqora SaaS Factory

Haccora is one product with two delivery modes and country packs.

## Product model

- **Standalone Haccora**: tenant enables product `haccora`.
- **Haccora for Dishbee**: Dishbee tenant enables `haccora.core` and `haccora.dishbee-sync`; product dependency provisioning creates/links the Haccora product automatically.
- **United Kingdom**: blueprint `haccora-uk`, country `GB`, locale `en-GB`.
- **Germany**: blueprint `haccora-de`, country `DE`, locale `de-DE`.
- **New Dishbee + Haccora UK tenants**: blueprint `dishbee-haccora-uk`.

The vertical product retains its domain records. Omniqora owns product/service entitlements, product connections, provider bindings, AI governance and shared platform services.

## Haccora service catalogue

Core domain services:

- `haccora.core`
- `haccora.haccp`
- `haccora.allergens`
- `haccora.evidence`
- `haccora.traceability`
- `haccora.training`
- `haccora.inspections`
- `haccora.sensors`

Omniqora-backed services:

- `haccora.ai-copilot`
- `haccora.document-ai`
- `haccora.rag`
- `haccora.graphrag`
- `haccora.regulatory-intelligence`
- `haccora.analytics`
- `haccora.dishbee-sync`

AI services depend on the governed Omniqora intelligence runtime. GraphRAG and regulatory monitoring remain evidence-preserving and review-required.

## Embedded Dishbee behaviour

`haccora.dishbee-sync` requires both products and the shared connector service. It is intended to synchronise only approved operational projections such as:

- tenant/business and locations;
- relevant users/roles;
- menu/recipe/ingredient and allergen references;
- supplier references;
- equipment references;
- compliance summary/status back to Dishbee.

Haccora compliance evidence remains in the Haccora data plane. Dishbee receives status/projections, not unrestricted Haccora table access.

## Provisioning

`service_product_dependencies` makes product requirements explicit. Enabling a service recursively installs required service dependencies and marks required products for provisioning. The platform-admin service toggle queues provisioning for the full dependency closure.

This lets `haccora.core` be sold directly or enabled from Dishbee without creating a second implementation.

## Runtime contract

Haccora should link to Omniqora using the standard product connection and one-time `oqcp_...` credential. The tenant snapshot is authoritative for country, branding, domains, product config and central entitlements.

Haccora must fail closed for central AI/add-on capability if the snapshot is unavailable, expired, mismatched or the required entitlement is disabled.
