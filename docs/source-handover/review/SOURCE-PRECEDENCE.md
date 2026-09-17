# Source precedence and merge boundaries

The intended application host is `asaffilate01-ship-it/seamless-comms-suite` (TanStack Start, React, Supabase in the recovered handovers). Its current branch must remain the base. The separate hosted Omniqora intelligence pilot uses Vinext/Cloudflare. The older Full Suite is a third source generation. None should replace the other's root project configuration.

| Source | Keep / reuse | Integration boundary |
|---|---|---|
| Current Omniqora repository | Existing routes, customers, auth, tenant rules, UI and deployment setup | Inspect latest HEAD before applying recovered files. No current application PR or database migration was created here. |
| Business360 Combined v0.3 | Business-first intake, departments, people, discovery, financial fundamentals, improvement reports, standalone identity and PostgreSQL RLS | Based on Transformation v0.2. Its `v0.3` number does not mean it includes the separately developed Transformation v0.3 AI hub. |
| Transformation and Product AI v0.3 | Six provider adapters, six specialist profiles, controlled AI runs, three scoped read-connector types and AI Hub panel | Reconcile engine, server, UI and server-function changes with Business360; do not overwrite either branch wholesale. Provider adapters were contract-tested; credentials/live acceptance are separate. |
| Enterprise AI Extension | Governance/adoption register, pilot assessment, evidence/review utilities | Separate Python core and host contract. No finished dashboard/authenticated network service in the original extension. |
| Consolidated AI Pack | Central source register, AI/day/BI/reception pilot, ecosystem v3, RRCI, adviser learning and server adapters | It already contains many earlier sources. Use originals for traceability; avoid implementing duplicate services. |
| RRCI Handover | Later knowledge governance, permissions, cited retrieval and action review | The tenant helper and migration modify existing onboarding/membership policy. Review and test together in isolation. Do not auto-apply to production. |
| Shared Knowledge Core | Original retrieval/optional graph reference | Newer RRCI governance has precedence. Historical Neo4j results do not establish newer governance correctness. |
| Adviser/Learning | Decision/outcome journal, reviewed lessons, candidate comparisons, adviser helpers | Already nested in Consolidated pack. Live advice/trading, automatic training and host UI are not thereby activated. |
| Ecosystem Core | One central Python runtime with scoped product adapters | Retain v3 contract; an older v2 React admin example is not interchangeable. Real billing/provider activation remains separate. |
| Full Suite and iTechLounge AI Core | Earlier broad feature catalogue, Intelligence engine and brand sources | Reference generations. Do not overwrite the live host's router, package file or lockfile. |
| SaaS Project Packs | Per-product integration updates and adapters | Apply only to each named app. 79 labelled packs do not mean 79 verified live integrations. |
| New website update | Marketing component and route | Additive only; no data migration or auth replacement. |

## Confirmed Business360 / AI hub overlap

The supplied common base is Transformation v0.2. Comparing it with Business360 and the newly recovered Transformation v0.3 identifies these source conflicts:

- `transformation/engine.py`: preserve Business360 records, private-person filtering, PostgreSQL actor context and dispatch; integrate AI hub initialisation, command dispatch and stale-run checks.
- `transformation/server.py`: preserve fail-closed authenticated request handling and PostgreSQL setup while loading the AI configuration.
- `TransformationWorkspace.tsx`: preserve business/departments/people onboarding and access controls while adding the AI Hub panel.
- `transformation.functions.ts`: retain verified Supabase identity and entitlement enforcement while adding only the reviewed AI commands.
- Service configuration, capability reports and validation documentation need a merged account of both branches, not a later filename winning by default.

`AI-BUSINESS360-FILE-DIFF.json` records all files added/changed by the AI branch relative to the supplied base. It is an inspection result, not an automatically applied patch.

## Concrete security issue to resolve during that merge

Business360's PostgreSQL migration covers seven core tables. The newer AI hub introduces `ai_settings`, `ai_runs`, `ai_usage` and `connector_snapshots` using SQLite schema initialisation. Those four tables do not yet have a merged PostgreSQL migration or RLS policy in Business360. Do not advertise them as protected by the existing seven-table migration. Adapt schema creation, actor propagation and SQL, then test tenant/project reads and writes.

The AI hub also computes a tenant-wide model-call quota. Project-filtered RLS can make a normal SUM see only the caller's projects and undercount tenant usage. Implement and test tenant-safe quota accounting before enabling providers; do not weaken tenant isolation to make the aggregate work. Private salary/benefit records must remain excluded from model context unless a deliberately approved, authorised feature requires them.

Knowledge stores, external graph backends, document permissions, department restrictions and M&A clean rooms require their own access enforcement. Database RLS on business records does not automatically secure retrieval, graph traversal or external connectors. People/stakeholder records do not automatically grant login access.

Keep standalone and add-on interfaces on the same reviewed service/domain model. Preserve manual entitlements until real billing is implemented. Recovrable/Recovarable/Recovra names appear across older handovers: confirm the intended product and actual contract before connecting it; no live collections integration is established by this bundle.
