# Build order for Omniqora and the portfolio

Build the shared capability as Omniqora add-ons first, with each SaaS retaining its own business data, permissions and approvals. The same service interfaces can later support an external company or a separately branded host. Reuse code and controlled services; do not combine unrelated customer datasets or duplicate the core in every frontend.

1. **Reconcile sources in the existing Omniqora repository.** Inspect current AGENTS.md, authentication, routes, organisation schema, Supabase conventions and current main. Preserve existing inbox, WhatsApp, cases, contacts and billing. Treat PR2 as already merged. Stage RRCI's repository-relative changes in a branch; keep the broader pilot and legacy suite isolated while porting selected modules. Do not import unrelated product migrations.
2. **Complete the RRCI host boundary.** Review the paired tenant-creation change/migration, add isolated database tests for membership, entitlement expiry and role escalation, resolve governance reliability gaps, then build `/app/regulatory-intelligence` inside the existing AppShell. Add catalogue/source setup, cited search, relationship review, approval queue and audit views. Use trusted demo provisioning for fictional records.
3. **Port the AI/day/planning pilot deliberately.** Replace Sites identity with existing verified Supabase sessions, D1 with transactional Postgres and R2 with private storage. Preserve revision/idempotency/approval semantics. Implement My day in each user's workspace and the shared task inbox. Reuse deterministic metrics before adding model explanations. The pilot's SQLite migrations must not be run in Supabase.
4. **Connect one narrow Haccora workflow.** Start with approved procedures, a missing-evidence follow-up and a manager-reviewed internal task. Map company/site/user roles and source identifiers. Demonstrate two unrelated companies and revoked access before extending the workflow. Haccora UK PR37 is already merged; keep launch configuration work separate from the new shared AI integration.
5. **Demonstrate a second product.** Add TaxNuvia's separate firm/public collections and a sourced onboarding brief, or Dokuvera's document revisions. Prove reuse without moving private data between products. Use the same engine with product-specific source mapping and review rules.
6. **Complete the Lawquo contract.** Review its draft PR1 in `law-remix`; preserve the merged PR2 portfolio update. Add a durable `prepare_assessment` operation and authenticated, revision-bound private result callback. Recheck current case permissions and legal review before publication. Generic internal task acknowledgement is not this callback.
7. **Wire operational connectors.** Each source SaaS owns a durable outbox/inbox, scoped service credentials, source IDs, revisions, receipts, retry policy and failure queue. Add subscriptions/membership sync and the ecosystem offer/linking components only where the product should expose them. Confirm current country and audience restrictions.
8. **Add voice and reception.** Select and integrate carrier, real-time voice, transcription and staff presence adapters. Resolve caller number to candidates, confirm the customer, ask about a follow-up and offer the previous real colleague. Check availability and provide callback/another-person options. Keep verified source booking/order receipts and KDS acknowledgement authoritative.
9. **Add daily automation and granular BI.** Connect calendar RSVP/tasks/CRM and a per-user timezone scheduler. Make the brief answer: what is overdue, due today, unconfirmed, blocked, why it matters and which help is available. Add line-level sales/returns/discounts/tax, recipes/lots, supplier dates, payroll/rotas and ledger movements before advertising finer predictions or integrated financial statements.
10. **Prepare a customer release.** Wire paid entitlements and metering to actual billing events, define usage limits by company/product/provider, add backups/restore, alerting, deployment rollback, retention and support. Evaluate retrieval and agent output using reviewed domain datasets and record live operational evidence. Launch one controlled customer workflow before expanding autonomous actions.

## Test gates that answer concrete risks

| Gate | Evidence required |
| --- | --- |
| Identity and entitlement | Expired sessions and entitlements fail; no self-enrolment or cross-tenant/module escalation; onboarding remains valid |
| Retrieval and governance | Wrong case/source excluded before ranking and model use; permission revocation, expired sources, contradictions, missing authority and outage states behave as specified |
| Reliability | Repeated deliveries, stale revisions, crashes between governance/index stores and source deletions converge without duplicate work or stale evidence disclosure |
| Agent execution | Allowed tool/argument checks, independent review where required, exact-payload approval, final permission check, cancellation and source receipts |
| Finance and operations | Reconciled source totals, explicit dates/currency/coverage, no inferred balance sheet from sales, forecast backtests without future leakage |
| Voice/ordering | Shared/withheld numbers, unknown caller, staff unavailable, interrupted call, price/stock changes, slot contention, payment failure, KDS timeout and webhook replay |
| Commercial operation | Real billing updates entitlement correctly; isolation, usage budgets, monitoring, backup restore and support escalation exercised |

## Professional agent and tool catalogue

An agent is a bounded workflow with data access, tools, budget and a review policy. Start with the supplied ten templates; additional named roles below are implementation targets, not separate completed autonomous systems.

| Agent/workflow | Tools and data it needs | Output and authority |
| --- | --- | --- |
| Daily guide/coordinator | Personal tasks, confirmed source calendar, inbox/case status, blockers, KPI exceptions | Prioritised brief, questions, suggested next steps; user confirms changes affecting shared work |
| Knowledge/research | Authorised RAG/graph service, approved source catalogue, citations and freshness/authority | Cited evidence or draft; abstain/escalate on missing or conflicting authority |
| Inbox/customer support | CRM/case lookup, policy retrieval, draft reply and internal task tool | Draft/helpful next step; actual sending requires approved connector/action |
| Reception/call continuity | Carrier events, speech/voice, CRM candidate lookup, staff directory/presence, transfer and callback tools | Confirmed request and real transfer receipt; matching a number is not identity proof |
| Orders/bookings | Authoritative catalogue, prices, stock/slots, payment state, source reservation/order and KDS APIs | Validated source receipts; never treat generated text as successful payment or booking |
| Finance/performance | Read-only ledger/EPOS/bank adapters, deterministic metric and scenario functions | Explain results, uncertainty and review actions; financial transactions remain in source systems |
| Stock/procurement | SKU/lots/recipes, expected deliveries, supplier terms, approved purchase proposal tool | Expiry/replenishment review; purchasing requires the business's authorisation |
| Workforce/training | Role-limited rotas, availability, skills, training/requirement register | Coverage/training proposals; source HR system and authorised managers own employment decisions |
| Compliance/risk | RRCI sources, controls/evidence mappings, reviewed relationships, audit/approval tools | Traceable gaps and proposed controls; do not issue an automatic compliance certificate |
| Documents/legal/projects | Controlled source revisions, case/project permissions and domain-specific review tools | Private drafts and evidence packs; legal and professional approvals stay in the relevant SaaS |
| Content/commerce | Approved brand/product data, catalogue facts, draft content tool | Reviewable text; image/video generation needs separate provider/rights integration |
| Operations/service admin | Health/usage metrics, job queues, deployment and incident records | Operator alerts and proposed remediation; no unrestricted infrastructure shell tool |

Required platform capabilities are model/provider adapters, authenticated tool registry, scoped retrieval, durable workflow queue, review/approval service, event receipts, usage/entitlements, observable audit and human handover. Framework/provider names are replaceable implementation choices; no new paid provider was purchased or configured in this delivery.

## Financial-adviser and learning update — 15 September 2026

The later addition is in `development/adviser-learning/`. It includes the new local decision journal, reviewed lesson and evaluation utilities, portfolio/meeting/follow-up helpers, and 59 current ZaksTrader reference files. Read `docs/FINANCIAL-ADVISER-AND-LEARNING.md` and the extension's `START-HERE.md`. Seventeen new local tests passed. The adviser UI, live providers and shared host wiring remain to be implemented. This addition does not activate trading or autonomous model updates.
