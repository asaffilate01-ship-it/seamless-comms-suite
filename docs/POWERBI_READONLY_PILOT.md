# Omniqora BI — Power BI read-only pilot

This extends the existing `omniqora.bi` entitlement and Shared Engines page. It does not create another tenant system, a replacement BI product or a separate AI platform. It is a real implementation of the read-only provider boundary and deterministic KPI-investigation stage. Live Microsoft acceptance is still required.

## Delivered in this phase

- Per-user, per-tenant delegated Microsoft authorization-code flow with PKCE S256 and single-use hashed state. Confidential-client code exchange occurs on the server. The callback uses the existing `/app/shared-engines` page and an authorization-code URL fragment, which the UI immediately removes.
- Short-lived access-token sessions, encrypted with AES-256-GCM and authenticated tenant/user/configuration/generation bindings. No app-only fallback, user impersonation, refresh-token storage, ID-token-based authorization or unattended identity reuse.
- Server-approved semantic-model catalogue; checks approved models against the connected user's real workspace access. This is not an estate-wide metadata scanner or automatic semantic-model discovery.
- Safe DAX compilation from approved measure/dimension identifiers and validated dates. No raw DAX, SQL, document text or LLM output can become executable input. Single-table results with a sentinel row, finite numeric validation, bounded response bodies and rejection of HTTP-200 embedded errors.
- Equal-length period comparison, ranked segment changes, additive reconciliation, non-additive/ratio handling, baseline-zero handling, and explicit warnings separating observed associations from causes.
- Browser workspace inside Shared Engines with actual connection/check/investigate/disconnect handlers, source evidence and run identifiers. No fabricated sample KPI values or disconnected action buttons.
- Server-only credential/state storage, owner-scoped metadata logs, database-backed request limits and reconnection/disconnection generation fences.

**Not delivered here:** natural-language planning by an LLM, RAG/GraphRAG evidence joins, causal inference, forecasting, report/model authoring, background watchers, approved external writes, refresh orchestration, Tableau/Qlik/Looker adapters, or a Power BI embedded custom visual. The existing shared AI services are not newly wired to this module in this commit. The compiled-query boundary is intended to become their safe tool interface after user-delegation and evidence tests.

## Deployment prerequisites

1. Apply `supabase/migrations/20261005113000_powerbi_readonly_pilot.sql` through the normal staging migration pipeline. It requires the existing `tenants`, `tenant_members`, `auth.users` and `has_tenant_entitlement` contracts.
2. Configure the server's existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never use a `VITE_` prefix or send the privileged key to the browser. The normal authenticated Supabase middleware and `omniqora.bi` entitlement remain mandatory for every read.
3. Register a Microsoft Entra confidential **Web** application (not an SPA redirect) for the required customer organisation(s). Set the exact HTTPS Web redirect to `https://YOUR-OMNIQORA-HOST/app/shared-engines`. Authorisation codes are forwarded from the UI to an authenticated server function, which performs the confidential exchange.
4. Request delegated Power BI `Workspace.Read.All` and `Dataset.Read.All`. Complete the applicable customer-admin consent and enable **Dataset Execute Queries REST API**. The connected user still needs semantic-model Read and Build permissions and applicable licensing/capacity. Do not grant write/admin access merely to make this pilot work.
5. Supply only server-side settings below. Audit the customer model's date relationship, metric definition, dimension coverage, sensitivity and row-security roles before approving its catalogue entry. This pilot supports at most 20 models across three workspaces per tenant.
6. Deploy the application with the feature flag enabled only for an agreed staging tenant. A code merge is not an application deployment or a successful Microsoft connection.

```text
OMNIQORA_POWERBI_ENABLED=true
OMNIQORA_BI_TOKEN_KEY=<64 hex characters generated securely; 32 random bytes>
OMNIQORA_POWERBI_CONFIG=<JSON configuration below>
CUSTOMER_A_POWERBI_CLIENT_SECRET=<real Entra client secret; server secret store only>
```

Example **configuration structure**. UUIDs and field names below are fixtures, not live credentials or verified customer models. Replace them with the existing Omniqora tenant ID and approved Power BI identifiers.

```json
{
  "11111111-1111-4111-8111-111111111111": {
    "entraTenantId": "22222222-2222-4222-8222-222222222222",
    "clientId": "33333333-3333-4333-8333-333333333333",
    "clientSecretEnv": "CUSTOMER_A_POWERBI_CLIENT_SECRET",
    "redirectUri": "https://YOUR-OMNIQORA-HOST/app/shared-engines",
    "models": [{
      "key": "profitability",
      "label": "Approved profitability model",
      "workspaceId": "44444444-4444-4444-8444-444444444444",
      "datasetId": "55555555-5555-4555-8555-555555555555",
      "date": {"table": "Calendar", "column": "Date"},
      "measures": [{
        "key": "revenue", "label": "Net revenue", "table": "Measures", "name": "Net Revenue",
        "kind": "additive", "unit": "currency", "blankAsZero": false
      }],
      "dimensions": [{"key": "region", "label": "Region", "table": "Store", "column": "Region"}]
    }]
  }
}
```

A measure marked `nonadditive` is never treated as a sum of segment contributions. Use it for distinct counts and ratios. `unit: "ratio"` means the measure uses a 0–1 convention; the investigation also returns percentage-point change. Currency values retain the semantic model's currency units; the app does not assume GBP or convert currencies. Blank values only become zero when `blankAsZero` is explicitly true for an approved metric. The identifier grammar intentionally excludes quotes, square brackets and other expression syntax; unsupported names require a reviewed mapping extension, not arbitrary DAX.

## Permission and information-handling boundaries

The effective data authority is the connected **Microsoft account**, plus Omniqora tenant membership, BI entitlement and the server-owned model allowlist. This implementation does not impersonate another UPN and does not use service-principal queries. Microsoft RLS does not restrict workspace Admin/Member/Contributor roles in the same way as Viewer roles. Use an appropriately permissioned Viewer account with Build access when testing row-restricted scenarios; a powerful account's broad access is not narrowed by this product.

There is no shared result cache. Raw metric results remain in the user's browser component and are cleared on tenant/component changes, connection changes and session expiry. Server tables persist encrypted credentials and run **metadata**, not query results, raw DAX, metric values, documents or prompts. No result is sent to a model provider, exported, or automatically written back in this phase. Sensitivity-label metadata is displayed when supplied, but this is not a claim of full Purview/MIP enforcement.

Tokens expire; the user reconnects. Disconnect deletes the stored session and pending state, but does not revoke Microsoft consent or an upstream token already issued. In-flight requests must pass a final membership/entitlement/session-generation check before results are released. A late callback cannot recreate a deleted session. Configuration revisions invalidate old sessions. Rotating the encryption key also requires all affected users to reconnect; do not discard the old key before a planned rotation/reconnection window.

Twenty provider operations can be reserved per tenant/user/minute using an atomic PostgreSQL advisory lock. Provider 429 responses are surfaced without retry storms. Discovery is bounded to three workspaces; an investigation makes an access check plus one compiled Execute Queries call. JSON bodies are bounded to 1 MiB (token responses 64 KiB), request timeout is 15 seconds and redirected credential-bearing requests are rejected. Microsoft can impose lower effective budgets when the same account is used elsewhere.

OAuth states expire after five minutes and are single-use. A connection run is only marked completed after successful code exchange, storage and audit update; an abandoned login can remain `running` until retention cleanup. Before production, configure a privileged retention job to remove expired OAuth states, expired connection records, and old run metadata under the organisation's retention policy. No retention scheduler is secretly started by this build.

## Tests

```sh
node --test verification/powerbi.test.mjs
python -m pip install 'pgserver==0.1.4' 'psycopg[binary]>=3.2,<4'
python verification/powerbi_database.py
```

The Node suite uses provider mocks and real cryptographic/query/analysis code. It is not evidence that Microsoft has accepted generated DAX against a real semantic model. The database suite provisions a disposable native PostgreSQL server and verifies this migration against a minimal existing-authority contract: forced RLS, private credentials/state, owner-only metadata, permission and entitlement revocation, privileged-RPC denial, concurrent rate limiting, single-use state and generation fencing. It does not apply the entire historical migration chain or connect to production. Existing repository build/typecheck/security/regression gates remain in the normal Verify workflow.

## Staging acceptance required before release

- Two Omniqora tenants and two Microsoft users with deliberately different data access. Verify no connection, result or run metadata crosses tenant/user boundaries.
- One reconciled additive metric, a non-additive metric, an RLS-sensitive model and a model the user cannot access. Compare returned totals against Power BI under the same identity, date filters and metric definitions.
- Verify the exact compiled DAX executes on each approved model. REST dataset discovery does not establish the existence/correctness of a measure or active date relationship.
- Denied consent, expired/replayed state, revoked membership/entitlement, session expiry, explicit disconnect, callback racing disconnect, and configuration rotation must fail without returning data or resurrecting sessions.
- Simulate refresh/freshness mismatch and validate the date range. `retrievedAt` is query time, **not** proof of source-data freshness; model refresh lineage is a next-phase capability.
- Exercise HTTP 200-with-error, access denied, throttling, response overflow, blank values and excess segments; no partial result may be labelled reconciled.
- Test sign-out and account switching in the actual app shell; verify that prior results are cleared. Verify response bodies/tokens are excluded from application logging/APM capture and browser analytics.
- No production enablement until licensing, consent, retention, secret rotation, app-host session handling, accessibility and the actual Microsoft two-user tests are signed off.

## Next implementation phase

Use this compiled-query boundary as an authenticated tool for the shared Omniqora supervisor. The planner should select only approved model/metric/dimension keys and proposed periods, request human confirmation where ambiguous, and preserve the caller's delegation. Add source-freshness evidence, document ACL-aware RAG/GraphRAG joins and independent numerical checks before narrative generation. Add a separately scoped, approval-gated action executor later; never reuse this read-only token path as a write permission.

## Primary API references checked for this implementation

- Microsoft OAuth authorization-code/PKCE protocol: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- Power BI Execute Queries, including HTTP-200 embedded errors, Read/Build requirements, service-principal RLS/SSO limitations and unsupported INFO/DMV queries: https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries
- Dataset discovery permissions and partial metadata: https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/get-datasets-in-group
- Power BI row-level security and workspace role limitations: https://learn.microsoft.com/en-us/fabric/security/service-admin-row-level-security

Microsoft recommends its supported authentication libraries for production integrations. This dependency-free pilot implements the documented confidential authorization-code/PKCE exchange with targeted tests; production security review should assess replacing the small protocol adapter with MSAL and a managed credential store without changing the tenant/query boundary.
