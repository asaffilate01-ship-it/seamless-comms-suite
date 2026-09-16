# Verification — updated 16 September 2026

## Passed

- **59 transformation Python tests** for tenant/project isolation, roles, revisions, financial arithmetic, FX validation, entry idempotency, forecast definitions, scenarios, dependency impact/cycles, approvals, stale plans, revocation, pause controls, concurrent execution, source isolation, model-output citation validation, request signing/replay, product prioritisation, UAT/adoption/sprints, six workstreams, reconciliations and independent benefit review/double-count prevention. The 16 added planning cases cover company scope, partial carve-out exclusions, source traceability, recurring cost normalisation, transition durations/budget overruns, unknown-versus-zero costs, duplicate keys, foreign currency provenance, cross-project references, independent review, stale drafts, idempotent generation, dependency/schedule conflicts, advisory mandates, diligence, TSA exit and role boundaries.
- **43 existing shared-core tests executed successfully** from the reused knowledge snapshot. The shared suite discovered 74 cases; 31 optional cases were skipped because a live Neo4j test environment was not configured.
- **Strict TypeScript checking** of the workspace, company planning panel, record templates and private Node service caller.
- **React DOM integration checks** against the real Python service through the signed Node caller: project load, six workstreams, GraphRAG evidence, financial scenarios, RICE output, UAT blockers, company-plan generation, transition totals, incomplete-plan review block, Day-1 roadmap/gates, guided intake, stale plan history, saving inventory, readiness-agent planning, rejection of self-approval and pause controls. Sixteen checks passed.
- A complete fictional example ran without external model calls. Its snapshot is included under `examples/`.

The generation-path test uses an explicit contract-test provider. It verifies schema/citation handling; it is not a real model quality evaluation. Default live local testing used evidence-only retrieval.

## Not verified here

- A full build or deployment of the existing TanStack/Supabase repository, real Supabase authentication/RLS, production membership changes and billing entitlement integration.
- Live Neo4j execution, live generation/embedding models, cloud services, ERP systems, Microsoft 365, CI/CD, BI platforms or analytics connectors.
- Actual-browser pixel/layout inspection. The available browser executable was missing and its download failed; DOM interaction tests passed but do not establish visual quality at desktop/mobile breakpoints.
- Production concurrency/load, large-corpus performance, backup restoration, external audit acceptance, real finance period-close continuity or migration outcome guarantees.

Raw Python logs and the machine-readable UI check result are included alongside this file. Integration must complete the outstanding checks before activating the module for customers.
