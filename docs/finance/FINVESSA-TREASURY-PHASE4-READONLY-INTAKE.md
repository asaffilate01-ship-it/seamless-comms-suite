# Finvessa TreasuryOS Phase 4 — Read-only Bank/ERP Intake + Analyst Working Papers

**Status: Source build in stacked PR; not merged, deployed or enabled for live banking.**
This PR is based on the Phase 2–3 treasury branch (PR #132), which itself is based on Phase 1 (PR #131).
The canonical treasury analysis still lives in Finvessa's domain components, while Omniqora provides the authenticated tenant workspace and reviewed governance infrastructure.

## Delivered functionality

### Financial export intake (read-only and browser-local)

The TreasuryOS authenticated route includes a source-adapter workbench.

Supported, versioned **CSV schemas** (NOT live provider connectors):

| Adapter | Input columns | Interpretation |
| --- | --- | --- |
| bank-debit-credit-v1 | statement_line_id,bank_account,currency,booking_date,description,money_in,money_out,closing_balance | money_in positive, money_out negative, opening balances come from independent account input |
| bank-signed-v1 | transaction_ref,account_id,iso_currency,posted_on,memo,net_amount,running_balance | positive bank movements are inflows, negative outflows |
| ledger-cash-debit-credit-v1 | journal_id,bank_account,currency,posting_date,narrative,debit,credit | **only for debit-nature cash asset ledger accounts**: debit positive, credit negative |
| ledger-signed-v1 | entry_ref,bank_account,currency,posting_date,narrative,net_amount | user must explicitly select a ledger whose signed convention is receipts positive, payments negative |

All adapters preserve exact ISO currency minor units, validate columns and strict dates, reject duplicate record IDs, invalid debit/credit pairs, missing bank running balances, unsupported currencies and unsafe financial amounts. Formula-like IDs and narratives cannot silently pass into a spreadsheet-ready output.

The operator can preview a synthetic example without access to bank accounts. Under an active Finvessa tenant product, an operator can import/paste an authorised local CSV, preview every mapped source line and apply normalized rows to the existing cash/ledger reconciliation inputs. No external URLs, OAuth, SWIFT systems, bank APIs, payment initiation or vendor account credentials are used.

A successful normalization is **not proof of a genuine, complete, bank-issued statement**; Phase 1 still independently validates bank closing balances against dated opening balances and checks the general ledger as a distinct source.

The operator must supply account opening balances (accounts.csv) and forecasts separately. No account balance or settlement movement is inferred from a generic debit/credit export.

### Daily analyst working-paper generator

A deterministic, source-derived pack combines the existing TreasuryOS cash/reconciliation report with the current liquidity-risk scenario:

- Individually separated GBP/EUR/USD/etc positions and 13-week cash outlooks (never invented FX conversion).
- Source and risk state shown distinctly. Blocking evidence generates **hold_source_data**, incomplete analysis **independent_review_required**, and clean built-in tests **built_in_checks_passed** — not a financial approval.
- Prioritised duties for the cash analyst, treasury risk analyst and treasury controls analyst, each supported by source row references.
- Separate bank balance, GL differences, stale positions, missing forecast inputs, stress buffer breaches and policy gaps.
- Export complete machine-readable JSON and a human-readable Markdown working paper.
- First 200 findings included in the condensed working paper with explicit disclosure of omitted findings. Full original evidence remains available in Phase 1 JSON.
- Report is generated from deterministic calculations, **without any GenAI inference, bank calls or automated financial instructions**.

This is a report available after a user runs the analysis. **It is not an hourly/daily background scheduler**: unattended runs remain blocked pending authorised read-only connectors, secure storage, data freshness rules and explicit operator approval.

### Tenant, security and privacy boundaries

- Existing authenticated route: /app/treasury-analyst.
- Real operator-supplied files and adapter-to-workbench action require the same verified active Finvessa tenant entitlement as the Phase 1 data input. Synthetic demonstration can be inspected by authenticated users.
- Imported data, selected policy, calculated financial positions and exported text are processed **only in browser memory**. Do not record these in model prompts, analytics events or error reporting, and do not add server persistence without a reviewed consent and data-residency design.
- Phase 3 database stores only review metadata and digests, subject to approved migration and tenant-scoped access; no bank/ERP raw source record storage is added.
- No financial approval, trades, payment execution, SWIFT message submission, bank connection or Zoryn money movement.

## Verification

On the Phase 4 PR:
    npm run test:treasury
    npm run build
    npm run typecheck
    npm run test:security

Treasury regression tests include the previous Phases 1–3 and tests for adapter roundtrip, debit/credit sign conventions, formula injection, duplicates, missing balances, unknown currencies, source-row mapping, exact minor-unit amounts, blocked working-paper signoff and markdown safety.

## Follow-on product and production requirements

1. Merge the stacked PRs in order only after independent review and passing CI. Maintain Lovable Git history (no force push).
2. Deploy Phase 3 PostgreSQL migration to disposable staging first, validate RLS and independent maker/checker behaviour against multiple real test identities.
3. Add customer-authorised Open Banking / bank SFTP / ERP API source integrations with actual provider APIs under contracts, verified provider capabilities, server-side OAuth, vault credentials, egress allowlists, tenant-scoped data access, source signatures and recovery procedures.
4. Move source processing to a secured server-side pipeline **only after** security/privacy/legal review, encryption and retention design, idempotent import keys, complete audit ledgers and bank-issued source verification.
5. Introduce scheduled daily treasury runs once deterministic source freshness, failure alarms and controlled report delivery are independently certified.
6. Introduce Omniqora Intelligence RAG/GraphRAG for cited exception narratives without relaxing financial calculation/controls validation. Benchmark real analyst accuracy, speed and review workload on gold-standard treasury working papers.

**Not provided by this Phase 4 PR:** automatic bank login, actual bank API/MCP, ION/360T/Bloomberg vendor connectivity, SWIFT FIN/ISO 20022 certified transport, LCR/NSFR, audited trading decisions, production approval.
