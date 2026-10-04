# AutoHashi Auction Intelligence v3

Status: implemented decision-support architecture. Human review remains mandatory.

## Decision chain

`provider lot → structured sheet extraction → auction history → UK market evidence → reviewed bid economics → deterministic score → human review → bid approval`

The AI/vision worker does not produce an authoritative BUY action. It produces a typed auction-sheet extraction. Omniqora recalculates the score from stored evidence and sets the intelligence job to `waiting_review`.

## Worker contract

Edge Function: `automotive-auction-intelligence-worker`

Authentication:

- header: `x-omniqora-worker-secret`
- secret: `OMNIQORA_INTELLIGENCE_WORKER_SECRET`
- minimum 32 characters

Actions:

- `claim` — atomically claims the next queued `automotive.auction_assessment` job.
- `complete` — submits a structured extraction conforming to `autohashi-auction-sheet-v1`.
- `fail` — retries up to the bounded attempt policy, then marks the job failed.

The worker receives provider sheet data/image references, historical auction observations, UK comparable evidence and the current reviewed cost model.

## Evidence rules

- Asking prices and completed-sale prices are stored as different evidence types.
- A missing or low-confidence sheet extraction cannot produce an automatic BUY.
- Unreadable fields must be null/unknown, not guessed.
- Chassis, mileage and grade must be preserved even when they disagree with the provider listing.
- A new extraction, market sync or bid-economics recalculation supersedes the previous approved decision.
- If finance/admin approval existed but has not yet been submitted, new intelligence evidence revokes that finance approval and requires re-approval.

## Hard-stop examples

The deterministic engine currently treats evidence such as declared flood damage, material mileage regression, chassis mismatch, questionable odometer evidence, unresolved major structural repair, unresolved airbag/SRS issues, margin below target, or a bid above the reviewed safe maximum as DO NOT BID blockers.

These are decision-support controls, not a substitute for qualified inspection, legal/tax classification or mechanical advice.

## Human review

AutoHashi sends `intelligence.review` through the signed bridge. Only compliance/admin roles can approve or reject the decision.

An approved DO NOT BID decision remains a bid blocker. Financial/admin bid approval requires an approved intelligence decision whose recommendation is BUY or REVIEW.

## Production activation

1. Apply migration `20261004213000_automotive_auction_intelligence_v3.sql`.
2. Deploy `automotive-auction-intelligence-worker` and the updated auction gateway.
3. Configure `OMNIQORA_INTELLIGENCE_WORKER_SECRET`.
4. Connect an approved vision/model worker to claim/complete jobs.
5. Test unreadable sheet, chassis mismatch, mileage rollback, flood, clean vehicle and stale-approval scenarios.
6. Confirm UK asking and completed-sale evidence remain separately labelled.
7. Keep live Japanese auction execution gated independently by the auction-agent controls.
