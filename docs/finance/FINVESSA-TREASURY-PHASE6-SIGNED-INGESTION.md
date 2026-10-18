# Finvessa TreasuryOS Phase 6 — Signed managed-source sandbox

**State: source-built / controlled CI validation.** This change is stacked after TreasuryOS Phases 1–5, and must not be merged before those changes. It is NOT a live bank or ERP connection, unattended financial job, deployed production database, SWIFT interface, or source authenticity certification.

## Working Phase 6 capabilities

1. **Verified managed-file snapshot format:** every snapshot has a version, tenant, source kind, provider key, key identifier, event identifier, UTC received time, canonical CSV, SHA-256 payload digest and HMAC-SHA256 signature. The signature message is domain-separated and binds every identity field plus the content digest.
2. **Independent content-hash and HMAC verification:** source payload digest is computed from received bytes, then the domain-separated signature is checked using a pinned non-exported key supplied by an approved key manager. A stale or future-dated source, tampered payload, wrong provider, mismatched tenant, missing signature, revoked/expired key, duplicate kind or duplicated provider event is rejected before financial calculations.
3. **Complete five-input verified envelope handoff:** the existing Phase 5 read-only connection admission is a separate prerequisite. The pure Phase 6 sandbox runner only produces a TreasuryOS shadow analysis when all five source kinds (opening balances, bank movements, cash general ledger, forecast and liquidity policy) have independently checked envelopes and current connector proofs. It then invokes the same deterministic cash/GL reconciliation, stress/liquidity and analyst working-paper generator.
4. **Manually triggered server-side demo:** authenticated active Finvessa tenant operators can select an as-of date and run a SYNTHETIC banking/ERP sample end to end. Five ephemeral HMAC keys are generated with WebCrypto and kept in server memory. The fixtures are locally signed and verified on the server, and the UI receives only a summary working paper and safe proof metadata. No customer source content or signing keys are sent from the browser, stored in the database, downloaded from a bank, or passed to an LLM.
5. **Metadata-only audit schema:** a source-ready migration adds:
   - treasury_signed_source_receipts: tenant, provider, event ID, source category, byte count, SHA-256 digest, signature-verification result, time and retention marker; unique tenant+provider+event prevents duplicated provider replay after a future trusted worker persists it.
   - treasury_shadow_run_receipts: tenant, report date, bundle digest and source/risk outcome labels. Its schema permits only sandbox_shadow, sets execution_enabled=false and requires review.
   - treasury_shadow_run_sources: five-source receipt linkage with composite tenant foreign keys, preventing cross-tenant audit record mixing.
   - Authenticated users get RLS-scoped SELECT only; only separately controlled service-role infrastructure may write. No raw bank data, financial amounts, key material or OAuth secrets are part of this schema. **The demo does not write audit receipts**, because trusted server-to-database receipt persistence and staging attestation are not yet activated.

## Important trust distinctions

- **Signed managed file ≠ independently authenticated bank statement.** HMAC proves possession of a jointly managed signing key, not that an external bank or ERP vendor actually provided the record. A future real provider connector must authenticate the external source through its approved API/OAuth/certificates, compare bank account authorization, and then sign a normalized managed-source envelope inside a vetted ingest worker.
- **Synthetic sandbox keys are ephemeral.** The server demo creates key material for sample records only; they cannot make an unverified provider appear connected or give the user network permissions.
- **Source-readiness metadata cannot be blindly trusted.** In the real worker, verified bindings, source mappings, key identity, permissions, revocation and freshness must be read independently from tenant-authorised server state and a secrets vault, not from caller-supplied flags or an MCP output. Phase 6's pure runner is NOT a public upload endpoint.
- **No cross-tenant replay:** SQL uniqueness is tenant and provider scoped, with composite foreign keys for receipt/run association. Browser-authenticated roles have no write permissions to these tables. A future trusted worker must persist receipts atomically after signature verification, reject duplicates under concurrent arrivals, and never log raw banking payloads.
- **No active schedule:** Phase 5's draft-only timing table remains unchanged; this phase adds neither cron nor an automatic report delivery mechanism. Manual synthetic calculation is the only server computation created here.
- **No financial actions:** no bank transfers, hedge orders, FX trading, payment approval or regulatory attestations can be executed.

## Verification

Run the existing treasury regression command (now includes Phase 6 cryptographic tampering and negative trust cases):

    npm run test:treasury
    npm run build
    npm run typecheck
    npm run test:security

The PR CI also runs the complete disposable local Supabase migration replay, integration checks and cross-product controls. Tests must cover altered CSV bytes, altered signed metadata, expired/revoked keys, missing scopes, stale sources, foreign tenants, repeated event IDs, empty/oversized input, database write-grant denial and synthetic server-only construction.

The SQL migration's successful local replay is not evidence of live provider readiness or independently tested production Supabase RLS. Verify role revocation, RLS and idempotency with multiple staged tenant identities before migration promotion.

## Phase 7: first real read-only provider pilot

To make this a true operational treasury analyst platform, complete the following independently approved dependencies:

1. Select and contract with **one approved UK banking/Open Banking data provider and one ERP/general-ledger provider** with clearly documented sandbox APIs and granted read scopes. Providers may be evaluated based on coverage, renewal consent, settlement balance vs available balance definitions, payments data completeness, provider costs, jurisdiction, rate limits and legally permitted use.
2. Build dedicated provider adapters under server-controlled access, encrypted tenant-scoped source storage and vault-backed OAuth or mutually authenticated transport. Pin vendor endpoint origins and TLS certificate expectations, implement redirect/SSRF defences, token refresh and revocation, per-account consent checks and incident handling.
3. Normalize bank transactions and GL records into the existing strict financial source schema. Verify source hashes/signatures and producer identity independently, then write the idempotent receipt and run metadata in a single auditable unit of work. Retain financial records only with approved encryption, retention and residency controls.
4. Implement a tenant-authorised, once-per-business-day **read-only** background analyst workflow with precise source freshness expectations, retry/dead-letter handling, alerting and dashboard delivery. Do not schedule until RLS, bank connector security, processing rights, performance and recovery tests are approved.
5. Add Omniqora RAG/GraphRAG as a cited explanation layer over deterministic cash/risk calculations, with independent model governance and financial expert review. AI may not invent balances, contracts or regulations or authorise financial movements.
6. Benchmark reconciliation false positives and false negatives, forecast error and report production time against signed-off treasury analyst working papers before claiming superiority to qualified professionals.

**Provider credentials, connection approvals and production schedules remain deliberately absent.** This is a working cryptographic ingestion/simulation layer, not a simulated claim of live bank access.
