# Company discovery and transaction planning — version 0.2.0

Use the **Company planning** workspace to build a company-specific baseline and a proposed target state for a merger, acquisition, carve-out or modernisation. Several companies and several alternative planning scopes can belong to one restricted transformation project. A scope selects its company perimeter and target organisation. Keep unrelated deals or differently authorised client teams in separate projects.

The system starts useful planning on the first day of discovery. **Planning start** is distinct from **Day 1**, the date the new ownership or operating arrangement must work. The generated plan covers preparation, Day 1, days 2–30, 31–60 and 61–100; an extended horizon can run up to 1,095 days from Day 1. Dates are calendar targets, not resource-levelled estimates or a guarantee that work fits the available window.

## Enter the baseline

| Record | What to enter |
| --- | --- |
| Company | Buyer, seller, target, NewCo, merged or operating company; sector, countries, sites, accountable owner and source references. |
| Business service | Critical outcomes such as paying employees, invoicing customers or fulfilling orders; Day-1 requirement and testable acceptance criteria. |
| Asset | Technology, property, equipment, inventory, intellectual property, data, contracts, licences, brands, networks or other assets; quantity, owner, criticality, evidence and target company. Choose retain, migrate, consolidate, replace, separate, retire or shared. Unassessed treatment remains a gap. |
| Workforce | Aggregate team headcount, FTE, skills, key dependencies, owner, target organisation and transition approach. This does not make individual employment decisions. |
| Cost item | Stable cost key, company, current/transition/target state, category, amount, currency, frequency, owner, confirmed/estimated basis and evidence. Optional links to an asset or team. |
| Objective | Metric, measured baseline, target, unit, direction, MoSCoW priority, accountable owner and target date. Missing baselines remain visible. |
| Asset dependency | A reviewed connection: source depends on target. Dependencies can cross companies; dependencies outside the selected perimeter are flagged. |
| Planning scope | Companies, target company, deal type, start, Day 1, horizon, constraints, requirements reference, budget and explicit coverage attestations. |

Guided cards open the corresponding register. Save companies before records that reference them. Save assets before their dependencies. Enter existing technical systems and link assets through `system_id` when available. Update an existing record rather than creating another ID for the same item; revisions prevent overwriting someone else's concurrent edit.

For a **partial carve-out**, the scope can explicitly select `asset_ids`, `workforce_ids`, `business_service_ids` and `cost_item_ids`. A blank selector means all records of that type within the chosen companies; supply the IDs to narrow the perimeter. Do not compare the seller's entire cost base with the carved-out business. Record and select the agreed allocated costs and teams. Dependencies on excluded assets remain visible as perimeter gaps. An allocation methodology and any stranded/shared costs must be reviewed separately; the tool does not infer a fair allocation.

Company comparisons show recorded assets and headcount, incoming assets, proposed target headcount/FTE and per-company costs. Counts reflect only entered records. An empty NewCo inventory is not evidence that it will have no costs, assets or workforce.

## Add the delivery and advisory model

| Workflow | Records and resulting behaviour |
| --- | --- |
| Embedded or white-label delivery | A delivery mandate captures the client, lead advisory firm, delivery partner, responsible workstreams, decision rights, reporting cadence, acceptance criteria and commercial reference. A sub-contract mandate requires a lead adviser. |
| Direct PE/corporate advisory | Choose direct advisory and identify the sponsor/client, delivery partner, scope, decision rights and acceptance obligations. |
| Technical due diligence | Findings capture business impact, severity, remediation and supporting evidence; link standalone or separation estimates through cost IDs. Open high/critical findings produce planning gaps and remediation actions. |
| TSA structuring and exit | First save a TSA record for supplier, monthly fee, exit date and exit conditions. Then link an obligation describing provider/recipient companies, assets, service scope, service levels, charging basis, responsibilities, consent status and exit roadmap. The plan schedules exit actions and flags unresolved consent and dates outside the horizon. |
| Synergies and benefits | Use measurable objectives for the investment thesis and application rationalisation target. Use existing immutable baseline/actual entries and independent finance review to recognise supported operating-cost benefits. Proposed percentages are not realised savings. |
| Decision log | Record the decision, alternatives, rationale, date and evidence. Only an owner/reviewer can record an accepted decision. This is a recorded external decision, distinct from the independently reviewed generated-plan workflow. |

These implement the requested consulting operating models. They do not verify a competitor's private contracts, client relationships or delivery outcomes. White-label settings currently affect the workspace header. Custom domains, client portals, SSO branding, contractual workflow, invoicing, margin management and commercial entitlements require additional implementation.

All members of a project can read its commercial and financial records. The mandate does not create a hidden prime/subcontractor permission boundary. Use separate restricted projects where those teams must see different information.

## Generate and review

1. Select a planning scope and generate a phased plan. It is saved as a draft with the project input version, creation time, creator and record revision/hash manifest.
2. Review company comparisons, proposed asset treatment, workforce coverage and financial assumptions. Read the gaps: incomplete coverage, unresolved transfer rights, missing baselines, scope boundaries, dependency cycles, scheduling conflicts, open diligence findings, TSA issues and budget problems.
3. Review proposed actions and Day-1 acceptance gates across the six technical domains plus governance, finance, people, operations/customers, contracts/suppliers, facilities and product/adoption. Owners are proposed from entered records; confirm their assignment and capacity.
4. Refine the source records and regenerate. The existing plan remains in history and is marked stale. Generating again with identical inputs, date and scope reuses the same non-rejected plan.
5. Resolve blocking input gaps, then have a different project owner/reviewer record their review evidence. Rejected and reviewed versions remain in history. Reviewing a planning baseline does not authorise spend, employment changes, production cutover or regulatory acceptance.
6. Manage delivery in the existing task, checkpoint, migration wave, product and financial registers. Generated actions are proposals in the plan, not automatically created executable tasks. Day-1 gates require acceptance evidence; generation never marks them passed.

Download an individual plan as JSON or export the project with plan history and audit records. Full plan payloads include current technical readiness, product readiness, existing delivery commitments, workstreams, assumptions, commercial records and source references. The workspace presents the primary company/cost/roadmap/gate views; detailed supporting registers remain available in their existing tabs and the export.

## Cost interpretation

Use decimal strings. Available currencies are GBP, EUR, USD, AED and PKR; adding further currencies requires updating validation and the UI. Foreign cost inputs require an explicit rate into the project's base currency, dated FX provenance and source. No market rate is inferred.

Recurring rates are annualised using 365 days, 52 weeks, 12 months or 4 quarters. Current and target costs are separate states: they are compared, never summed as one operating budget. Missing cost states return null rather than zero. To assert that an entire state has no cost, enter an evidenced zero and attest coverage after review.

Transition one-off costs are added once. Transition recurring costs require `duration_months`; the management estimate is the annualised rate divided by 12 and multiplied by that duration. Missing duration blocks a total transition estimate and plan review. An entered total exceeding the scope budget produces a gap. This does not forecast payment dates, inflation, taxes, accruals, intercompany eliminations or cash availability.

Cost estimates are not automatically imported into the immutable transaction ledger, and ledger amounts are not added to planning estimates. Reconcile them explicitly. A duplicate `(company, cost state, cost key)` is rejected; the software cannot detect every economic duplicate entered under a different key. Scope, team and cost coverage attestations are human statements, not proof of completeness. Do not count the same team, shared service or contract in multiple company baselines without a documented allocation.

The fictional example has GBP 300,000 current annual recurring costs, GBP 192,000 target annual recurring costs, GBP 100,000 one-off separation costs and a three-month TSA at GBP 18,000/month, producing a GBP 154,000 entered transition estimate. Its GBP 108,000 annual difference is an unverified scenario, not recognised savings. The application-count objective of 10 to 8 is likewise a fictional hypothesis.

## AI, graph and execution boundaries

The company plan uses deterministic rules over typed records. That preserves arithmetic, explicit unknowns, traceable facts and repeatable review. Existing RAG/GraphRAG and optional model generation can assist evidence review, research and drafting through the Evidence/Product workflows; they do not invent or silently replace company facts. No model or vendor connection is required for this plan generator.

Discovery, financial and plan records currently reside in the project SQLite store. Asset dependency traversal is implemented in the planning engine. The optional Neo4j backend belongs to the document/evidence knowledge layer. Company/asset/people/cost entities are not automatically synchronised into Neo4j; a scoped, versioned mapping/ingestion adapter is additional work. Evidence source text must be ingested explicitly for retrieval.

This is a reusable framework, not a universal complete methodology. Sector, jurisdiction, deal perimeter, contractual rights, customer obligations and company-specific controls must be established during discovery. Real ERP cloning, directory separation, migration execution and regulatory assessment remain specialist work supported by integrations and approved tools.

## API additions

All calls use the existing authenticated host, signed RPC and project access controls.

| Command | Input | Access |
| --- | --- | --- |
| `records.save` | New record kind, record, expected revision | Owner/analyst/reviewer; cost items require owner/finance/reviewer. Accepted decisions require owner/reviewer. |
| `planning.generate` | `scope_id`, `as_of` | Owner/analyst/reviewer. Stores a draft; no external execution. |
| `planning.get` | Plan `id` | Any authorised project member. |
| `planning.review` | Plan `id`, decision `reviewed` or `rejected`, `evidence_ref` | Owner/reviewer different from creator. Review requires current inputs and no blocking input gaps. |
| `snapshot` / `export` | Existing request | Snapshot includes plan summaries; export includes full plan versions. |

The service adds a `plans` table when initialising an existing project database. Back up the database before upgrading. No destructive migration is included. `planning_example.py` and the expanded `demo.py` provide fictional input and output; tests exercise the new calculation, reference, isolation, role and review behaviour.
