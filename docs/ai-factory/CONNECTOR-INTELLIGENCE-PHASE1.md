# Connector Intelligence — Phase 1 (Mimic-inspired, review-only)

Status: source-only feature branch; requires reviewed PR, CI, deployment and tenant smoke testing.
This is **not** a supplier connection, agent execution service, or production MCP server.

## Location and use

In Omniqora, open **/app/connector-hub**, choose an entitled product, and use
**Connector Intelligence — Phase 1**. The workbench is only shown inside the
existing authenticated tenant/product Connector Hub.

1. Select OpenAPI 3.x (JSON) or browser HAR (JSON). YAML is not supported yet.
2. Use **Load safe example** to demonstrate a local quote-API import.
3. Click **Analyse locally**. The page shows allowed structural paths, HTTP
   methods, query/body field names and *authentication pattern labels*.
4. Copy the generated TypeScript **review-only draft** for an independent
   engineering/security review. Its methods deliberately throw, and contain no
   HTTP transport or credential-handling code.

## Security and data handling

- **All processing happens in the browser**, with deterministic TypeScript.
  No upload, remote fetch, AI provider call, database write, storage API, or
  supplier request occurs. Raw textarea input is cleared after an attempt.
- Import only vendor-authorised docs or your own redacted test captures. HAR
  files can contain bearer tokens, cookies and personal information even when
  this parser discards values; do not use real customer or production captures.
- The parser ignores header *values*, JSON body *values*, query *values*,
  descriptions and examples. Sensitive field names are rejected. HAR route
  segments not in a conservative structural vocabulary are replaced with
  placeholders rather than retained as customer IDs.
- Input is limited to 300,000 characters, 1,000 HAR entries and 80 operations.
  Non-HTTPS, loopback/IP/local hosts are not accepted as HAR origins; other
  origins are ignored. OpenAPI server host metadata is informational only.
- OpenAPI 3.x paths with invalid separators or control characters are skipped.
  OpenAPI schema $refs, complex multipart formats, streaming and advanced
  polymorphism are intentionally **not** resolved.
- Generated code contains structural metadata and inert methods only.
  It does not carry captured hosts, authentication values or HTTP clients.
- The parser is a **first-pass structural redactor**, not a general-purpose DLP
  system. Use pre-sanitised source material; do not rely on it to cleanse raw
  production traffic or highly sensitive data.

## Architecture boundaries

Use the existing SaaS Factory tenant/product control plane and Connector Hub.
Never create a competing auth or token store. The existing provider_catalogue,
provider_bindings, mcp_setup_requests, agent approvals, spending ledgers,
intelligence_jobs and external SaaS authority remain canonical.

Mimic (littledivy/mimic) was reviewed as design inspiration. No captured
identity-replay or certificate-bypass feature is added here; no Mimic upstream
source files are copied. Official vendor API/OAuth processes are required for
live connectors.

## Verification

Run the focused test:

    node --test verification/control-plane/connector-intelligence.test.mjs

The test suite checks OpenAPI sanitisation, HAR redaction/deduplication, rejected
unsafe origins and invalid input, inert generated TypeScript syntax and workbench
non-network characteristics. This test is also required by verify.yml on PRs.

## Phase 2 (not part of this PR)

Implement an admin-reviewed, vault-backed staging connector pipeline that:
- imports official specs with a supplier-specific allowlist and provenance;
- verifies capabilities and scopes with authorised *sandbox* credentials;
- runs signed, rate-limited, idempotent contract tests with receipts;
- turns only independently certified operations into tenant-scoped MCP tools;
- requires review and staged deployment before any production grant;
- integrates API documentation into evidence-scoped Omniqora Intelligence RAG;
- preserves human approval for consequential payments, write operations,
  cancellations, communications and regulated acts.

No release, migration, supplier key, live API call, model usage charge or
tenant activation is performed by this phase.
