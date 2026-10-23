# Omniqora Connector Intelligence — Phase 2A: MCP proposals and staging-readiness guardrails

Status: source-level, non-executing review features. **Not** a production
connector runtime, official MCP server, supplier account connection, or
independent sandbox verification system.

## Scope delivered

After a safe Phase 1 OpenAPI/HAR import in the authenticated Omniqora
\`/app/connector-hub\`:

1. The operator enters a lowercase provider key.
2. A deterministic, local parser proposes MCP-shaped JSON descriptors for
   generic **GET, HEAD and OPTIONS** paths only.
3. Proposed descriptors use field *names* and unconstrained JSON Schema
   placeholders. They are NOT authoritative OpenAPI type contracts.
4. All non-read methods and known-sensitive paths are placed in a distinct
   \`quarantined\` list; they are never exposed as runnable tools.
5. The operator can copy the inert proposal and complete a **self-reported**
   sandbox preparation checklist. Even fully checked, the status stays
   \`manual_review_required\` and \`canActivateProvider=false\`.

This adds **no** service-role paths, writes, execution worker, database tables,
credential flows, provider API calls or tenant grants. A tool proposal is never
a trusted registered MCP capability. Read methods may still disclose sensitive
data and require supplier-specific human review.

## Security principles

- Existing SaaS Factory tenant and product auth, provisioning, provider binding
  catalogue, MCP review controls, vault and AI budget ledgers remain the
  authorities. Do not create parallel production identities.
- Source inputs are untrusted metadata from authorised or pre-redacted test
  specs only. Never paste customer production HAR data or real secrets.
- Sensitive financial, identity, employment, legal, customer, order, delivery,
  contact and booking path families are quarantined; **unknown API semantics
  are never inferred to be safe** from an HTTP verb alone.
- No source hostname, auth header value, tokens, cookies, sample request/response
  body or execution endpoint appears in the MCP proposal export.
- Every proposed MCP descriptor remains marked \`proposal_only\` and
  \`independentlyVerified=false\`. It has no network transport or auth.
- No client-supplied checklist or evidence flag can activate a provider binding.
- The proposal format is an internal planning artifact, **not an official
  functioning MCP server handshake or registration endpoint**.

## Tests

    node --test verification/control-plane/connector-intelligence.test.mjs
    node --test verification/control-plane/connector-qualification.test.mjs

CI runs both suites before build and typecheck. Test coverage includes
unsafe field/path tampering, sensitive path quarantine, redaction, no hidden
network access and fail-closed manual qualification.

## Phase 2B (next gated work)

Only after approved supplier sandbox access and independently reviewed source
credentials:

1. Create an authenticated, server-only *sandbox* provenance/approval service
   with tenant/product/region and unique source revision.
2. Store opaque, rotated credential references in a secret vault; never expose
   secret values to browsers, codegen inputs, CI logs or AI prompts.
3. Use a fixed supplier-specific hostname and a documented operation allowlist,
   enforce TLS, DNS/private-IP/redirect SSRF protections, request limits and
   independent entitlement checks before every call.
4. Implement a sandbox adapter capability probe, signed/verified status
   receipt and idempotent webhook contract test. Do not assume vendor access
   from a catalogue listing or a self-reported health check.
5. Require a reviewer different from the request author and separate approvals
   for billing, transfer, order creation/cancellation, personal data export
   and any supplier production switch.
6. Run tenant-to-tenant isolation, revoked credentials, stale verification,
   forged health receipt, quota exhaustion, network failures and negative tests
   in the actual isolated hosted environment.
7. Wire approved read tools through the existing Omniqora Intelligence worker
   and cost reservations; writes remain proposed actions with human review.
8. Publish to staging first, verify source revision and actual runtime health,
   then obtain deployment approval and activate exactly one sandbox tenant.

**No existing third-party licence, production token, OAuth approval, certified
webhook, live tenant, or model provider access is asserted by this document.**
