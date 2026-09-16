# Omniqora portfolio consolidation — 16 September 2026

Omniqora remains the shared platform. Business360 uses the same transformation service and UI in the host and standalone app. Product applications keep their own domain databases, customer relationships, authentication, publication and transaction decisions. No product's migration is transplanted into another product database.

## What is included

- The 78 original integration plans are retained in `recovered-integration-plans.json`, including original repository/Sites mappings and unresolved identities. Their historical PR status is evidence from recovery, not a claim about current deployment.
- The app's `src/modules/ecosystem/catalogue.json` adds SparesGrid, Business360 and EPOS/Cafe1, giving 81 deployment records. Repeated products represent different markets/deployments; they are not 81 distinct brands or 81 live connections.
- `/app/integrations` lists the deployment registry and the current tenant's configured bindings. Only a verified tenant owner/admin can inspect binding metadata. Keys, private source context and draft bodies are never returned there.
- `/website` restores the original communications/CRM/cases/Aida/campaigns/workflows/analytics/industry catalogue, adds the wider service families and product ecosystem, and retains “Your business, working as one.” The original multilingual homepage now links to it on desktop and mobile.
- Veyumo's 17 new source files from draft PR #1, head `9589c9f2224997dbbdac29fe8f841e72137f7de1`, are integrated here; settings and Supabase configuration are merged minimally. Its protocol, database and Gigs fixture checks run in CI. Gigs credentials, functions deployment, offers and sales activation are separate operational steps.
- Existing Business360, transformation/product AI, financial planning, M&A/carve-out planning, adviser/learning, enterprise AI, RRCI/shared knowledge, ecosystem/referral services and earlier AI control-plane source remain present. The two earlier full-stack AI applications remain in `reference/`; their simulation dashboards and provider deployments are not presented as live host capabilities.

## Product contracts checked against source

| Product | Source inspected | Connection implemented in this repository | Remaining source/deployment work |
|---|---|---|---|
| Haccora UK | `haccora-connect` dispatcher and integration-admin | Exact raw-body HMAC, five-minute freshness, event ID/type matching, organisation-bound notification receipts | Register a webhook in the source workspace. Only notification metadata is retained; permission-filtered domain evidence needs a separate source export. Haccora Germany must be checked independently. |
| Lawquo | Draft PR #1 head `740e6eb5708910b2b4f58f6c1094573eceeb274b`, handover and `lawquo-omniqora.ts` | Metadata-only queue, exact firm/case/request/revision/kind scope, explicit case evidence submission, validated private assessment results | Install the source adapter alongside Lawquo's current case access loader and `validateOmniqoraDraft`. Domain PR remains independent. No court filing, client publication, conflict clearance or client-money operation. |
| TaxNuvia finder | `your-accountant-finder` matching input and output contracts | Ranking of the exact supplied eligible candidate set, using the existing matching result shape | Wire the server adapter after existing source eligibility/redaction. Keep `mergeAiRanking` and source fallback; private TaxNuvia Accounts is a separate deployment. |
| SparesGrid | Current Site `appgprj_6aa9abd0be448191abbb0d000a7bb927`, AI/enquiry/vision routes | Existing question and enquiry JSON contracts return `{text,sources}` and a review flag; no source UI change required | Configure its server URL/key and an explicit source-tenant binding. Photo recognition is deliberately refused until a compatible vision provider adapter is configured; no OCR result is fabricated. |
| EPOS / Dishbee | Recovered hospitality/commerce plans and pilot catalogue | Same-period sales/refund/discount/COGS arithmetic and reviewed draft contract | Exact EPOS/Cafe1 repository and source branch/record permissions still need verification. No live EPOS adapter is asserted. |
| Business360 | Current host and standalone source | Shared backend, authenticated project UI, source-scoped discovery brief contract | Deploy the service, apply migrations, provision project membership and configure AI policy. Standalone accounts remain local pilot accounts; no invented cross-app SSO or self-serve billing. |
| Other SaaS/tenant projects | Preserved original 78 plans | Shared server adapter, explicit product binding and generic source-context draft/event contracts | Install each adapter with the product's real permission-filtered source loader. Unknown project identities are not guessed or automatically activated. |

Hacvora/Haccora and Recovrable/Recovarable/Recovra spellings are preserved through the user's requests and recovered source identities. This update does not silently merge separately named companies, tenants or products. Cirqiva is the waste/circular-economy product, not an EPOS alias.

## Runtime routes

All routes are server-to-server, JSON, no redirects, no CORS grant and no cookie-based product authentication.

- `POST /api/integrations/gateway`: source-scoped synchronous drafts; native SparesGrid question/enquiry contract, TaxNuvia ranking, EPOS or generic/Business360 brief.
- `POST /api/integrations/events`: timestamped, idempotent metadata receipts. Lawquo sends its existing `{title,input:JSON.stringify(scope)}` envelope.
- `GET /api/integrations/runs/:runId`: only the same configured source connection and dedicated project principal may read a receipt/result.
- `POST /api/integrations/runs/:runId/context`: Lawquo-only, fresh source-authorised evidence whose case scope exactly matches the original metadata. The source rechecks its current user permissions and context revision before sending and before using the result.
- `POST /api/integrations/haccora/:connectionId`: native `x-haccora-signature: t=seconds,v1=HMAC_SHA256(secret,seconds+'.'+rawBody)`, with the source event headers.

The old `adapters/omniqora-server-client` is retained for the earlier pilot. Its approved-task polling endpoints belong to that pilot; they are not silently redirected to this gateway. New product work uses `adapters/product-bridges/client.mjs` and the contracts above.

## Provisioning and isolation

1. Apply the normal ordered Supabase migrations, including `20260912090000_veyumo_control_plane.sql` (if previously unapplied) and `20260916140000_business360_bridges.sql`. The latter adds a twelfth Business360 table with forced RLS. The runtime database login must remain non-superuser and without BYPASSRLS.
2. Create a dedicated source service principal as a real host tenant member and grant it the appropriate Business360 project role. Use a separate principal/project for sensitive source domains; do not give a customer's browser that principal's credentials. Source principals must be provisioned through trusted administration, not signup role claims.
3. Enable the tenant in `BUSINESS360_ENABLED_TENANTS`. The host checks current tenant membership on every machine call, and again after the service returns. The service independently checks current project membership; a source credential alone cannot choose a different tenant/project/user.
4. Configure server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRANSFORMATION_URL`, `TRANSFORMATION_SIGNING_KEY` and `OMNIQORA_BRIDGES_JSON`. The service role is used only for the fixed, operator-bound host membership lookup. Never use a `VITE_` prefix for these secrets.
5. Configure one independent random credential of at least 32 characters per binding. Store only its environment-variable name in the binding. Keys cannot be reused across bindings. Bind an exact external tenant and an explicit list of case/collection/branch scopes. There are no wildcard tenant grants. Haccora notification bindings currently require the organisation itself in `allowedScopes`.
6. Configure an approved model bound to that tenant/project, enable data sharing, select the corresponding specialist route and set usage limits in Business360 AI policy. Requests fail closed without this setup. No model credentials or fabricated outputs are seeded.
7. Install the source adapter with a loader that authenticates the actual source user, checks current case/client/branch access, redacts records and provides a monotonically updated context revision. Recheck it after generation. SparesGrid's existing routes already filter source records by tenant and role; bind the gateway key only to that source tenant.
8. Exercise two tenants and two source scopes in staging. Verify revocation, rotation, expiry, stale signatures, duplicate/changed idempotency keys, source revision changes, quota refusal and provider failures. Only then describe that particular connection as live verified.

`bindings.example.json` is disabled, contains placeholder UUIDs and references a missing secret; it is not runnable production configuration. Binding `expiresAt`, tenant entitlement and current membership are enforced. The authenticated registry says “configured—not live-verified” even after configuration; a label does not manufacture connectivity evidence.

## Durable processing and data handling

Receipts are atomic per tenant/project/connection/request ID. A changed payload with an existing ID is rejected. Each connection has a daily receipt limit and draft calls use the existing per-project/per-tenant model budgets, including failed attempts. Model output is structured, bounded and validated against only source-supplied IDs. The draft path cannot invoke tools, fetch arbitrary URLs or perform external actions.

Private context/results have creator-specific forced RLS in addition to tenant and project boundaries. Ordinary project owners/viewers cannot read a different principal's bridge data, even with an unfiltered SQL query. The project audit records connection/request metadata, never case narrative or model output. Business360 exports do not include these private bodies.

There is no unattended retry or callback worker for intelligence drafts. If a process dies in `processing`, inspect that exact receipt and provider usage before any replay; do not create duplicate jobs blindly. Received notification events are evidence of receipt, not evidence of a completed inspection or workflow. Veyumo has its own tested durable worker documented separately.

Set a retention period for bridge source payloads/results and implement operator-controlled expiry appropriate to the customer engagement before production. Removing expired rows must use the approved operator database role; runtime users have no DELETE grant. Source evidence remains subject to source permissions and revision checks.

## Verification and deployment truth

CI builds the current app and standalone UI, typechecks, runs the service suites, product bridge contracts, Veyumo tests, PGlite policy checks and native PostgreSQL tests. No external model, Gigs account, live EPOS system or customer tenant is contacted by those tests. They establish source behaviour, not production activation.

The local environment cannot create the native PostgreSQL helper's OS account; the native gate runs in GitHub CI. The remote browser could not reach the local preview, so no new browser visual pass is claimed. The public site's `/website` route returned 404 before this merge; Git source sync and publishing the Lovable deployment are separate steps.
