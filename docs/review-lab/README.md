# SaaS Review Lab

Location: Tenant Factory → SaaS Review Lab. The Review Lab prepares portable study packages and inspects manually imported findings and discussions. It performs no model calls, browser tests, subscriptions, billing, automatic issue creation or production activation.

## Working flow

1. Select a tenant and enter a product, decision, audience and brief. Product names are study labels, not registered integration mappings.
2. Add optional public/synthetic observations with source references. References are not fetched. A supplied test receipt is not independently verified.
3. Confirm public/synthetic content and prepare. Server checks current owner/admin/agent membership using the authenticated user's client. No platform-admin bypass.
4. Download the draft for restoration and the study package for provider adaptation. Drafts are memory-only and clear on tenant switch/reload. Download before navigating away. No customer data is persisted by this module.
5. Once a provider has run a study externally, adapt its report to the schema below and import it against the matching prepared revision. Imported reports never prove execution or provider identity.

## API contracts

TanStack POST server functions `prepareReviewStudy` and `inspectReviewReport` use existing authenticated middleware. These are internal application functions, not stable public REST URLs. `contract.ts` contains strict version-1 Zod request/report schemas. `service.server.ts` enforces fresh membership for both operations. The SHA-256 digest binds normalised study data; it is not a signature or authenticated execution receipt.

Report format:

```json
{
  "version": 1,
  "studyDigest": "COPY_DIGEST_FROM_PREPARED_PACKAGE",
  "findings": [{
    "category": "fix",
    "priority": "high",
    "claim": "Clarify the differences between subscription tiers",
    "evidenceIds": [],
    "experiment": "Test clearer tier descriptions with real prospects",
    "metric": "Completed paid registrations"
  }]
}
```

Categories: keep, fix, build, market, monetise. Priorities: high, medium, low. Empty evidence references mean unsupported hypothesis. Report requires 1–50 findings; the downloaded empty template must be filled before import. Imports are capped at 150 KB in the UI and bounded by the server schemas. The provider package instructions treat source content as untrusted data, require independent first opinions and distinguish simulation from actual demand.

## Connection phase

MiroFish is deliberately not wired to guessed endpoints. Upstream self-hosted MiroFish and independent hosted vendors have different contracts. Choose and pin a provider/version before implementing a transport adapter. No provider code was copied and no third-party packages were added.

Required before enabling execution:
- Verified provider API, credential storage, region/data-processing policy and deployment licence review.
- Durable tenant-scoped studies/runs/revisions and RLS, ideally integrating the pending product research persistence work (PR #175), rather than copying its tables.
- Atomic allowance reservation, idempotency keys, job queue, cancellation, timeouts, redacted audit receipts and uncertain-completion reconciliation.
- Server-controlled endpoint allowlist and verified callback authentication. Never accept arbitrary fetch URLs or credentials in browser study payloads.
- Actual billing based on provider usage. The current ceiling is planning metadata only, never an enforced allowance or price estimate.
- Signed-in staging/browser acceptance for tenant switching, permission revocation and report review.

Later: live agent chat, authenticated test-evidence ingestion, approved backlog execution and outcome tracking. The existing research module retains web research ownership; existing product repositories retain customer records and domain logic.

## Verification

`node --test verification/review-lab/*.test.mjs` on Node 24 (native TypeScript stripping), `npm run typecheck`, `npm run build`, `npm run test:security`. No migration or provider subscription is required for this release.

## Phase 2: discussion inspection and experiment handoff

Incomplete drafts can now be downloaded/restored, including empty briefs and evidence summaries. The stricter study validator still prevents preparation until completed and confirmed. Restoration never carries over the UI confirmation. Drafts remain tab-memory only.

`inspectReviewTranscript` accepts `{study, transcript}` and rechecks tenant membership. Use the template downloaded from the prepared study:

```json
{
  "version": 1,
  "studyDigest": "COPY_DIGEST_FROM_PREPARED_PACKAGE",
  "messages": [{
    "id": "message-1",
    "agentId": "persona-1",
    "round": 1,
    "text": "I need a clearer explanation of the delivery format.",
    "evidenceIds": []
  }]
}
```

One message per persona per round; messages are bounded to 200 and 2,000 characters each. Partial transcripts are accepted and show supplied versus planned turn counts. Unknown agents, excess rounds, duplicate IDs/turns and unknown evidence are rejected. The UI supports persona/round filters and text search. All text renders as plain text; no imported HTML or links execute. The UI file size limit remains 150 KB, so larger transcripts must be shortened before import. No claim of provider authenticity, completeness or real user representation follows from successful import.

`exportReviewExperiments` accepts `{study, report}`, revalidates membership and references, and returns a portable JSON backlog sorted by priority. Stable finding indexes preserve source mapping. Items contain experiment, metric, unverified evidence references and unset owner/deadline/outcome. Every item is proposed, and the package requires human review. Export does not create GitHub issues, execute tasks or authorise spending. Integration with saved research projects and verified outcome tracking remains pending.

Import failure clears the affected report/transcript; changing the study or confirmation clears both. Preparing again also clears previous imported results. This prevents old results being presented as a new successful run. Signed-in browser acceptance and provider-backed conversation remain outstanding.
