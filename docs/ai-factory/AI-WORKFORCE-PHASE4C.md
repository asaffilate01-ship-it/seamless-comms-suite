# Omniqora AI Workforce Phase 4C — operator-only read-only model probe

Status: **source-only staging foundation; not connected to tenant employees or paid model jobs**.

This phase prepares a minimal OpenAI Responses API provider interface for a future controlled read-only AI Workforce pilot. It does **not** activate any provider account, fetch tenant data, authorise a customer action or connect the generic Agent Factory queue.

## Built

- Synthetic-only model input from static Phase 4B fixture datasets.
- A single hard-coded HTTPS endpoint for the Responses API; URLs are never controlled by tenants, prompts, tasks or connectors.
- No tool definitions, no tool calls, explicit tool_choice=none, store=false, background=false, stream=false.
- Maximum output tokens 32–256, input-byte bound and fixed max input token estimate.
- An operator-supplied, recently reviewed model price/currency record plus maximum per-probe cost ceiling. Estimates are NOT independent provider billing receipts or reserved tenant balances.
- One-shot fetch with redirect refusal and a bounded timeout; no retries, web browsing, file access, messaging, payment, database write or job execution.
- The output must be a completed text-only response with bounded text and an explicit usage record. Tool output, missing usage, over-limit tokens and cost are rejected.
- Returned metadata states customerDataRead=false, customerActions=0, toolCalls=0, costEstimateOnly=true, reviewRequired=true and dataOrigin=synthetic_fixture.
- A separate operator-probe command gated by AI_WORKFORCE_MODEL_PILOT_ENABLED=true and AI_WORKFORCE_MODEL_PILOT_CONFIRM=SYNTHETIC_ONLY_APPROVED. NODE_ENV=production is refused. Credentials never appear in browser state or CI.
- Tests use a fake HTTP transport. No real provider request or spend occurs during CI.

## Source

services/ai-workforce-readonly/model-probe.mjs
services/ai-workforce-readonly/operator-probe.mjs
verification/control-plane/ai-workforce-phase4c.test.mjs

## Required environment for an OPTIONAL, manual staging request

The operator must approve this independently and accept any genuine vendor token charges. None of these environment variables are set by the repository:

- AI_WORKFORCE_MODEL_PILOT_ENABLED=true
- AI_WORKFORCE_MODEL_PILOT_CONFIRM=SYNTHETIC_ONLY_APPROVED
- AI_WORKFORCE_MODEL_ID (version reviewed and supported for Responses API)
- AI_WORKFORCE_TARIFF_VERIFIED_AT (recent ISO timestamp)
- AI_WORKFORCE_TARIFF_EVIDENCE_URL (HTTPS vendor price reference)
- AI_WORKFORCE_OPERATOR_REFERENCE (written approval reference)
- AI_WORKFORCE_INPUT_RATE_MINOR, AI_WORKFORCE_OUTPUT_RATE_MINOR (verified minor-currency units per 1M tokens)
- AI_WORKFORCE_MAX_PROBE_COST_MINOR (explicit ceiling)
- AI_WORKFORCE_CURRENCY (GBP, EUR or USD)
- AI_WORKFORCE_PROVIDER_TOKEN (server-only credential; never Git or client)

Operator command:

    node services/ai-workforce-readonly/operator-probe.mjs

This command is **never invoked automatically**, and it is not part of the user-facing product. No live key, provider credential, API spend or customer data was added.

## Acceptance tests

    node --test verification/control-plane/ai-workforce-phase4c.test.mjs
    bun run typecheck
    bun run build
    bun run test:security

Test the adapter against mocked completed, incomplete, malformed, oversized, tool-calling, over-cost, stale-tariff, wrong-host and expired-approval cases. Before attempting any real model request: verify the versioned model supports the chosen endpoint, operating region, safety evaluation, price evidence, billing budget and contracted data processing terms.

## Next required phase — 4D customer-backed read-only worker

Do NOT connect this probe directly to the tenant UI. Phase 4D must implement an independently reviewed tenant-scoped credential vault and tool-grant attestation, model-evaluated region/country policy, cost-reservation and post-provider reconciliation, atomic job admission linking approved employee/task revisions to the canonical budgeted queue, role-safe read-only retrieval, idempotency, cancellation and immediate revocation. External writes, outreach, employment decisions, financial transfers and filings remain separately gated by human review.
