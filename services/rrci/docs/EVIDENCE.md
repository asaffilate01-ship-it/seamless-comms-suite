# Implementation evidence and validation

This starter was generated and debugged with AI assistance in this conversation. A job application should describe your subsequent design decisions, changes and validation honestly; receiving this code is not equivalent to personally delivering an enterprise deployment.

## Checks actually run

- **Version 0.2: 60 Python automated tests passed**, including 31 tests executed with real Neo4j storage. See `evidence/neo4j-test-run.txt`.
- The original 27 Python tests still pass; two tests verify backend selection without silent fallback.
- **8/8 small synthetic retrieval checks passed**, with recorded outputs in `evidence/demo-results.json`.
- A real loopback HTTP run provisioned random scoped credentials, started the Python server, called the CLI query client and retrieved both downstream branches through graph traversal. Result: `evidence/http-integration.json`.
- Provider request parsing/format, citation checks and embedding ranking were tested using test doubles and a local HTTP stub. These tests exercise the code boundary, not a real LLM's answer quality.

Neo4j Community 5.26.0 with Python driver 5.28.6 was run locally for the integration tests. The Neo4j CLI fixture demonstration passed 8/8 checks, and an actual HTTP API request through the configured Neo4j service returned both downstream branches. See `evidence/neo4j-demo-results.json`, `evidence/neo4j-http-response.json` and `evidence/neo4j-verification.json`. No live Ollama/model call, cloud deployment, external SaaS integration, React/TypeScript compilation, Docker image build, GitHub Actions run, load test or production security certification is claimed.

## What the tests establish

| Area | Evidence |
| --- | --- |
| Access | Different customer, project and collection records are excluded; caller cannot override the credential's namespace; a read-only key cannot ingest |
| Graph retrieval | Actual three-hop connections are followed; source chunks accompany each included edge; budgets are enforced |
| Source lifecycle | Duplicate ingest is a no-op; stale revisions fail; updates/deletes invalidate dependent graph edges; expired sources are filtered |
| Answer handling | No evidence skips generation; invalid citation IDs fail; schema-valid model output is still a draft |
| Reuse | Haccora, TaxNuvia and Lawquo fixtures use the same service class and API logic |
| Provider boundary | JSON request/response contract and transport are tested without calling a real model |
| Neo4j | Native Cypher traversal, scoped nodes/relationships, atomic source updates, concurrent revision checks, literal query parameters and edge ID replacement |

The graph example intentionally uses a question whose relevant branch records are connected through differently worded source records. It demonstrates traversal. It is too small to show general accuracy, production reliability or that a graph database is necessary for this particular dataset.

One implementation defect found during the initial test run was an SQL INSERT column-count mismatch. The insert was corrected to name all columns explicitly; the tests then passed. The test suite was also changed to avoid running inherited test cases twice.

## Your interview evidence workflow

1. Run the package and explain each returned passage and graph connection.
2. Add a fresh fictional dataset you understand, with two customers and different permissions.
3. Add one useful SaaS adapter and show how identity is verified before retrieval.
4. Connect a real model and capture its version, prompt version and test dataset revision.
5. Use reviewed expected answers/sources for answerable, ambiguous, conflicting, outdated, unauthorised and unanswerable questions.
6. Record retrieval recall, unsupported claims, citation correctness, appropriate abstention, latency and actual usage. Do not treat citation format checks as factual correctness.
7. Compare text and graph retrieval on the same questions. Record where the graph helps and where it adds no benefit.
8. Keep the issue, your changes, tests, review discussion, defects fixed and a short demo recording in GitHub. Distinguish your own review from independent review.
9. Reuse the unchanged core in a second SaaS and document exactly what the adapter had to change.

Use mock/sample data for public portfolio demonstrations. Present a deployment as production experience only after it actually operates for users with the relevant deployment and support responsibilities.
