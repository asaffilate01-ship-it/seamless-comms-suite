# Finvessa TreasuryOS Phase 8 — Forecast Accuracy & Evidence Quality

**Status: feature-branch build under review, no live finance execution.**

This phase introduces a real quantitative Treasury Analyst accuracy workflow. It consumes operator-supplied historic frozen forecasts and end-of-week actual cash positions, recomputes errors in exact currency minor units, reports source coverage and directional error, and generates a traceable analyst working paper.

The system DOES NOT certify that the forecast was truly frozen in the past or that actual bank cash statements are genuine. A historical CSV could be backfilled or altered. Therefore output always includes independentHistoricSnapshotVerified=false and warns of unverified ex-ante provenance, even when its error metrics fall within an operator-selected tolerance.

## Input contract

Historical forecasts CSV, supplied as local file or text, fields:

    snapshot_id,forecast_frozen_on,currency,week_end,baseline_closing,downside_closing

Actual cash CSV fields:

    actual_id,currency,week_end,closing_balance,evidence_as_of

Rules:
- All dates must be valid ISO calendar dates. Forecast frozen date precedes each week end; the week end falls within the following 91 days and is on or before the supplied evaluation date.
- All rows refer to one frozen snapshot (one ID and freeze date). For each currency/week, one forecast and one actual can be used. Duplicate actual IDs, duplicate comparison keys and inconsistent freeze claims are rejected, rather than arbitrarily matched.
- Actual cash evidence must be dated on or after the actual week end and no later than evaluation. Evidence freshness is asserted by the local operator, not independently proven by a bank API.
- Every supported ISO currency uses its exact minor-unit precision. GBP and EUR are separate analyses; no fabricated FX rate or cross-currency total.
- Missing actuals are not filled with zero, are omitted from numerical accuracy calculations and prevent the currency from passing a quality threshold.
- Unmatched actuals remain flagged. No source text, bank credentials, or analysis output is uploaded to the backend, an LLM, or third-party service.
- Operators choose an explicit maximum WAPE tolerance in basis points (0 to 10000), and minimum comparable weeks (2–13). These are user-defined modelling standards, not regulatory rules.

## Implemented measures

- Mean Absolute Error (MAE), rounded up by at most one ISO minor unit.
- Weighted Absolute Percentage Error (WAPE) in basis points = ceil(sum absolute forecast errors / sum absolute actual cash × 10000). If all actual balances are zero, WAPE is unassessed rather than divided by zero.
- Average signed error = forecast minus actual. Positive means cash is overestimated; negative means underestimation.
- Maximum absolute closing cash miss.
- Coverage of available actual weeks, with explicit missing and unmatched source-row evidence.
- Observed scenario-band hits = count of actuals between the downside and baseline forecast. This is descriptive, NOT a statistically calibrated confidence interval.
- Fail-closed result states: insufficient_evidence, review_required, within_operator_tolerance. The latter means only that the operator-specified numeric tolerance was met, never that actual bank data were independently authenticated.

## Operator experience

An authenticated Omniqora TreasuryOS user sees a new Accuracy & Forecast Backtesting panel. It loads a clearly labelled illustrative GBP/EUR 8-week synthetic history by default. For real historical CSVs, the active Finvessa tenant entitlement is mandatory. The operator can upload two CSV files, choose the evaluation date, tolerance and sample minimum, review currency-by-currency errors, drill into matched source-row IDs and download a Markdown analyst working paper or complete JSON evidence report.

The data remain entirely in browser memory in this milestone, consistent with the earlier file-import TreasuryOS phases. A future secure worker must independently notarise historic forecast snapshots, sign actual bank evidence, enforce account-level consent and only then produce a genuinely verified forecast performance study.

## Tests and staging requirements

Run:

    npm run test:treasury
    npm run build
    npm run typecheck
    npm run test:security
    npm run test:automotive-history

The new forecast accuracy regressions assert exact GBP/EUR MAE, WAPE, sign of cash errors, isolated currencies, zero denominator, missing weeks, duplicate/conflicting source IDs, unsafe amounts, future actuals, mismatched freeze dates, source-row disclosures and secure browser-local operation.

GitHub's wider checks also verify Omniqora's SaaS Factory and automotive history features. No migration is introduced in Phase 8, and no live or scheduled financial source is changed.

## Merge and go-live boundaries

Source conflict repair includes a normal Git merge of the latest Omniqora main commits into Phase 1 and propagates the merge through Phases 2–7 without rewriting Lovable history. Review all PRs and use the normal merge order before Phase 8. These merges are not a release, and the user must separately authorise production financial processing or a Lovable publish.

Future hard requirements: independently timestamped immutable forecast snapshots, authenticated bank actuals, verified source digests, encrypted tenant storage, consented read-only source integrations, tenant RLS negative tests, documented backtest cohort and baseline analyst benchmark. The platform cannot claim it outperforms professional treasury analysts before those tests exist.
