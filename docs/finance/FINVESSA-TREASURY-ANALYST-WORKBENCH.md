# Finvessa Treasury Analyst Workbench — pilot implementation

Status: **feature branch / controlled synthetic pilot**. Not a live treasury management system, production-certified analysis service, SWIFT/payment interface or regulated financial activity.

## Ownership and launch boundary

- **Finvessa** owns treasury specialist workflows, calculations, evidence and customer-facing domain requirements.
- **Omniqora** owns tenant identity, entitlements, governance, platform UX, optional future AI orchestration and verified connectors.
- **Zoryn** owns separately authorised/contracted payments-related services. No Zoryn banking API or credential is used by this pilot.
- Located at **/app/treasury-analyst** on the authenticated Omniqora application. No public marketing page, payment, trading, Supabase migration, external provider or production release is changed.
- Every signed-in tenant can inspect the **synthetic demonstration**. Importing arbitrary bank/ledger data is gated behind an **active Finvessa tenant product** obtained from the authenticated tenant control-plane call. A catalogue entry alone is not an entitlement.
- Bank, ledger and forecast text are processed **in browser memory only**. They are not persisted to Supabase, uploaded to an LLM, transmitted to a bank, or stored in localStorage. Browser-local exported documents remain the user's responsibility. Do not use real customer financial records until independent production security/privacy review.

## Functionality delivered

1. Ingest four explicitly specified CSVs (or provided synthetic example).
2. Validate account uniqueness, currency precision, strict ISO dates, row structure, monetary amounts, transaction IDs and evidence provenance. Limit files to 2 MB / 20,000 rows; do not silently skip invalid financial rows.
3. Reconstruct signed balances by account using exact integer ISO minor units. Check every provided closing statement balance. Detect duplicate and conflicting bank transaction IDs. Ignore transactions before the opening snapshot or after the report date; flag the problem.
4. Conduct a **separate bank-versus-general-ledger reconciliation** using exact account/date/amount/normalised-reference matching. No fuzzy matching or invented transfer counterparties. Duplicate ledger IDs, ambiguous matches, bank-only and ledger-only entries remain visible. Without a ledger, do not mark account reconciled.
5. Calculate 13-week forecasts in **separate currencies**, given evidence-backed cash obligations. Baseline includes committed + expected movements. Conservative downside includes committed items and expected outflows but excludes expected inflows. No unlicensed FX prices, cross-currency aggregation or predictive-model invention.
6. Surface blocking and warning controls for mismatches, stale evidence, unsupported currencies, absence of forecast inputs and projected cash shortfalls.
7. Provide a responsive analyst view with a transaction/ledger quality table, weekly forecast table, source references, methodology, **CSV working-paper export** and full JSON output. CSV text escaping protects against spreadsheet formula injection.
8. Explicitly require qualified financial review and forbid the appearance of autonomous trading, bank connectivity or payment processing.

## Input contracts

**accounts.csv** (required)
account_id,currency,as_of,opening_balance

**transactions.csv** (required)
transaction_id,account_id,currency,date,reference,amount,closing_balance

**ledger.csv** (required to call a bank-to-book reconciliation complete)
ledger_id,account_id,currency,date,reference,amount

**forecast.csv** (optional, but required for a valid 13-week forecast)
account_id,date,reference,amount,certainty

- All dates are YYYY-MM-DD.
- Amounts are signed decimal strings (minus = outgoing). Do not use currency symbols, locale thousands separators, exponential notation or binary floats.
- Supported pilot currencies: GBP, EUR, USD, CHF, AED, PKR, CAD, AUD, JPY, KWD, BHD, OMR, each with defined minor-unit precision.
- Each account has a unique ID; opening balance is an **as-of** starting position; only later posted movements are included.
- Ledger matching is deliberately strict and may flag operational false negatives where posting dates/references legitimately differ. This is preferable to silently guessing matches.
- Forecast certainty must be **committed** or **expected**. Items due on/before the report date or after 91 days are excluded with a flagged reason.

## Validation commands

From repository root, on the feature branch:

    npm ci
    npm run test:treasury
    npm run build
    npm run typecheck
    npm run test:security

The TanStack file-based route tree is checked into the branch for source review; Vite will regenerate it on build. Tests are source-level until runner evidence or hosted validation is available.

## Analyst acceptance criteria

- No summing GBP with USD/EUR; unsupported currency precision is a hard error.
- No binary floating-point rounding of money.
- All demo accounts pass source statement checks and one-to-one bank/ledger exact matches.
- No ledger => no reconciled claims. No valid cash obligations => no substantiated 13-week forecast.
- Duplicate imported bank transactions never inflate cash positions; conflicting IDs and ambiguous ledger matches prevent sign-off.
- A wrong bank closing balance prevents sign-off, even if the calculated arithmetic can proceed.
- Exported CSV safely escapes input text that could be evaluated as a spreadsheet formula.
- Real imported files never go to a model, banking endpoint or payment provider.

## Not yet built / next gates

1. **Enterprise tenant persistence and evidence integrity**: RLS-backed encrypted input ledger, source hashes, retention/residency controls, immutable review logs, access policies and approved document ingestion.
2. **Real authorised connectors**: bank statement/API retrieval, ERP/GL access, client-specific source contracts, secure credential vault, reconciliation permissions and connector sandbox validation.
3. **Expanded analyst coverage**: intraday cash forecasting, forward rate exposures, hedge accounting, liquidity and funding scenarios, IRRBB / LCR / NSFR models, derivatives pricing and validation, back-office and SWIFT ISO 20022 interpretation.
4. **AI-enhanced investigations**: Omniqora Intelligence RAG/GraphRAG grounded in approved tenant data, quantitative engine calls and AI drafted commentary. Each numerical result requires independent deterministic checks, evidence provenance and adjudication. MCP tools must be verified, versioned, allowlisted and separately permissioned.
5. **Model benchmarking**: test against gold-standard treasury analyst workbooks, independent reconciliation proofs, forecast backtests and false-positive/false-negative metrics. No unsupported "better than people" claims.
6. **Regulatory and operational safety**: role-separated maker-checker workflows, qualified human approval, licensing/outsourcing reviews where applicable, pen tests, operational resilience, versioned model governance and certified disaster recovery.
7. **Commercial Finvessa deployment**: authoritative Finvessa product hosting, contracts, subscription billing, tenant activation and Zoryn partner agreements. None are activated by merging this code.

## Decision

Build accurate, explainable **digital treasury analysis workflows**, not conversational agent personas. Omniqora's existing AI Agent Factory may later orchestrate analyst work after verifiable model/capability contracts are operational. This milestone proves the deterministic analytical core and controlled evidence flow first.
