# Omniqora source integration — 16 September 2026

This update integrates the recovered Omniqora master handover with the existing TanStack Start/Lovable repository. The live address supplied by the owner is https://omniqora.itechlounge.co.uk. The existing home page and authenticated application remain; the new public services page is `/website`.

## Integrated source

| Location | Included capability | Activation boundary |
| --- | --- | --- |
| `src/modules/marketing/`, `/website` | Services, observations, Business360 positioning and “Your business, working as one.” branding | Built with the existing web application |
| `src/modules/transformation/`, `/app/transformation` | Business-first intake; departments, people, stakeholders, evidence, financials, improvements; transformation/product and transaction planning; AI hub | Requires entitlement, Python service and database setup below |
| `services/transformation/` | Combined Business360 and latest transformation AI service, deterministic calculations, bounded specialist agents, reviewed actions, model/connector adapters | Separate private service; hosted business data requires PostgreSQL |
| `apps/business360-standalone/` | Separate login/session shell using the same workspace and service engine | Operator-provisioned pilot accounts; separate hosting; no self-serve billing |
| `src/modules/rrci/`, `/app/compliance-intelligence`, `services/rrci/` | Authenticated source queries, source catalogue and permitted audit view; compliance/evidence backend | Dedicated service, licensed sources, explicit workspace membership and entitlement |
| `services/enterprise-ai/`, `src/modules/enterprise-ai/` | Enterprise architecture, adoption, governance and portfolio domain code/contracts | Tested library; requires a host/API and product UI integration |
| `services/decision-intelligence/` | Financial-adviser and reviewed-learning domain code | Tested library; not a live financial adviser or automatic learning pipeline |
| `services/ecosystem-core/`, `adapters/omniqora-server-client/` | Shared referrals, app linking, eligibility, signed webhooks and adapter contracts | Deploy once centrally; existing billing and provider integrations still required |
| `reference/` | Earlier AI pilot and intelligence engine source | Retained separately; no root build/deployment claim |

The source incorporates Business360, Transformation/Product AI v0.3 AI Hub, the Enterprise extension, RRCI, the consolidated ecosystem and adviser/learning code, and the supplied marketing component. Overlapping transformation files were merged against their supplied common base; Business360's database adapter and personnel restrictions were retained. Historical full-stack/Vinext applications are references, not wholesale replacements for the current host. Separate product archives (such as Haccora, TaxNuvia and EventPlanr) are not independent apps mounted inside Omniqora.

Original package guidance remains under `docs/business360/`, `docs/transformation/`, `docs/enterprise-ai/` and `docs/source-handover/`. Paths mentioning `omniqora-update/` refer to the extracted handover layout; this repository now mounts those paths at its root. Historical test reports describe earlier snapshots; use the current workflow for this merged source.

## Database and identity

1. Apply the repository's existing migrations through the normal Supabase deployment process, followed in order by `20260915180000_rrci_addon.sql`, `20260916120000_business360_rls.sql`, and `20260916130000_business360_ai_rls.sql`. These files are included in Git; this update does not apply them to a live database.
2. The RRCI migration also replaces the permissive tenant bootstrap with an atomic `create_my_tenant` function. Authenticated users cannot directly self-enrol into an arbitrary tenant. The host refetches the real role after creation/reuse and fails closed on database errors.
3. Business360 uses a dedicated non-superuser database login without `BYPASSRLS`, granted membership in `business360_runtime`. The service sets the verified tenant/user/role inside each transaction. All 11 business/AI tables force RLS. Use separate credentials from Supabase's administrative/service-role credentials. Set the password outside source control.
4. Supabase verifies the host user; every host call checks current tenant membership and entitlement. Project membership is enforced again by the service/database. Private personnel pay records are restricted and excluded from AI profile tools. Membership is rechecked after service responses.
5. The standalone pilot has separate operator-managed credentials and sessions; it does not silently share the host's Supabase identity or subscriptions. Follow its README for accounts, origin, CSRF and secure deployment requirements.

## Service activation

- Host: set `TRANSFORMATION_URL`, a matching random `TRANSFORMATION_SIGNING_KEY` of at least 32 characters, and `BUSINESS360_ENABLED_TENANTS`. Empty entitlement configuration denies access. Set these on the server, never as `VITE_` variables.
- Transformation service: install `services/transformation/requirements-postgres.txt`; set `TRANSFORMATION_DATABASE_URL` and the same signing key. Use the WSGI entrypoint behind the chosen authenticated/private TLS ingress and a production WSGI server. Keep `BUSINESS360_ALLOW_SQLITE=0` for hosted operation. SQLite is an explicit local-evaluation option only.
- Evidence storage: configure persistent, backed-up knowledge storage. Optional Neo4j and local models require their drivers, schema and separately provisioned infrastructure. Evidence-only mode does not call an LLM.
- AI hub: configure the operator-owned `OQ_AI_CONFIG` file and only the secret variables it references. Provider, model and connector bindings are tenant/project-specific. An owner must enable the project policy and approve data sharing. No model credentials or live integrations are provisioned by this merge. Every bounded run remains a reviewable draft; permitted consequential actions retain human approval.
- Knowledge/compliance: deploy `services/rrci/`; configure its credentials privately and match them in server-side `RRCI_BINDINGS_JSON`. Provision RRCI workspace rows, permissions and valid entitlements through trusted administration. The new page offers query/catalogue/audit, not a complete source-administration interface. Only ingest documents the customer is permitted to use.
- Collections/Recovrable, telephony, payments, production customer messages and billing remain explicit integration work. Collection candidates and cutover plans do not send messages, move money or execute a production cutover.
- Shared ecosystem: deploy once as a central service with its own persistence; do not create competing databases per product. Its existing signed contracts do not activate third-party provider accounts or apply real billing discounts until the receiving application's adapter is connected.

## Validation

The merged root application builds and typechecks. The disposable PGlite test applies the full migration chain and passes 32 access-policy checks, including tenant bootstrap, revocation, project isolation, private pay restrictions and tenant-wide AI quota accounting. `npm run test:services` runs each Python package in an independent process to avoid conflicting `knowledge_core` namespaces. The optional Neo4j integration cases are skipped without a configured test database. Four ecosystem Node adapter tests and the standalone bundle build also pass locally.

The new GitHub workflow is configured to repeat the build, typecheck, policy tests, service suites, standalone build and a native PostgreSQL adapter test using a disposable database. However, [run 35100227016](https://github.com/asaffilate01-ship-it/seamless-comms-suite/actions/runs/35100227016) and its retry failed before allocating a runner or executing any steps. No job logs were available, so the underlying GitHub account/runner cause is unconfirmed. This is not a passing CI run.

The native PostgreSQL test also cannot start in the scratch environment because OS database-user creation and privilege dropping are restricted. Consequently native-driver/PostgreSQL integration remains unverified and must pass in a suitable environment before activating hosted Business360. The source merge relies on the passing local application, service and PGlite policy checks above; it does not activate the new services or alter repository branch protections. Restore GitHub Actions execution and rerun the supplied workflow before production activation.

No live customer database, live provider credentials or production model calls are used in these checks. Reference applications and live voice/payment/provider connections are outside this verification.

## Release and rollback

Merge through a normal merge commit to preserve Lovable history. Git sync delivers source to the connected project; publication, database migrations, service infrastructure and secret configuration are distinct release steps. Verify the public page and authenticated role/tenant journeys on the deployed domain after publication.

To disable the new services, remove their operator entitlements/bindings and disable project AI policies. If reverting application source, use a new revert commit. Preserve customer data and database tables; do not drop schemas as an application rollback or rewrite published Git history.
