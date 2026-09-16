# Integration with the current Omniqora host

## File destinations

Copy the `omniqora-update/` contents into the current repository as an additive change:

| Path | Purpose |
| --- | --- |
| `services/transformation/` | Python domain engine, signed RPC endpoint, knowledge runtime snapshot, tests and example. |
| `src/modules/transformation/` | React workspace, record templates, styles, authenticated server function and private server caller. |
| `src/routes/_authenticated/app.transformation.tsx` | TanStack file route for `/app/transformation`. |

Do not overwrite the existing tenant helper, authentication middleware or database schema. The service verifies explicit project membership after the host verifies Supabase user identity and the requested tenant's membership.

The inspected host exposes `requireSupabaseAuth` from `@/integrations/supabase/auth-middleware` and `useTenant` from `@/hooks/useTenant`. The supplied route follows its current conventions. A full repository build has not been run. Regenerate the route tree through the existing TanStack build process after adding the file; do not hand-edit generated route files.

Add a sidebar entry to `src/components/app/shell.tsx` targeting `/app/transformation` and an `app.nav.transformation` translation in the existing language dictionaries. Example English label: `Transformation`; German: `Transformation`. Retain the host's own icons, route typing and navigation structure. The route works independently of the sidebar after merge/build.

The root `AGENTS.md` prohibits rewriting published Git history because the project is connected to Lovable. Use a normal branch and commits, then a reviewed PR. No changes were pushed by this package.

## Host configuration

Set server-only variables:

```text
TRANSFORMATION_URL=https://your-approved-service-host
TRANSFORMATION_SIGNING_KEY=<independent-random-secret-at-least-32-characters>
```

Use the same signing key in the Python process. Generate a random key with an appropriate secret manager or `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`. Never put it in a browser bundle, `VITE_` variable, repository or client device.

Every signed request binds the timestamp, a unique nonce, the server-verified tenant/user/role and the exact request body. The Python service rejects altered, expired and replayed requests. It separately enforces project roles. Adding a project member requires the host to verify the target user is already in the same tenant.

The current service trusts this host as its identity issuer. Protect the signing key and service endpoint accordingly. A production implementation should introduce separate keys per trusted issuer, rotation, request budgets, rate limits and a managed authentication boundary. Do not expose the developer server directly to the Internet.

## Run the service

Environment variables are not automatically loaded from `.env.example`. Export them using the deployment platform. For a loopback pilot:

```bash
cd services/transformation
python3 -m transformation.server
```

The developer server binds to `127.0.0.1:8091`. `GET /health` provides a liveness response; signed `POST /rpc` performs operations. `wsgi.py` exposes a WSGI application for a production WSGI server and TLS ingress. Choose/pin that server in your deployment; production concurrency and load tests remain required.

There are two stores: project/action/finance data in SQLite and knowledge data in SQLite or Neo4j. Back up both. This is a small-pilot transaction store, not the final multi-region data platform. Moving project data to PostgreSQL requires a tested storage adapter and migration; no Supabase migration is implied by these files.

Version 0.2 adds a non-destructive `plans` table on service initialisation, new typed discovery/commercial record kinds, `planning.generate/get/review` RPC commands and the Company planning tab. Merge the updated server function allowlist together with the UI and service. Back up the project database before upgrading. Company discovery and asset dependencies are not automatically synchronised to the optional Neo4j knowledge backend; see `COMPANY-PLANNING.md`.

Version 0.3 adds `ai_settings`, `ai_runs`, `ai_usage` and `connector_snapshots` tables, the **AI & connectors** panel and nine signed RPC commands. `OQ_AI_CONFIG` points to an operator-owned registry with exact tenant/project bindings and secret references. Merge the updated host command allowlist and new Python/UI modules together. Read `AI-LAYER-SETUP.md` before enabling models or source reads.

## Enable Neo4j

```bash
python3 -m pip install -r requirements-neo4j.txt
python3 init_neo4j.py
```

Set `KNOWLEDGE_STORAGE=neo4j`, `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` and `NEO4J_DATABASE` before starting the service. Remote connections require encrypted `neo4j+s://` or `bolt+s://` endpoints. The installer initializes the pinned knowledge schema. Changing storage does not automatically migrate existing SQLite documents.

Knowledge graphs and document retrieval are scoped to a project and tenant. Cypher is parameterised with fixed query structure; the model cannot supply arbitrary Cypher. Native Neo4j graph traversal is included. Keyword and optional vector ranking still run in Python, with inherited pilot limits of 2,000 eligible chunks and 5,000 edges per collection. Native vector/full-text indexes and large-corpus tuning are future work. This is local evidence-centred GraphRAG, not a claim to implement every Microsoft GraphRAG indexing mode.

## Enable a generation model

Set `KNOWLEDGE_PROVIDER=ollama`, the operator-approved `KNOWLEDGE_MODEL_URL`, and an installed, versioned `KNOWLEDGE_CHAT_MODEL`. For semantic retrieval also set `KNOWLEDGE_EMBED_MODEL` and re-ingest sources with the configured embedding model. Remote endpoints require HTTPS.

The legacy knowledge provider contract is `embed(texts)` and `generate(question, evidence, graph_paths, instruction)`. Version 0.3's separate specialist hub implements generation adapters for OpenAI, Azure OpenAI, Claude, Gemini, Bedrock and Ollama with per-project routing and metering. Those adapters do not replace the legacy embeddings/provider contract. Keep the legacy path in evidence-only mode during the new hub pilot; its optional direct generation is outside hub budgets. No live model inference was run during this build.

Use the existing central knowledge service in a later deployment consolidation rather than indefinitely running duplicate vendor copies. The bundled `vendor/knowledge_core` is an unchanged snapshot from the September 15 RRCI handover so the new package can be evaluated independently. Record its provenance and reconcile any newer shared-core changes before centralisation. It does not automatically inherit changes made to a separate RRCI deployment.

## Authorisation and evidence boundaries

All project members can read that project's records, finances, sources and graph results. For a restricted deal room or differently authorised data, create a separate project. Document-level ACL inheritance, seller/buyer clean-room controls and per-record field restrictions are not implemented. Tenant admins do not automatically see every project: they must have a project grant.

Project owner controls membership and agent mode. Analysts maintain discovery/technical/product records, generate draft plans and propose actions. Reviewers accept checkpoints/specifications, independently review company plans and approve agent proposals. Finance users import entries, maintain planning cost items and independently review benefits. Cost items may also be maintained by owners/reviewers. Viewers only read. Tenant membership is rechecked by the host per request; project membership is rechecked by the service.

Project records and document evidence are separate representations. Saving a research or architecture record does not automatically ingest its full text into RAG. Import the authorised source text under Evidence and add reviewed relationships using its exact revision and quote. This avoids claiming that an unreviewed record is a verified source. Automating this mapping is a connector task.

Agent approvals bind to the current project data version. Record, evidence, policy or membership changes invalidate previous pending/approved plans. A failed evidence write may conservatively invalidate approval. Evidence and project stores do not share one transaction; requested/completed audit events describe that boundary. If a model call is in progress when access changes, access is rechecked before returning its result.

## Commercial and standalone packaging

Keep module data and APIs separate. Use the existing Omniqora host for login and tenant resolution. Billing/entitlement checks need to be added to the host before paid activation; the current route is not connected to Stripe or the existing subscription catalogue.

For a standalone product, retain the same domain service and UI, replace the host wrapper with standalone verified identity, provision its own tenant records and subscriptions, and migrate data through an explicit export/import process. Branding settings here affect the module header only. A full white-label product also needs domains, login branding, email templates, legal documents, support routing and commercial administration.
