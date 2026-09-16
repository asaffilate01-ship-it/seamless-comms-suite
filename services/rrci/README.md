# Shared Knowledge Core 0.2 — RAG, graph retrieval and optional Neo4j

A working Python **local pilot** for Amer's SaaS portfolio. Run one service and add a small authenticated adapter to each application. The working name does not imply a new public brand.

The shared service owns ingestion, retrieval, evidence references, graph traversal and evaluation traces. Haccora, TaxNuvia and Lawquo keep their customer login, permissions, business rules and approval flows. Omniqora can call the service through authorised adapters for coordination and internal drafts.

## What is implemented

- Python JSON API; no third-party packages needed for the local demo.
- Separate project, customer and collection scopes derived from service credentials.
- Plain-text document ingestion, overlapping chunks, revisions, validity dates and language/jurisdiction filters.
- Keyword retrieval using BM25 over the authorised collection.
- Explicit graph relationships with supporting source quotes and bounded traversal up to three connections deep.
- `rag`, `graph` and `hybrid` query modes, with actual source excerpts and relationship paths returned.
- Optional Ollama generation and embeddings adapter. Generated claims must reference retrieved citation IDs. Citation validity does not prove factual correctness.
- Duplicate-safe document ingestion and revision checks. Changes/deletions invalidate graph edges based on old content.
- Read/write credentials, scoped traces, a CLI, fictional multi-project fixtures and automated tests.
- Shared TypeScript server connector and a React interface component for integration into existing SaaS applications.
- Optional Neo4j storage with native entity relationships and Cypher path traversal, using the same public API.

**Default mode is evidence retrieval only.** It does not pretend to generate an LLM answer. With a configured, reachable model, the same pipeline can generate draft answers using retrieved evidence. Live model quality has not been evaluated in this build.

**Graph implementation:** choose SQLite for the dependency-free local demonstration or Neo4j for native graph storage and Cypher traversal. Both use reviewed, source-supported relationships. This does not use Microsoft's GraphRAG package or automatically extract graph relationships/community summaries.

**Enable Neo4j:** follow `docs/NEO4J.md`. Set `KNOWLEDGE_STORAGE=neo4j` in the separate Python service after configuring the database and initializing its schema. The SaaS connector API stays the same.

## Run the local demonstration

Use Python 3.11+ from the extracted project directory:

```bash
python -m unittest discover -s tests -v
python -m knowledge_core demo --output var/demo-results.json
python -m knowledge_core init-demo
python -m knowledge_core serve
```

In another terminal, in the same directory:

```bash
python -m knowledge_core query "What if the fridge fails?"
python -m knowledge_core query "Which locations are connected to Northstar Foods?" --mode rag
python -m knowledge_core query "Which locations are connected to Northstar Foods?" --mode graph
python -m knowledge_core query "What payroll onboarding reports are requested?" --jurisdiction GB --token-file var/taxnuvia-demo-reader.token
```

The graph example follows fictional records from **Northstar Foods → Batch B17 → Lemon Tart → two branches**. Ordinary keyword search finds the supplier passage. Graph traversal brings in the downstream recipe and branch records. This deliberately small example demonstrates behavior; it does not establish general superiority or production accuracy.

`init-demo` creates random local service tokens in `var/*.token` and hashed credentials in `var/credentials.json`. It refuses to overwrite an existing credentials file. These tokens are local demo secrets; keep them outside Git and outside browser code. The server uses `127.0.0.1:8080` and accepts authenticated server-to-server calls.

## Where the files go

| Destination | What to add |
| --- | --- |
| New shared Python repository/service | This package: `knowledge_core/`, `tests/`, CLI, docs and deployment files. |
| Each SaaS backend | Adapt `adapters/shared-knowledge-client.ts`; authenticate the app user and map their authorised collection before calling the service. |
| Each SaaS frontend | Adapt `adapters/KnowledgePanel.tsx`; call the SaaS's own authenticated endpoint. |
| Per-project domain configuration | Extend `knowledge_core/profiles.py` and implement document/relationship mappings in that SaaS's backend. |
| Omniqora | Add a server-side caller for authorised internal evidence briefs after verifying its actual integration interface. |

Do not paste the Python service into a Lovable React application or expect it to run as a Supabase Edge Function. It needs its own Python runtime. Supabase can remain the application database and source of identity/documents. The shared service selects SQLite or Neo4j as its own store; a Supabase/Postgres/pgvector storage adapter remains future work.

See `docs/INTEGRATION.md`, `docs/ARCHITECTURE.md`, `docs/API.md` and `docs/EVIDENCE.md` before connecting real customer data.

## Enable a model when ready

The optional adapter calls the operator-controlled Ollama `/api/chat` and `/api/embed` endpoints. Install and run suitable models in your own environment; model names are deliberately not hardcoded.

Set the following process environment:

| Variable | Value |
| --- | --- |
| `KNOWLEDGE_PROVIDER` | `evidence` (default) or `ollama` |
| `KNOWLEDGE_MODEL_URL` | Default `http://127.0.0.1:11434`; non-loopback endpoints require HTTPS |
| `KNOWLEDGE_CHAT_MODEL` | Exact installed chat-model identifier, required for `ollama` |
| `KNOWLEDGE_EMBED_MODEL` | Optional installed embedding-model identifier |
| `KNOWLEDGE_DB` | Default `var/knowledge.db` |
| `KNOWLEDGE_STORAGE` | `sqlite` (default) or `neo4j`; see `docs/NEO4J.md` for connection settings |
| `KNOWLEDGE_CREDENTIALS` | Default `var/credentials.json` |

Without an embedding model, retrieval remains keyword based. With one, ingest documents through the configured service so vectors are stored, then queries combine keyword and vector rankings. After switching embedding models, re-ingest documents using their current `expected_revision`; changing the embedding model invalidates old graph edges, which must be reviewed and re-added. Do not mutate a model behind a fixed identifier: pin versions. A collection containing mixed/missing embedding models rejects vector queries rather than silently comparing incompatible vectors.

The provider interface is `embed(texts)` and `generate(question, evidence, graph_paths, instruction)`, with `embedding_id` and `chat_model` properties. Azure/OpenAI or another approved provider can implement that boundary later. No OpenAI/Azure adapter or live API test is claimed in this package.

## Current boundaries

- Local pilot, not deployed or connected to any live SaaS repository.
- Text input only. No PDF/OCR/SharePoint/email crawler, automatic sync or arbitrary URL fetching.
- No hosted admin dashboard, billing or end-user login; those remain future work or existing SaaS responsibilities.
- Graph edges must be submitted by a trusted adapter after review. Checking a quote exists does not establish that the asserted relationship is true.
- No autonomous actions, outgoing messages, case decisions or task execution. This is a retrieval tool that an agent could call.
- Collection-level authorisation only. The SaaS adapter must enforce end-user access and use appropriately separated collections, especially for legal cases. Do not mix differently authorised documents in one collection.
- Both backends retain pilot limits of 2,000 eligible chunks and 5,000 edges per collection. Keyword ranking and optional vector similarity are computed in Python; Neo4j's full-text/vector indexes are not used yet. Native graph queries are limited to three hops, 24 returned paths and a transaction timeout. Large workloads need further retrieval/index tuning and load testing.
- Developer server is for loopback use only. Before a shared deployment, add a production server, TLS ingress, rate/usage limits, secret rotation, backup/retention, concurrency/load testing and real-user access tests.
- The supplied React/TypeScript integration source has not been built against any of your existing applications; their authentication and UI conventions must be connected and tested.

## Official technical references

- [Supabase AI and pgvector](https://supabase.com/docs/guides/ai)
- [Supabase RAG permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [Microsoft GraphRAG](https://microsoft.github.io/graphrag/)
- [Neo4j Python driver](https://neo4j.com/docs/python-manual/current/connect/)
- [Neo4j transactions](https://neo4j.com/docs/python-manual/current/transactions/)
- [Ollama chat API](https://docs.ollama.com/api/chat)
- [Ollama embeddings API](https://docs.ollama.com/api/embed)
