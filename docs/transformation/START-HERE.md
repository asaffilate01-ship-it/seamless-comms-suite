# Omniqora Enterprise Transformation and Product Intelligence

Updated 16 September 2026. Version 0.3.0 — executable development package.

This package extends the inspected Omniqora architecture with transformation delivery, financial intelligence, technical intelligence, product discovery and controlled AI workflows. It is not deployed, pushed to GitHub or connected to your customers' enterprise systems.

The current host inspected was `asaffilate01-ship-it/seamless-comms-suite`, commit `0d49bc85c4309c3b1160d0a10c15fe3e4aaa69c0`, using TanStack Start, React 19 and Supabase. The new files are additive. Earlier RRCI, enterprise-AI and adviser-learning packages remain separate; this package does not replace them.

## What is executable

| Capability | Included implementation |
| --- | --- |
| AI provider and agent hub | Six provider adapters (OpenAI, Azure OpenAI, Claude, Gemini, Bedrock, Ollama); six model-driven specialist profiles; project-bound model routes, data-sharing controls, usage limits, durable runs, citations and task proposals. Contract-tested, no live provider claims. |
| Scoped read connectors | Microsoft Graph metadata, GitHub repository/issues and a fixed JSON feed; snapshots with explicit review/ingestion. No automatic production changes or complete synchronisation. |
| Company discovery and planning | Multiple companies, company/asset/workforce baselines, target ownership, objectives, current/target/transition costs, reviewed asset dependencies and transaction scope. Versioned preparation, Day-1 and 100-day plans, extended horizons, gap detection, budget checks, proposed owners and independent review. |
| Partner and direct advisory models | Embedded delivery mandates, lead adviser/client/partner responsibilities, direct advisory, technical diligence findings, TSA obligations/exit roadmap and evidence-linked decision records. |
| Six technical delivery domains | ERP/processes; identity/workplace; cloud/networks; security/GCC control assurance; software/integration; data/BI. Six workstreams and 36 editable acceptance checkpoints. |
| Project and adviser delivery | Restricted project membership, engagement/branding records, two-week diagnostic task template, tasks, risks, deliverables, runbooks and migration waves. |
| Technical intelligence | Reviewed dependency graph, prerequisite migration order, downstream impact, cycle detection, readiness rules and TSA exposure. |
| Financial intelligence | Immutable entry imports, explicit FX provenance, budget/actual/remaining forecast, management cash reporting, scenario cashflows, NPV, ROI, payback and TSA delay costs. |
| Reconciliation and benefits | Per-account/data-line amount and count checks; extract manifest references; baseline/actual comparisons; independent finance review; double-attribution protection; audit trail. |
| RAG and GraphRAG | Existing shared knowledge core snapshot, document revisions, source citations, reviewed graph edges, temporal filters, SQLite or optional Neo4j backend. |
| Generative AI | Multi-provider specialist hub plus the existing optional Ollama evidence generation/embeddings path. No model is enabled by default. Source references are checked; output remains a draft. |
| Agentic workflows | Model-selected, allowlisted tools in specialist runs; existing rules-based readiness agent; explicit modes, independent action approval, stale-input rejection, pause/cancel and idempotent internal execution. |
| Product intelligence | Research/JTBD records, PRDs and specifications, RICE grouped by reach period and population, MoSCoW, stories, sprints/capacity, roadmap release targets, UAT/release gates, GTM records, competitor evidence and cohort adoption calculations. |
| User interface | Responsive React workspace; authenticated TanStack route and server function; all principal workflow sections connected to the Python service. |

## Run the example and tests

Python 3.11+ is recommended. The default SQLite/evidence mode uses the standard library.

```bash
cd omniqora-update/services/transformation
python3 demo.py
python3 -m unittest discover -s tests -v
PYTHONPATH=vendor python3 -m unittest discover -s vendor_tests -v
```

`demo.py` uses fictional data in a temporary database, makes no network calls and prints a complete example. `examples/fictional-snapshot.json` includes its company plan. `examples/company-intake.json` contains the corresponding intake records. Do not treat its numbers as business forecasts.

Start with `docs/COMPANY-PLANNING.md` for the multi-company intake, Day-1 planning, cost assumptions, embedded delivery and direct advisory workflow. The plan generator uses deterministic rules and flags unknowns; generation does not certify completeness, approve a cutover or automatically execute its proposed tasks.

Read `docs/AI-LAYER-SETUP.md` to activate providers, route specialists, bind connectors and run the first live pilot. The **AI & connectors** tab works through the new signed RPC commands. Operator credentials and approved model/source access are required for live calls.

Read `docs/INTEGRATION.md` before merging. Read `docs/CAPABILITY-STATUS.md` before representing this as a commercial product. The Python service needs its own runtime; it does not run inside a Lovable browser bundle or Supabase Edge Function.

## What remains before a live pilot

Deploy and secure the Python runtime; configure its signing key and the host URL; merge and build the authenticated route against the current host; provision an approved Neo4j environment and model if desired; run real-user/project isolation and restore tests; connect one approved source system; validate with a domain expert.

Live Oracle/SAP/Workday cloning, Microsoft 365 migrations, cloud changes, email/Slack/WhatsApp delivery, payments, audit certification, licensed control libraries and automatic production deployments are not implemented here. They require system-specific connectors, permissions, licences, migration tools and supervised acceptance testing. The current agents execute internal tasks and reports only.

See `verification/RESULTS.md` for the checks actually run and the live-environment tests not run.
