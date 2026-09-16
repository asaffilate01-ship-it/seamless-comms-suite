# Financial adviser and shared learning extension

Added 15 September 2026 to Amer Saleem's Omniqora consolidation. This contains new runnable local utilities, reviewed ZaksTrader source and the integration plan for the wider suite. It has not been pushed, deployed or connected to a real client, CRM, custodian, model or broker.

## What was added

| Area | Included now | Further integration |
| --- | --- | --- |
| Adviser portfolio review | Long-only, integer-value holdings review; direct concentration, asset-class totals, currency separation and missing/stale-data flags | Custodian feeds, reconciliation, issuer/fund look-through, performance/risk calculations and professional review UI |
| Client preparation | Sourced fact-find summary, missing/review-due fields, open actions and meeting agenda | Real CRM/calendar/document connectors and client-level access mapping |
| Follow-ups | Unsent draft from explicitly confirmed meeting actions, owners and dates | Adviser approval UI, approved send/CRM outbox and delivery receipts |
| Decision reasoning | Scoped, immutable version/evidence snapshots; supporting/opposing reasons and unknowns captured before outcomes | Wire actual agent/tool runs and current source permissions; these are concise evidence summaries, not hidden model reasoning |
| Feedback and lessons | Verified-outcome checks, deterministic residual/error review, independent exact-proposal review, version/expiry/source-invalidation rules | Provider receipts, reviewed outcome corrections, host approval UI and durable sync |
| Candidate evaluation | Paired baseline/candidate metrics, source availability/time checks, scope/version/ID separation, no automatic activation | Training, purged rolling validation, holdout-use registry, shadow monitoring and production rollout |
| Trading reuse | 59 selected files checked against ZaksTrader's current main commit | Selective adaptation; trading models, broker routes and schema stay in ZaksTrader |

Run the local implementation from `services/decision-intelligence/` with `python -m unittest discover -s tests -v` and `python demo.py`. Seventeen tests passed in this delivery. The fictional demo output is in `examples/`.

Read `docs/ADVISER-WORKFLOWS.md`, `docs/ZAKSTRADER-REUSE-REVIEW.md`, `docs/LEARNING-AND-GRAPH-CONTRACT.md` and `docs/PRODUCT-ADOPTION.md` before integration. The workflow JSON is a proposed registration contract; existing Omniqora does not automatically load it.

## Where the files belong

| Destination | Files and responsibility |
| --- | --- |
| Existing Omniqora repo `asaffilate01-ship-it/seamless-comms-suite` | Add/adapt `services/decision-intelligence/` as a server module. Build an adviser workspace through the existing host identity/entitlement interfaces. Call the RRCI governed facade for restricted evidence. |
| ZaksTrader repo `asaffilate01-ship-it/remix-of-market-mind-intelligence-34` | Retain its trading models, feature/outcome stores, execution controls and promotion logic. Implement a minimal scoped decision/outcome bridge; the included reference tree is an inspection snapshot, not a complete app/update patch. |
| Other SaaS products | Add server-side outcome/source mapping and review views appropriate to the product. Keep their business decisions, permissions and databases authoritative. Do not copy ZaksTrader trading migrations into unrelated products. |

## Reference behind the request

The supplied newsletter tracking URL did not resolve through available access. Its description matches [Anthropic's official Claude for Financial Advisors announcement](https://claude.com/blog/claude-for-financial-advisors), dated 14 September 2026. That announcement describes connecting advisory systems and using workflows for preparation, portfolio analysis and compliance review. Anthropic's [workflow walkthrough](https://www.anthropic.com/webinars/inside-claude-for-financial-advisors) also describes reviewing follow-ups and CRM changes before approval. These are product references, not installed integrations or claims about Omniqora's current capabilities.

The adviser module is part of Omniqora first. TaxNuvia can link an authorised firm into it for the services that firm actually offers; its existing accountant directory should not be presented as a licensed investment-adviser system merely by adding AI.
