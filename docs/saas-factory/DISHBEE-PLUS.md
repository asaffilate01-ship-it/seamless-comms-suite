# Dishbee+ in the Omniqora SaaS Factory

## Product boundary

Dishbee+ is a first-class Omniqora product with product key `dishbee-plus`.

The current consumer marketplace source repository remains:

`asaffilate01-ship-it/onyn`

The repository does **not** need to be physically merged into the Omniqora repository. It is linked as an external/hybrid product through the SaaS Factory control plane, the same pattern used by other vertical products.

## Runtime split

### Omniqora owns reusable horizontal capability

- marketplace/vendor primitives;
- identity and tenant membership;
- catalogue syndication;
- integration hub and provider registry;
- payments abstraction;
- CRM/customer 360;
- communications and journeys;
- geo/serviceability;
- dispatch/tracking/fleet primitives;
- inventory primitives;
- loyalty/rewards integration;
- analytics and channel profitability;
- provider health, retries, certification evidence and operational assurance;
- enterprise integration, security/audit and data-governance controls.

### Dishbee owns restaurant operations

A Dishbee+ merchant that is a restaurant can route its paid order to Dishbee for:

- menu/KDS mapping;
- restaurant stock/recipe handling;
- kitchen station routing;
- EPOS;
- Hive vendor/company routing;
- MealDeck multi-brand operations;
- restaurant delivery orchestration;
- restaurant-specific compliance/Haccora hooks.

### Dishbee Hive owns multi-kitchen execution

A Dishbee+ listing can resolve to a Hive vendor/brand. Dishbee Hive keeps vendor isolation, KDS ownership, central pass/packing and settlement boundaries.

### Dishbee+ owns the consumer experience

- discovery;
- search;
- categories;
- merchant/store pages;
- cart;
- checkout;
- order tracking;
- favourites/reorder;
- offers/rewards;
- customer support entry points;
- multi-category UX for food, grocery, pharmacy, convenience and future categories.

## Why this replaces separate middleware for the merchant

The target path is:

`Uber Eats / Deliveroo / Just Eat -> Omniqora Integration Hub -> Dishbee -> KDS`

Direct certified provider connections are preferred.

Deliverect, Otter and UrbanPiper are supported as optional bridges while direct provider approval is unavailable. Once a direct route is production approved, the merchant can use Dishbee/Dishbee+ without buying a separate aggregation middleware product.

Foodics, Dines, Toast, Square, Lightspeed, Epos Now, Grafterr and similar restaurant/POS products are competitor/reference systems, not Dishbee runtime dependencies. Their useful features are gap inputs for native Dishbee/Omniqora development. RapidSwitch/import tooling may ingest exports when a merchant migrates away from a former POS. SumUp remains a payment provider only where configured.

## Jungleworks parity mapping

The existing Omniqora modules already cover much of the Yelo/Tookan/Hippo model:

| Jungleworks pattern | Omniqora / Dishbee family |
| --- | --- |
| Yelo marketplace/storefront | Omniqora Marketplace + Dishbee+ |
| Tookan dispatch | Omniqora Geo + Dispatch + Fleet + Tracking |
| Tookan agent app | Omniqora Universal Agent + Dishbee own-driver runtime |
| Tookan picker/fulfilment | Dishbee KDS/Hive pass + reusable fulfilment primitives |
| Hippo engagement | Omniqora Connect + CRM + Journeys + RFM + Feedback |
| white-label marketplace | SaaS Factory branding/domains + Dishbee+ |
| vendor app | Dishbee tenant/Hive vendor surfaces + Dishbee+ vendor operations |
| catalogue/inventory | Omniqora Marketplace/Inventory + Dishbee restaurant catalogue |
| integrations | Omniqora Integration Hub |
| analytics | Omniqora Analytics + Profitability |

Remaining work should extend the shared engines, not recreate them inside Dishbee+.

## Enterprise/QITT capability mapping

The QITT-style enterprise gaps are represented horizontally:

- Identity/endpoint/workplace -> `omniqora.identity` and enterprise identity connectors.
- Integration/APIs/middleware -> `omniqora.integration-hub` and `omniqora.enterprise-integration`.
- Security/audit/compliance -> `omniqora.security-assurance` plus RRCI/Haccora where domain-specific.
- BI/data/governance -> `omniqora.analytics` + `omniqora.data-governance`.
- ITSM/operations -> `omniqora.ops-assurance`.
- ERP/enterprise systems -> provider catalogue entries under `omniqora.enterprise-integration`.

These capabilities remain shared platform services and are not exposed as consumer marketplace UI unless a specific Dishbee+ workflow needs them.

## Pharmacy boundary

Dishbee+ can support pharmacy discovery/catalogue and permitted commerce, but prescription-only, controlled or otherwise restricted medicine workflows require the relevant regulated-pharmacy, prescribing, identity and fulfilment controls. The generic marketplace connector must not silently treat those products as ordinary grocery inventory.

## Migration from Onyn / OnynGo

1. Keep the current repository and deployment functioning.
2. Register the source as product `dishbee-plus` in Omniqora.
3. Link the existing external workspace with a control-plane connector.
4. Move shared identity, marketplace, dispatch, CRM and integration concerns behind Omniqora contracts in phases.
5. Route restaurant vendor orders into Dishbee.
6. Route Hive vendor orders into Dishbee Hive.
7. Keep non-food vendors on Omniqora Marketplace.
8. Rebrand the consumer UI and public domains independently of the backend migration.
9. Retire the `onyngo` alias only after redirects, app identifiers and integration references have been migrated.
