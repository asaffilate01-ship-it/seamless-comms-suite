# Business360 v0.3 verification

16 September 2026. This records this build's checks. Inherited v0.2 results are retained in `inherited-v0.2/` and are not counted as newly run.

## Passed

| Check | Result |
|---|---|
| Transformation/domain suite | 70 passed. Includes 11 new Business360 cases for hierarchy, reporting cycles, confidential pay exports, role/tenant isolation, evidence verification, deterministic metrics, missing inputs, duplicate invoices, collection eligibility, benefit overlap and persistence. The inherited domain/approval/M&A tests were rerun in this total. |
| Standalone authentication/HTTP suite | 10 passed. Login/logout and cookie flags, anonymous rejection, CSRF/origin, live entitlement changes, cross-tenant reads and membership assignment, forged browser identity, deactivation, password reset/revocation, rate limiting, static path restriction and security headers. |
| Shared knowledge suite | 43 executed and passed; 74 discovered, 31 optional Neo4j cases skipped. Vendor source remained unchanged. |
| SQL and RLS | 11 checks passed on embedded PostgreSQL using PGlite 0.5.8. Migration executed; all seven tables force RLS. Tested bootstrap, unfiltered cross-tenant reads, missing project grants, private pay, forbidden viewer/analyst/cross-tenant writes, audit immutability for runtime role, owner retention and revocation. |
| TypeScript | Shared UI and standalone entrypoint typechecked with TypeScript 5.9.3 (`--noEmit --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --jsx react-jsx --lib es2022,dom`). This was not a full host typecheck. |
| Reproducible browser bundle | `npm ci --ignore-scripts` succeeded using the included lockfile; `npm run build --prefix standalone` succeeded with the package's own dependencies and without the temporary shared dependency symlink. |
| Fictional business example | Onboarding through departments, person, stakeholder, Q&A, financials, issue, improvement and receivable generated the included report. No external calls or real business data. |

Raw test logs and reproducible test sources are included. [PGlite](https://pglite.dev/docs/) runs PostgreSQL in an embedded WebAssembly environment; these policy tests are not a validation of a hosted Supabase/PostgreSQL deployment or the Python network driver under production load.

## Not established

- Native PostgreSQL + psycopg end-to-end integration: a disposable native test runner is included as `test_postgres.py`, but its database could not start here because this environment cannot provision/run the required unprivileged operating-system user. No native test cases executed. Run it under a normal non-root development account with pgserver 0.1.4 and psycopg installed, then validate the actual hosted database, schema owner and dedicated application login.
- Full current Omniqora repository integration/build, Supabase auth behavior in that deployment, billing, real users, live deployment, browser interaction or visual layout QA. No GitHub merge/push or site publication occurred.
- Live Neo4j, live generation/embedding model quality, ERP/CRM/accounting/telephony connectors, document parsing/OCR, Recovrable calls, production concurrency, restore rehearsal or customer-specific access acceptance.
- Separate Enterprise Governance & Adoption module integration or the contents of the unreadable second shared chat.

## Reproduce

```bash
cd omniqora-update/services/transformation
python3 -m unittest discover -s tests -v
PYTHONPATH=vendor python3 -m unittest discover -s vendor_tests -v
```

```bash
cd standalone
npm ci
npm run build
python3 -m unittest test_server.py -v
```

For SQL policy checks, in `verification/`, run `npm ci` then `node test_rls.mjs`. The optional native integration runner starts a disposable local database; do not substitute live database credentials. These tests never authorise a production launch by themselves.
