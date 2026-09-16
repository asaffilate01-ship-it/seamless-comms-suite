# Omniqora Business360 / transformation service

Python 3.11+; standard-library SQLite/evidence mode. Run `python3 demo.py` for a fictional, offline example and `python3 -m unittest discover -s tests -v` for the module tests. The unchanged shared knowledge snapshot is under `vendor/knowledge_core`; its tests are under `vendor_tests`.

Start the loopback developer server with `python3 -m transformation.server` after configuring a dedicated PostgreSQL `TRANSFORMATION_DATABASE_URL` (or explicitly `BUSINESS360_ALLOW_SQLITE=1` for local evaluation) and setting `TRANSFORMATION_SIGNING_KEY` (at least 32 random characters). The trusted application host must use the same key and verify Supabase identity/tenant membership. The Python service separately enforces project membership. Do not expose the developer server directly.

`wsgi.py` exports a WSGI application for a separately selected production server/TLS ingress. See the handover package's integration and capability-status documents before deployment.

## RPC envelope

```json
{"command":"snapshot","project_id":"authorised-project-uuid","data":{}}
```

Required signed headers are `X-OQ-Timestamp`, `X-OQ-Nonce`, `X-OQ-Context` and `X-OQ-Signature`. The signature is HMAC-SHA256 over `timestamp + newline + nonce + newline + base64url_context + newline + exact_body_bytes`. Context contains only server-verified `tenant`, `user` and `tenant_role`. The included TypeScript server caller implements the protocol. Browser code must call the authenticated host wrapper.

## Commands

| Commands | Purpose |
| --- | --- |
| `business.report` | Evidence coverage, people/departments, reproducible business KPIs, improvement estimates and collection candidates. |
| `projects.list`, `projects.create` | Authorised projects; create with name and base currency. |
| `snapshot`, `export`, `audit` | Derived reports, project export and hash-chain inspection. |
| `records.save` | Typed record plus `expected_revision`. Schema is validated in the domain modules. |
| `planning.generate`, `planning.get`, `planning.review` | Versioned company plans from a scope, historical retrieval and independent baseline review. |
| `ai.status`, `ai.policy.save` | Project-bound model/connector catalogue and owner-managed AI policy. |
| `ai.runs.start`, `ai.runs.step`, `ai.runs.get`, `ai.runs.list`, `ai.runs.cancel` | Durable model-driven specialist runs, one bounded step per request. |
| `connectors.read`, `connectors.ingest` | Approved source preview and explicit evidence ingestion. |
| `members.add`, `members.remove`, `policy.update` | Project owner controls membership and agent policy. |
| `diagnostic.create`, `workstreams.initialise`, `workstreams.report` | Diagnostic template, six workstreams and acceptance overview. |
| `finance.import`, `finance.scenario`, `finance.savings` | Entry import, scenario calculation and baseline/actual comparison. |
| `benefits.propose`, `benefits.verify` | Record attributed benefit; a different finance reviewer verifies it. |
| `technical.impact` | Downstream impact for a `system_id`. |
| `knowledge.ingest`, `knowledge.edge`, `knowledge.delete`, `knowledge.ask` | Source documents, reviewed relationships, revision-safe deletion and evidence queries. |
| `product.report`, `product.brief` | Product metrics and source-grounded PRD/market/sprint/GTM drafts. |
| `actions.propose`, `actions.review`, `actions.execute`, `agents.run` | Whitelisted internal tool actions and bounded readiness workflow. |

Agent tools are `create_task`, `readiness_report` and `cutover_plan`. The last produces a reviewable plan and cannot execute a production cutover. Only the first two can run under the explicit low-risk automatic policy.

The sibling standalone folder supplies operator-provisioned pilot login; the add-on uses the existing Supabase host. No billing processor, live enterprise connector or production scheduler is supplied. Model and Neo4j operation are optional and require the corresponding configured service.
No billing, hosted identity issuer or production scheduler is supplied. Read-connector adapter code is included, but customer credentials and live acceptance tests are required. Model and Neo4j operation are optional and require the corresponding configured service. Configure the new agent hub through `OQ_AI_CONFIG`; see `ai-config.example.json` and the package's `docs/AI-LAYER-SETUP.md`.
