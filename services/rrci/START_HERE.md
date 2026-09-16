# Start here

**Yes: one shared knowledge product can serve the SaaS portfolio.** Each app adds an authenticated connector, a document mapping, domain rules and a small interface. The product can be administered through Omniqora later while remaining a separate Python service.

This archive contains version 0.2 of the working local starter, including an optional Neo4j backend. It is not installed in any existing SaaS.

1. Extract the archive and open `shared-knowledge-core` in your editor.
2. Read `README.md` for four commands to run the local demonstration.
3. Compare the sample `rag` and `graph` queries. Open `evidence/demo-results.json` to inspect recorded results.
4. Read `docs/INTEGRATION.md` for the per-SaaS work and `docs/API.md` for the request format.
5. Start the first real integration with one Haccora collection of approved sample procedures.
6. To use Neo4j, follow `docs/NEO4J.md`. Neo4j connects to the main Python service; each SaaS continues using the same connector.

| Included | Needs connecting later |
| --- | --- |
| Python retrieval API and scoped storage | Separate hosting and real SaaS authentication |
| Documents, graph relationships and citations | Your source documents, updates and approved relationship mappings |
| Optional model connector | A running model and domain evaluation |
| Shared server connector and React panel source | Compile/adapt in each SaaS's existing project |
| Tests, synthetic demo and recorded results | User acceptance tests and a real customer pilot |

The default demo produces source evidence without calling an LLM. Choose SQLite or Neo4j storage. Neo4j mode uses native relationships and Cypher traversal. Microsoft's GraphRAG framework is not included; Supabase/Postgres retrieval storage remains a later adapter.

Keep Lawquo's current legal permissions, approval logic and `lawquo-omniqora.ts` component in Lawquo. This package does not overwrite them.
