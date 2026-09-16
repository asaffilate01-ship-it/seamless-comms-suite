# Identity, access and RLS

## Trust boundary

The browser never supplies an authoritative tenant role, database credential or user identity. In Omniqora, Supabase authentication and current `tenant_members` membership are checked on every server request. A server-only entitlement allowlist is checked next. The host signs the exact request and verified identity. The service rejects tampering, expired signatures and replayed nonces, then checks project membership and the operation's role.

In standalone mode, the account directory verifies salted PBKDF2-SHA256 passwords (600,000 iterations). It creates high-entropy sessions stored by token hash, expiring after eight hours. Cookies are HttpOnly, SameSite=Strict and Secure over HTTPS, without a Domain attribute. POST requests require the configured origin and JSON; authenticated POSTs also require the session CSRF token. Login has per-email and per-IP attempt limits and generic rejection messages. There are no default accounts or public registration. Logout, password reset and user deactivation revoke access. Entitlements are checked on every RPC. Password recovery currently requires the operator CLI.

A tenant administrator is not automatically entitled to view every project. Project grants are separate. People, reporting-line and stakeholder records are business data, not authentication accounts.

## PostgreSQL transaction database

Apply `omniqora-update/supabase/migrations/20260916120000_business360_rls.sql` once as a migration administrator in a non-production environment first. It creates the private `business360` schema and enables **and forces** RLS for projects, members, objects, actions, audit, nonces and plans. It creates no public REST grants. Do not expose this schema through Supabase's browser API.

Provision a dedicated LOGIN with `NOSUPERUSER NOBYPASSRLS` through your secret manager and grant it membership in `business360_runtime`. Example operator SQL, with an actual password provisioned out of band:

```sql
CREATE ROLE business360_app LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT business360_runtime TO business360_app;
```

Do not run the application as `postgres`, a Supabase service role or a table owner with bypass powers. The adapter rejects superuser and BYPASSRLS logins, selects `business360_runtime` for each transaction, fixes the search path, and sets tenant/user/tenant-role context from the verified server actor. Identity settings are transaction-local. SQL is fixed application code with bound values. No arbitrary SQL endpoint exists.

The static membership lookup functions are SECURITY DEFINER, owned by the migration administrator with RLS bypass authority; they are required to avoid recursive membership policies. They constrain lookup to the transaction's verified tenant and user, use a fixed search path and have no PUBLIC execution grant. Keep their ownership and code under migration control. Database access remains trusted: someone holding the application database credential could set actor context directly. RLS complements authentication; it cannot secure a stolen server credential or a compromised host.

The migration prevents row access across tenants and ungranted projects; viewers cannot mutate business rows. `person_private` rows (individual salary/benefits) are readable/writable only by project owner or finance. New financial baselines, receivables and ledger imports also restrict writes to owner/finance. Audit rows are append-only for the runtime role. The application additionally enforces independent review, stale-plan checks, membership rules and action-specific controls that are finer than row isolation.

A hash-chained audit log is not externally immutable: a privileged database administrator can still alter it. Independent retention/anchoring remains deployment work. Migration rollback, upgrades and backfill from a previous SQLite pilot need an explicit validated migration; changing the connection URL does not copy old data.

## Data visibility

| Data | Current visibility |
|---|---|
| Business, departments, people, stakeholders, processes, financial metrics and project plans | All explicitly granted project members can read; write privileges vary by role. |
| Individual salary and benefit rows | Project owner and finance only, in both application filtering and PostgreSQL RLS. |
| Knowledge source text, chunks and graph retrieval | Project/tenant checks in the inherited knowledge service. Storage is SQLite or optional Neo4j, not covered by the new PostgreSQL RLS migration. |
| Standalone credentials and sessions | Private server-side account directory; no general browser read/write endpoint. |
| Other projects and tenants | No access without an explicit project grant and verified tenant membership. |

Department records organise the engagement; they do not currently define separate department permissions. Put confidential departments or deal rooms in separate restricted projects. Do not ingest payroll documents or other more-restricted source material into a project-wide evidence collection. Per-document inherited ACLs, employee self-service permissions and buyer/seller clean-room controls are future work. These boundaries are material when choosing pilot data.

## Evaluation and production

The business service fails closed without a PostgreSQL URL unless the operator explicitly opts into `BUSINESS360_ALLOW_SQLITE=1` for local evaluation. SQLite is not presented as RLS. All service and standalone data stores need private persistence and backup/restore validation. Production authentication, encrypted transport, secret rotation, ingress limits, dependency review and customer-specific access tests are deployment responsibilities. Review `verification/RESULTS.md` for the tests actually run.
