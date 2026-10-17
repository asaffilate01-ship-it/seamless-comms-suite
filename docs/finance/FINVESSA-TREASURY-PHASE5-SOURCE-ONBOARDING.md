# Finvessa TreasuryOS Phase 5 — trusted sources and inactive reporting schedules

**State: source implementation on a stacked GitHub branch, not a live banking connection, deployed scheduler or production processing pipeline.**

The code extends the existing Phase 4 Treasury Analyst Workbench on Omniqora. Merge order remains Phase 1 PR #131 → Phase 2/3 PR #132 → Phase 4 PR #133 → this Phase 5 PR.

## Delivered

1. Five required, individually permissioned read-only treasury source contracts: opening balances, posted bank movements, independent cash general ledger, cash forecast and liquidity policy.
2. Pure admission policy rejects missing/duplicate contracts, foreign tenants, unapproved connection proofs, write permissions, stale/expired timestamps and ambiguous provider identities.
3. A separately callable, in-memory shadow analysis function consumes already verified canonical sources and performs Phase 1 cash and bank/ledger reconciliation, Phase 2 liquidity scenarios and Phase 4 analyst pack generation. It is a deterministic contract/test harness — NOT yet a deployed banking connector worker or independently validated data-signature verifier.
4. A metadata-only Supabase migration creates tenant-scoped provider requests, server-approved verification metadata and schedule drafts. Direct authenticated table writes are revoked and RLS requires membership plus active Finvessa entitlement.
5. Tenant administrators can request read-only provider setup and store an inactive proposed daily/business-day reporting time. The SQL schema only permits simulation_only and draft/paused schedule states; no cron is created.
6. Authenticated operator UI offers a manual server-side synthetic data brief using deterministic treasury engines. Only synthetic sample financial records are processed. No real customer bank data is submitted to this server action.

## Evidence and boundary

| Area | Current truth |
|---|---|
| Read-only bank/ERP integrations | Contracts and qualification requests only; no approved live API/SFTP access |
| Five-source admission | Policy and tests in the codebase, not a production security attestation |
| Verified source status | Only future separately authorised service-role processes can populate the verification table |
| Daily reporting | Saved preference only; no background worker or unattended dispatch |
| Server analysis | Manually triggered synthetic sample, requires authenticated active Finvessa tenant |
| Raw source records | No new backend storage for bank CSVs, GL entries, policies or financial amounts |
| Omniqora AI/MCP | Inactive blueprint until security, evaluation and data contracts are independently verified |
| Zoryn/SWIFT/trading/payments | No integration or execution rights activated |

## Tests and deployment

Run these on the stacked Phase 5 feature branch:

    npm run test:treasury
    npm run build
    npm run typecheck
    npm run test:security

New regressions cover cross-tenant data refusal, stale/expired evidence, provider and source mismatch, unverified scopes, duplicate inputs, shadow computation and mandatory manual review. SQL structural tests supplement the existing GitHub disposable Supabase migration replay; neither alone certifies production row-level security.

Do not automatically merge or publish after a source-only change. Independent review, staging migration deployment, multi-tenant negative access tests and connector-provider approval are separate required steps.

## Next stage gates

- Contract with one banking/Open Banking data provider and one ERP GL provider; establish explicitly permitted read-only scopes, supplier sandbox access and individual tenant/organisation data rights.
- Implement a trusted server worker with vetted HTTPS/mTLS/OAuth/SFTP transport, tightly allowlisted origins, secret vault references, health receipts, verified source hashes, idempotent ingestion, replay prevention, source timeliness checks, per-account segregation and audit logs.
- Only after approved encrypted source storage and tested scheduler idempotency/recovery, activate genuine daily analysis jobs and operator-controlled delivery.
- Add Omniqora Intelligence RAG/GraphRAG for source-grounded exception explanations and improve quantitative accuracy by benchmarking against expert treasury working papers. No autonomous payment/trade/regulatory attestations.

These features deliberately prioritise the actual work of treasury analysts and financial control evidence, not conversational AI personas.
