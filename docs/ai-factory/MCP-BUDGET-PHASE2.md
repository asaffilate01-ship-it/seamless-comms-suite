# Omniqora AI Agent Factory — phase 2 handover (12 October 2026)

## Scope built as source

This phase extends the approved-recipe and MCP-directory feature of Omniqora PR #97. It adds:
- Tenant/product-scoped **MCP setup requests** from search results. Requests are stored as *requested*, reviewed independently by a platform administrator and may be *shortlisted*, *rejected* or *revoked*. **Shortlisted does not mean installed, authenticated, allowed tools or live.**
- Tenant owner/admin monthly **AI spend limit** (GBP/USD/EUR, minor units) via a guarded SQL function. Budgets belong to the actual SaaS tenant and product, not a global pool.
- Reviewed **AI model tariffs** storing provider, exact model, currency, approved rate version, cached/uncached input price, output price, region clearance, evaluation evidence and date. Nothing is seeded with guessed prices.
- A **budgeted one-click task queue**: only independently approved Agent Factory use cases with active SaaS product/AI entitlement, fresh independently verified provider binding, qualified rate, country clearance, sufficient monthly balance and valid idempotency key can be enqueued.
- Atomic SQL creation of budget reserve + `ai_agent_runs` + `intelligence_jobs`. A failure rolls the entire operation back. Reusing an idempotency key with altered payload is rejected.
- Trusted service-role-only **receipt settlement** records actual provider billing against the reservation, releases unused reserve, and reports provider overage rather than hiding it. Neither browsers nor tenant members can fabricate charges.
- An independently authorised cancellation RPC cancels only queued, unclaimed work with no agent steps; budget is released atomically. In-progress work requires worker-side cancellation and actual receipts.
- Read-only operator panels and an independent **MCP Platform Review** route, all under existing Omniqora authentication. The generic legacy run route rejects Factory recipe use cases to avoid bypassing their reservation path.

## Code paths

- `supabase/migrations/20261012180000_mcp_budgeted_ai_factory_v2.sql` — four new tables, strict RLS and SECURITY DEFINER RPCs; **no live tenant, account, AI model rate, secret, entitlement, MCP endpoint or provider binding is created**.
- `src/modules/agent-factory/operations.functions.ts` — authenticated UI-to-SQL data contracts.
- `src/modules/agent-factory/AgentFactoryPanel.tsx` — request setup, budget controls, reviewed model selection, cost preview and gated budgeted task queue.
- `src/routes/_authenticated/app.mcp-review.tsx` — platform-level review queue, with independent review notes.
- `src/modules/intelligence/functions.ts` — prevents an existing generic route from bypassing Factory budgets.
- `verification/control-plane/agent-factory-phase2.test.mjs` — security/approval/rate/idempotency contract assertions.

## What is still unavailable

**No third-party MCP tool is invoked by this phase.** OAuth flows, secure vault-backed credentials, supplier/vendor verification, tool-schema probing, tenant-scoped scope grants and remote execution sandboxes remain future controlled work.

**No model is automatically invoked by queueing a task.** The worker must be deployed and must enforce:
1. The expected `budgetReservationId` and per-step token/tool spending ceilings before each provider call.
2. The current tenant/source product access and exact allowed tool bindings.
3. Independent per-action approvals for writes, payment, financial-regulatory actions and sensitive data export.
4. Provider capability/region compliance, account rotation, retry/idempotency and revocation, including mid-run.
5. Trusted final usage receipt and calls to `settle_budgeted_ai_agent`; queued work can be atomically cancelled with `cancel_budgeted_ai_agent` before any worker claim or model step. Once processing starts, the worker must cancel and settle its actual usage; the UI cannot prematurely release funds.

Current **reservation** is a reliable atomic *pre-run admission limit*, not a guarantee that a misconfigured external model worker cannot overspend. Actual charge can exceed reserve and will be recorded as overage.

## Activation checklist

1. Merge the reviewed stack only after green build, security, complete migration-chain and forced-RLS CI.
2. Run production dry-run for migrations `20261012130000`, `20261012141000`, `20261012180000` and apply only with controlled release approval. A Git merge is not a Supabase deployment.
3. Provision one staging tenant plus an active product and `omniqora.intelligence-runtime` entitlement. Confirm admin vs member and cross-tenant query/RPC denial.
4. Install and independently verify the approved model provider account and `provider_bindings` health receipt.
5. Curate real verified model pricing in `ai_reviewed_model_rates` from vendor evidence, including accurate currency/rate and model evaluations. Do not use a placeholder rate for production.
6. Configure a monthly tenant/product budget and approve the Agent Factory use case with a **different** reviewer from its author.
7. Run positive and adversarial staging cases: duplicate idempotency, lower budget, stale tariff, stale provider verification, wrong country, wrong tenant, suspended use case, risk model mismatch, no entitlement, unauthenticated calls, blocked browser writes, repeat settlement, overage.
8. Deploy a separately authenticated worker with positive receipt proofs and negative cancellation tests before enabling real model calls.
9. Pilot first with read-only agents for Gabley property matching (source-published only), Dishbee menu insights, XpertJobs interview coordination and Finvessa accounts review. Do not automate eligibility, offers, tax filing, payroll, payouts or external correspondence.

## Observability

Budget reservations are **not actual expenditure**. Actual provider receipts only populate `spent_minor` when the trusted worker submits settlement. Display reserved and incurred amounts separately. MCP review status is not provider health. Profile settings and a public registry entry are not authorisation.

Canonical source authority stays with each SaaS: Gabley listings, MealDeck/Dishbee orders, recruitment records, MoneyBridge money movement and all other vertical transactional systems.
