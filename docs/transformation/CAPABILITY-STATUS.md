# Capability status and next implementation boundaries

## Company planning and advisory models

Version 0.2 adds guided company, business service, asset, aggregate workforce, cost, objective and dependency registers; transaction scopes; embedded/direct delivery mandates; diligence findings; detailed TSA obligations and a decision log. It generates versioned plans with company comparisons, current/target run-rate costs, transition estimates, proposed dates/owners, dependencies, gaps and 13 Day-1 acceptance domains. Historical versions become stale when project inputs change, and independent baseline review requires blocking input gaps to be resolved.

These are rules-based planning drafts from entered data. Proposed owners/dates are not confirmed capacity commitments. Generated actions remain in the plan until deliberately managed through delivery registers. Live discovery, automatic vendor migration, workforce decisions, legal structuring, commercial billing, resource levelling, jurisdiction-specific methodologies and guaranteed readiness are not implemented. See `COMPANY-PLANNING.md` for the workflow and precise financial/AI/graph boundaries.

## AI and control

The default is source retrieval without generated answers. Version 0.3 adds a separate specialist hub with OpenAI, Azure OpenAI, Anthropic, Gemini, Bedrock and Ollama generation adapters, operator-bound project connections and owner-controlled model routes. The legacy Evidence/Product path retains optional Ollama generation/embeddings. Citation validation is not proof that a claim is entailed by its source. Domain evaluation, unsupported-claim detection and human review remain necessary.

The existing readiness agent remains a bounded rules-based workflow. The new specialist hub uses a bounded model-driven JSON decision loop with a server-enforced tool allowlist, role/project checks, persistent steps, usage reservations, input-version checks and cancellation. It can read reports/evidence/connectors and propose tasks. It cannot approve or execute those proposals. The legacy evidence-generation model has no tools. Neither workflow is an unconstrained general agent or a trained predictive model.

Three read connector adapters are included: Microsoft Graph metadata, fixed GitHub repository/issues and a projected JSON feed. These are bounded snapshots with explicit evidence ingestion, not complete discovery or continuous sync. Six provider wire contracts and the agent/connector controls were tested with fixtures; live authentication, model quality, account permissions and source scopes remain unverified. See `AI-LAYER-SETUP.md` for exact capability boundaries, legacy-generation separation and activation steps.

There is no live payment, purchasing, external messaging, arbitrary code, shell, SQL/Cypher generation, cloud mutation or production cutover tool. Adding one requires its own narrow connector, dry run, timeout, idempotency semantics, outcome reconciliation, failure handling and realistic recovery plan. Do not assume every migration can be rolled back.

## Six workstreams

| Workstream | Managed now | Connector/execution work still required |
| --- | --- | --- |
| Enterprise systems and processes | Entity/module scope, separation plans, account/transaction reconciliation, close rehearsals, freeze/rollback evidence and acceptance gates. | Licensed Oracle/SAP/Workday extraction, clone/separation tooling, payroll/ledger adapters and real finance-close validation. |
| Identity and workplace | Directory/tenant/device scope, identity mapping checkpoints, access tests, mailbox/file/device migration waves and handover. | Microsoft Graph/directory connectors, approved migration tools, delegated scopes, device management and cross-tenant transfer support. |
| Cloud and infrastructure | Workload/network scope, landing-zone review, IaC evidence, restore/failover checks, migration waves and cost ownership. | Cloud inventory, cost APIs, reviewed deployment runners, network/DNS changes and per-provider tests. |
| Security/GCC controls | Versioned framework references, applicability decisions, evidence, gaps, exceptions and assessor records. | Approved/licensed control catalogues, current applicability review, scanner integrations, assessor workflows and independent audits. |
| Development and integration | Interface contracts, ownership, authentication scope, test evidence, migration waves, replay/rollback planning. | Repository/CI connections, contract-test runners, middleware connectors, event schemas and deployment approvals. |
| Data, BI and governance | Source/target assets, lineage references, quality rules, reconciliations, reporting acceptance and transaction-linked benefit comparisons. | Fabric/Databricks/Power BI metadata and pipeline connectors, source lineage extraction, report reconciliation and operational observability. |

The 36 initial checkpoints are original planning templates. They are not a complete implementation of any named vendor's migration methodology or an authoritative compliance standard. Framework name, edition, control reference, applicability, scope and reviewer evidence are explicit data. A software status never awards ISO certification or a SOC 2 report, or guarantees NCA/SAMA/UAE compliance.

## Financial meaning

- All inputs use explicit currency and Decimal strings. Foreign amounts require a documented FX rate/date/source. The platform does not fetch market FX automatically.
- `forecast` means remaining forecast cost; completion estimate is actual plus that remaining forecast. Do not import a full-period forecast as remaining cost without adjusting it.
- Cash reporting separates revenue and cash costs. It is not a statutory P&L, balance sheet, payroll engine, tax calculation or full double-entry accounting system.
- Scenario inputs are assumptions. NPV, ROI and payback use the supplied discount rate and timing convention. No interest-rate, exchange-rate or future savings forecast is inferred by a model.
- Entry IDs are immutable and repeat imports are idempotent. Different IDs for the same underlying invoice are not automatically detected. Use upstream unique transaction/line identifiers and reconcile imports.
- Reconciliations check each supplied key/currency independently and compare counts as well as amounts. Two offsetting errors cannot disappear into a matching grand total. The application checks hash format but cannot establish that an uploaded manifest represents a complete or authentic extract.
- A reviewed benefit links to one baseline and one actual operating-cost entry for the same period/category. Independent finance acceptance is required. Reusing a baseline or actual entry in a second reviewed benefit is rejected. A difference is not automatically proof of causal savings or an external audit opinion.
- Negative differences are retained. Cash savings, cost avoidance, accounting recognition, productivity improvement and avoided risk need distinct finance-approved methodologies before portfolio aggregation. Only the implemented operating-cost comparison is totalled here.

## Product lifecycle

Research/JTBD, specifications, opportunities, stories, sprints, UAT, releases, GTM, competitors and adoption aggregates are persistent records. RICE is calculated from explicit inputs and grouped by matching reach period/population. MoSCoW remains independently chosen. Sprint reporting identifies capacity overload and missing estimates.

PRD, market, sprint and GTM generation retrieves ingested source documents. A model must be configured to generate prose; otherwise the endpoint returns evidence only. A generated response is not automatically saved as an approved specification. Review it and save a versioned spec/record. No live competitor crawler, user interview collection, Jira/Linear sync, analytics event collector, experimentation engine or GTM publisher is configured.

Release gates require finished linked stories, passed UAT and change/rollback/GTM references. Pending or failed blocking UAT prevents readiness. The service records a release after authorised review; it does not deploy software. Adoption rates use supplied aggregates for a consistent cohort and report null when no denominator exists.

## Operational boundaries

Local hash-chained audit events are useful for inspection but a privileged database owner can rewrite the chain. Production assurance requires independent retention/anchoring and restricted operational access. Export currently contains project records, finances, plan versions, action results and audit events; source documents and embeddings require the separate knowledge-store backup/export.

Before a customer pilot, complete the real host build, tenant/project isolation testing, deployment hardening, monitoring, rate limits, key rotation, backup/restore, evidence retention and deletion, dependency/security review, load testing, and model/connector evaluation with the actual customer datasets. These are material production gates, not claimed completed work.
