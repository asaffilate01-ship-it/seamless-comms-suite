# Decision intelligence — local integration kernel 0.1

Python 3.11+; standard library only. From this directory:

```bash
python -m unittest discover -s tests -v
python demo.py
```

This is a new local kernel, informed by the inspected ZaksTrader mechanisms. It is not its numerical trading model, a deployed API, an authenticated app or an automatically learning production system. The demo uses fictional data, a controlled clock and a disposable local database.

## What runs

- SQLite journal with company/product/collection scoping, permission checks, server-clock capture, versioned evidence/reason snapshots and duplicate/conflicting-request handling.
- Source-receipted outcome recording and deterministic prediction-error review. Missing/disputed results cannot support an approved lesson.
- Lesson proposals bound to exact task/model/prompt/rule versions. Independent review binds the exact proposal hash; expiry and source invalidation remove lessons from retrieval.
- Offline paired binary evaluation with chronological availability checks, training/holdout ID separation, explicit dataset scope/model versions, Brier/log-loss/calibration metrics and no automatic promotion.
- Deterministic long-only portfolio observations, meeting briefs and unsent follow-up drafts.

## Trusted host boundary

`Access` must be built inside an authenticated backend after verifying session, firm, product, client/collection membership, current source permissions and entitlement. It is not a token, and accepting an Access object directly from a browser would not authenticate anyone. Every read/write is scoped, but people holding direct database access can read the database. Deploy behind the existing verified Omniqora/SaaS server boundary; there is intentionally no unauthenticated demo web server.

Use a collection per authorised client/case boundary. For independently permissioned documents, invoke the RRCI subject/source facade before generating a brief or returning lesson context. A source change/revocation must trigger `invalidate_source`; recheck permissions before displaying results or sending approved context to a model. This kernel does not discover provider permissions or guarantee a multi-service in-flight revocation protocol.

`record_decision` captures now using the trusted server clock. It has no backdated historical-import API. The injectable clock exists for tests only. Historical ZaksTrader imports need a reviewed adapter that verifies original pre-outcome snapshot provenance; do not backdate new snapshots and call them prospective evidence.

Outcome quality is a trusted source adapter's assertion. This kernel does not independently contact a custodian, verify a meeting transcript or authenticate the external receipt. It requires an explicit measurable outcome definition when a probability is supplied. A trading loss is not automatically a software mistake, and agreement with a client is not proof that advice was suitable.

## Integration boundaries still to build

Host endpoints/UI, database migrations/RLS for hosted Postgres, billing, provider/CRM/custodian ingestion, durable sync/retry workers, source ACL discovery, physical retention/deletion, reviewed outcome supersession and independent audit storage are not implemented here. The SQLite audit table is a local application record, not certified immutable storage. Decision payloads may contain client information and need the same retention/access policy as the source records.

Evaluation callers must provide immutable predictions made before outcomes and one explicit dataset scope. The checks reject some leakage mistakes; they cannot prove an external dataset was never inspected, selected repeatedly or manipulated. Use ZaksTrader's governed version/promotion patterns with purged time windows and a holdout-use registry when implementing training. A passing comparison only permits independent review; it neither trains nor activates a model. No weights, prompts, business policies or external systems are rewritten by this module.

Approved lessons are bounded, attributed context to review. Treat their text as untrusted data, never as higher-priority instructions or tool permissions. One reviewed lesson can flag a known source mapping issue; it does not establish statistical performance. Model promotion needs larger representative evaluation and fresh shadow evidence.

Portfolio values are integer minor units and remain separated by currency. Missing values remain missing. Direct-instrument concentration is calculated within the known supplied values of each currency; it is not full portfolio diversification or fund look-through. The caller must provide the firm's review threshold. This version does not calculate performance, suitability, short/leverage exposure, tax or trades.
