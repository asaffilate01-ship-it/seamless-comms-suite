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

1. Persist dossiers through an authenticated operator workspace with tenant isolation, versioned reviews and audit events. The current tool is local development tooling and has no hosted UI/storage.
2. Add adapters for reviewed REA evidence and the existing web-intelligence snapshot contract once those collectors are verified. Keep analysis execution in disposable workers with bounded resources and explicit inputs.
3. Hand reviewed requirements to repository-specific development agents, with tests and a PR as the output. Approval applies to the concrete diff before merge/release.
4. Add customer packaging through existing Factory entitlements and provider cost controls: research limits, analysis minutes, storage and build quotas. Subscription billing and customer access are not implemented by this change.
5. Reuse VOXENTRI for creative assets and Native App Factory for mobile packages. Each product retains its source, business logic and release checks.

The commercially useful outcome is a research-to-build workflow producing our own implementation. It does not promise recovery of a hosted SaaS backend or private model weights from a website.
