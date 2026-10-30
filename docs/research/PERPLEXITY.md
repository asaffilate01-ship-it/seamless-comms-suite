# Shared Perplexity research pilot

Implemented in Omniqora's AI Control dashboard. Not deployed or enabled by this change.
This uses Search API (`POST https://api.perplexity.ai/search`), not a legacy Sonar
chat endpoint. It returns source excerpts, not an AI-generated synthesis. The
provider adapter is independent of the dashboard and can be reused by subsequent
permissioned product connectors. Kindelo, UniPathway and Creative Studio have not
been modified or connected by this PR.

## Contract and controls

- Existing authenticated server middleware supplies actor identity. The browser
  cannot choose an actor, endpoint, API key, price, model, arbitrary context or tools.
- The service-only reservation RPC checks actual tenant owner/admin/agent membership
  (no platform-admin bypass), active product and intelligence-runtime entitlement.
- An operator provisions a disabled-by-default allowance for a specific tenant,
  product and date period. No client can replenish it. Row locking serialises
  admissions; one durable request UUID maps to one exact query hash/actor/preset.
- Every admitted request consumes one unit, including failures and uncertain outcomes.
  No automatic retry/refund: a provider timeout may still be charged. A retry with
  the same UUID never repeats the provider request. A crash can leave `reserved`;
  this is labelled outcome unconfirmed, not success or a refundable failure.
- This is a request-count allowance, not a currency-denominated billing ledger.
  Operators must calculate an appropriate cap from current provider pricing and
  set provider-account spending limits. No unlimited or default-active quota.
- One query, five sources, bounded excerpts, 20-second abort, 256 KB response limit,
  fixed HTTPS endpoint, redirects refused, no upstream errors reflected to users.
- UK childcare and food presets filter to configured official domains; returned
  links are filtered again. General research is not authoritative compliance advice.
- External text is plain React text, never HTML or instructions for tool execution.
  Missing excerpts stay empty. Duplicates and unsafe/nonmatching links are dropped.
- Query text is sent to Perplexity but not stored locally; only its hash is retained.
  User confirms the question contains no personal/confidential records. This checkbox
  is not automated DLP. Source text may itself contain public personal information.
- Saved results require current tenant membership, active product and entitlement.
  RLS hides results after 30 days. No browser writes or direct reservation calls.
  Tenant changes unmount/reset the form. No cross-tenant cache or external publication.

## Deployment checklist

1. Apply `20261029215226_perplexity_research.sql` after the existing migrations in
   staging and run database advisors plus real-session acceptance.
2. Configure server-only `PERPLEXITY_API_KEY` and `PERPLEXITY_RESEARCH_ENABLED=true`
   through the deployment secret manager. Never use a `VITE_` variable for these.
3. Provision the exact tenant/product allowance using an authorised operator connection.
   Set `period_start`, exclusive `period_end`, `request_limit`, and `enabled=true`.
   Check current membership, active product and entitlement. Do not grant database
   service credentials to product clients. Renewal is manual and must preserve usage
   evidence; changing a quota is an operator action, not a UI entitlement purchase.
4. Configure a daily operator maintenance job to delete expired results:
   `DELETE FROM public.research_requests WHERE expires_at <= now();`
   RLS expiry is immediate even if cleanup is delayed; physical deletion needs this job.
5. Test a low-cap staging allowance: owner success, viewer/outsider denial, exhausted
   cap, repeated request UUID, tenant switching, inactive product, revoked entitlement,
   upstream outage and stale pending request. Confirm provider billing separately.
6. Deploy the application and verify the AI Control panel with real authenticated users.
   No production key, live request, migration, retention schedule or deployment was
   performed as part of this implementation.

## Integration boundaries and next work

Existing draft PRs #145/#146 own public-page collection and source monitoring;
#175 owns product research dossiers. This panel does not duplicate or activate those
workflows. Follow-on product endpoints need scoped service-credential admission,
explicit data-transfer permissions and product-side UI adapters. Agent API synthesis,
reviewed report exports, scheduled alerts and monetary settlement are separate work.
No policies, customer records, approvals, messages or business actions are changed.

## Verification

- `node --test verification/control-plane/perplexity-research.test.ts`
  (Node 22.18+ / Node 24; CI uses Bun for TypeScript tests).
- `node --test verification/control-plane/perplexity-research.database.test.mjs`
- `npm run typecheck`, `npm run build`, `npm run test:security`.
- Database tests execute the new migration in PGlite with minimal parent fixtures;
  the security suite separately replays the repository migration chain.
- Mock provider tests do not demonstrate a working production key or live search.

API contract reference checked 29 October 2026:
https://docs.perplexity.ai/docs/search/overview
https://docs.perplexity.ai/docs/search/quickstart

## Saved-record export and access UX

The panel now reports read-only membership and prevents presenting a usable search
button to viewers. Server admission remains authoritative. Checking a submitted
request only refreshes its history, including when its allowance is exhausted.

Completed records can be downloaded as plain-text research evidence. Export reads
one exact tenant/product/request again with the authenticated RLS client, so missing,
revoked, expired, incomplete or malformed records cannot be exported from a stale
browser result. Downloads contain source publication/update dates (or Unknown),
retrieval time and explicit unreviewed/untrusted-excerpt labels. No generated answer,
automatic compliance approval or publishing action is introduced. Downloaded copies
have their own retention responsibility; database expiry cannot delete them.

## Paged history and on-demand evidence

History now supports all/completed/failed/pending status filters and 20-row pages,
with a 21st row used only to detect a next page. The database filters tenant, product
and status before paging; ordering is created time then request ID. Only metadata
is returned in the history list. Offset pages may shift as searches arrive or expire;
no complete-count or stable-snapshot claim is made. Pages are bounded to 0–500.

Opening a completed record performs a fresh exact-record read through the user's
RLS client. Detail and export share validation of completion, expiry, result schema
and safe source URLs. Closing a detail unmounts its query and discards its cached
content; reopening checks access again. Errors hide stale contents. Access revocation
is rechecked on reads, not pushed to already displayed browser text. No migration,
new provider call, entitlement expansion or product connector is introduced here.
