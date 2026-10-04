# Omniqora Network Expansion — territory engine

This module turns a kitchen/site anchor into a versioned franchise territory.

## Contractual model

A territory has three separate polygons:

1. **Protected core** — the exclusive franchise territory attached to the franchise agreement.
2. **Shared boundary** — overlap where Omniqora may route an order to either neighbouring kitchen.
3. **Overflow delivery area** — operational reach only; it creates no exclusivity.

The approved protected GeoJSON is the contractual territory. Delivery zones may change more frequently without changing the franchise agreement.

## Route-time calculation

The server uses Google Maps Platform **Routes API / Compute Route Matrix** with a stable `TRAFFIC_UNAWARE` baseline.

The algorithm:

1. geocodes the kitchen postcode/address if coordinates are not supplied;
2. samples radial candidate points around the kitchen;
3. requests road travel times from the kitchen to those points;
4. calculates the requested core/shared/overflow time envelopes;
5. compares protected-core candidates with nearby taken/reserved/operating MealDeck kitchen anchors;
6. shrinks the protected core where a neighbouring kitchen reaches the candidate materially faster;
7. if demographic data is loaded, tests core-minute thresholds against the configured population range;
8. saves a new **review** version; and
9. only an explicit approval promotes the GeoJSON to the live territory.

Google documents a 625-element maximum for ordinary non-transit Compute Route Matrix requests. The current engine deliberately samples below that ceiling per matrix request.

## Demographic layer

Use an imported normalized England/Wales small-area file. Recommended sources:

- ONS Lower-layer Super Output Area population estimates (latest available edition).
- Census 2021 / ONS household counts.
- ONS/Open Geography LSOA codes, centroids and optionally boundary GeoJSON.

The engine currently uses the LSOA centroid-in-polygon method for population and household estimates. This is appropriate for territory scoring and tuning, but it is still an estimate; the approved road-time GeoJSON, not the estimated population count, is the contractual boundary.

### Normalized import columns

Required: `geography_code` (or `LSOA21CD`), `centroid_lat`, `centroid_lng`.

Recommended: `name`, `population`, `households`, `daytime_population`, `students`, `population_source`, `household_source`, `source_year`.

Import with:

    bun run import:territory-demographics ./data/england-wales-lsoa-normalized.csv

## MealDeck N7 pilot

The initial Islington/Camden design is anchored at **N7 8XH / Caledonian Road**, with:

- requested core: 25 minutes
- shared: 30 minutes
- overflow: 35 minutes
- tunable core range: 18–28 minutes
- protected population target: 150,000–200,000
- public status: **Taken**

The first live calculation requires `GOOGLE_ROUTES_API_KEY`, Geocoding API enabled on the same key or `GOOGLE_GEOCODING_API_KEY`, and imported demographic cells if population/household tuning is required.

## Managed investor franchise

Network programmes can also offer a **Managed Franchise**.

The investor funds the same franchise/site costs as an owner-operator, but an approved operations company manages day-to-day operations under a separate management agreement.

Default planning configuration for MealDeck:

- management share: 20% of **Managed Operating Profit**
- minimum management fee: £0 unless specifically agreed
- management fee is shown separately from site OPEX

Managed Operating Profit is calculated after food/packaging, payroll, premises, utilities, delivery/payment costs, local site costs and standard franchise charges, but before the management fee, financing, corporation tax, depreciation and investor distributions.

The management agreement must remain legally separate from the franchise agreement and should be reviewed by franchise, tax and employment advisers before issue.