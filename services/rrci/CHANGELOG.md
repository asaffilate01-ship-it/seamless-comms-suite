# Changelog

## 0.2.0 — optional Neo4j backend

- Added `Neo4jStore` and environment-based storage selection; SQLite stays the default.
- Added native document/chunk/entity storage and source-supported `KNOWLEDGE_LINK` relationships.
- Added parameterized Cypher path queries with scope/provenance filters, three-hop bounds and path/context budgets.
- Kept document updates and derived-link removal in one transaction. Concurrent stale updates return `409`.
- Added schema initialization, encrypted remote connection configuration, scoped transaction locks and driver cleanup.
- Added `init-neo4j` and `demo-neo4j` commands, optional driver dependencies, Docker database configuration and setup guidance.
- Added real-Neo4j tests alongside the existing API contract. All 60 tests passed locally.
- Added backend and graph execution identifiers to traces. Request formats and SaaS connector code remain compatible.

This release does not migrate existing SQLite data, connect a live SaaS, provision a cloud database or evaluate an LLM. See `docs/NEO4J.md` for activation and `docs/EVIDENCE.md` for the validation boundary.

## 0.1.0 — initial local starter

Scoped SQLite retrieval, explicit graph links, optional Ollama model boundary, SaaS connector source, CLI, sample data and 27 automated tests.
