# Omniqora AI Core Operating Model

## Principle

AI is the operating intelligence layer across Omniqora, but not the sole execution mechanism.

Use the right engine for the right job:

- LLM/GenAI for understanding, drafting, summarising, question answering and structured proposals;
- RAG for grounded retrieval from authorised evidence;
- GraphRAG for bounded relationship/dependency discovery;
- predictive models for ETA, churn, propensity, anomaly and forecast use cases where validated;
- optimisation algorithms for routing, dispatch, allocation and scheduling;
- deterministic rules for permissions, pricing arithmetic, compliance gates, entitlements and state transitions;
- human approval for consequential regulatory, financial, legal, safety or externally binding actions.

## Shared AI control plane

Every AI-enabled module should use the same:

- tenant and workspace identity;
- model/provider registry;
- data-sharing policy;
- evidence permissions;
- prompt/instruction version;
- tool/action allowlist;
- approval policy;
- usage/budget ledger;
- evaluation framework;
- audit trace;
- stop/suspend mechanism;
- source/citation model.

## AI across the platform

### CRM
- customer/company summaries;
- lead scoring and qualification suggestions;
- next-best action;
- meeting/call/email summaries;
- opportunity risk;
- churn/repurchase signals;
- deduplication proposals;
- natural-language search.

### Connect / Reception
- intent understanding;
- conversation summaries;
- multilingual assistance;
- caller/customer context retrieval;
- draft responses;
- handoff context;
- guarded order/booking intake through source-system adapters.

### Compliance
- regulatory copilot;
- evidence mapping;
- application drafting;
- gap analysis;
- policy/procedure drafting;
- inspection/interview simulation;
- correspondence/RFI assistance;
- ongoing obligation monitoring.

### Business360 / M&A / Carve-out
- discovery questions;
- source/evidence analysis;
- dependency explanation;
- diligence synthesis;
- TSA/Day-1 gap analysis;
- risk and remediation proposals;
- board/SteerCo briefs;
- scenario narrative;
- benefits evidence review.

### Geo / Routing
- AI may forecast traffic/ETA uncertainty, demand and service time;
- route feasibility and optimisation remain deterministic/optimisation-engine outputs;
- AI must not invent coordinates, distances or completed journeys.

### Dispatch / Fleet
- assignment recommendations;
- predicted delay/failure risk;
- capacity/demand forecasting;
- exception explanation;
- driver/fleet anomaly detection;
- optimisation engine remains authoritative for hard constraints and chosen objective.

### Marketplace
- listing enrichment;
- semantic search;
- matching/recommendations;
- fraud/anomaly signals;
- supplier/vendor assistance;
- pricing suggestions where appropriate;
- order/payment/commission state remains deterministic.

### Sales / Journeys / Feedback
- audience/segment suggestions;
- copy generation;
- channel/time recommendations;
- sentiment;
- churn/propensity;
- journey branch suggestions;
- human/tenant policies control consent, frequency caps and sending.

## Agentic AI

Agents should operate through typed tools, not arbitrary database/network access.

Each agent run should bind to:

- tenant/workspace;
- goal;
- role/profile;
- permitted evidence;
- permitted tools;
- model/version;
- budget;
- step limit;
- policy revision;
- input version;
- approval requirements.

Agents can research, draft, reconcile, propose and execute narrowly authorised actions. They must re-check current permissions and entitlements immediately before side effects.

## Production rule

No AI-generated statement becomes a source-of-truth fact merely because a model produced it. Source records, verified provider responses, deterministic calculations and authorised human decisions remain authoritative.