# API v1

All routes except `GET /health` require `Authorization: Bearer <scoped-service-token>`. Use JSON and POST. The project and tenant come only from the token configuration. The core rejects unknown request fields and has a 200,000-byte request-body limit.

| Route | Capability | Purpose |
| --- | --- | --- |
| `/v1/documents/upsert` | `ingest` | Index or replace one source |
| `/v1/documents/delete` | `ingest` | Delete one source and derived graph edges |
| `/v1/graph/edges/upsert` | `ingest` | Add a reviewed relationship supported by a quote |
| `/v1/query` | `query` | Retrieve evidence; optionally generate a draft |
| `/v1/traces/get` | `trace` | Retrieve a trace by ID within an authorised collection |

## Document upsert

```json
{
  "collection": "manuals",
  "id": "supplier-record",
  "title": "Fictional supplier record",
  "text": "Northstar Foods supplies Batch B17.",
  "source_uri": "urn:fictional:supplier-record",
  "jurisdiction": "GB",
  "language": "en",
  "valid_from": "2020-01-01",
  "valid_until": null,
  "expected_revision": 0
}
```

The first revision requires zero. Changed sources require the latest known revision. The response returns `id`, `revision` and `unchanged`; new content also returns `chunks`. An identical retry is a no-op. Text is limited to 100,000 characters; titles to 200. Source links must be HTTPS or a URN, are treated as metadata, and are never fetched by the service.

To delete, send `{collection, id, expected_revision}` to the delete route. It returns `404` if absent, `409` if the revision changed. Graph updates after a document change must reference its new revision.

## Relationship upsert

```json
{
  "collection": "manuals",
  "id": "supply-b17",
  "source": "Northstar Foods",
  "relation": "supplies",
  "target": "Batch B17",
  "document_id": "supplier-record",
  "document_revision": 1,
  "quote": "Northstar Foods supplies Batch B17."
}
```

An edge's source and target are canonical labels assigned by the adapter. Use stable spelling; entity resolution is not automatic. The quote must occur in an indexed chunk. The source adapter is responsible for verifying the relationship, not just finding matching text. Repeating the same edge ID replaces that edge within the same scope.

## Query

```json
{
  "collection": "manuals",
  "question": "Which locations are connected to Northstar Foods?",
  "mode": "hybrid",
  "seeds": ["Northstar Foods"],
  "hops": 3,
  "top_k": 8,
  "as_of": "2026-09-15",
  "jurisdiction": "GB",
  "language": "en"
}
```

Only `collection` and `question` are universally required. Lawquo and TaxNuvia also require `jurisdiction`. Question length is 2,000 characters. Defaults: `rag`, automatic exact-label seeds, three hops, eight chunks, today's date and English. Dates/jurisdictions are filters over supplied metadata, not independent verification of source currency or applicable law.

Responses include `run_id`, `status`, `answer`, `claims`, `evidence`, `graph_paths`, `trace` and `review_required`.

- `evidence_only`: matching passages returned; no model answer generated.
- `insufficient_evidence`: no relevant passages or the configured model indicates insufficient support.
- `draft`: model output passed schema and citation-reference checks; factual correctness still requires evaluation/review.

Evidence entries carry `citation_id`, source/chunk IDs, source revision, title, URI and exact quote. Graph paths carry the connected labels and each source-supported edge. IDs and quotes let a reviewer inspect how the response was constructed.

## Errors

`401` authentication, `403` capability/collection permission, `404` missing resource/route, `409` revision or embedding-model mismatch, `413` size or pilot collection capacity, `415` media type, `422` invalid input, `502` model/service response failure. Provider failures return errors; there is no silent substitution of an evidence-only result for a failed generated answer.

Trace retrieval body: `{ "collection": "manuals", "id": "<run_id>" }`. Retention is seven days, pruned when later queries run. Storage is not a complete immutable audit system. Raw sources and model context are returned only in the authorised query response, not the stored trace.
