# Applying the stack to the QITT delivery model

QITT's FAQ describes collaboration with existing advisers, a short diagnostic entry engagement, white-label/co-branded delivery and acquisition/separation assignments. That suggests an enterprise delivery workspace that advisers, client owners and technical teams can use together. The platform's first commercial pilot should support a clearly scoped diagnostic or one migration workstream; broad vendor execution follows after its connectors and controls are validated.

Source: [QITT FAQ](https://qitt.ae/faq/), retrieved 15 September 2026. Advertised fees, timelines and outcomes are QITT's statements and are not pricing commitments or performance claims for this software.

| Layer | Responsibility in this implementation |
| --- | --- |
| React / TanStack Start | Customer workspace, project selection, registers, evidence review, actions and reporting. |
| Supabase in the existing host | Authenticate the user and establish authorised tenant membership. |
| Python domain service | Enforce project roles, workflows, financial calculations, reconciliations, version checks and audit events. |
| Knowledge core | Versioned source ingestion, retrieval, source references and reviewed relationships. |
| Neo4j (optional) | Persist the knowledge graph and perform bounded, tenant/project-scoped graph traversal. |
| Embeddings (optional) | Semantic document retrieval alongside lexical ranking. |
| Generative model (optional) | Explain evidence and draft findings, PRDs, market/sprint/GTM briefs. |
| Agent/action engine | Turn readiness findings into controlled internal task and reporting actions. |
| Provider connectors (future) | Read approved enterprise sources and execute narrow authorised operations through verified adapters. |

For a deal, an analyst could ingest the approved TSA and architecture evidence, map dependencies, capture finance baselines, run a diagnostic, prepare a separation plan, collect reconciliation results, request owner decisions and measure a reviewed benefit. The graph explains relationships; deterministic services handle arithmetic and policy; accountable specialists validate assumptions and outcomes.

For product teams, the same workspace holds research findings, jobs to be done, specs, stories, priorities, release evidence and adoption cohorts. Its AI briefs should refer to the actual ingested research and dated market sources. Shared services do not imply sharing confidential evidence between customers or projects.

## Official technical references used

- [Neo4j Python driver: querying](https://neo4j.com/docs/python-manual/current/query-simple/)
- [Neo4j GraphRAG retrieval guide](https://neo4j.com/docs/neo4j-graphrag-python/current/user_guide_rag.html)
- [Intercom's RICE prioritisation method](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/)

Framework discovery points for the specialist configuring applicability: [Saudi NCA](https://nca.gov.sa/), [SAMA Rulebook](https://rulebook.sama.gov.sa/), [UAE TDRA](https://tdra.gov.ae/). These are official portals, not a substitute for selecting and reviewing the correct current instruments and editions for the client.
