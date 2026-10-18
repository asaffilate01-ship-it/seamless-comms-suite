# Finvessa TreasuryOS — Phase 7: TrueLayer and Xero read-only provider pilots

**State: development code only, not live banking or production.** Phase 7 extends the existing TreasuryOS Phases 1–6 with fixed TrueLayer Data v3 and Xero Accounting read-only interfaces and synthetic server response tests. No genuine provider API key, OAuth consent, customer bank account, money movement, production network read, automation or deployment is activated.

## TrueLayer Data API v3

Authoritative references:
- https://docs.truelayer.com/docs/enable-your-users-to-connect-their-bank-account
- https://docs.truelayer.com/docs/get-all-user-accounts
- https://docs.truelayer.com/docs/create-a-connection-v3

TrueLayer recommends Data v3 for new Data integrations. The scoped pilot only knows GET https://api.truelayer-sandbox.com/v3/connected-accounts. It requires an independently authorised Data v3 connection with read scope accounts, a short-lived server-held bearer token and a consent-linked Connection-Id. It parses the paginated items list, validates the tenant's explicit account allowlist, allows business current/savings account metadata, and omits holder names, full account identifiers and bank account numbers.

**Limitation:** TrueLayer connected-accounts discovery is NOT a bank balance, a statement, available cash, a guarantee of full transactions or an independently verified account-opening balance. It can never be promoted as the five-source TreasuryOS bank input. The actual Data v3 consent redirect, connection creation, token lifecycle, balance and transaction methods are future separately approved work.

## Xero Accounting API

Authoritative references:
- https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml
- https://xeroapi.github.io/xero-node/accounting/
- https://github.com/xeroapi/xero-node

The only allowed pilot endpoint is GET https://api.xero.com/api.xro/2.0/BankTransactions?page=1&pageSize=100, requiring an approved Xero test organisation ID, a server-vault-resolved OAuth bearer and the exact read scope accounting.transactions.read. It validates an explicit bank account allowlist, authorised RECEIVE/SPEND, IsReconciled=true, positive totals, exact supported two-decimal currency scale, duplicate IDs and dates. Missing or multi-page pagination is flagged incomplete instead of pretending an exhaustive ledger export.

**Limitation:** Xero BankTransactions represent only a subset of cash-account postings. They are NOT equivalent to a complete general-ledger journal, a bank-issued statement or a certified bank/GL match. The output always says it cannot be used directly as the bank statement or full GL. More approved endpoints and complete source coverage are prerequisites for end-to-end reconciliation.

## Execution architecture

The provider adapter takes an independently verified backend pilot record, the authenticated tenant ID, a separate credential resolved by a trusted worker, current UTC time, and a transport object. It enforces the correct tenant, product, provider, sandbox consent and proof expiry, exact read permissions and bounded account allowlist.

HTTP is GET only, with fixed origin/path/query, no redirects or cookies, no cache, 8-second timeout, HTTP 200, JSON response, a streamed 1 MB response byte cap and a 100-row first-page cap. Unapproved accounts and transactions are excluded or flagged, and no error returns a token or sensitive provider response body.

**No real provider networking is currently wired to any authenticated or public server action.** An authenticated Finvessa user can run a synthetic preview where a fake in-process HTTP transport exercises the same GET-only parser, and sees only non-sensitive coverage/control findings. No external connection occurs.

The source adapter output cannot self-certify complete financial sources or call the signed TreasuryOS Phase 6 shadow runner. The signed treasury admission controls still require the five independent sources and a separately approved source-verification worker.

## Validation

Run these on the phase branch:

    npm run test:treasury
    npm run build
    npm run typecheck
    npm run test:security

Provider tests cover approved read scopes, expired consent, mismatched identity, unauthorised account exclusion, Xero posting/amount/type controls, missing pagination, redirected and large HTTP responses, safe JSON, fixed GET endpoints and absence of leaked bank account number, holder name or credentials.

## Activation blockers and next implementation gates

1. Bank Data API commercial contract and an approved AISP/agency/legal operating model. End-user consent and source ownership must be supported and auditable.
2. Xero application and test organisation access, verified developer credentials, correct read scopes and a complete cash/ledger extract for the intended accounting use case.
3. A sealed server-side source worker, bank consent process, vault key lifetimes, granular account permissions, idempotent retries, source signing, freshness, revocation, rate limits, error monitoring and audited source snapshots.
4. Encrypted, tenant-isolated storage and negative RLS tests on staging. No raw account details or transaction records in browser logs/analytics/model prompts.
5. Only after verification, guarded daily READ-ONLY analyst processing and cited policy intelligence. No payments, trading, hedge orders or regulatory attestation.

**Merge sequence:** TreasuryOS PRs #131, #132, #133, #134, #135, then Phase 7. Main has diverged, so resolve conflicts by reviewable integration, preserving Lovable history; do not force-push or auto-publish.
