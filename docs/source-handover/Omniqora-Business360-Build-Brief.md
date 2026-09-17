# Omniqora Business360 — discovery, improvement and transaction planning

Prepared for Amer Saleem · 16 September 2026 · Version 0.2

Version 0.2 expands the scope to discovery-led business modelling, tangible and intangible resources, stakeholder journeys, goals and full lifecycle acquisition, merger, sale and carve-out planning. It distinguishes the first day of an engagement from operational Day 1 at transaction completion. Sections 17–23 specify the expansion and its relationship to the Enterprise AI Architecture Role work.

Referenced conversation: https://chatgpt.com/share/6aaa6e65-18a0-83eb-b5e7-f113b9a8ce2d. The user identified it as **Enterprise AI Architecture Role**, dated 15 September 2026. The share page could not be accessed directly; retrieved prior conversation context identifies its Enterprise AI Governance & Adoption proposal. This update combines that architectural direction with the user's written requirements here. Its source code and reported test results have not been inspected in this task.

Working product name only; brand, trademark and domain availability have not been checked.

Status: proposed product specification. This document is not deployed software. No Omniqora source, live connector, Recovrable API or customer dataset has been inspected or changed during this task. Previous Omniqora decisions inform the proposed boundaries; production implementation must be checked against the current source.

## 1. Product purpose

An AI-assisted business discovery, assessment, improvement and transaction planning platform that examines a whole company, group, branch, department or business process. It first establishes the business's purpose, customers, revenue model, operating processes, resources and goals. It then gathers and validates evidence, identifies financial and operational weaknesses, recommends changes, coordinates approved work and measures the outcome. Dedicated transaction workspaces support buying, selling, merging, and separating a department into a subsidiary to operate or sell.

Customer promise: **Understand the business. Find the losses. Improve the results.**

The product supports three ways of working:

1. Consultant-led engagement: our team visits a business, conducts interviews, gathers documents and data, validates findings and delivers an improvement programme.
2. Self-service SaaS: a business connects systems, completes guided assessments and uses the platform with optional adviser support.
3. Continuous monitoring: recurring analysis flags new leakage, missed targets, renewals, collection delays and opportunities, while measuring previous improvements.

The assessment can cover every department, but it must explicitly distinguish assessed, partially assessed and unassessed areas. Software cannot substantiate findings about systems, physical assets or practices for which no reliable evidence exists. Physical inventory, site observations and staff interviews remain explicit evidence sources.

Position the service as business performance assessment and advisory. Do not represent a generated report as an independent statutory audit opinion.

## 2. Fit with Omniqora and the wider suite

Preserve the existing direction: test inside Omniqora, retain one reusable product core, then offer a standalone portal with its own brand, subscriptions and onboarding.

| Component | Responsibility |
| --- | --- |
| Business360 | Assessment scopes, questionnaires, metric definitions, findings, opportunity valuation, scenarios, improvement plans and benefits tracking |
| Omniqora Core | Tenant identity, membership, permissions, product entitlement, metering, billing interface and platform audit |
| Omniqora Intelligence / Knowledge | Shared provider interfaces, permitted evidence retrieval, vector and graph services, model evaluation and usage controls |
| Omniqora Agents / Flow | Durable jobs, agent execution, approvals, tool policies and workflow execution through defined interfaces |
| Omniqora Contact / Connect | Communications and system integrations where implemented and authorised |
| Recovrable | Accepted collection cases and their operational status, exposed through a proposed integration contract |
| RegulaOS / the compliance module | Authoritative compliance obligations, controls and specialist evidence workflows; Business360 links relevant findings rather than duplicating ownership |

These are proposed ownership boundaries, not a claim that all underlying services are operational.

Standalone customers must be able to connect their own accounting, CRM and other systems without buying the wider Omniqora suite. Recovrable must be optional: ordinary aged-debt analysis and manual follow-up remain available without it.

## 3. Audit and improvement coverage

| Domain | Evidence collected | Analysis and opportunities | Example metrics |
| --- | --- | --- | --- |
| Strategy and business model | Objectives, budgets, products, segments, pricing and market assumptions | Unit economics, concentration, capacity constraints, growth options and resilience | Contribution by segment, customer concentration, budget variance |
| Finance and cash | Trial balance, general ledger, management accounts, bank records, invoices, budgets | Revenue and margin trends, cash timing, cost allocations, working capital, break-even and forecasting | Gross margin, operating margin, cash runway where applicable, DSO, DPO, cash conversion cycle |
| Collections and credit control | Aged receivables, invoice terms, payment allocations, disputes and promises to pay | Overdue balances, invoice defects, slow dispute resolution, broken promises and approved Recovrable referrals | Overdue percentage, recovery rate with a defined cohort, dispute age, collection cycle time |
| Costs, procurement and contracts | Purchase ledger, supplier contracts, orders, invoices and usage | Duplicate or anomalous charges, unused subscriptions, fragmented suppliers, renewal exposure and price variance | Addressable spend, recurring savings, supplier concentration, purchase-price variance |
| Revenue leakage | Quotes, orders, contracts, delivery records, invoices, refunds and discounts | Delivered but unbilled work, contract underbilling, missed renewals, unauthorised discounts and margin erosion | Unbilled value, billing accuracy, discount rate, net revenue retention where applicable |
| Sales and customer experience | CRM stages, enquiries, response times, orders, support and retention records | Lost leads, stalled deals, follow-up failures, churn, upsell opportunities and poor service handoffs | Win rate, response time, conversion, retention, churn, customer lifetime contribution estimate |
| Marketing | Campaign spend, analytics, lead sources, CRM attribution and customer cohorts | Low-quality acquisition, tracking gaps, poor landing-page conversion and unprofitable campaigns | CAC with defined costs, ROAS, contribution after acquisition cost, funnel conversion |
| HR and workforce | Approved organisation charts, roles, staffing, payroll aggregates, schedules, skills and training | Capacity, overtime, onboarding delays, duplicated work, training needs and workload distribution | Revenue per FTE, labour cost ratio, utilisation with agreed definitions, overtime, turnover |
| Technology, data and AI | Application inventory, subscriptions, usage, integrations, cloud costs and architecture | Unused licences, duplicated tools, manual rekeying, technical dependencies, automation opportunities and AI readiness | Cost per active user, cloud unit cost, data quality, manual hours, integration failure rate |
| Assets, inventory and facilities | Asset registers, stock movements, maintenance, leases, energy bills and site observations | Idle or missing assets, overstock, obsolete stock, downtime, repair-versus-replace scenarios and energy waste | Asset utilisation, downtime, inventory days, stock accuracy, maintenance cost |
| Operations, quality and delivery | Timestamped process events, work orders, tickets, SOPs and interviews | Bottlenecks, rework, avoidable approvals, queues, defects and weak handoffs | Cycle time, waiting time, first-time-right rate, throughput, on-time delivery |
| Telephony and communications | Bills, number inventory, call events, queues, routing, staffing and CRM outcomes | Unused numbers, missed or abandoned calls, routing problems, repetitive enquiries and service coverage | Answer rate, abandonment, wait time, cost per handled enquiry, attributed conversion |
| Risk and continuity | Dependency maps, continuity plans, ownership, policies and incident records | Single points of failure, poor evidence, resilience gaps and specialist review needs | Overdue actions, recovery exercise results, dependency coverage |

Use industry packs to select relevant metrics and questions. A cafe, accountancy firm, vehicle dismantler and SaaS business should not receive the same scorecard. HR analysis should begin with department aggregates and authorised workforce data, not unrestricted personnel files.

## 4. Engagement workflow

1. **Discover the business and define scope.** Use adaptive Q&A, documents, interviews and observation to establish purpose, value proposition, customer and supplier journeys, revenue model, actual workflows, ownership, resources and short-, medium- and long-term goals. Record legal entities, branches, departments, period, reporting currency, data owners and exclusions. Confirm the current-state model with accountable owners and agree which decisions require which reviewers.
2. **Collect evidence.** Start with upload templates, documents and guided interviews; add authorised connectors. Maintain a request list with owners, deadlines and coverage.
3. **Validate the data.** Detect duplicate imports, missing periods, inconsistent currencies, missing records and conflicting definitions. Reconcile key totals to source reports. Flag unresolved differences.
4. **Establish the baseline.** Freeze the measurement period, metric versions, normalisation assumptions and approved financial totals.
5. **Run analysis.** Specialist workflows calculate metrics, examine anomalies, retrieve supporting evidence and produce candidate findings.
6. **Review findings.** A responsible person validates the evidence and assumptions, rejects false positives and assigns confidence and priority.
7. **Model improvements.** Compare conservative, base and upside scenarios, implementation costs, lead time, constraints and overlap with other initiatives.
8. **Approve a plan.** Create accountable owners, milestones, budget and outcome measures. Approval is required before external or consequential actions.
9. **Execute.** Use tasks, existing systems, approved no-code workflows and optional suite integrations.
10. **Measure and repeat.** Compare actual results with the agreed baseline and counterfactual; account for changes in volume, prices, seasonality and other initiatives. Reopen findings when evidence changes.

Deliverables include an executive report, department scorecards, evidence register, opportunity register, financial scenarios, an immediate/30/60/90-day plan and a recurring management dashboard.

## 5. Intelligence design

| Capability | Role in this product | Required boundary |
| --- | --- | --- |
| Rules and metric engine | Calculate financials and KPIs, reconcile totals, identify defined exceptions | Versioned deterministic calculations using decimal amounts; invalid or missing inputs produce explicit unavailable results |
| GenAI | Read documents, structure interview notes, explain findings and draft reports or action plans | Evidence references, visible assumptions and structured output validation |
| RAG | Retrieve the relevant contract, invoice, procedure or policy for a specific question | Enforce source permissions before retrieval and generation; cite source versions and locations |
| Graph-assisted retrieval / GraphRAG | Connect people, departments, software, contracts, suppliers, assets, processes and revenue streams | Every relationship carries provenance, time validity and verification status; inferred links are not treated as verified facts |
| Statistical models | Forecast demand or cash, flag anomalies and examine trends | Backtesting, uncertainty ranges, drift checks and sufficient historical data |
| Agent workflows | Gather missing evidence, coordinate domain analyses, draft actions and execute permitted tools | Durable state, bounded steps and budgets, safe retries, approvals and an execution log |
| No-code configuration | Build questionnaires, scorecards, rules, report templates and workflows | Versioned publication, permissions, test runs and rollback |

Financial totals must come from governed queries and calculations, not generated prose. The model can explain a gross-margin change, but the calculation service owns the numbers.

Graph use case: a sales team depends on a particular CRM integration; that integration depends on a licence that appears unused in login data. Connecting the contract, service account, workflow and revenue process can expose the dependency before recommending cancellation. An inferred relationship triggers verification, not automatic certainty.

Process mining adds another useful capability: reconstruct actual business flows from system event logs and identify bottlenecks. Microsoft's documentation describes this event-data approach and its use for operational analysis and KPIs. Where logs are absent, label the output an interview-based process map. [Microsoft process mining overview](https://learn.microsoft.com/en-us/power-automate/process-mining-overview).

Microsoft's GraphRAG approach extracts a graph from text and uses related structures and summaries during retrieval. For this product, use graph methods where cross-source relationships help; ordinary retrieval or SQL remains sufficient for many tasks. [GraphRAG documentation](https://microsoft.github.io/graphrag/).

Do not interpret correlation or an AI explanation as proven causation. Store causal explanations as hypotheses until supporting evidence or an appropriately designed intervention justifies stronger language.

## 6. Financial measurement and benefit integrity

Maintain separate benefit categories:

| Category | Measurement rule |
| --- | --- |
| Recurring cost saving | Baseline and new comparable recurring cost, adjusted for scope/volume, net of replacement costs |
| One-off cash recovery | Cash actually received and allocated to the relevant case; refunds and reversals reduce the result |
| Working-capital release | Timing or balance improvement in receivables, payables or inventory, shown separately from profit |
| Incremental revenue | Additional sales relative to the agreed baseline, with attribution assumptions |
| Incremental contribution | Additional revenue less associated variable costs, including fulfilment and acquisition where relevant |
| Capacity released | Hours of work avoided; show hours and optional economic value without claiming payroll cash savings unless realised |
| Risk exposure reduction | A separately labelled estimate with explicit assumptions; never silently added to realised financial benefits |

An overdue invoice paid through Recovrable is a cash collection. It must not automatically be counted as new revenue or additional profit.

Illustrative calculation only: retiring 40 genuinely unused monthly licences costing £25 each gives £1,000/month gross avoidable recurring spend. If replacement/support costs are £150/month, steady-state net savings are £850/month or £10,200 per full year. With £1,500 one-off implementation costs and immediate full realisation, first-year net benefit is £8,700 and simple payback is about 1.8 months. Contract commitments, start dates, taxes and transition delays must be included in a live case.

Every metric definition records numerator, denominator, period, entity, inclusion rules, data source, accounting basis, currency, owner and version. Show zero-denominator and incomplete-input conditions explicitly. Distinguish EBITDA from cash flow; distinguish campaign revenue attribution from campaign profitability.

Example definition: DSO = average trade receivables / credit sales for the matching period × days in the period. Publish the exact conventions used, including tax treatment. Alternative definitions must be visibly versioned and cannot be compared without reconciliation.

Benefits carry a shared opportunity group and overlap links. For example, automating enquiry handling and adding a receptionist may claim the same time saving; the portfolio total must allocate the benefit once. Track identified, validated, approved, implemented and realised values separately.

Benchmarks require a named source, licence or permission where needed, sector, geography, business size, date and metric definition. Never fabricate a peer percentile or treat a model's memory as benchmark data.

## 7. Finding and recommendation record

Every finding needs:

- Unique ID, tenant, engagement, department, category, owner and state.
- Plain-language observation and business consequence.
- Linked records, document/page references, source versions and evidence dates.
- Coverage, completeness, limitations and unresolved contradictions.
- Verified facts separated from inferred causes and forecast outcomes.
- Baseline amount or metric, calculation version and reproducible inputs.
- Conservative/base/upside benefits, category, time horizon and confidence rationale.
- Implementation and recurring costs, dependencies, operational trade-offs and rollback approach.
- Alternatives considered, including continuing the existing arrangement.
- Approval requirements, action owner, due date and measurement plan.
- Links to related findings to prevent duplicate benefits.
- Actual results, supporting evidence and reviewer sign-off.

Prioritisation should expose its ingredients: verified economic potential, confidence, implementation effort, time to value, business impact and dependencies. Allow leaders to adjust weights; do not conceal uncertainty in a single opaque score.

## 8. Recovrable integration proposal

No Recovrable endpoint or authentication mechanism has been verified. The following defines a proposed adapter to agree with the actual product.

**Inbound data:** customer reference, invoice reference, currency, outstanding balance, due date, payment terms, dispute/hold flags, allocated payments and last-updated version. Import only the minimum contact and supporting details authorised for the collection task.

**Referral workflow:** a validated aged-debt finding generates a proposed collection case. Check the current balance and exclusions; obtain approval or apply an existing authorised policy; send the case once; retain the returned external case ID.

**Status return:** accept case acceptance/rejection, contact status, promise to pay, disputed/paused status, payment allocation, recovery, cancellation and reversal events. These event names are conceptual, not documented API names.

**Reliability:** use signed requests or webhooks according to the real API, tenant-bound credentials, timestamp/replay protection, idempotency keys, version checks, retries, dead-letter handling and periodic reconciliation. Keep a mapping of tenant + source invoice ID + external case ID.

**Accounting:** the accounting system remains authoritative for invoice balance and payment allocation. Recovrable owns collection case activity. Business360 stores reconciled analytical snapshots and benefit measurements.

**Operational controls:** a payment, dispute, credit note or cancellation must pause or update the relevant follow-up. Suppress duplicate referrals and duplicate contact. Cash marked recovered is provisional until matched against the authoritative payment record. Collection action permissions are separate from permission to view an overdue-invoice dashboard.

## 9. Product experience

Navigation: Overview · Discovery · Business Map · Engagements · Evidence · Resources · Departments · Financials & KPIs · Opportunities · Scenarios · Transactions · Actions · Results · Ask AI · Integrations · Settings.

- Overview shows assessed scope, data freshness, coverage and validated priorities; distinguish proposed value from realised outcomes.
- Engagement workspace provides a guided checklist, meeting notes, evidence requests and reviewer assignments.
- Evidence room links each finding to its sources and makes missing evidence visible.
- Department pages present a small set of relevant metrics with definitions and drill-down.
- Opportunity register supports grouping, ownership, prioritisation and overlaps.
- Scenario workspace lets users change assumptions and see financial and capacity implications.
- Action board and approvals inbox coordinate implementation.
- Results view tracks benefits by category and period against approved baselines.
- Ask AI supports questions such as “Why did our margin fall?”, “Which costs can we change before renewal?” and “What evidence supports this recommendation?” Answers include citations or an explicit insufficient-evidence response.

Provide desktop analysis, tablet-friendly site visits and mobile evidence capture/approvals. Keep detailed financial modelling and dense comparisons available on desktop. Reports and exports inherit the reader's permissions.

## 10. No-code builder

Business users and approved advisers can configure:

1. Assessments: sections, conditional questions, attachments, scoring rules and reviewer assignments.
2. Metric cards: selected approved formulas, filters, targets and reporting periods.
3. Detection rules: thresholds, materiality, exceptions and alert routing.
4. Workflows: trigger → scoped condition → draft/task → approval where required → permitted action → result measurement.
5. Reports: approved sections, branding, narrative templates and evidence appendices.
6. Industry packs: sector-specific questions, metrics, evidence requirements and recommendations.

Use a validated formula/rule language; do not allow arbitrary code to run with platform credentials. AI can draft workflows, but publication must validate available tools, permissions and action limits. The customer experience can be no-code while the core still uses engineered services for finance calculations, permissions and reliable execution.

## 11. Technical boundary and data model

Proposed alignment with the earlier Omniqora direction: React interface, a Python/FastAPI domain service, PostgreSQL/Supabase for structured data, shared document storage, shared retrieval services and a durable job queue. Confirm current versions and the existing source before selecting libraries or preparing migrations.

Suggested module boundaries, subject to source review:

- `src/modules/business360`: screens, module registration and host adapters.
- `services/business360`: metrics, findings, scenarios, benefit calculations and engagement APIs.
- `contracts/business360`: versioned schemas for host, connector and event interfaces.
- `industry-packs/business360`: questionnaires, metric definitions and approved playbooks.

Conceptual records:

| Record | Key purpose |
| --- | --- |
| Engagement / Scope | Entity, department, period, objectives and exclusions |
| EvidenceSource / EvidenceVersion | Source identity, content, permissions, hash/version and retention |
| ImportRun / Reconciliation | Mapping, duplicate handling, errors, source totals and coverage |
| MetricDefinition / MetricSnapshot | Versioned formula and reproducible values |
| BusinessEntity / Relationship | Supplier, customer, software, asset, department and supported links |
| Finding / EvidenceLink | Observation, proof, inference, confidence and reviewer state |
| Opportunity / Scenario | Alternatives, assumptions, costs, benefits and overlap groups |
| Approval / Action / Execution | Authorised change and execution history |
| BenefitBaseline / BenefitMeasurement | Agreed comparison and realised result |
| CollectionReferral / ExternalCaseLink | Reconciled Recovrable handoff |

Every record is tenant-bound. Department and engagement permissions can further limit access within a tenant. Tenant identity is established from verified authentication, not a client-supplied tenant field.

Host contracts: identity, membership, entitlements, billing, notifications, connector credentials, retrieval, model execution and audit. Business logic depends on these interfaces rather than hardcoded Omniqora pages. This permits an Omniqora shell and a standalone shell over the same core.

For a later independent deployment, export/import tenant data and documents with stable IDs, move secrets through a secure reauthorisation or migration process, and preserve audit history and connector mappings. A new frontend alone does not make the backend independent.

## 12. Connector sequence

1. CSV and spreadsheet templates, PDF/document ingestion and guided manual evidence capture.
2. The first pilot's accounting system: trial balance, invoices, payments, suppliers and cost categories.
3. CRM and telephony metadata for enquiry-to-revenue analysis.
4. Recovrable adapter once its real API and ownership rules are available.
5. Marketing, HR, inventory, cloud and other sector-specific systems according to customer demand.

Connector candidates include Xero, QuickBooks, Sage, Microsoft 365, Google Workspace, CRM platforms, advertising platforms and carrier/PBX systems. These are candidates, not confirmed integrations. Verify each provider's API scope, plan, authorisation requirements, rate limits and data access before promising support.

Begin connectors with read access. Separate collection of evidence from permission to send communications, modify records or execute financial actions.

## 13. Access, reliability and quality

Access controls must cover database rows, files, search indexes, graph traversal, summaries, caches, job payloads and exports. A manager able to see a department total does not automatically gain access to salary details or another department's documents.

External content is evidence, not an instruction source. Documents and email cannot grant tool permissions. Use a tool allowlist and validated arguments; keep credentials outside prompts and browser clients. Record source versions and tool outcomes.

Provide revocation and deletion propagation across documents, vectors, graphs and caches. Preserve required audit metadata under an agreed retention policy without retaining unauthorised content indefinitely.

Agent execution needs cancellation, timeouts, cost budgets and safe resumption. Recheck action permissions and relevant source state at execution time, even if an earlier approval exists. Consequential actions such as contract cancellation, customer contact, payment or personnel decisions require the appropriate explicit authority.

Human reviewers validate material recommendations and sensitive employment or specialist professional conclusions. The product can identify a workload problem or draft options; it should not independently decide who loses their job.

Meaningful release verification:

- Reconcile financial outputs against accountant-approved examples and source totals.
- Confirm missing data, currencies, credits, refunds and zero denominators are handled correctly.
- Demonstrate that restricted evidence cannot leak through answers, graphs, summaries or exports.
- Repeat imports and webhook deliveries without duplicate records or collection referrals.
- Test concurrent payment/dispute updates before a collection action.
- Demonstrate approval revocation and stale-data checks at execution.
- Verify that a shared opportunity is counted once and a collection does not become new revenue.
- Evaluate cited answers and refusals to infer unsupported conclusions using representative business cases.

## 14. Commercial packaging

| Offer | Customer | Commercial model |
| --- | --- | --- |
| Department review | A finance, HR, sales, technology or operations leader | Fixed-scope diagnostic plus optional monitoring subscription |
| Whole-business platform | An owner, CFO or management team | Onboarding plus recurring company subscription with department and usage allowances |
| Adviser workspace | Accountants, consultants, MSPs and business advisers | Multi-client subscription, engagement allowances and branded reporting |
| Group / enterprise | Multi-entity organisations | Entity/usage pricing, advanced access, SSO, integration support and deployment options |
| Implementation services | Customers wanting delivery support | Separately scoped automation, integration and change projects |

Price after measuring onboarding effort, analyst review time, model costs, connector maintenance and achievable customer value in pilots. Do not promise unlimited data processing or guaranteed savings before that evidence exists.

Optional success fees require an agreed baseline and attribution rules and must specify the benefit category. Time saved and predicted revenue should not silently qualify as realised cash savings.

Relevant recommendations may include Recovrable, Omniqora Contact/Flow, Veyumo or other portfolio tools. Score the existing supplier, internal improvement and external alternatives against the same requirements. Disclose a commercial connection and keep recommendation ranking independent of referral revenue.

## 15. Delivery phases and release gates

### Phase 1 — audit and evidence foundation

Build adaptive discovery, current-state confirmation, scope selection, roles, assessment templates, evidence requests, resource registers, file imports, metric definitions, financial snapshots, findings, opportunity records, review workflow and a management report. Include transaction selection and a planning-only transaction workspace with dependencies and provisional milestones. Start automated analysis with finance, costs, collections and communications; other domains have guided evidence-led assessments. Transaction execution remains gated until the requirements in sections 21–22 are met.

Gate: one representative pilot can complete an end-to-end assessment with reconciled figures, traceable findings and accurate assessed/unassessed coverage. Use labelled synthetic data until a customer authorises real data.

### Phase 2 — connected monitoring and Recovrable

Add the first accounting connector, CRM/call metadata, scheduled imports, source reconciliation, thresholds, recurring metrics and the verified Recovrable adapter.

Gate: repeat syncs are reliable, a paid or disputed invoice stops the corresponding referral/follow-up, and financial results reconcile to source records.

### Phase 3 — agents, no-code workflows and measured outcomes

Add agent task execution, policy-bound tools, workflow builder, approval checks, scenario modelling, improvement plans and benefits verification.

Gate: authorised work completes with an audit record; stale, duplicate or unauthorised actions are blocked; predicted and realised benefits are visibly separate.

### Phase 4 — graph insight and specialist packs

Add richer dependency relationships and GraphRAG where justified by evaluated use cases. Extend HR, technology, inventory, procurement, marketing, facilities and sector-specific process analysis. Introduce process mining when event logs support it.

Gate: relationship-based findings show their source paths, respect permissions and add demonstrable value over simpler retrieval.

### Phase 5 — standalone and adviser channels

Add independent brand, domain, signup, subscription plans, connector onboarding, multi-client adviser workspace and optional separate deployment. Reuse the core and suite interfaces.

Gate: a customer can buy and use the product without an Omniqora suite subscription; entitlement and data boundaries are enforced; billing and support ownership are clear.

## 16. Immediate implementation handoff

Use this brief as the new Business360 module specification alongside the existing Omniqora integration plan. Before merging source, inspect the current Omniqora package/repository, module registry, authentication, entitlement, connector and knowledge interfaces. Then implement Phase 1 against those real interfaces.

The remaining integration inputs are the current Omniqora source target, an agreed first pilot/data sample and the actual Recovrable API or source contract. Those inputs affect implementation, not the feasibility of the product outlined here.

No production integration or deployment has been completed by creating this brief.

## 17. Discovery before diagnosis

The product begins by learning what this particular business or department exists to do and how it actually works. A static questionnaire is insufficient. Use a configurable question library plus an adaptive interview that asks follow-up questions when answers or documents reveal gaps, dependencies or contradictions.

Examples:

- If sales are mostly on credit, ask how terms are agreed, work is evidenced, invoices are issued, disputes are handled and receipts are allocated.
- If an apparently profitable department shares payroll, IT, purchasing or premises, request the allocation basis and the cost of replacing each shared service before evaluating a carve-out.
- If an asset register shows equipment that staff say is unavailable, request inspection evidence and record the conflict rather than choosing a convenient answer.
- If an owner wants growth but operations are at capacity, investigate capacity, quality and fulfilment before recommending additional marketing expenditure.

Capture these discovery dimensions:

| Dimension | Questions and resulting records |
| --- | --- |
| Purpose and value | Why does the business exist; what problem does it solve; which products/services matter; what differentiates it? |
| Customers and markets | Who buys, who uses, who pays; why do they choose or leave; how concentrated or seasonal is demand? |
| Revenue mechanics | How does an enquiry become an order, delivery, invoice and cash receipt; which margins and obligations attach to each step? |
| Operating model | What work is performed; by whom; using which systems, assets, suppliers and approvals; where do handoffs occur? |
| Structure | Legal entities, locations, departments, reporting lines, decision rights, shared services and outsourced work |
| Resources and rights | What the business owns, leases, licenses, borrows, shares or depends upon; who controls access or transfer |
| Goals and constraints | Short-, medium- and long-term targets; budgets; capacity; minimum service and quality requirements; funding constraints |
| Strategic intent | Improve, grow, stabilise, buy, merge, prepare for sale, carve out to operate, or carve out to sell |
| Stakeholder problems | Management, staff, customer and supplier experiences, with supporting evidence and material disagreements |

Voice or text interviews, forms, site inspection notes, photographs, contracts, accounts, system exports and authorised connectors all feed the same evidence model. Record consent and recording choices where interview capture is used. AI-extracted answers remain drafts until reviewed at the appropriate level.

Represent each material statement with its source, date, scope, owner and status: reported, observed, reconciled, verified, inferred, disputed or unknown. A management assertion is valuable evidence but is not automatically independently verified.

The resulting current-state pack includes a business model summary, organisation chart, customer and supplier journey maps, process maps, application/asset inventory, revenue-to-cash map, dependency map and data coverage report. Owners confirm this before major recommendations are promoted to an approved plan.

## 18. Resource, obligation and goals registers

Maintain a resource register broad enough to support operational improvement and transaction planning:

| Register | Required details |
| --- | --- |
| Tangible assets | Fixtures and fittings, machinery, equipment, vehicles, stock, hardware, property interests; location, serial/reference, condition, capacity, use, maintenance and ownership/lease evidence |
| Intangible resources | Brands, trademarks, domains, software, source code, patents, designs, content, databases, know-how, customer relationships and contractual rights; ownership/licence, expiry, restrictions and dependencies |
| Workforce and organisation | Departments, roles, reporting lines, vacancies, skills, capacity, salaries, employer costs and benefits, with tightly scoped access to individual records |
| Technology and data | Applications, infrastructure, identities, integrations, hosting, data stores, licence terms, access owners, support contracts and recovery dependencies |
| Suppliers and contracts | Service scope, price, volume commitments, renewal, notice, termination, transfer/change-of-control clauses and verification owner |
| Obligations and liabilities | Debts, creditors, leases, guarantees, commitments, security interests and reported contingent exposures, each with source and specialist-review status |
| Recurring and one-off expenditure | Payroll, professional and legal fees, compliance, insurance, rent, utilities, finance costs, maintenance and other material cost classes |
| Goals | Metric, approved baseline, target, deadline, owner, budget, dependencies, assumptions and minimum customer/service/quality outcomes |

Do not equate ownership, accounting recognition and value. A resource may be operationally important without appearing as an asset on the balance sheet. Keep book value, estimated replacement cost, independently assessed value and scenario assumptions in separate fields with their dates and bases.

Shared resources carry a usage/allocation rule and proposed future disposition: retain, transfer, duplicate, replace, retire or temporarily share. Legal transferability and actual consent remain reviewable evidence fields, not assumptions inferred from a resource's business use.

Goal horizons are customer-configurable. Suggested defaults are near-term 0–90 days, medium-term 3–12 months and long-term 1–3 years; these are planning presets, not universal definitions.

## 19. Stakeholder bottlenecks and root-cause investigation

Capture customer, supplier and staff perspectives in addition to management's view. Link each issue to the relevant journey step, event evidence, affected volume, frequency, owner, cost and downstream consequence.

For a customer complaint about late delivery, investigate quotation accuracy, stock, supplier lead time, scheduling, approvals, dispatch and communication before proposing a solution. For slow payment, separate late invoicing, wrong purchase-order references, disputed fulfilment and a customer's own cash constraints.

The issue register must distinguish symptom, suspected cause, evidence supporting the cause, evidence contradicting it and a test that could validate the proposed intervention. A relationship map alone does not prove causality.

Recommendations should optimise a balanced set of outcomes. Cutting service staff may reduce one cost while increasing missed sales and complaints; acquiring customers faster may worsen cash pressure if fulfilment and payment terms are ignored. Scenarios expose such trade-offs and respect management-approved constraints.

## 20. Full plan generation and implementation tracking

The output is a versioned operating and improvement programme assembled from the confirmed business model, evidence, objectives and selected scenario.

The plan contains:

1. Executive assessment of the business's purpose, position, strengths and constraints.
2. Current-state processes, resources, financial baseline and KPI definitions.
3. Evidence-backed findings, unresolved questions and important dependencies.
4. Proposed future organisation, workflows, systems and responsibilities.
5. Alternatives and quantified scenarios, including the option to retain current arrangements.
6. Initiative-level implementation costs, recurring costs, capacity requirements and conservative/base/upside outcomes.
7. Immediate, 30-, 60- and 90-day actions followed by agreed medium- and long-term milestones.
8. Cash forecasting: a configurable weekly 13-week view where relevant, plus a longer monthly scenario model, using reconciled starting balances and explicit payment/funding assumptions.
9. Acquisition, retention, pricing, service and revenue collection initiatives linked to operational capacity.
10. Owners, dependencies, acceptance criteria, approvals, risk responses and measurement dates.
11. Management dashboards and a results register comparing actual outcomes with approved baselines.

Every plan task includes an ID, deliverable, responsible owner, accountable approver, predecessors, planned duration, earliest start, deadline, resource/cost estimate, required evidence, acceptance check, risk, status and change history. Dates propagate through dependencies; tasks waiting for consents or unavailable resources cannot be labelled ready simply because a date has arrived.

AI drafts and updates plans. A scheduling engine checks dependencies and resource constraints. A calculation engine produces financial outcomes. Policy-controlled agents execute only permitted actions. Human owners validate material assumptions and accept deliverables.

## 21. Transactions: acquisition, merger, sale and carve-out

Create a dedicated Transactions workspace with a versioned transaction perimeter: exactly which entities, activities, people, assets, contracts, data, liabilities and locations are included, excluded, shared or unresolved.

| Mode | Plan emphasis |
| --- | --- |
| Acquisition | Target assessment, diligence questions, strategic fit, funding assumptions, integration alternatives and post-completion value tracking |
| Merger | Combined operating model, complementary and duplicate capabilities, decision rights, culture, customer continuity and integration sequencing |
| Sale preparation | Evidence readiness, business narrative, financial reconciliation, resource/contract completeness, operational improvement and disclosure workflow |
| Carve-out to operate | Subsidiary operating model, resources, governance, separate reporting, shared-service arrangements and eventual independence where intended |
| Carve-out to sell | Sale perimeter, buyer requirements, separation plan, standalone costs, temporary services and both businesses' post-separation operations |

The transaction workspace must consider both the transferred/new business and the retained parent. Maintain separate operational and financial views for each, and a combined reconciliation so allocations do not make costs disappear.

Professional practice supports planning across pre-sign, sign-to-close and post-close, including readiness and benefit delivery. This informs the product's stage model; it is not a claim that AI can replace deal advisers. [KPMG integration and separation lifecycle](https://kpmg.com/xx/en/what-we-do/services/advisory/deal-advisory/our-capabilities/integration-separation.html).

### Two meanings of Day 1

- **Engagement Day 1:** the first day our team or customer starts the assessment. The platform creates a provisional plan, interview schedule, evidence request list, scope, owners and open questions from what is known.
- **Transaction Day 1:** the first operational day under the completed transaction or approved new structure. The platform maintains a readiness checklist and executable runbook, based on verified dependencies, approvals and current facts.

Full lifecycle coverage is available from the outset. Task detail and certainty increase as evidence arrives. Unknown transfer rights, missing payroll information or an unspecified completion date remain explicit blockers or assumptions; AI must not invent them to present a supposedly complete plan.

### Transaction stages and outputs

| Stage | Generated plan and supporting outputs |
| --- | --- |
| Engagement initiation | Objectives, roles, scope, confidentiality boundaries, interviews, inspections, initial timetable and evidence requests |
| Discovery and diligence | Business/resource maps, finance and technology findings, questions for advisers, contract review register, dependencies and data quality exceptions |
| Options and future design | Buy/merge/separate alternatives, degree of integration or independence, target organisation, cost scenarios, customer continuity and constraints |
| Pre-completion preparation | Workstreams, resource plan, consent/approval tracking, draft transition-service schedules, system/data migration plans and readiness rehearsals |
| Completion and operational Day 1 | Authorised cutover sequence, accountability, evidence of readiness, communications, contingencies and stabilisation support |
| Days 2–30 | Operational stabilisation, payroll/payment checks, issue management, data reconciliation, customer/supplier monitoring and first reporting cycle |
| Days 31–100 | Approved integration or separation changes, process improvements, benefit validation, temporary-service exit milestones and revised forecasts |
| Beyond Day 100 | Remaining separation/integration, service exits, longer-term operating model and ongoing performance improvement |

Day 100 is a review milestone, not a promise that every complex separation will finish within 100 days. Timelines are driven by the actual transaction, consents, systems, resources and critical path.

### Core workstreams

| Workstream | Detailed planning coverage |
| --- | --- |
| Governance and legal | Structure decisions, authorisation register, transaction conditions, entity setup tasks, transfer/consent review and adviser deliverables |
| Finance and treasury | Opening balances, chart of accounts, bank/payment access, invoicing, collections, supplier payments, funding needs and financial reporting |
| People | Role and reporting-line design, workforce scope, key-person dependencies, payroll, benefits, communication, training and adviser-managed employment requirements |
| Technology and cyber | Identity/email, applications, ERP/CRM, telephony, domains, hosting, connectivity, access segregation, security controls and service support |
| Data and records | Data ownership and permission, source/target mapping, extraction, reconciliation, retention, restricted-data handling and access revocation |
| Commercial | Customer agreements, order pipeline, pricing, service commitments, branding, marketing, notices and relationship ownership |
| Suppliers and operations | Purchasing authority, supplier accounts, stock, production, equipment, logistics, quality, fulfilment and service continuity |
| Premises and assets | Ownership/lease treatment, facilities access, utilities, insurance evidence, shared equipment and transfer/replace tasks |
| Compliance and specialist advice | Applicable jurisdiction/sector questions, control ownership, policy and evidence transfer, approval conditions and specialist sign-off |
| Value and performance | Savings, growth, cash timing, one-off costs, service outcomes, retained-parent effects and independently traceable benefits |

### Carve-out economics and temporary services

Model the historical departmental result, the allocation bridge and the future standalone result separately. A department's allocated costs do not reliably equal its future independent costs.

Track one-off separation costs, new recurring costs, temporary duplicate running costs, temporary-service charges, loss of group purchasing benefits, and costs left in the parent after the activity leaves. Use consistent currencies, periods and scope and retain the assumptions behind the bridge.

Where temporary services are needed, generate a draft transition service agreement (TSA) service schedule: provider, recipient, service, users/volume, performance requirement, access, price, start/end, dependencies, escalation and exit criteria. Legal terms require the relevant advisers. Some services may flow from the new business back to the parent; model the direction explicitly.

Give each temporary service an exit owner, replacement capability, migration plan, test evidence, last dependency and closure approval. KPMG identifies technology dependencies, standalone reporting and deliberate TSA exit planning as important elements of separation. [KPMG: Winning the separation](https://kpmg.com/uk/en/insights/advisory/winning-the-separation.html).

### Illustrative dependency chain

A carved-out department's customer support uses the parent's phone numbers, CRM, customer database and identity system. The plan cannot mark customer support ready merely because a new subsidiary exists. It must choose an authorised temporary service or establish replacement access, verify permitted customer data, set routing, allocate trained staff, test enquiry handling and name an escalation owner before service handover.

The graph links this dependency to contracts, customers, costs and Day 1 tasks. A changed transfer date or refused licence transfer should update affected tasks and scenarios, then trigger review.

## 22. Operational Day 1 readiness and execution

The platform produces an operational runbook for each specific transaction. A readiness view includes:

- Can authorised staff access the necessary premises, equipment, applications and support?
- Can the business take an order, deliver, invoice, receive money, pay a supplier and process payroll?
- Are customer and supplier communications prepared and approved, with correct entity, contact and payment information?
- Are transferred/shared contracts, licences, service arrangements and required permissions ready for the chosen operating model?
- Is the relevant data available, reconciled, permissioned and recoverable?
- Are accountable owners, incident response and temporary service support available?
- Are outstanding conditions, risks and dependencies resolved or explicitly accepted by the authorised decision-makers?

Each readiness assertion links to test results or documentary evidence and an accountable sign-off. Overall percentages cannot hide a critical blocker: a company with no working invoicing or payroll process cannot be shown as operationally ready because many smaller tasks are complete.

The cutover runbook records relative/actual time, owner, prerequisites, exact action, tool/role permissions, expected result, verification, stop/go authority, escalation and rollback or contingency. Where rollback is impossible, use a forward-recovery plan and flag the decision accordingly. System changes and externally sent communications require established authority; generating a plan grants none.

Keep buyer, seller and separate deal workspaces isolated by default. Use role- and purpose-restricted diligence views, controlled sharing, redaction and specialist-approved access arrangements where information is sensitive. Any sharing across organisations is explicit and auditable. Recommendations to integrate operations before completion must remain subject to authorised legal review and applicable transaction conditions.

Additional acceptance checks before releasing transaction execution:

1. The plan distinguishes engagement start, signing, completion, operational Day 1 and later milestones.
2. Missing transfer consent or a failed critical system test blocks the dependent action.
3. A changed scope or completion date recalculates dependencies and prompts review of financial assumptions.
4. Cost bridges reconcile the new business, retained parent, temporary services and total group costs without disappearing allocations or duplicated savings.
5. Buyer/seller isolation also holds in retrieval, graph results, summaries, job outputs and exports.
6. Payment, identity and data migration simulations require role-appropriate sign-off and maintain recoverability evidence.
7. Every Day 1 business-critical capability has a named owner and acceptance evidence.
8. Actual outcomes can be compared with approved scenarios through the first reporting cycle and later benefit reviews.

This expansion remains a product and implementation specification. It does not assert that a transaction has been assessed, an executable deal plan has been validated, or production functionality has been installed.

## 23. Combining the Enterprise AI Architecture Role work

The identified thread had two purposes: extending Omniqora's enterprise AI capability and assessing Amer's suitability for an Enterprise Architect role. The product-relevant part is the Enterprise AI Governance & Adoption work. The career-assessment material is not part of the SaaS product.

Retrieved prior context describes an enterprise extension covering use cases and risks, independent approvals, audit records, model/token cost forecasting, architecture guidance and adoption planning. It reports locally tested code, with host authentication, dashboard, live provider connections and runtime enforcement still to be integrated. Treat this as candidate implementation to inspect and reuse, not a production dependency already proven available.

Combine the work through the following responsibilities:

| Layer | Reused/proposed responsibility | Business360 use |
| --- | --- | --- |
| Enterprise architecture | Current and target system maps, ownership, integrations, decision records, technology roadmap | Explain current constraints and design a workable future operating model or transaction separation/integration |
| AI governance and adoption | Use-case register, risk/approval policies, ownership, pilot decisions, evaluation and adoption roadmap | Decide where AI is appropriate, who may approve it, how it is tested and how adoption is measured |
| Shared intelligence | Model access, evidence retrieval, graph services, deterministic analysis and source permissions | Analyse business evidence and explain recommendations without losing traceability |
| Agent execution | Scoped tools, durable workflows, approvals, retries, timeouts, cancellation and audit | Carry out approved investigation and implementation tasks |
| Business360 domain | Discovery, resources, processes, finance/KPIs, opportunities and benefits | Turn the evidence into a business improvement programme |
| Transaction domain | Deal perimeter, workstreams, dependencies, readiness, runbooks and temporary-service exits | Carry the programme through acquisition, merger or separation and subsequent operations |

For each proposed automation or AI use case, attach the business problem, data sources, intended users, process owner, expected benefits, system dependencies, permitted actions, risks, evaluation criteria, running-cost estimate and deployment status. Link the use case to the relevant business finding and implementation tasks.

The product can then generate an architecture/adoption pack alongside the commercial plan:

- Current technology and data landscape with known gaps and dependencies.
- Proposed target systems, integrations, data flows, identity boundaries and controls.
- Options and decision records explaining selection and trade-offs.
- Prioritised AI/automation roadmap with pilots, acceptance criteria and accountable owners.
- Model, infrastructure, connector and operational cost assumptions.
- Adoption, training and change-management tasks.
- Transaction-specific separation or integration requirements and Day 1 dependencies.

AWS Bedrock, Databricks and Snowflake were context from the role discussion. They must be assessed against the actual customer's estate and requirements; they are not mandatory components or already-live integrations of this product.

The next implementation step is to inspect the current Omniqora source and enterprise extension together, map available interfaces against this brief, and build the discovery-led Phase 1 workspace on the verified services. Record missing services explicitly in the implementation-status register.
