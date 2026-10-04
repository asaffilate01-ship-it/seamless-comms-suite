# AutoHashi Auction Learning & Watches v4

Status: implementation complete in code; deployment/provider credentials remain activation steps.

## Scope

v4 adds four layers on top of Auction Intelligence v3:

1. **Human correction learning** — a reviewer can correct a structured auction-sheet extraction. The original AI extraction remains immutable evidence and the corrected human extraction becomes a new approved evidence record.
2. **Hammer-price calibration** — verified auction wins create price outcomes; predictions are calibrated against the actual hammer and retain absolute/error-percent evidence.
3. **Auditable price curves** — hierarchical median/p25/p75 snapshots are stored by make/model/model-code/year/grade/mileage context.
4. **Saved auction watches** — scheduled feed scans can filter new Japanese lots, estimate a hammer range, queue sheet intelligence where an evidence-score threshold is requested, and create qualified opportunity matches.

None of these layers can submit or authorise an auction bid.

## Production vision runner

Edge Function: `automotive-auction-vision-runner`.

The runner:
- claims bounded batches from `automotive-auction-intelligence-worker`;
- sends the strict schema/current evidence to one configured HTTPS vision-provider endpoint;
- supplies recent human corrections as **reference-only examples**;
- explicitly instructs the provider that it has no purchase or bid authority;
- completes or fails the underlying Omniqora job through the existing typed worker contract.

Required secrets:
- `AUTOHASHI_AUCTION_VISION_RUNNER_SECRET`
- `AUTOHASHI_AUCTION_VISION_PROVIDER_URL`
- `AUTOHASHI_AUCTION_VISION_PROVIDER_TOKEN` when the configured provider requires one
- `OMNIQORA_INTELLIGENCE_WORKER_SECRET`

GitHub schedule: `.github/workflows/autohashi-auction-vision.yml`. It safely skips when deployment URL/secret values are absent.

## Learning corrections

Correction action: `learning.correct_extraction`.

Only compliance/admin roles may submit corrections. Allowed fields are validated server-side. Unknown enum values, invalid odometer values, malformed booleans or arrays are rejected.

A correction:
- writes `automotive_auction_review_corrections`;
- supersedes the prior extraction without deleting it;
- creates a new human-source extraction at confidence 1;
- recalculates the deterministic v3 decision;
- invalidates stale intelligence and unsubmitted finance approval;
- becomes a reference example for future extraction jobs.

Future workers receive up to 20 recent correction examples with a hard instruction never to copy values that are not visible in the current auction evidence.

## Hammer prediction

Prediction method version: `hierarchical-median-v1`.

The predictor looks back up to 730 days and selects the first sufficiently populated hierarchy:

1. exact model code + year + grade + 20,000 km mileage band (minimum 3 outcomes);
2. make/model + year + grade + mileage band (minimum 3);
3. make/model + year ±1 + grade (minimum 5);
4. make/model + year ±2 (minimum 7);
5. otherwise insufficient data.

The prediction is the median verified hammer, with p25/p75 as the displayed range. Confidence combines sample size and hierarchy specificity. No synthetic age/mileage price adjustment is invented.

A verified `auction.bid.won` webhook writes a hammer outcome and calibrates any open prediction for that lot.

## Saved-search watches

Canonical tables:
- `automotive_auction_watch_rules`
- `automotive_auction_watch_matches`

Worker: `automotive-auction-watch-worker`.

Supported rule criteria:
- make/model/model code
- year min/max
- minimum auction grade
- maximum odometer
- maximum opening bid
- maximum predicted hammer
- minimum **pre-bid evidence score**

The watch evidence score uses condition (45%), provenance (40%) and evidence (15%). It intentionally excludes market/economics because a newly discovered lot has not yet completed the bid-cost review.

If a rule requires a score but the lot has no sheet decision yet, the match becomes `pending_intelligence` and the worker queues the v3 sheet assessment. A future watch run can then qualify or disqualify it.

The watch worker:
- processes at most 50 rules per scheduled run;
- pages feed results up to each rule's configured cap;
- honours hourly/daily cadence;
- records qualified/pending/disqualified stages;
- never references bid submission or bid-authorisation tables;
- deduplicates unchanged price-curve snapshots within 24 hours.

GitHub schedule: `.github/workflows/autohashi-auction-watches.yml`.

## Deployment sequence

1. Apply `20261004223000_automotive_auction_learning_v4.sql`.
2. Deploy the updated auction gateway and agent webhook.
3. Deploy `automotive-auction-vision-runner`.
4. Deploy `automotive-auction-watch-worker`.
5. Configure v3/v4 worker/provider secrets.
6. Configure GitHub deployment secrets:
   - `AUTOHASHI_AUCTION_VISION_RUNNER_URL`
   - `AUTOHASHI_AUCTION_VISION_RUNNER_SECRET`
   - `AUTOHASHI_AUCTION_WATCH_WORKER_URL`
   - `AUTOHASHI_AUCTION_WATCH_WORKER_SECRET`
7. Run clean, flood, mileage-rollback and human-correction fixtures.
8. Seed or accumulate verified hammer outcomes and verify prediction confidence/ranges.
9. Create an hourly watch and validate candidate → pending intelligence → qualified.
10. Confirm qualified matches appear in the existing AutoHashi notification bell.
11. Confirm none of the v4 workers can authorise or submit a bid.


## SaaS Factory tenant mapping

Interactive AutoHashi auction actions are multi-tenant. The signed bridge carries the authenticated AutoHashi tenant ID, and Omniqora resolves it through:

- `tenant_products.product_key = 'autohashi'`
- `tenant_products.external_tenant_id = <AutoHashi local tenant UUID>`
- tenant-product status in `requested | provisioning | active`

Exactly one mapping must exist. Missing or ambiguous mappings fail closed.

Scheduled auction watches iterate enabled AutoHashi tenant-product mappings independently. A manual watch run carries the already-resolved Omniqora tenant ID to the worker.

The signed Japan-agent webhook does not rely on a global tenant mapping: it resolves the authoritative bid instruction first and takes `tenant_id` from that instruction. Ambiguous provider references fail closed.

`AUTOHASHI_OMNIQORA_TENANT_ID` remains only as a legacy fallback for a request that has no external AutoHashi tenant context. It is not used to override a missing mapping for an authenticated external tenant.
