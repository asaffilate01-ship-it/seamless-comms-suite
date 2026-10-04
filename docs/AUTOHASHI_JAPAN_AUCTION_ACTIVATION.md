# AutoHashi Japan Auction Activation

Status: implementation-ready foundation. Live provider inventory and auction execution stay disabled until contracted credentials and tenant mappings are configured.

## 1–10 delivery status

| # | Workstream | Current status | Activation gate |
|---|---|---|---|
| 1 | Compare Japanese inventory feeds | Built: TheCarApi + CarStack read-only adapters and side-by-side comparison function | Obtain both provider credentials and run the same 50–500 vehicle search sample |
| 2 | Omniqora auction provider adapter | Built | Configure active provider binding/secrets |
| 3 | AutoHashi auction UI → Omniqora | Built on AutoHashi PR branch: signed bridge + local read-only projection | Deploy both migrations/functions and add fixed tenant mapping |
| 4 | Intelligence, provenance, max bid | Built: canonical chassis identity, 90-day history, mileage-regression flag, auction AI queue, explicit GBP→JPY max-bid conversion | Enable intelligence worker and provide reviewed cost/FX inputs |
| 5 | Japan-side execution partner | Manual Japan-desk queue built; no auction-house transmission is claimed | Sign an exporter/auction-member agreement |
| 6 | Execution API/webhooks | Provider capability contract and bid queue built | Map the selected partner's actual API/webhook contract; do not invent endpoints |
| 7 | AutoHashi Japan / AUCNET / i-AUC | Architecture/catalogue prepared | External legal/commercial work: Japanese base/entity/branch, secondhand-dealer licence, bank/invoice requirements and provider screening |
| 8 | Direct USS route | Architecture/catalogue prepared | USS membership eligibility and authorised system-access agreement |
| 9 | Reconcile AutoHashi existing PR | Changes are being added to the existing ecosystem branch, not a parallel workflow | CI must be green before merge |
| 10 | Secrets/security | AutoHashi branch removes tracked .env; CI rejects tracked env files; browser never receives auction credentials | Rotate any credential that was ever committed; deploy secrets into server secret stores |

## Provider boundaries

Read-only providers:
- vehicle.japan.thecarapi — inventory/detail/images/history capabilities only.
- vehicle.japan.carstack — inventory/detail/images/makes/filters capabilities only.

Execution providers:
- vehicle.japan.agent — first operational route; manual or API-backed Japan-side execution partner.
- vehicle.japan.aucnet — future authorised direct integration.
- vehicle.japan.iauc — future authorised direct integration.
- vehicle.japan.uss — future authorised direct integration. No public USS developer API is assumed and screen scraping is prohibited by design.

Read-only providers never advertise bid.submit.

## Server credentials

Omniqora provider secrets remain server-side:
- THECARAPI_API_KEY
- optional THECARAPI_BASE_URL (default https://api.thecarapi.com)
- CARSTACK_API_TOKEN
- optional CARSTACK_BASE_URL (default https://carstack.dev/v1)

AutoHashi bridge secrets:
- OMNIQORA_AUTOMOTIVE_URL — deployed Omniqora /api/automotive/auctions endpoint
- OMNIQORA_SERVICE_KEY_ID
- OMNIQORA_SERVICE_SECRET

Matching Omniqora service scope must be limited to the AutoHashi tenant/product and these capabilities:
- automotive.auctions.read
- automotive.auctions.sync
- automotive.auctions.bid.request

Generate the plaintext service secret outside the database. Store only its SHA-256 hash through the existing platform_set_service_credential control-plane function.

## Fixed tenant mapping

AutoHashi must have one active platform_tenant_mappings row for destination=omniqora. Browser callers cannot choose another tenant. The bridge resolves AutoHashi tenant → fixed Omniqora tenant → autohashi product.

## Inventory flow

1. AutoHashi operator chooses a read-only provider and filters.
2. AutoHashi Edge Function authenticates the user and fixed tenant mapping.
3. Edge Function calls the signed Omniqora automotive endpoint.
4. Omniqora calls the provider using a server-only key.
5. Provider data is normalised into automotive_auction_lots.
6. Exact Japanese chassis/frame number links repeat auction appearances to the canonical automotive_vehicles record when available.
7. AutoHashi receives a safe projection in auction_feed_lots.
8. A provider record is never treated as a verified hammer result unless that provider contract actually supplies one.

## Side-by-side feed evaluation

Run compareJapanAuctionProviders using identical filters after both provider credentials are configured. Compare sample size, exact chassis coverage, grade coverage, images, auction house/date, model code, response latency and exact-chassis overlap. Start at 50 lots for field mapping, then repeat with 100–500 lots before choosing the primary source.

## Intelligence and max bid

A selected lot can queue automotive.auction_assessment for auction-sheet consistency, visible condition, mileage history, relisting, grade consistency and bid risk. AI findings are proposals and cannot approve compliance or execution gates.

The bid model keeps settlement and source currencies separate. For GBP settlement and JPY source, fxRate means JPY per GBP. max_bid_minor is the safe GBP purchase budget; max_bid_source_minor is the converted JPY ceiling. If FX is missing, the source ceiling stays unavailable rather than being guessed.

## Bid execution flow

1. Create a draft from a synced lot.
2. Require a positive reviewed maximum JPY bid.
3. Authorised AutoHashi admin calls bid_queue.
4. Signed Omniqora runtime creates automotive_auction_bid_requests.
5. Status starts as pending_partner.
6. Response explicitly reports transmittedToAuctionHouse=false.
7. Only a contracted Japan-side provider can later move it to submitted/accepted/won/lost.
8. AutoHashi mirrors execution status; ordinary browser users cannot write provider-result fields.

## External Japan membership gates

AUCNET's current exporter material states that buying through its platform requires a company/branch registered in Japan and a Japanese secondhand-dealer licence. Current AUCNET membership material also lists a Japanese business base, bank account and qualified invoice registration.

USS's current membership page requires, among other conditions, Japanese corporate registration for corporations, full-time Japanese-speaking staff, a used-vehicle dealer licence held for at least one year, qualified invoice registration and guarantor/SS arrangements. USS CIS internet participation is for USS members.

Official references:
- https://info.aucnet.co.jp/am-exp-en-iauc.html
- https://info.aucnet.co.jp/am-trial-en-ad2601.html
- https://www.ussnet.co.jp/en/application/index.html
- https://www.ussnet.co.jp/en/auction/outline/index.html

## Go-live order

1. Merge Omniqora provider/runtime changes after CI.
2. Deploy Omniqora migration and automotive endpoint.
3. Configure one read-only provider key in staging.
4. Create scoped Omniqora service credential.
5. Deploy AutoHashi migration and omniqora-auction-bridge.
6. Add fixed AutoHashi→Omniqora tenant mapping.
7. Configure bridge secrets.
8. Run 50-lot provider smoke test.
9. Run 100–500 lot provider comparison.
10. Validate canonical vehicle/relisting history.
11. Queue AI assessment on selected lots.
12. Validate reviewed GBP→JPY max-bid model.
13. Test bid authorisation; confirm pending_partner and transmittedToAuctionHouse=false.
14. Only after a Japan-side contract exists, map its actual execution API or documented manual desk procedure.
15. Run staging acceptance before production credentials are issued.
