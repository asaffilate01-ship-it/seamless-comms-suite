# Integrating Business360 with Omniqora

## Shared engine, two host wrappers

The existing Omniqora host is `asaffilate01-ship-it/seamless-comms-suite` (TanStack Start, React 19, Supabase). Reuse its authentication, tenant selection, navigation and entitlement/billing service. The standalone host is in `standalone/`. Both use `TransformationWorkspace` and the Python domain service. Do not create a separate business rules implementation for each channel.

Copy `omniqora-update/` into a normal branch of the current host as an additive change. Do not overwrite its authentication middleware or tenant helpers, and do not rewrite published Git history: the repository's AGENTS instructions prohibit this because of the Lovable connection. No commits, pushes or deployment were performed for this package.

| Destination | Purpose |
|---|---|
| `src/modules/transformation/` | Shared workspace, Business360 panel, forms, styles, authenticated server request and private service caller. |
| `src/routes/_authenticated/app.transformation.tsx` | Existing supplied module route, now titled Business360; URL remains `/app/transformation` for compatibility. |
| `services/transformation/` | Engine, signed RPC service, PostgreSQL adapter, knowledge core, tests and demo. |
| `supabase/migrations/20260916120000_business360_rls.sql` | Private transaction schema and forced RLS. Review against the target Supabase/database roles before applying. |

Add a **Business360** navigation entry pointing to `/app/transformation` using the host's existing sidebar and localisation conventions. Use the existing TanStack build to regenerate route types. Do not hand-edit generated route files. The shared standalone interface was compiled and typechecked; the full Omniqora host was not built with these files and still needs an integration build.

## Configuration

The Omniqora server needs:

```text
TRANSFORMATION_URL=https://your-private-service-host
TRANSFORMATION_SIGNING_KEY=<secret-manager-managed-random-secret-at-least-32-characters>
BUSINESS360_ENABLED_TENANTS=<comma-separated-enabled-tenant-UUIDs>
```

The Python service uses the same signing key, plus `TRANSFORMATION_DATABASE_URL` for its dedicated non-superuser login. Keep secrets server-only; never use `VITE_` variables for them. An empty entitlement allowlist denies access. Before self-serve selling, replace the manual allowlist with Omniqora's authoritative entitlement service, checked on every call. It is not a Stripe/billing implementation.

The service's `wsgi.py` exposes the production application. Run behind an approved WSGI server and private/TLS ingress. The developer server binds to `127.0.0.1:8091`; do not expose it directly to the Internet. In a local-only evaluation, export `BUSINESS360_ALLOW_SQLITE=1` explicitly. Hosted transaction storage requires the PostgreSQL migration. See `SECURITY.md` for database roles and policy boundaries.

Before enabling users, provision a tenant, create the first business engagement as its owner, verify that another tenant and an ungranted colleague cannot access it, assign the required project roles and verify confidential pay visibility. Use hosted backup/restore and representative workload checks before a customer pilot.

## Evidence and model configuration

Knowledge data is separate from transaction data and remains in the inherited SQLite or optional Neo4j store. Back up both, plus the standalone account directory if used. Saving a register record does not automatically ingest a source document or synchronise it to the knowledge graph.

For Neo4j, install `requirements-neo4j.txt`, configure the approved encrypted endpoint and run `init_neo4j.py`. For generation, set `KNOWLEDGE_PROVIDER=ollama`, `KNOWLEDGE_MODEL_URL`, and versioned installed chat/embedding models. With no provider configured, evidence retrieval remains available but no generated prose is promised. No live model or Neo4j evaluation was run here. The bundled vendor knowledge core remains an unchanged snapshot from the supplied package; reconcile later changes with the actual central Omniqora core before deployment.

The current Evidence interface accepts authorised source text. Automated PDF/scan/OCR extraction, source-system discovery and external connector sync are future work. Source references do not establish document authenticity or completeness. Reviewers must verify the evidence.

## Controlled delivery and expansion

Use inherited planning scopes for acquisition, merger, separation and carve-out work; review preparation, operational Day-1 and 100-day deliverables and unresolved gaps. This is a draft plan from entered data, not a certification of transaction readiness.

Recovrable integration should consume approved collection cases with current balance, dispute/hold status, tenant and customer identity, then reconcile outcomes and receipts. v0.3 only provides the eligible-case report; it neither sends collection messages nor posts payments. Never treat recovered principal as new revenue or count working-capital release as recurring cost savings.

Retain the existing bounded action registry and approval requirements for future connectors. Each external capability needs its own authority, idempotency, result verification and operational acceptance. The commercial roadmap and broader AI/governance merge are in `PRODUCT-BRIEF.md`.
