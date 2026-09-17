# Verification — updated 16 September 2026

## Passed

- **81 transformation Python tests** for tenant/project isolation, roles, revisions, financial arithmetic, FX validation, entry idempotency, forecast definitions, scenarios, dependency impact/cycles, approvals, stale plans, revocation, pause controls, concurrent execution, source isolation, model-output citation validation, request signing/replay, product prioritisation, UAT/adoption/sprints, six workstreams, reconciliations and independent benefit review/double-count prevention. The 16 added planning cases cover company scope, partial carve-out exclusions, source traceability, recurring cost normalisation, transition durations/budget overruns, unknown-versus-zero costs, duplicate keys, foreign currency provenance, cross-project references, independent review, stale drafts, idempotent generation, dependency/schedule conflicts, advisory mandates, diligence, TSA exit and role boundaries.
- **22 new AI-layer test methods** within the 81-case transformation suite cover all six provider wire contracts, rejected/truncated responses, strict endpoint/credential references, scoped connector projection, tenant/project bindings, role restrictions, state persistence, idempotent start, step limits, concurrent claims, quotas, pause, cancellation, permission revocation during a call, stale inputs, forbidden tools, invented references, task proposal approval and explicit evidence ingestion.
- **43 existing shared-core tests executed successfully** from the reused knowledge snapshot. The shared suite discovered 74 cases; 31 optional cases were skipped because a live Neo4j test environment was not configured.
- **Strict TypeScript checking** of the workspace, company planning and AI hub panels, record templates and private Node service caller.
- **React DOM integration checks** against the real Python service through the signed Node caller: project load, six workstreams, GraphRAG evidence, financial scenarios, RICE output, UAT blockers, company-plan generation, transition totals, incomplete-plan review block, Day-1 roadmap/gates, guided intake, stale plan history, saving inventory, readiness-agent planning, rejection of self-approval and pause controls; plus AI default-off state, owner route/sharing controls, multi-step model-driven runs, observation references, pending task proposals, usage metering, connector preview/explicit ingestion and cancellation. Twenty-four checks passed.
- A complete fictional example ran without external model calls. Its snapshot is included under `examples/`.

The legacy generation test and new model/connector integration checks use explicit contract-test fixtures. They verify schema/citation handling; they are not a real model quality evaluation. Default live local testing used evidence-only retrieval.

## Not verified here

- A full build or deployment of the existing TanStack/Supabase repository, real Supabase authentication/RLS, production membership changes and billing entitlement integration.
- Live Neo4j execution, live generation/embedding models, cloud services, ERP systems, Microsoft 365, CI/CD, BI platforms or analytics connectors.
- Actual-browser pixel/layout inspection. The available browser executable was missing and its download failed; DOM interaction tests passed but do not establish visual quality at desktop/mobile breakpoints.
- Production concurrency/load, large-corpus performance, backup restoration, external audit acceptance, real finance period-close continuity or migration outcome guarantees.

Raw Python logs and the machine-readable UI check result are included alongside this file. Integration must complete the outstanding checks before activating the module for customers.
