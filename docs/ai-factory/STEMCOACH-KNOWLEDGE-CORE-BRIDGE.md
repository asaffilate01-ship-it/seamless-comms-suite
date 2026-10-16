# STEMCoach → Omniqora shared RAG and GraphRAG

**Status: reviewed development contract; no tenant, model, embedding worker or public host provisioned by this commit.**

The education product \`stemcoach\` is already in the SaaS Factory portfolio
registry as \`tenantProvisioning: not_activated\`. This phase reuses the existing
\`services/rrci/knowledge_core\` instead of cloning the AI engine.

## Trusted scopes

Provision separate read and ingestion service tokens, with SHA-256 hashes only
in the Core credential configuration. Both must be scoped to:
- \`project: stemcoach\`
- \`tenant: stemcoach-public\`
- \`collections: [stemcoach-lessons]\`

Use capability \`query\` on the read token and \`ingest\` on the offline
operator sync token. Student account tokens are **never** passed directly to
the Knowledge Core: the STEMCoach Supabase Edge Function authenticates the
caller, checks coaching entitlement/rate, validates tutorial ID against a
server-side allowlist, and uses the read-only Knowledge Core credential.

## Retrieval semantics

- \`POST /v1/documents/upsert\`: authored lesson texts, source URNs,
  versioned content, language=en, subject inside source. No private data.
- \`POST /v1/graph/edges/upsert\`: exact-quote-supported
  \`Lesson title -teaches→ Objective\` edges, bound to the current revision.
- \`POST /v1/query\`: \`rag\`, \`graph\`, or \`hybrid\` with fixed source-scoped
  collection, up to six cited chunks and two graph hops.
- If no source matches, return \`insufficient_evidence\`; do not generate an
  unsupported answer.
- Default \`KNOWLEDGE_PROVIDER=evidence\`: **BM25 text retrieval + graph traversal,
  no LLM answer**. Optional, separately approved Ollama embeddings/LLM and
  Neo4j may enhance retrieval only after model/version/region evaluation,
  reindexing and production authorisation.
- Generated claims must cite existing retrieved source chunks but remain
  \`review_required\` drafts. Citation-shape validation does not prove academic
  correctness. No source has been certified to a current awarding-body syllabus.

## Privacy and safety

This is the portfolio-wide \`stemcoach\` general learning collection, not a
school-private knowledge base. Source SaaS retains student accounts,
institutions, classes, sessions, attempts, question packs and subscription.
The import excludes all identifying data and typed answers. Personalisation
in the UI uses only local/authoritative STEMCoach state; shared retrieval
never accepts arbitrary user text, tenant IDs, collection IDs or documents
from browser inputs.

Before enabling school-private GraphRAG: separately approve the institution
tenant, consent/privacy policy, product entitlements, data residency,
retention, per-collection credential and strict role-scoped retrieval.
Do not reuse the global read token for private school material.

## Activation and regression tests

1. Start Knowledge Core in a staging environment with a supported HTTPS
   ingress and provision the separate scoped credentials above.
2. Run \`PYTHONPATH=services/rrci python -m unittest services/rrci/tests/test_stemcoach.py -v\`
   and the complete \`services/rrci/tests\` suite.
3. From STEMCoach, run its offline \`npm run knowledge:preview\` and
   operator-only \`npm run knowledge:sync\` into the staging collection.
4. Deploy STEMCoach \`omniqora-learning-evidence\` Edge Function with exact
   secrets; test authenticated, unauthenticated, wrong-subject,
   cross-tenant, forged citations, wrong data classification, stale revision,
   missing model and provider outage cases.
5. Gate any paid AI generation on Omniqora Agent Factory model verification,
   budget reservation and worker receipts. The source system must not bypass
   its existing entitlement and approval rules.

No production deployment or real AI inference is implied by a passing test.
