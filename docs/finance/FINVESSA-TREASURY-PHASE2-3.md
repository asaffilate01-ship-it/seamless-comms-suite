# Finvessa TreasuryOS — Liquidity Risk + Independent Review (Phases 2–3)

**Delivery state: GitHub source implementation only.** Stacked on the Phase 1 analyst workbench (PR #131); not deployed, migrated or a live bank integration.

## Phase 2 — deterministic liquidity risk

The Phase 2 scenario engine uses individual, validated Phase 1 forecast cash flows; it does not infer gross inflows/outflows from weekly net totals. Each operator supplies explicit treasury-policy rows in liquidity-policy.csv:

    currency,minimum_cash,undrawn_facility,outflow_stress_pct,expected_inflow_haircut_pct

The controls calculate currency-specific cash floors, outflow shocks (0–300%), haircuts to expected inflows (0–100%), weekly stressed closing cash, funding buffer breaches and uncovered shortfalls. Committed inflows remain unchanged. Stress adjustments conservatively round UP in safe integer ISO currency minor units. Undrawn facilities are shown separately and **never added to cash**.

Every scenario includes evidence references. No currency netting, unsourced FX prices, LCR/NSFR, IRRBB or approved trading recommendation is created. A blocked cash report stays blocked, and missing policy/forecast evidence produces an unassessed currency, never a fictional satisfactory rating.

The demonstration includes clearly labelled synthetic policy limits. For an imported real-data report, no policy is silently inferred; the operator must provide a policy CSV. The risk result remains a scenario analysis, not approval for an action.

## Phase 3 — review and audit fingerprint register

The new schema-only migration is supabase/migrations/20261017193000_finvessa_treasury_review_register.sql.

- Tables: treasury_review_cases and treasury_review_events, with tenant IDs and product_key=finvessa.
- Retains only SHA-256 fingerprints, report dates, mode, exception/coverage counts, workflow states, reviewer identities and bounded review notes. **No raw bank/GL CSV, account numbers, amounts, policies, customer documents or payment credentials are stored.**
- Source and policy hashes are calculated in the browser and sent as metadata. They prove neither independent source authenticity nor calculation accuracy; they support subsequent fingerprint comparison only.
- Submission requires an authenticated write-capable tenant member and an active Finvessa product.
- Review is separate, limited to owner/admin/platform reviewer. A submitter cannot review their own case; PostgreSQL functions recheck identity, tenant, role, product entitlement and status with row locks.
- Two human review outcomes: acknowledged and correction_requested. **Acknowledgement is not financial sign-off, trade/payment approval or regulatory attestation.**
- RLS scopes reads to tenant members with an active Finvessa product; authenticated clients have no direct table write grants. The audit event table is append-only for ordinary authenticated users.

Neither the schema nor authenticated functions are running until the migration is deliberately applied and staged. Raw bank data and risk computations remain browser-local. No external API, banking account, Zoryn payment or Omniqora MCP is invoked.

## Analyst Factory expansion

Ten Finvessa analyst templates are registered as **regulated, human-reviewed drafts**: cash/liquidity, funding, financial risk, FX/derivatives, payments/operations, controls, internal audit, treasury business analysis, systems/integrations and MI/ALCO reporting. All have capability requirements that remain **unverified**. Registering a template cannot authorise model execution or bank access.

## Acceptance and release

Run:
    npm run test:treasury
    npm run build
    npm run typecheck
    npm run test:security

The tests include source financial correctness, currency-isolated stress cases, missing-policy denials, confidential-data boundaries, reviewer segregation and RLS contract checks. SQL tests are **static/contract tests**, not proof that the migration has passed a real PostgreSQL and Supabase RLS audit.

Next gates:
1. Review/merge Phase 1 PR #131 and then the stacked Phase 2–3 PR, only after checks and security review.
2. Apply the migration to an isolated staging Supabase project. Confirm cross-tenant access denials and reviewer role segregation with live integration tests. No production changes are implied by Git merging.
3. Onboard verified read-only bank/ERP/TMS connectors using scoped identity, approval, credentials vault and vendor sandbox contracts.
4. Add scheduled server-side analyst jobs only once source access, encrypted persistence, idempotency, data freshness, controlled delivery and rollback are independently reviewed.
5. Integrate Omniqora RAG/GraphRAG with dated, authorised policy references and separately validated quantitative outputs.
6. Backtest the financial forecasts and compare with expert treasury analysis before claiming greater accuracy or efficiency.

This is an analyst automation platform, not an autonomous payment/trading system.
