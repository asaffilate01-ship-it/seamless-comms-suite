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

## MealDeck current offer: 2026-10-06-r3

MealDeck is a turnkey multi-brand kitchen franchise. The offer brings together the shared MealDeck brand portfolio, location and territory assessment, the equipment and opening-supplies package, all technology including Haccora, and central compliance, administration, training, operational support, marketing and scoped accountancy. The available location menu, equipment schedule, service scope and launch requirements are agreed for each site. The franchisee runs and staffs the kitchen, follows food safety and service standards, and funds premises, payroll, utilities and the agreed operating charges.

This revision changes the current service and setup offer. Existing signed agreements, accepted application snapshots, management agreements, invoices and territory fee history remain unchanged.

| Term | Current offer reference |
| --- | --- |
| Base franchise fee | Each location's previous catalogue fee reduced by 50% once; standard range £3,750–£12,500, paid upfront |
| Equipment, opening packaging and opening supplies | £15,000 package per location, paid upfront in addition to the reduced base franchise fee |
| Royalty | To be confirmed in the written quote; no replacement percentage has been agreed |
| Marketing | 1.5% of contract-defined Net Sales |
| Technology | 35p per completed order for all technology including Haccora |
| Accountancy | £100 per month for the agreed service scope |
| Bought-in supplies | At the agreed purchase-cost basis, with no markup |
| Manufactured supplies | (Ingredients + labour + other properly allocated production costs) × 1.15 |

One completed customer order per kitchen, regardless of brand count or ordering channel; cancelled and fully refunded orders are excluded. The 35p charge replaces the previous £199 monthly technology offer. There is no additional monthly technology charge in r3.

Card processing fees charged by third parties. Courier delivery charges and aggregator commissions also remain separate operating costs. No MealDeck card-processing tariff or payment commission is introduced by this revision.

The standard upfront base fee plus package totals £18,750–£27,500 per location. Business charges exclude VAT where applicable. The package excludes premises works and deposits, professional costs and working capital; the written quote defines the equipment and supplies included and the site-specific service scope. This is not an all-in premises or working-capital budget.

### Independent service and territory fee versions

`offerVersion` is `2026-10-06-r3`; `franchiseFeeVersion` remains `2026-10-06-r2`. The unchanged migration `20261006120000_mealdeck_franchise_pricing_revision.sql` archives each record's previous fee under `metadata.franchiseFeeRevisions['2026-10-06-r2']`, rounds its original fee reduction to the nearest penny and sets `metadata.franchiseFeeVersion` in the same transaction. Replaying that migration does not reprice converted records; a later unmarked import under an already revised programme requires a separate review.

The forward migration `20261006133000_mealdeck_technology_and_upfront_package.sql` updates only the current MealDeck programme's service/setup offer and the authoritative `tech_fee_minor_per_order` scalar to 35. It archives the prior pricing and offer under `offer.pricingHistory['2026-10-06-r3']`, retains earlier history and leaves all actual territory and template records untouched. There is no fee-reduction calculation in r3. Replaying r3 does not change fees, reservations, accepted snapshots or the archived offer. The seed RPC fills missing records, copies already reduced template fees verbatim and preserves existing prices, reservations and programme decisions.

An undecided royalty remains `royalty_bps = NULL` with `royalty_status = 'quote_required'`. The database check constraint rejects an apparently agreed numeric rate, including zero, while that status remains. The universal supply-markup scalar remains zero; the two supply categories and monthly accountancy fee are defined in `offer.pricing`. No new royalty percentage is approved by this revision.

The r3 public programme DTO contains `offerVersion`, `franchiseFeeVersion`, `royaltyStatus`, `royaltyPercent: null`, `royaltyDisplay`, `techFeePerOrder: 0.35`, `techIncludesHaccora: true`, `techFeeBasis: 'per_completed_order'`, `techOrderDefinition`, `accountancyFeePerMonth`, the split supply-cost fields, `equipmentOpeningSuppliesFee: 15000` and both `equipmentOpeningSuppliesPaymentTiming` and `franchiseFeePaymentTiming` as `'upfront'`. It contains no retired `techFeePerMonth` or `equipmentOpeningSuppliesEstimate` fields. Public offer copy includes the turnkey brand portfolio, central support and operator responsibilities, with `cardProcessingFeeDescription: 'Card processing fees charged by third parties'`.

Presenters inspect the stored offer version independently of the fee version. A database programme still carrying r2 service terms is shown as offer r2, with its previous monthly technology and indicative equipment allowance, until the forward migration has run. Updating the application code alone must not make that stored programme claim the r3 service prices.

Each territory has its own `franchiseFeeVersion` only when that marker exists on the stored row. Do not infer it from the programme or fee amount. An unmarked row remains unmarked, and public, CRM and exhibit presenters withhold its price until confirmed. Missing or invalid stored amounts also produce a null fee. Public responses exclude internal pricing history.

The website adapter handles legacy-to-current fee conversion once using the fee version alone. The revised API sends stored, already revised r2 territory fees directly for both r2 and r3 offers; it does not apply a second discount. Application `answers.offerVersion`, `answers.offerSnapshot` and `answers.selectedTerritoryFee` retain the offer presented by the website adapter. These enquiry records are not signed fee schedules, and earlier snapshots are not rewritten to r3.

`getTerritoryAgreementExhibit` keeps geography in `territory` and puts the indicative catalogue charge in `currentOffer.baseFranchiseFee`. It no longer injects today's catalogue price into `territory.fee_minor` as though that were a contractual charge. `contractualPricing.status` is `agreement_schedule_required`; the signed fee schedule remains the source for an existing contract.

Deploy the forward migration together with the corresponding server/CRM release. Source changes alone do not confirm that the production database or public endpoint has been updated. This change configures and presents offer terms; it does not implement order metering, charge collection or a billing engine.

Run `network-expansion-pricing.test.mjs` for the original r2 fee reduction; `network-expansion-offer-r3.test.mjs` for service-term migration replay, unchanged prices/reservations/snapshots, history and new seeds; `network-expansion.test.mjs` for the full migration chain; and `network-expansion-public.node.mjs` for the public API, bootstrap, CRM/exhibit terms and stored-r2 versus stored-r3 distinction.
