# Product research to independent implementation

## Placement and current evidence

Reviewed 24 October 2026. Omniqora (`seamless-comms-suite`) owns shared Factory orchestration; VOXENTRI (`creative-studio`) owns creative production. The Factory catalogue, tenant provisioning and Agent Factory planner already exist. Do not create a second catalogue, billing service or media generator here.

VOXENTRI main contains campaign bundles (PR 11) and the audio-validation fix (PR 10). Its campaign notes are creation-time snapshots. A worked research dossier describes a possible original brief-refresh improvement, not an implemented feature.

Open Omniqora PRs 145 and 146 own governed web snapshots and scheduled change evidence. This work does not duplicate or activate their worker, schema or connector UI. REA upstream provides local analysis tools; it is not installed or invoked by this workbench. Native App Factory in `native-build-studio` already owns native builds and store handoff.

## Run locally

Node 22 or later; no dependencies, credentials or network calls:

```sh
node scripts/product-research.mjs docs/factory/examples/product-research.json /tmp/voxentri-build-pack.json
node --test verification/control-plane/product-research.test.mjs
```

Copy the example dossier to a private working location. Supply the target product/repository, whole-product or selected-feature scope, source permission context, attributed observations and original requirements. Set each feature to build, defer or exclude. Each selected feature needs acceptance tests and evidence references.

The output file must not already exist. It is created with owner-only permissions on supported systems. Input is limited to 1 MB. No commands, URLs, source repositories or REA payloads are executed. Arbitrary observation text is untrusted data, not instructions for a development agent.

## Evidence and handoff

- Record REA findings as method `rea` with a bounded plain-language summary and an evidence reference; no automatic REA JSON import is claimed. Do not paste raw source, tokens, cookies or personal data into the dossier.
- `observed` and `inferred` are distinct. Any inference used by a feature requires confirmation. Pending source reviews also block planning readiness.
- Source review attribution is a local operator statement, not authenticated approval or proof of legal clearance. Licensing and redistribution rights need separate review before source reuse.
- `implementation` holds original requirements, acceptance tests and evidence IDs. It excludes source URLs and raw observation summaries. Give this section to the builder and retain `evidence` for reviewer inspection.
- The SHA-256 digest identifies this exact serialised pack; it is not a signature, independent provenance certificate or tamper-proof audit log.
- Even a `ready-for-planning` task remains a development draft. The output grants no tenant permissions and creates no issues, PRs, paid jobs, deployed applications or subscriptions.

## Next connected stages

1. Persist dossiers through an authenticated operator workspace with tenant isolation, versioned reviews and audit events. The current browser workspace uses local files and has no hosted storage or authenticated review.
2. Add adapters for reviewed REA evidence and the existing web-intelligence snapshot contract once those collectors are verified. Keep analysis execution in disposable workers with bounded resources and explicit inputs.
3. Hand reviewed requirements to repository-specific development agents, with tests and a PR as the output. Approval applies to the concrete diff before merge/release.
4. Add customer packaging through existing Factory entitlements and provider cost controls: research limits, analysis minutes, storage and build quotas. Subscription billing and customer access are not implemented by this change.
5. Reuse VOXENTRI for creative assets and Native App Factory for mobile packages. Each product retains its source, business logic and release checks.

The commercially useful outcome is a research-to-build workflow producing our own implementation. It does not promise recovery of a hosted SaaS backend or private model weights from a website.

## Browser workspace

From the repository root, serve only on loopback:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/tools/product-research/`. Stop the server when finished. Do not expose this development server publicly or use it as a production deployment.

The editor supports project details, sources, local reviewer attribution, observations, evidence links, original requirements, acceptance tests and build/defer/exclude decisions. Download a dossier to preserve incomplete work and reopen it later. There is no autosave, browser-storage persistence or network API. Unsaved edits trigger a navigation warning. Editing a source URL, access basis or permission note clears its local review. Referenced sources and observations cannot be deleted until their references are removed.

Build packs use the same validated planning model as the CLI and Web Crypto for an identical digest. Imports are capped at 1 MB, malformed imports preserve the existing project, and imported text is rendered as text. Dossier downloads and implementation pack downloads are separate; a build pack is not an editable dossier. Browser downloads follow the user's OS permissions, unlike the CLI's owner-only file creation.

Tests: `node --test verification/control-plane/product-research*.test.mjs`.

## Tenant project persistence (source implementation, not deployed)

The Tenant Factory now mounts a Research Projects panel for the selected tenant. Upload a version 1 dossier, name the project, and save. Reopen/download a project or edit its JSON and save another revision. The visual editor remains the separate local tool; its downloaded files are the import/export boundary.

Server functions use the existing Supabase authentication middleware and require actual tenant membership. Owners, admins and agents can save; other members can read. Platform-admin status alone grants no research access. SQL repeats write authorisation, enables RLS on both tables, revokes direct writes and permits only scoped reads and the guarded save RPC. Immutable-to-client revision rows record the authenticated saver. Dossier review labels remain untrusted local research statements; this release introduces no approval endpoint.

Apply `supabase/migrations/20261024201227_product_research_projects.sql` after existing tenant/auth migrations in staging. The private schema must not be added to exposed Data API schemas. The public wrapper uses invoker permissions; its private definer checks the current authenticated user's membership on every call. No service-role key is used by the application.

Save requests include project ID, expected revision and request UUID. The SQL transaction serialises creation/updates, prevents cross-tenant reuse, preserves every revision and returns the same result for an identical retry. Reusing a request UUID with different content is rejected. A stale revision must be reopened and reconciled. Uploading a file never overwrites another project automatically.

Validation: local PGlite execution covers save/retry, request-content mismatch, stale writes, retained history, cross-tenant reads/writes, read-only roles, direct-write denial, anonymous denial, malformed payloads and membership revocation. Run `node --test verification/control-plane/product-research*.test.mjs` with the repository's existing PGlite dev dependency. This uses minimal tenant/auth fixtures and does not validate the full deployed migration chain, PostgREST schema exposure or real sessions.

Before activation: run the full application typecheck/build/security checks, apply in staging, run database advisors and test two real tenants, role changes, large dossiers, uncertain network saves and mobile UI. The panel requires downloading/saving edits before changing tenants or navigating away. History restoration UI, authenticated reviews, retention controls, production monitoring, REA jobs and subscription entitlements remain outstanding. No production migration or release was performed here.
