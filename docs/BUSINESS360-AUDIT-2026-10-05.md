# Business360 / Omniqora implementation audit — 5 October 2026

Audit baseline: main `41438ac`, including PRs 58, 60 and 62. This audit covers
Business360 and its actual host, service, bridge and SaaS Factory paths. It is not
an assurance report for every product in the Omniqora portfolio. Historical
handover specifications were compared with current source; catalogue entries and
passing tests are not treated as live connections.

## Assessment

Business360 is a substantial implemented audit/planning application with a shared
Omniqora and standalone UI. It is not yet demonstrated as a fully activated,
self-service commercial SaaS. The largest missing link found in this review was
Factory registration and entitlement enforcement. This change supplies that
registration and an explicit Factory access mode for the Omniqora host/bridges.
Standalone identity, billing and Factory entitlement synchronisation remain work.

| Area | Built and wired in source | Verification / remaining gap |
|---|---|---|
| Business intake | Businesses, departments, people, reporting lines, stakeholders, twelve discovery domains, evidence references | Engine tests; completeness still relies on entered/connected evidence |
| Audit preparation | Per-business six-check readiness, verified discovery, completed-period baseline | Tests reject future/empty baseline and disputed discovery; this is preparation, not assurance |
| Financials/KPIs | Decimal calculations, margins, DSO/DIO/DPO, cash conversion, CAC, conversion, costs, estimates, overlap flags and benefits | Deterministic tests; accounting/ERP ingestion and reconciled production balances not demonstrated |
| Collections | Per-business overdue totals, disputed/held exclusions, dated balance checks | Draft candidate selection only; Recovrable is not connected here and no debtors are contacted |
| M&A/carve-out | Planning scopes, company perimeter, target state, dependencies, workforce, cost scenarios, TSA obligations, Day-1 milestones, review/staleness controls | Implemented planning; no automatic legal transfer, ERP separation or production cutover |
| AI hub | Discovery, finance, technical, compliance, product and transaction specialists; durable bounded runs; approved tools, quotas, policy, review | Six provider adapters in source; credentials, deployed provider endpoints and representative live evaluations unverified |
| Evidence / RAG / GraphRAG | `knowledge.ingest/edge/ask`, rag/graph/hybrid retrieval, cited evidence, optional Neo4j storage, optional Ollama generation/embeddings | Configured at service deployment; no production knowledge-store/graph proof in this audit. This does not establish Microsoft GraphRAG or every reference AI application as deployed |
| Read connectors | Bounded Microsoft Graph applications/organisation/licences, GitHub repository/issues, fixed approved JSON feeds | Return incomplete-inventory flags; not general SAP/Oracle/Workday/Power BI/Fabric or accounting connectors |
| Product bridges | Product-specific contracts, fixed source identity/project, source scope, signed Lawquo/Haccora paths, receipts, idempotency, read-only drafts, cached-access revocation checks | Configuration and credentials are operator-owned. Source adapters and actual delivery must be verified per SaaS. Registry entries are not proof of live wiring |
| Connection readiness | Admin preflight checks service access, project, policy, role, model binding and configuration presence | Explicitly does not call the model, contact sources or mark a live connection verified |
| Omniqora UI | `/app/transformation` uses authenticated tenant identity and signed RPC to the Python service | Requires host configuration and separately deployed Python service. Git/Lovable synchronisation alone does not deploy it |
| SaaS Factory | This change registers product `business360`, service `business360.core`, an advisory blueprint and optional Omniqora add-on mapping | Manual activation; no tenants, prices, subscriptions or connections activated by migration |
| Access/RLS | Host tenant checks; restricted project membership; private pay filtering; signed RPC; PostgreSQL actor context and forced RLS | Company/department dropdowns are organisational scope, not separate ACLs. Use restricted projects/tenants for different authorised teams |
| Standalone | Same React workspace and engine; operator accounts, password/session controls, separate pilot entitlement directory | Separate identity remains; no self-serve billing, enterprise SSO/MFA, automated invitation/recovery or Factory synchronisation |
| Site/live operation | Public root and `/app/transformation` probes attempted on 5 October | Retrieval failed; direct probes returned 403. This cannot distinguish edge restrictions from application behaviour and does not establish an outage or successful live deployment |

## Where it sits

Omniqora is the control plane. `business360` is a product/landlord under Omniqora;
`business360.core` is its service and can also be enabled as an Omniqora add-on.
The service owns engagement records in the Transformation data layer. The Factory
owns organisation/tenant records, catalogue, branding, domains and entitlements.

Hierarchy: organisation → tenant/workspace → restricted engagement project →
companies → departments/people/stakeholders. A company can be a transaction target
inside an engagement; creating that company is not equivalent to creating a new
Factory tenant, giving someone a login, or migrating a SaaS database. Distinct
client access requirements should use distinct tenants or restricted projects.
Factory brands/locations are not currently automatically mapped to engagement
companies/departments. Standalone users are not silently linked to Supabase users.

## Factory access added in this change

Default `BUSINESS360_ENTITLEMENT_MODE=pilot` preserves the existing explicit
`BUSINESS360_ENABLED_TENANTS` deployment allowlist. An empty list denies access.
Set `BUSINESS360_ENTITLEMENT_MODE=factory` only after applying the new migration
and configuring/validating the intended tenant grants. Invalid modes fail closed.

Factory mode requires an active tenant and an active/trial `business360.core`
service whose validity window has started and has not expired. A standalone
Business360 product assignment, when present, must also be active. A service-only
assignment supports add-on access without requiring a standalone subscription.
Database failures never fall back to the pilot list. Host requests recheck the
entitlement before returning results; bridges recheck through their existing
before/after identity guard. Browser identity/project membership checks remain.

The same mode must be configured on all host instances. The standalone Python
account server still uses its own operator entitlement directory; this change
does not make that server consume Factory grants. Do not promise unified access
revocation across both deployments until that adapter is implemented and tested.

Registration is deliberately hybrid/manual: the generic provisioning worker must
not infer that a Python service, account directory or model provider is live
merely because the source has been built. Pricing has not been invented or set.
No forced history rewrite, production migration, credential change or cutover is
performed by this build.

## Remaining work, in execution order

1. Deploy the current host and Transformation service; apply PostgreSQL/RLS and
   Factory migrations through the deployment process. Confirm restricted DB role,
   signing key, TLS, backups, monitoring and recoverability.
2. Select one operator-approved pilot tenant/project; set up real members and
   provider/project bindings; run connection preflight and controlled source/model
   smoke tests. Record actual deployment and evidence references.
3. Add standalone managed identity and explicit canonical tenant/user mapping,
   Factory entitlement consumption/revocation, and a controlled provisioning
   adapter. Preserve existing pilot identities; do not infer matching users from
   email alone.
4. Agree prices/plans and add payment reconciliation, subscription lifecycle,
   invitations/recovery and service-level operational controls. A manual service
   grant is not billing integration.
5. Connect one authoritative accounting source and Recovrable via scoped contracts
   and reconciliation. Then expand HR/assets/ERP/telephony/marketing sources; keep
   provider pagination, consent, freshness and completeness visible.
6. Complete document/OCR intake and evidence mapping for the intended customer
   formats, host RAG/graph storage and run representative evaluations. The existing
   evidence API is not a universal automatic business-audit ingestion pipeline.
7. Deepen department-level engagement boundaries, goals/scenarios, reviewed action
   delivery and actual-versus-forecast tracking according to pilot evidence.
   Production cutover/external action adapters need their own explicit approval
   and rollback controls.

## Code and tests

Primary paths: `src/modules/transformation/`, `services/transformation/`,
`apps/business360-standalone/`, `src/modules/ecosystem/`,
`src/modules/control-plane/`, and `supabase/migrations/`.

New migration: `20261005063000_business360_factory.sql`.
New gate: `src/modules/transformation/entitlement.server.ts`.
Regression coverage: `verification/product-bridges.test.mjs` and
`verification/control-plane/business360-factory.test.mjs`. These exercise
entitlement windows, suspension, database failure, no pilot fallback, request-time
revocation, catalogue hierarchy, manual activation, no seeded tenant grants and
repeatable migration. The repository CI also exercises native PostgreSQL/RLS,
shared application build and standalone build. Passing CI verifies the tested
source configuration, not the user's production deployment.
