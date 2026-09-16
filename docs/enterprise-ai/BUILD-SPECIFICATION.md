# Enterprise AI architecture governance and adoption

## Product decision

Add an Enterprise AI workspace inside Omniqora. Reuse the existing organisation, identity, entitlement, notification, connector and intelligence interfaces. Keep enterprise governance configuration within the customer's tenant. Retain a reusable core so a future standalone host can replace identity, billing and navigation without changing business rules.

This specification extends the existing RRCI and adviser-learning work. It does not create a second copy of their knowledge engine or executor. The proposed capabilities below are a backlog unless explicitly marked implemented locally.

## Workspace and navigation

Proposed route: `/app/enterprise-ai`. Follow the current repository AppShell and route conventions after inspecting the latest branch; the historical handover records React 19 and TanStack Start.

| Screen | Principal task | Key fields and actions |
| --- | --- | --- |
| Overview | Understand adoption and exposure | Approved pilots, active owners, evidence overdue, cost by department, realised benefits |
| Architecture | Map current and target state | Systems, owners, data flows, trust boundaries, dependencies, ADRs and versions |
| Use cases | Prioritise and approve work | Problem, sponsor, users, business baseline, risk, data readiness, funding |
| Agents and models | Know what is running | Version, purpose, tools, source access, runtime location, owner and status |
| Policies and controls | Define approved practice | Policy version, control owner, exception, review date and evidence |
| Evaluations | Determine release readiness | Dataset version, thresholds, failures, reviewers, approvals and regression results |
| Costs | Forecast and allocate spending | Tokens, tools, infrastructure, review, budget, variance and cost per successful task |
| Roadmap | Sequence delivery | Dependencies, milestones, accountable owner, budget and exit criteria |
| Evidence and incidents | Review decisions and failures | Source versions, traces, actor identities, incident impact and remediation |

On mobile, use summaries and a focused record view; retain full evidence and approvals. On desktop, support side-by-side review of a proposal and its evidence. Risk labels require text as well as colour. Export only through a permission-checked server action with source-aware filtering.

## Current and target architecture

Current-state discovery must establish what the customer actually owns before selecting technologies. Inventory deployed AI, unapproved tools, application owners, contracts, identity boundaries, source permissions, regions, data retention and current usage. Treat vendor names in the advert as possible estate components, not a requirement to purchase all three platforms.

The target separates the management workspace from agent execution. The management layer records use cases, policies, approvals, costs, evaluations and roadmap decisions. The execution layer checks current permissions, approved versions, action limits and budget reservations before each operation. Only the execution layer can call external tools. A register entry alone is never authorisation to act.

Reuse RRCI for permission-aware evidence and action-proposal controls. Reuse adviser-learning for reviewed outcome journals and candidate evaluations. Adopt existing provider or data-platform controls where they already satisfy a requirement; Omniqora should reference their evidence and coordinate workflows instead of recreating every control.

## MVP scope and delivery status

| Capability | This package | Next implementation |
| --- | --- | --- |
| Use-case register | SQLite local core with tenant and workspace scoping | Host-authenticated API, Postgres/RLS and UI |
| Assessment | Fixed policy with required control references | Versioned policy administration and qualified domain review |
| Independent approval | Contributor and owner separation, expiry, content binding | Host identity, evidence versions and transaction-safe revocation |
| Pilot lifecycle | Draft, assessed, approved, pilot and suspended | Runtime gating, production release and retirement |
| Token planning | Multi-model Decimal calculations, retries, cache, human review | Saved scenarios, actual usage ingestion and reconciliation |
| Audit | Successful mutations committed atomically with records | Independent retention, denials, versions, search and exports |
| Architecture inventory | Specification only | Applications, flows, dependencies, decision records |
| Roadmap and benefits | Specification and 90-day plan | Milestone storage, dependency checks, baseline and benefit tracking |
| Dashboard | Specification only | Existing Omniqora routes, responsive views and browser tests |
| Bedrock Databricks Snowflake | Reference mapping only | Operator accounts, scoped credentials, sandbox validation |

## Data model for the host

Use host tenant and workspace identifiers consistently. Proposed host entities are systems, data flows, use cases, agent versions, model versions, policy versions, control assessments, evidence versions, approvals, evaluations, roadmap milestones, usage events, budgets and incidents. Preserve historical versions rather than replacing previously approved content.

Every mutable record needs owner, revision, created/updated actor and timestamps. Approval records bind to the exact reviewed object version, policy version and evidence versions. Usage events need provider, model version, run, timestamp, token types, pricing version and a unique provider/event key. Avoid storing raw prompts by default; where retained, apply explicit access and retention rules.

A tenant field is insufficient isolation by itself. Server queries, database policies, object storage, queues, caches, vectors, graph edges and exported evidence must all preserve the same boundary. Test cross-tenant and cross-workspace access with real host credentials before release.

## Governance operating model

| Responsibility | Accountable role |
| --- | --- |
| Business outcome and adoption | Business use-case owner |
| Target architecture and exceptions | Enterprise architecture lead and architecture forum |
| Data access and permitted use | Source data owner |
| Security design and assurance | Security lead |
| Domain suitability and external outputs | Relevant domain/compliance reviewer |
| Quality thresholds and evaluation | Evaluation owner independent of model change author |
| Budget and benefits | Sponsor and finance owner |
| Service operations and incidents | Named service owner |

Recommended policy set: approved AI use; data classification and retention; model/provider approval; agent tools and autonomy; AI-assisted software development; evaluation and release; incident response; exceptions; procurement and exit. Map controls to NIST AI RMF and the firm's own obligations through qualified reviewers. Do not turn framework mapping into a claim of certification or legal compliance.

For Claude Code and Lovable use, define repository permissions, approved source/data use, secret handling, dependency checks, code review, automated testing and promotion rights. The choice of coding tool does not replace the organisation's engineering controls.

## Agent behaviour and release gates

Start with a bounded research-brief workflow: authenticate; retrieve permitted sources; draft with citations; validate structured output and citation coverage; route to a qualified human; record outcome. Use fictional/public data for the first demonstration. Do not introduce trading or client-account changes into the first pilot.

Before connecting tools, establish allowlisted operations, parameter validation, scoped credentials, bounded iterations, timeouts, idempotency, circuit breakers, escalation and an effective stop mechanism. Retrieved text is untrusted evidence and cannot change permissions. A content filter does not replace access checks.

Required evaluation categories: groundedness, citation accuracy, task completion, leakage, injection, denied-tool use, access revocation, provider outage, latency, cost and human correction rate. Set thresholds before running the evaluation. Save dataset and model versions, individual failures and reviewer decisions. Separate model quality from deterministic control tests.

Release proceeds through assessment, sandbox, controlled pilot and production review. The current local core stops at pilot registration. Production release requires host identity tests, actual runtime enforcement, backup/restore, monitoring, live connector assurance and a named operational owner.

## Cost and investment model

Monthly tasks = active users × tasks per user per working day × working days.

For each model, calls = tasks × calls per task × (1 + expected retry fraction).

Model cost = calls × ((uncached input tokens × input rate) + (cached input tokens × cached rate) + (output tokens × output rate)) / 1,000,000.

Add tools, retrieval, embeddings, storage, compute, licensing, support, human review and contingency. Keep all rates in one stated currency and retain price date and FX assumptions. Include cache-write or reasoning-token charges according to the provider's actual billing model. Forecast peak concurrency separately from monthly spend.

Track cost per successfully completed task and realised benefit after review effort. Time saved is not automatically a cash saving. A production budget mechanism must atomically reserve an upper bound before work, reconcile actual usage, handle duplicate events and retries, and deny new work when the budget is exhausted. The local forecast check does not implement this mechanism.

Illustrative demo assumptions, not vendor prices: 100 users × 5 daily tasks × 20 days = 10,000 tasks. Two model calls per task, 4,000 input tokens at £3/million and 500 output tokens at £15/million yield £390 model spend. £320 additional monthly costs and 20% contingency give £852. Excludes tax and any charges not included in the scenario. The demo computes these figures.

## First 90 days

| Period | Deliverables | Exit criterion |
| --- | --- | --- |
| Days 1 to 30 | Current-state inventory, interviews, use-case shortlist, risk baseline, cost assumptions and target principles | Owners validate the map and sponsor approves pilot priorities |
| Days 31 to 60 | Target architecture, policy ownership, two bounded pilots, evaluation datasets, reference implementation and cost scenarios | Security/data reviewers accept the design and pilots meet agreed thresholds |
| Days 61 to 90 | Controlled rollout, training, runbooks, operational metrics, budget proposal and later adoption waves | Sponsor reviews measured value, control evidence and support readiness |

Indicative later waves: expand approved departmental patterns, onboard more systems, consolidate providers and consider selective automation only where controls and outcomes support it. Funding and staffing determine dates; this is a proposed plan, not a delivery commitment.

## Standalone path

Keep business logic free of Omniqora imports. Supply replaceable ports for verified identity and entitlement, evidence, runtime usage, revocation and notifications. A standalone host would add its own account provisioning, billing, support, domain and application shell. Preserve tenant data boundaries; do not transfer customer data automatically. A dedicated enterprise deployment is an operational option with separate backup, keys and upgrade ownership.

## Acceptance criteria for host release

1. A user cannot read or mutate another tenant or workspace, including through exports and background jobs.
2. Clients cannot choose their role, risk tier, entitlement, approval state or final forecast used for approval.
3. All contributors and owners are excluded from independent approval; evidence and policy changes invalidate approval.
4. Revoked users, expired entitlements and suspended use cases cannot start new runtime work; in-flight behaviour is documented and tested.
5. Runtime usage and retries are attributed once; budget reservation remains correct under concurrent calls.
6. Source ACL changes propagate to retrieval, caches, graph relationships and displayed evidence.
7. A model/tool/policy change runs the evaluation suite and requires release review.
8. Provider outages produce an explicit unavailable/degraded result and do not fabricate grounded answers.
9. Dashboard data distinguishes demo, pilot and production; forecasts and actual charges remain separately labelled.
10. Audit retention, incident response and backup restoration are demonstrated before external rollout.
