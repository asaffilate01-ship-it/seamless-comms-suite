# Implementation status and source precedence

This consolidation includes recovered source, a newly written server client, verified GitHub file exports and new integration guides. It does not claim the whole portfolio is connected, deployed or commercially ready. No GitHub changes or database migrations were applied during consolidation.

## Use the right source generation

| Package path | What it is | How to use it |
| --- | --- | --- |
| `development/rrci-handover/omniqora-update/` | Newer unfinished Regulatory, Risk & Compliance Intelligence implementation against Omniqora's actual TanStack/Supabase stack | Reconcile with current Omniqora. Complete and validate this bounded module; it already includes the earlier knowledge core. |
| `source/ai-intelligence-pilot/` | Broader AI, daily guide, BI, speech and reception pilot; source commit `64d877c3718033c3d8b51d34b77a880671` | Port using its original merge guide. This Vinext/Cloudflare D1/R2 service uses different authentication and storage from main Omniqora. |
| `reference/shared-knowledge-core-v0.2/` | Original self-contained text/RAG/graph service and optional Neo4j backend | Baseline/reference and local demonstration. Do not copy its older `app.py` over the newer RRCI version. |
| `services/ecosystem-core-v3/` | Separate ecosystem backend, membership/referral/linking/discount event source | Run once in a Python runtime, or keep as a separate repository. Apps receive only relevant adapters. Version 3 administration uses `web/`; `react/CentralAdmin.jsx` retains the older version 2 contract. |
| `reference/omniqora-full-suite-2026-08-22/` | Older full suite and phase-5 intelligence/workflow foundations | Selective reference/port source. Do not overwrite current Omniqora or the later pilot. Includes simulations and unconnected provider interfaces. |
| `repo-updates/seamless-comms-suite/pr-2/` | Five exact files from the merged portfolio-services update | Already merged in Omniqora; this does not mean the broad AI pilot or RRCI work was merged. |
| `adapters/omniqora-server-client/` | New server-only client for queueing pilot runs and reconciling approved internal tasks | Six local contract tests passed. App auth, durable queue and actual deployment remain integration work. |

The RRCI root `START_HERE.md` is the later handover and takes precedence over inherited v0.2 README/evidence claims for governance features. The older core remains inside it as a dependency. Keeping both source archives preserves history; it is not an instruction to deploy two competing knowledge services.

## Capability matrix

| Requested capability | Included implementation | Remaining work before claiming it is live |
| --- | --- | --- |
| Agentic AI and A-to-Z guidance | Ten agent templates, seven journey stages, bounded model tool loop, review controls, internal tasks and audit in pilot | Main-app port, a real provider configuration, tested SaaS execution adapters and background processing |
| Generative AI | Pilot Responses API runner; optional Ollama generation/embeddings in knowledge service; legal drafting source in Lawquo PR1 | Evaluate actual models and approved data, connect host model interface, review output, configure deployment |
| Welcome to your day | Personal check-ins, unfinished work, priorities, blockers, manual meeting status and follow-up drafts | Live calendar/email/notification integrations and scheduling; morning briefs currently refresh in the UI |
| Financial intelligence | Imported accounts, contribution/P&L arithmetic, balance snapshots, cash commitments and scenarios | Authoritative ledger/bank adapters, reconciliation and model evaluation; no forecast balance sheet is implemented |
| Forecasts and granular KPIs | Weekday sales baseline/backtest, location/currency separation, scenario controls | Transaction/SKU feeds, finer KPI dimensions, forecast versioning and stronger models; ±15% scenario bands are not confidence intervals |
| Stock and expiry | Lot-level stock coverage, reorder review and FEFO risk using imports | Live inventory/recipe/supplier delivery data and approved purchasing actions |
| HR, rotas and training | Imported coverage/skill gaps and training/compliance register | Availability/contract checks, rota optimisation/publication, HRIS/LMS connections; no autonomous employment decisions |
| Reception, speech and recognition | Reviewed dictation, transcription endpoint, scoped number matching, history, previous/preferred human and order/booking intake | Carrier/voice integration, availability, warm transfer, source CRM sync and live speech provider validation |
| Online orders and KDS | Source-receipt-gated reception handoff contract | Actual order/booking/EPOS adapter and KDS acknowledgements; online orders should use their existing deterministic path |
| RAG and graph retrieval | BM25, optional embeddings, citations, reviewed graph relationships and bounded graph/hybrid retrieval | Real source ingestion, evaluation, PDF/OCR and authorised provider sync |
| Neo4j | Native storage and Cypher traversal in v0.2 core; backend remains available in RRCI tree | New governed queries currently use a filtered snapshot and Python traversal; governed native Cypher and live governance/Neo4j tests are incomplete |
| RRCI governance | Source ranks, subject allowlists, ordered sync receipts/tombstones, relationship review, outage policy, action approval/claim and audit chain | Source authority failure rules, provider ACL discovery, worker/reconciliation, independent audit retention, real executor and receipts |
| Omniqora RRCI add-on | Host interfaces, authenticated server functions, tenant/module membership and entitlement draft migration | Workspace UI/navigation, membership/billing provisioning, isolated migration/RLS tests and real host adapters |
| Third-party customers | Workspace/product boundaries, configurable plans, reusable connectors and ecosystem backend foundations | Onboarding/SSO where required, billing/usage enforcement, support/operations and contracted deployment; no paid activation is created |

## Exact RRCI boundary

The ordinary v0.2 `/v1/query` adapter does not apply RRCI subject-level ACLs, authority decisions or action review. For governed enterprise content, complete the RRCI host facade and its `/v1/rrci` path. Do not expose legacy collection-reader credentials as a substitute for the governed path. The supplied per-SaaS query panel/client remains the original v0.2 integration source.

The RRCI draft's SQLite governance database and selected index backend are separate stores. Crash consistency, retry/supersession, physical deletion/retention and source permission changes need further tests. An action claim is not an executed external action. A hash-chained application audit is not certified immutable storage. This code does not use Microsoft's GraphRAG framework or automatically build community summaries.

The draft host migration changes existing tenant creation/membership policy as well as adding module tables. Review `src/lib/tenant.functions.ts` and the migration together. Test on an isolated database before applying to existing users. The original handover explicitly leaves existing membership auditing unfinished.

## Verification performed for this delivery

- All recovered ZIPs passed CRC checks and path-safety inspection.
- 263 GitHub changed files from 31 PRs matched the Git blob hashes at their immutable PR head commits.
- Original knowledge-core suite: 60 discovered, **29 passed / 31 skipped** locally; live Neo4j was not configured in this consolidation.
- Newer RRCI suite: 74 discovered, **43 passed / 31 skipped** locally; includes 14 governance tests. Current output is included under `verification/`.
- New Omniqora server client: **6 contract tests passed** using a fake HTTP transport.
- Existing historical TypeScript/build/live-Neo4j evidence is retained in its original source folders. It was not rerun against every app or the new governance/Neo4j combination.
- No migration, carrier call, payment, live LLM, production deployment or end-to-end multi-app workflow was exercised here.

## Financial-adviser and learning update — 15 September 2026

The later addition is in `development/adviser-learning/`. It includes the new local decision journal, reviewed lesson and evaluation utilities, portfolio/meeting/follow-up helpers, and 59 current ZaksTrader reference files. Read `docs/FINANCIAL-ADVISER-AND-LEARNING.md` and the extension's `START-HERE.md`. Seventeen new local tests passed. The adviser UI, live providers and shared host wiring remain to be implemented. This addition does not activate trading or autonomous model updates.
