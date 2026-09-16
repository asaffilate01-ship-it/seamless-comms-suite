# Neo4j in the shared service

Neo4j is now an optional backend in this package. It belongs alongside the separate Python service. You do not add Neo4j credentials or a database driver to every SaaS frontend.

| Component | Responsibility |
| --- | --- |
| SaaS connector | Authenticate the user, choose the authorised collection and call the existing API |
| Shared Python service | Enforce scope, retrieve evidence, query graph paths and optionally generate a draft |
| Neo4j database | Store document/chunk nodes, entity nodes, native relationships and scoped traces |

## Local setup

Use a local Neo4j Community instance or a separately provisioned Neo4j Aura database. The adapter was tested against Neo4j Community 5.26.0 with Python driver 5.28.6, which is pinned in `requirements-neo4j.txt`. It needs no APOC plugin. Aura connection configuration is included; a live Aura deployment has not been tested.

For local Docker, set a strong `NEO4J_PASSWORD` in your terminal environment, then:

```bash
docker compose -f compose.neo4j.yml up -d
python -m pip install -r requirements-neo4j.txt
```

The Compose file publishes the database/browser ports only on loopback and retains database data in its own volume. Removing that volume deletes its data. Docker itself must be installed separately. The file configures only the database; run the Python service on the host as below.

Set these values in the Python service's process environment or server secret manager:

| Variable | Local example |
| --- | --- |
| `KNOWLEDGE_STORAGE` | `neo4j` |
| `NEO4J_URI` | `bolt://127.0.0.1:7687` |
| `NEO4J_USERNAME` | `neo4j` |
| `NEO4J_PASSWORD` | The database password you configured |
| `NEO4J_DATABASE` | `neo4j` |

The app does not load `.env` automatically. Use process environment settings. Compose does read its standard `.env`, but those values must also reach the separately started Python service.

Then run:

```bash
python -m knowledge_core init-neo4j
python -m knowledge_core init-demo
python -m knowledge_core demo-neo4j --output var/neo4j-demo-results.json
python -m knowledge_core serve
```

If you already ran `init-demo`, keep its existing credentials and skip that command. `init-demo` creates demo service credentials and a separate local SQLite fixture database. `demo-neo4j` populates the Neo4j demo namespaces and runs the same eight retrieval checks. It does not use or migrate the SQLite database.

Use `demo-neo4j` only in a development/test database: it writes fictional `demo-company` and `other-company` sample namespaces for Haccora, TaxNuvia and Lawquo. It is duplicate-safe for identical fixtures but intentionally rejects conflicting source revisions.

In another terminal:

```bash
python -m knowledge_core query "Which locations are connected to Northstar Foods?" --mode graph
```

The response trace must show `storage_backend: neo4j` and `graph_execution: neo4j_cypher`. Evidence should include the supplier, recipe and two branch records.

## Remote hosting

Use `neo4j+s://...` or `bolt+s://...` for remote connections; certificate verification stays enabled. Plain `bolt://`/`neo4j://` connections are allowed only on loopback. Create or choose the database in your hosting account and put its credentials only on the shared service.

`init-neo4j` provisions uniqueness constraints and a trace expiry index. Run it with an account allowed to create schema. The runtime account needs access to this schema and the service's scoped data; it also needs write access because consistent retrieval snapshots take a collection lock and traces are written. Neo4j user/role administration remains a deployment task.

The startup check verifies connectivity and required schema. An unavailable or misconfigured Neo4j backend produces an error rather than quietly switching to SQLite. Never expose the database directly to SaaS end users. Application scopes are enforced by the service; they are not a substitute for appropriately limiting direct database access.

## Data model

| Neo4j element | Stored information |
| --- | --- |
| `KnowledgeDocument` node | Source ID, revision, dates, title, jurisdiction, language and URI |
| `KnowledgeChunk` node | Exact source passage and optional serialized embedding |
| `KNOWLEDGE_CONTAINS` relationship | Document-to-chunk association |
| `KnowledgeEntity` node | A canonical entity label within one project/customer/collection |
| `KNOWLEDGE_LINK` relationship | Reviewed connection, edge ID, supporting chunk/quote and source revision |
| `KnowledgeTrace` node | Scoped evidence/path identifiers, timing and usage metadata |
| `KnowledgeScope` node | The collection key and short transaction lock |

`KNOWLEDGE_LINK` is a fixed relationship type; the domain relation such as `supplies` or `served_at` is stored as a property. This permits generic adapters without inserting user-controlled relationship names into query text.

To inspect a demo graph in Neo4j Browser, set the scope parameter to the literal JSON string `["haccora","demo-company","manuals"]`, then use:

```cypher
MATCH (a:KnowledgeEntity)-[r:KNOWLEDGE_LINK]->(b:KnowledgeEntity)
WHERE a.scope=$scope AND r.scope=$scope AND b.scope=$scope
RETURN a,r,b LIMIT 25
```

Updates/deletes invalidate links derived from the old source in the same transaction. Re-add reviewed edges against the returned new document revision. Identical retries are no-ops. Concurrent changed updates with the same expected revision allow one writer and reject the other with `409`.

## Existing SQLite data

Changing `KNOWLEDGE_STORAGE` selects a different authoritative database; it does not copy or merge data. Keep the old database, configure a new Neo4j database, and re-ingest approved sources and reviewed relationships through the existing APIs. Validate counts, source content, permissions and representative answers before directing a SaaS pilot to the new service. No automatic destructive migration is included.

## Tests and practical limits

With a dedicated test database and the above connection environment set:

```bash
NEO4J_TEST_ENABLED=1 python -m unittest discover -s tests -v
```

Tests create unique per-test customer namespaces and delete only those namespaces afterwards. They check the shared API contract plus native Cypher execution, concurrent revisions, literal query parameters and edge identity. Without `NEO4J_TEST_ENABLED=1`, live-database tests are explicitly skipped.

This version retains the starter's small-collection limits. Text/vector ranking remains in Python; native Neo4j full-text and vector indexes are future work. Graph queries have a 15-second transaction timeout, three-hop bound and 24-path output limit. Large dense graphs can still be expensive; measure and tune before scaling.

Neo4j supplies graph storage and traversal. It does not automatically supply an LLM, validate the meaning of source relationships, implement legal authority rules or make the product agentic. Default evidence mode and existing approval boundaries remain in place.

Official references: [Python connection guide](https://neo4j.com/docs/python-manual/current/connect/), [transactions](https://neo4j.com/docs/python-manual/current/transactions/), [constraints](https://neo4j.com/docs/cypher-manual/current/schema/constraints/create-constraints/).
