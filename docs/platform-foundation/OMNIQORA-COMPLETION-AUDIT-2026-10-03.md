# Omniqora completion audit — non-Dishbee engine

Date: 3 October 2026

This branch completes the shared Omniqora engine work identified in the October repository audit while deliberately leaving Dishbee-specific migration, KDS, ordering and runtime cutover work to its separate workstream.

## What is already on main and reused

The completion layer builds on the current SaaS Factory rather than replacing it:

- tenant/landlord/product control plane, blueprints, branding, domains and provisioning;
- platform kernel, regions/locales, provider bindings, service credentials and data routing;
- CRM and Customer 360;
- Connect/reception/assisted ordering;
- Geo, dispatch, fleet, public tracking and Universal Agent;
- Syndriva marketplace/commerce, inventory, bookings, payments and loyalty;
- growth segmentation/RFM, campaigns, journeys, sales sequences and feedback;
- platform utilities: documents, forms, automation, support, notifications and tenant search;
- Business360 audit/discovery, deterministic transformation planning, M&A/carve-out planning and specialist AI hub;
- RRCI evidence retrieval, RAG/hybrid retrieval, explicit graph traversal and optional Neo4j;
- automated portfolio Migration Factory with evidence/shadow/cutover gates.

## Added by this branch

### Accounting and accounts preparation

The prior main branch exposed only the first vertical-package persistence layer. This branch adds the controlled accounting workflow needed to move from ingestion to reviewable ledger output:

- review queue with confidence/evidence;
- explicit capex-vs-revenue, tax, duplicate, bank-match, account and policy exceptions;
- balanced journals and journal lines;
- fixed-asset register;
- accounts-preparation runs;
- controlled posting RPC which refuses unbalanced journals;
- trial-balance projection from posted journals;
- final actions tied to authenticated tenant users.

The AI boundary remains proposal-first. Extraction/classification is not treated as automatically posted bookkeeping.

### Tax intelligence

Adds a versioned authority-source registry with jurisdiction, authority hierarchy, effective dates, checked date, content hash and supersession. Tax positions link research cases to source IDs, facts, confidence and risk. Specialist-review risk remains explicit; an AI draft is not tax advice or a filing decision.

### Governed AI/agent control plane

Adds shared persisted profiles and run governance for discovery, finance, technical, compliance, product, transaction, accounting, tax and knowledge specialists:

- bounded step counts;
- provider/model and policy/input-version recording;
- step/evidence trace;
- token/cost fields;
- action proposal queue;
- separate human approval before consequential actions;
- no generic arbitrary SQL/shell/cloud mutation grant.

The existing Transformation AI Hub remains the deeper model/connector runtime. These Supabase records make governed agent orchestration reusable by the SaaS Factory and other products.

### RAG and GraphRAG enrichment

The existing service already provided scoped ingestion, BM25/vector-capable retrieval, citations, hybrid search, reviewed graph edges and optional Neo4j/Cypher traversal.

This branch adds model-assisted graph proposal generation:

1. a configured model receives one supplied source document;
2. it proposes entities and relationships;
3. the service validates the schema;
4. every entity/edge quote must occur literally in the source;
5. edges must reference proposed entities and cannot self-link;
6. the response is always `review_required`;
7. nothing is promoted automatically;
8. reviewed relationships continue through the existing edge-ingestion API.

This is practical automated GraphRAG enrichment, while preserving evidence and human review. It still does not claim Microsoft GraphRAG community summarisation or automatically trusted semantic extraction.

### M&A, diligence, carve-out and Day-1 control

Business360's deterministic planning service remains the detailed transformation engine. This branch adds shared SaaS-Factory persistence/control for:

- acquisitions, disposals, mergers, carve-outs, integrations and separations;
- diligence findings by workstream/severity/evidence;
- TSA obligations, owners, costs and exit criteria;
- Day-1 gates;
- synergy/benefit records with finance-approval flag;
- deterministic transaction readiness RPC.

A programme is not Day-1 ready when critical gates are missing, high/critical findings remain unresolved, or TSA obligations are still draft/disputed.

### Shared Kindelo childcare engine

Adds reusable household/provider/matching primitives:

- parent/household care and funding context;
- provider availability, capacity, qualifications, regulatory/vetting status;
- geo-ready fields;
- scored matching with reasons and blockers;
- every generated match is human-review-required.

Ofsted/CMA legal/regulatory determination remains in the compliance/vertical boundary, not inferred by the matching score.

### Shared automotive engine

Adds reusable cross-product vehicle primitives for SparesGrid, Zivvo, Autohashi and later automotive products:

- vehicle identity profile;
- VIN/registration/source references;
- evidence history;
- market/listing/auction/sale/valuation/inspection events;
- part requirements and compatibility status.

Provider-specific vehicle data, auction feeds and parts APIs remain connectors bound through the platform kernel.

## What this branch intentionally does not do

- It does not alter Dishbee-specific runtime, ordering, KDS, tenant migration or production cutover code.
- It does not fabricate live provider credentials, regulatory authority, external filings, payments or customer data.
- It does not auto-approve accounting entries, tax positions, graph edges, childcare matches, M&A readiness or AI actions.
- It does not convert Business360 financial reporting into a statutory full double-entry accounting product; the new accounting workflow is the dedicated ledger/accounts-prep boundary.
- It does not claim deployment merely because source/migrations exist. Production migration and runtime activation remain separate controlled steps.

## Verification

The normal `test:control-plane` command now includes `core-completion.test.mjs`. That test applies the complete migration chain in PGlite and verifies:

- balanced accounting posting and trial-balance projection;
- tax source/position persistence;
- governed agent steps and approval queue;
- knowledge enrichment records;
- M&A/carve-out Day-1 readiness;
- tenant isolation;
- Kindelo shared matching;
- automotive evidence;
- vertical package statuses.

RRCI adds `test_graph_proposals.py` to verify source-grounded graph proposals and rejection of invented support quotes.
