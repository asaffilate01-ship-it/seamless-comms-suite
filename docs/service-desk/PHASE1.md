# Service Desk: first implementation

Working product label, not a cleared commercial brand. Route: `/app/service-desk`.

## Implemented

- Responsive staff workspace with existing organisation selector, real request intake, queue filters, search, record links and operational attention rules.
- Existing Omniqora cases remain the system of record. No second case database or duplicated control plane.
- Server functions use verified authentication middleware, live membership checks, explicit tenant filters and the caller-scoped Supabase client (RLS retained). Viewer submission is rejected server-side.
- No tenant bootstrap. No local storage of customer data. Switching organisations hides the previous snapshot immediately and ignores late responses.
- A stable request UUID makes duplicate concurrent inserts/network retries safe through the existing primary key. A conflicting UUID cannot overwrite another case. Replays require matching tenant, author assignment, title and priority; changed cases fail closed.
- Audit-write failure is reported separately from a successfully saved case. Request and audit writes are not yet transactional; an atomic audited intake RPC is a release prerequisite for regulated use.
- Only the 200 most recently updated cases are loaded; counts and search explicitly describe that scope.

## Source audit and boundaries

Inspected main at `60b9638038f3e9df8bcc0e038c9cd60f2a9bc6f7`, root AGENTS, portfolio source audit, case routes, case server functions, tenant bootstrap, auth middleware and initial RLS schema. Existing cases provide intake, assignment, lifecycle and detail views. The new page links to these existing details rather than duplicating them.

Factory documentation places tenant identity, entitlements and orchestration in Omniqora; separate products own domain data. This phase is a staff pilot inside Omniqora, not a registered independent subscription product. No catalogue entries or provisioning actions have been added. No separate SaaS Factory source repository was assumed.

Open PR discovery found no matching service-desk/Granicus implementation. Other shared capabilities have open work (including web-intelligence PRs #145/#146). This branch does not assume those capabilities are merged or active.

## Next implementation stages

1. Agree commercial brand; establish product source boundary and versioned Factory contract, product entitlement checks and subscription provisioning. Keep billing inactive until webhook and entitlement tests pass.
2. Customer/resident identities, request ownership and secure upload storage. Do not invite residents as tenant members: existing staff membership permits organisation-wide case visibility.
3. Dedicated public-facing forms, request descriptions, service categories, workflow templates, case-scoped audit history and configurable SLA deadlines.
4. AI drafts through the existing approved Omniqora gateway with scoped case context, citations, provider budget, consent and human review. Current attention prompts are deterministic, clearly labelled, and never invoke a model.
5. Independent branded frontend deployment, support operations, accessibility testing, retention/data-residency configuration and public-sector procurement evidence.

## Validation / release

Focused executable model tests: `node --experimental-strip-types --test verification/service-desk/model.test.mjs` (Node 22.6+). Added to existing verify workflow. Existing workflow also runs build, typecheck, security and control-plane checks.

This environment could read/write through the GitHub connector but could not clone/install the full repository. Full application build/typecheck, authenticated staging, tenant RLS concurrency tests and browser visual QA must be completed through CI/staging. No migration, customer activation, payment configuration or deployment performed.

Staging acceptance: two unrelated tenants with owner/agent/viewer accounts; deny cross-tenant reads and viewer creation; verify duplicate request UUID retries; slow response while switching tenants; expired/revoked membership; database/audit failure; empty and >200-record states; keyboard/mobile navigation. Review current full migration chain rather than treating the initial schema alone as proof of current RLS.

Rollback: revert this feature commit; existing cases remain intact. No schema rollback is required.
