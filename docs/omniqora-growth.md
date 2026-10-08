# Omniqora Growth v1

**Status on 8 October 2026: source and hosted database released; corrected site published and signed-out frontend verified.** Growth implementation PR #81 and release corrections PR #82 are merged. The current application release is [`af016c60be0ef23af0012e6ef6c34ec88736f87b`](https://github.com/asaffilate01-ship-it/seamless-comms-suite/commit/af016c60be0ef23af0012e6ef6c34ec88736f87b), which adds public browser configuration defaults for the connected project and regenerated database types. Application CI, the complete migration-chain check and the hosted database postflight passed. Production `/app/growth` redirects a signed-out visitor to the working sign-in screen. Authenticated workspace acceptance, tenant activation, real provider acceptance and remote product-adapter invocation remain pending; no successful live generation is claimed.

## What this release does

The authenticated workspace is `/app/growth`, labelled **Omniqora Growth** separately from Growth Lab. It supports the product keys `omniqora`, `syndriva`, `merqora` and `affivon`:

1. Save a brand's `name`, `voice`, `offer`, `rules` (one rule per line in the UI; an array in the contract), `audience`, `locale` and `disclosure`.
2. Save trusted evidence with its content, source reference, revision and optional expiry. Source URLs are references; the workspace does not fetch or scrape them.
3. Save a campaign brief with a title, objective, channel, output language and 1–20 selected evidence IDs.
4. Select an explicitly configured OpenAI, Claude or Gemini writer and optionally Jev. Persist the run, input snapshots, provider/model, output, checks and failures.
5. An owner/admin reviews the result. Approval and rejection are separate from generation. Jev can assess brand fit and claim support; it cannot approve content. Without Jev, editorial and brand review remains manual.
6. Hand off an approved, current result into both an existing Campaigns draft and a Creative Studio brief. The run records `marketingCampaignId` and `creativeBriefId`; retrying a completed handoff returns the existing records.

Output languages are `en`, `ur` and `es`; the UI renders Urdu output right-to-left. Channels are `social`, `email`, `whatsapp` and `web`. These select the draft format, not a delivery connection.

The source contains a product-adapter API for evidence ingestion and approved output export. Remote Syndriva, Merqora and Affivon applications must implement and invoke it; selecting a product in this UI does not connect its remote application. Merqano/`commerce-compass` remains a different product from Merqora.

**Not implemented by this release:** social scheduling/publishing, social inbox automation, advertising account management or spending, media generation, live marketplace/affiliate-network synchronization, or unattended optimization. Creative direction is a production brief, not a generated image, video or audio asset.

## Access and activation

The server and database enforce tenant membership, an active tenant/product and a currently valid `omniqora.campaigns` service (`active` or `trial`, within its validity dates). Handoff additionally requires a currently valid `omniqora.creative` service.

| Workspace role | Read | Prepare/edit/generate | Review | Handoff                     |
| -------------- | ---- | --------------------- | ------ | --------------------------- |
| Viewer         | Yes  | No                    | No     | No                          |
| Agent          | Yes  | Yes                   | No     | No                          |
| Owner/admin    | Yes  | Yes                   | Yes    | With Creative Studio access |

The UI consumes server-returned `allowed`, `canWrite`, `canReview` and `canHandoff`; it does not grant access by hiding/showing a button. When setup is missing, it shows inline instructions to enable the selected product and Campaigns, configure a writer, and enable Creative Studio for handoff. **Refresh access** rechecks the saved configuration.

An authorized operator must provision that configuration through a reviewed server/database administration process. The hosted target still lacks unrelated legacy schema required by the Control Plane and Platform Kernel setup routes. Growth no longer links to those routes, and this release does not establish them as working setup screens. The observed default tenant has no product activations, services, provider bindings, service credentials or platform administrators; catalogue entries alone do not activate Growth.

Evidence kinds are `brand_fact`, `competitor_ad`, `customer_feedback`, `product_data` and `affiliate_offer`. Product and affiliate-offer evidence requires a future `validUntil`. Affivon brands require `disclosure`, and every output variant must retain that exact saved disclosure. Supply wording appropriate to the intended output language.

Brand, evidence and campaign edits use `expectedRevision` to reject conflicting changes. Runs retain immutable input snapshots. Changed or expired inputs prevent new approval, handoff and approved export. Do not treat an old approval as authorization for revised content.

## Configure a writer and optional Jev classifier

Create a `provider_bindings` record for the exact tenant and product. The supported `provider_key` values are `ai.openai`, `ai.anthropic`, `ai.gemini` and `ai.jev`.

- Use status `configured`, `active` or `degraded`; other statuses block requests.
- Use `environment: "production"` by default. A deployment using `OMNIQORA_GROWTH_ENVIRONMENT` must match that explicit environment.
- Leave `brand_id` and `location_id` empty: v1 requires a product-wide provider binding and rejects restricted bindings until the necessary mappings exist.
- Set `config.growth_enabled: true` and `config.model` to the provider model ID available to that account. Optional `config.max_output_tokens` controls the writer output limit.
- Set `secret_refs.api_key` to the exact scoped environment reference below. Add the corresponding value through the application server's secret store, never a frontend build variable or committed file.

```text
env:OQ_SECRET_GROWTH_<TENANT_UUID_WITHOUT_HYPHENS_UPPERCASE>_<PRODUCT_UPPERCASE>_<PROVIDER_SUFFIX>
```

| Provider       | Suffix      |
| -------------- | ----------- |
| `ai.openai`    | `OPENAI`    |
| `ai.anthropic` | `ANTHROPIC` |
| `ai.gemini`    | `GEMINI`    |
| `ai.jev`       | `JEV`       |

There is no fallback to a global provider secret and no automatic provider/model fallback. Each tenant/product/provider resolves only its own derived secret name. **Ready to request** means the local binding and credential presence checks pass; provider acceptance is established only by an actual request.

## Execution limits and recovery

| Control               | Implemented behavior                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent generation | At most one running generation per campaign                                                                                      |
| Daily starts          | 30 new runs per tenant/product per UTC day, including saved blocked/failed attempts; identical request replays do not add starts |
| Writer output         | Default 3,000 tokens; configured limit clamped to 512–4,096                                                                      |
| Provider request      | Writer timeout 30 seconds; classifier timeout 20 seconds                                                                         |
| Run lease             | Five minutes; abandoned running attempts are reconciled as failed                                                                |
| Retry                 | No automatic generation retries; a transport retry reuses the same `requestKey` to recover the saved attempt                     |
| Handoff               | Atomic creation of both drafts, with existing IDs returned on replay                                                             |

The UI's status polling reads saved work; it does not invoke the writer again. After a failed provider call, inspect the recorded result before explicitly starting another attempt. A `stale` run needs current inputs and a new generation. A failed content check blocks approval. These limits are not a monetary budget or a promise about provider charges.

## Product-adapter contract

Use `POST /api/platform/growth` with `Content-Type: application/json` and:

```http
Authorization: Bearer <keyId>.<secret>
```

Provision the active service credential server-side in `platform_service_credentials`, using the application's service-identity format with the secret stored as `secret_hash`. The remote adapter retains the raw secret server-side. This is service authentication, not a browser session or a Supabase service-role key supplied by the caller. The inline Growth guidance does not provision this credential.

Every request contains the actual `tenantId`, `productKey` and **Growth Studio `brandId`**. The credential must allow that tenant/product and capability. Prefer an explicit `brandIds` allowlist. Nonempty `locationIds` restrictions are refused because this release has no verified location-to-Studio-brand mapping. Scope, credential status/expiry, activation and entitlement are rechecked inside the database transaction.

### Ingest evidence

Required capability: `growth.evidence.write`. Replace bracketed identifiers with mapped UUIDs; the example validity date must be replaced with the source's real expiry.

```json
{
  "operation": "evidence.ingest",
  "tenantId": "<tenant-uuid>",
  "productKey": "merqora",
  "brandId": "<growth-studio-brand-uuid>",
  "externalRef": "catalogue:item-123",
  "title": "Verified product details",
  "content": "Evidence supplied by the product system.",
  "kind": "product_data",
  "sourceUrl": "https://merchant.example/items/123",
  "validUntil": "2026-11-01T00:00:00Z"
}
```

The unique identity is `(tenantId, productKey, brandId, externalRef)`. New evidence returns HTTP 201; replay/update returns 200 with `{created, changed, replayed, evidence}`. The evidence includes its revision and `provenance: {credentialId, externalRef}`. Identical retries preserve revision, timestamps and source identity; a changed payload revises the source and invalidates dependent unhanded-off results. Never reuse the same external reference for a different item.

### Export approved output

Required capability: `growth.campaigns.read`. `campaigns.get` is an alias with the same approval/freshness gate.

```json
{
  "operation": "campaigns.export",
  "tenantId": "<tenant-uuid>",
  "productKey": "merqora",
  "brandId": "<growth-studio-brand-uuid>",
  "runId": "<approved-growth-run-uuid>"
}
```

The response contains scope/run/campaign IDs, `status`, `reviewStatus`, `output`, `handoff`, `provenance` and `exportedAt`. `output` contains `angle`, `rationale`, `variants`, `creativeBrief` and `warnings`. Provenance records run/brand/campaign revisions, evidence references/revisions/validity, provider/model and review/completion timestamps. Handoff IDs/statuses may be null if drafts have not been created. Export itself does not create a handoff, provision a tenant or publish anything.

Only completed, approved and still-current output can be exported, including after a previous handoff. Errors are sanitized: 403 scope/access denied; 404 unavailable run; 409 stale result; 422 contract violation; 413 body larger than 64 KiB; 415 unsupported content type; 503 unavailable service. A remote adapter must treat denial/staleness as a blocked operation and reconcile its mapping or inputs.

## Verification and release evidence

From the repository root:

```sh
npm ci
npm run build
npm run typecheck
npm run test:growth
npm run test:security
```

The build regenerates the TanStack route tree before type checking. `test:growth` runs `verification/growth-studio.runtime.test.mjs`, `verification/growth-studio.database.test.mjs` and `verification/growth-studio.gateway.test.mjs`. These exercise controlled provider responses and isolated database/gateway fixtures. Run the repository's normal CI gates as well. The main workflow uses `bun install --frozen-lockfile`; the repaired npm lock also matches the configured build dependency, `@lovable.dev/vite-tanstack-config@2.25.3`.

### Completed checks

| Area                     | Observed result                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                   | [PR #81](https://github.com/asaffilate01-ship-it/seamless-comms-suite/pull/81) and [PR #82](https://github.com/asaffilate01-ship-it/seamless-comms-suite/pull/82) are merged; the release-correction merge is `0f5412622924b8a8e42e49fdef7467ab33f21f6a`. The corrected release is `af016c60be0ef23af0012e6ef6c34ec88736f87b`, tree `1d57c63475e9ae23db02da5b09ea9925be34223d`.          |
| Application verification | Current-source audit, production build and typecheck passed. [CI run 37742436474](https://github.com/asaffilate01-ship-it/seamless-comms-suite/actions/runs/37742436474) and [CI run 37742436561](https://github.com/asaffilate01-ship-it/seamless-comms-suite/actions/runs/37742436561) passed. Growth checks passed: **25 runtime groups, 86 database checks and 14 gateway checks**.  |
| Migration rehearsal      | **Verify complete Supabase migration chain** CI passed against the complete checked-in SQL chain. This is separate from the hosted postflight below.                                                                                                                                                                                                                                     |
| Hosted target            | Native Lovable Cloud backend confirmed as `mqbmbzsadypjzirbfhja`. **10 canonical migrations applied**, retaining the six existing ledger entries: 16 total. All ten selected migration bodies matched source.                                                                                                                                                                            |
| Hosted access checks     | RLS enabled on all five Growth tables; authenticated direct insert/update/delete denied. Ingest, approved export and run-completion RPCs remain service-only. All recorded postflight checks passed.                                                                                                                                                                                     |
| Data preservation        | Existing application data was preserved. Postflight retained one tenant, four tenant members, three contacts, three cases, three conversations and five messages; the CRM backfill produced three people with no missing contact links.                                                                                                                                                  |
| Initial setup            | Zero tenant products, tenant services, provider bindings, service credentials and platform administrators; no Growth brands, evidence, campaigns or runs yet.                                                                                                                                                                                                                            |
| Production configuration | Native Lovable confirmed `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are present. The corrected source supplies only public project defaults to the browser, preserves real-environment precedence and regenerates types for the 80-table hosted schema.                                                                                                  |
| Backend smoke checks     | Against the newly published build at approximately **07:28 UTC**, malformed `{}` returned HTTP 422 `invalid_growth_request`; a well-formed `campaigns.export` request with a deliberately invalid synthetic service credential returned HTTP 403 `growth_access_denied`. Earlier checks also confirmed denial without Authorization and a 200 public-key backend auth-settings response. |
| Site publication         | Native Lovable confirmed the website update for `af016c6` at approximately **07:27 UTC** on [omniqora.itechlounge.co.uk](https://omniqora.itechlounge.co.uk/).                                                                                                                                                                                                                           |
| Signed-out frontend      | Reloading production `/app/growth` navigated to exactly `https://omniqora.itechlounge.co.uk/auth` and rendered **Welcome back** with Google and email/password sign-in. No application errors were observed after 07:26 UTC. No authenticated workspace session or provider request was attempted.                                                                                       |

The hosted observation is recorded in `hosted-postflight-observed.json` at `2026-10-08T06:46:27.632Z`, against the Growth migration source commit `7b97c2a2782b27d21ff85fc371d1e38ea0b8b062`. PR #82 subsequently corrected UI setup guidance and aligned the npm build lock; the later production correction is identified above. The hosted schema and backend rejection checks do not prove a working model credential, successful authenticated frontend session, populated Growth workspace or remote adapter connection.

Publication and signed-out browser proof are retained as `omniqora-growth-published-20261008.jpg` and `omniqora-growth-live-20261008.jpg`. Final API responses are recorded in `growth-live-final-malformed.json` and `growth-live-final-invalid-credential.json`. The earlier missing-configuration browser error was historical; the earlier page request returned an HTTP 200 shell, not an HTTP 500 response.

The two Growth migrations at the end of the applied dependency chain are:

1. `supabase/migrations/20261008100000_omniqora_growth_studio.sql`
2. `supabase/migrations/20261008100500_growth_product_gateway.sql`

For subsequent schema changes, follow the existing [migration rehearsal and staging process](../verification/staging/README.md) for the complete migration chain and actual target ledger. Review the dry run and use the approved environment's deployment path. Do not reset a populated hosted database, mark failed migrations applied or omit dependencies to make a release pass.

For application publication, use the existing native Lovable deployment path from the connected main branch and confirm the published revision. Git synchronization alone does not install server secrets or prove the deployed route works. Keep schema, server code and browser assets on compatible revisions.

### Remaining operational acceptance

1. Sign in with an authorized existing tenant member and verify authenticated `/app/growth` on [omniqora.itechlounge.co.uk](https://omniqora.itechlounge.co.uk/). Only the signed-out redirect and sign-in screen have been verified. A setup-required state is expected until the selected tenant/product is activated.
2. Provision one pilot tenant/product with Campaigns, an explicitly configured writer and its scoped server secret. Add Creative access for handoff. Optional Jev can be added separately; owner/admin review remains required.
3. Save a real brand, current sources and a campaign; generate, inspect checks, approve and reconcile both draft IDs. Record actual provider acceptance and output without exposing secrets.
4. Verify an agent cannot approve and another tenant cannot read or act on the pilot work. Exercise a duplicate request, expired source and revoked credential.
5. Implement and invoke each remote product adapter with its own scoped service credential; verify evidence ingestion and approved export against the live API.

Source, database deployment, publication and the signed-out browser check are complete. Authenticated workspace operation, real provider generation, cross-tenant acceptance in the hosted application and the four-platform integration become verified only as those live checks are recorded.

## Source map

- [UI and operator states](../src/modules/growth/GrowthWorkspace.tsx)
- [Input/output contracts](../src/modules/growth/studio.contract.ts) and [shared records](../src/modules/growth/studio.types.ts)
- [Authenticated server functions](../src/modules/growth/studio.functions.ts)
- [Generation/access/checks](../src/modules/growth/studio.runtime.server.ts) and [provider bindings/transports](../src/modules/growth/studio.providers.server.ts)
- [Repository RPC adapter](../src/modules/growth/studio.repository.server.ts)
- [Service gateway](../src/modules/growth/studio.service.server.ts) and [existing service identity](../src/modules/platform/service-identity.ts)
