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

## MealDeck current offer: 2026-10-06-r2

This revision applies to the current location offer and territory templates. It does not change signed agreements, accepted application snapshots, management agreements or invoices.

| Term | Current offer reference |
| --- | --- |
| Base franchise fee | Each location's previous catalogue fee reduced by 50%; standard range £3,750–£12,500 |
| Equipment, opening packaging and opening supplies | Approximately £15,000 per location; indicative and separately itemised |
| Royalty | To be confirmed in the written quote; no replacement percentage has been agreed |
| Marketing | 1.5% of contract-defined Net Sales |
| Technology | £199 per month per location; replaces the old 25p-per-order charge |
| Accountancy | £100 per month for the agreed service scope |
| Bought-in supplies | At the agreed purchase-cost basis, with no markup |
| Manufactured supplies | (Ingredients + labour + other properly allocated production costs) × 1.15 |

Business charges exclude VAT where applicable. The equipment/opening-stock allowance excludes additional premises work, deposits, separately quoted technology hardware/setup, professional costs and working capital. The quote defines the precise inclusions and avoids charging a cost twice.

The migration `20261006120000_mealdeck_franchise_pricing_revision.sql` archives each record's previous fee under `metadata.franchiseFeeRevisions['2026-10-06-r2']`, rounds the halved fee to the nearest penny and sets `metadata.franchiseFeeVersion` in the same transaction. Programme history is retained under `offer.pricingHistory`. Replaying the migration does not reprice converted records; a later unmarked import under an already revised programme requires a separate review. The seed RPC fills missing records and preserves existing prices, reservations and programme decisions.

An undecided royalty is stored as `royalty_bps = NULL` with `royalty_status = 'quote_required'`. The database check constraint rejects an apparently agreed numeric rate while that status remains. The retired per-order technology and universal supply-markup scalars are zero; current monthly fees and the two supply categories are in `offer.pricing`.

The public programme DTO contains `franchiseFeeVersion`, `royaltyStatus`, `royaltyPercent: null`, `royaltyDisplay`, `techFeePerMonth`, `accountancyFeePerMonth`, `boughtInSupplyMarkupPercent`, `manufacturedSupplyMarkupPercent`, `manufacturedSupplyCostBasis` and `equipmentOpeningSuppliesEstimate`. Each territory has its own `franchiseFeeVersion` only when that marker exists on the stored row. Do not infer it from the programme or fee amount. An unmarked row remains unmarked, and current CRM/exhibit presenters withhold its price until confirmed. Public responses exclude internal pricing history.

The website adapter handles legacy-to-current fee conversion once. The revised API sends stored, already-revised fees directly; it does not apply a second discount. Application `answers.offerVersion`, `answers.offerSnapshot` and `answers.selectedTerritoryFee` retain the offer presented by the website adapter. These enquiry records are not signed fee schedules.

`getTerritoryAgreementExhibit` keeps geography in `territory` and puts the indicative catalogue charge in `currentOffer.baseFranchiseFee`. It no longer injects today's catalogue price into `territory.fee_minor` as though that were a contractual charge. `contractualPricing.status` is `agreement_schedule_required`; the signed fee schedule remains the source for an existing contract.

Deploy the migration together with the corresponding server/CRM release. Source changes alone do not confirm that the production database or public endpoint has been updated. Run `network-expansion-pricing.test.mjs`, `network-expansion.test.mjs` and `network-expansion-public.node.mjs` to verify migration replay, custom prices, signed-snapshot preservation and the API boundary.
