from datetime import date
import hashlib
import time
import uuid
from .profiles import PROFILES
from .retrieval import retrieve
from .types import APIError, fields, identifier, integer, iso_date, source_uri, text


class KnowledgeService:
    def __init__(self, store, provider=None):
        self.store = store
        self.provider = provider

    def ingest(self, principal, data):
        fields(data, {"collection", "id", "title", "text", "source_uri", "jurisdiction", "language", "valid_from", "valid_until", "expected_revision"},
               {"collection", "id", "title", "text", "source_uri"})
        scope = principal.scope(data["collection"], "ingest")
        valid_from = iso_date(data.get("valid_from", "1970-01-01"), "valid_from")
        valid_until = data.get("valid_until")
        if valid_until is not None:
            valid_until = iso_date(valid_until, "valid_until")
            if valid_until <= valid_from:
                raise APIError(422, "valid_until is exclusive and must be later than valid_from")
        jurisdiction = identifier(data.get("jurisdiction", "unspecified"), "jurisdiction")
        profile = PROFILES.get(scope.project, PROFILES["generic"])
        if profile.jurisdiction_required and jurisdiction == "unspecified":
            raise APIError(422, "This project requires explicit jurisdiction metadata")
        document = {"id": identifier(data["id"], "id"), "title": text(data["title"], "title"),
                    "text": text(data["text"], "text", 100000), "source_uri": source_uri(data["source_uri"]),
                    "jurisdiction": jurisdiction, "language": identifier(data.get("language", "en"), "language"),
                    "valid_from": valid_from, "valid_until": valid_until,
                    "expected_revision": integer(data.get("expected_revision", 0), "expected_revision", 0, 1_000_000)}
        return self.store.ingest(scope, document, self.provider)

    def add_edge(self, principal, data):
        allowed = {"collection", "id", "source", "relation", "target", "document_id", "document_revision", "quote"}
        fields(data, allowed, allowed)
        scope = principal.scope(data["collection"], "ingest")
        edge = {k: text(data[k], k, 200) for k in ("source", "target")}
        edge.update({k: identifier(data[k], k) for k in ("id", "document_id", "relation")})
        edge["quote"] = text(data["quote"], "quote", 600, 10)
        edge["document_revision"] = integer(data["document_revision"], "document_revision", 1, 1_000_000)
        if edge["source"].casefold() == edge["target"].casefold():
            raise APIError(422, "Self edges are not supported in this pilot")
        return self.store.add_edge(scope, edge)

    def graph_candidates(self, principal, data):
        fields(data, {"collection", "document_id", "expected_revision"}, {"collection", "document_id", "expected_revision"})
        scope = principal.scope(data["collection"], "ingest")
        if self.provider is None or not hasattr(self.provider, "extract_graph"):
            raise APIError(503, "A graph extraction model is not configured")
        document_id = identifier(data["document_id"], "document_id")
        expected_revision = integer(data["expected_revision"], "expected_revision", 1, 1_000_000)
        document, chunks = self.store.document_snapshot(scope, document_id)
        if int(document["revision"]) != expected_revision:
            raise APIError(409, "Document revision changed; extract again from the current source")
        profile = PROFILES.get(scope.project, PROFILES["generic"])
        chunk_map = {row["id"]: row["content"] for row in chunks}
        entities = {}
        candidates = {}
        usage = {"input_tokens": 0, "output_tokens": 0, "batches": 0}
        for start in range(0, len(chunks), 12):
            batch = chunks[start:start + 12]
            raw, batch_usage = self.provider.extract_graph(document.get("title", document_id), batch, profile.instruction)
            usage["batches"] += 1
            for key in ("input_tokens", "output_tokens"):
                value = batch_usage.get(key)
                if isinstance(value, int):
                    usage[key] += value
            raw_entities = raw.get("entities")
            raw_relationships = raw.get("relationships")
            if not isinstance(raw_entities, list) or len(raw_entities) > 80 or not isinstance(raw_relationships, list) or len(raw_relationships) > 120:
                raise APIError(502, "Graph extraction exceeded the allowed schema")
            for item in raw_entities:
                if not isinstance(item, dict) or set(item) != {"label", "type"}:
                    raise APIError(502, "Invalid graph entity candidate")
                label = text(item["label"], "entity label", 200)
                entity_type = identifier(item["type"], "entity type")
                entities[label.casefold()] = {"label": label, "type": entity_type}
            for item in raw_relationships:
                required = {"source", "relation", "target", "quote", "chunk_id"}
                if not isinstance(item, dict) or set(item) != required:
                    raise APIError(502, "Invalid graph relationship candidate")
                source = text(item["source"], "source", 200)
                target = text(item["target"], "target", 200)
                relation = identifier(item["relation"], "relation")
                quote = text(item["quote"], "quote", 600, 10)
                chunk_id = identifier(item["chunk_id"], "chunk_id")
                if source.casefold() == target.casefold():
                    continue
                content = chunk_map.get(chunk_id)
                if content is None or quote not in content:
                    raise APIError(502, "Graph candidate quote is not present in its cited source chunk")
                digest = hashlib.sha256(
                    "|".join([scope.key, document_id, str(expected_revision), source, relation, target, chunk_id, quote]).encode()
                ).hexdigest()[:24]
                candidate = {
                    "id": "auto-" + digest,
                    "source": source,
                    "relation": relation,
                    "target": target,
                    "quote": quote,
                    "chunk_id": chunk_id,
                    "document_id": document_id,
                    "document_revision": expected_revision,
                }
                candidates[candidate["id"]] = candidate
        return {
            "document_id": document_id,
            "document_revision": expected_revision,
            "status": "review_required",
            "entities": list(entities.values())[:160],
            "candidates": list(candidates.values())[:240],
            "usage": usage,
            "review_required": True,
        }

    def apply_graph_candidates(self, principal, data):
        fields(data, {"collection", "document_id", "document_revision", "candidates"},
               {"collection", "document_id", "document_revision", "candidates"})
        scope = principal.scope(data["collection"], "ingest")
        document_id = identifier(data["document_id"], "document_id")
        document_revision = integer(data["document_revision"], "document_revision", 1, 1_000_000)
        candidates = data["candidates"]
        if not isinstance(candidates, list) or not 1 <= len(candidates) <= 100:
            raise APIError(422, "candidates must contain 1-100 reviewed relationships")
        document, chunks = self.store.document_snapshot(scope, document_id)
        if int(document["revision"]) != document_revision:
            raise APIError(409, "Document revision changed; review candidates again")
        chunk_map = {row["id"]: row["content"] for row in chunks}
        validated = []
        for item in candidates:
            allowed = {"id", "source", "relation", "target", "quote", "chunk_id"}
            fields(item, allowed, {"source", "relation", "target", "quote", "chunk_id"})
            source = text(item["source"], "source", 200)
            target = text(item["target"], "target", 200)
            relation = identifier(item["relation"], "relation")
            quote = text(item["quote"], "quote", 600, 10)
            chunk_id = identifier(item["chunk_id"], "chunk_id")
            if source.casefold() == target.casefold():
                raise APIError(422, "Self edges are not supported")
            if chunk_id not in chunk_map or quote not in chunk_map[chunk_id]:
                raise APIError(422, "Reviewed relationship must cite an exact current source quote")
            edge_id = item.get("id")
            if edge_id is None:
                digest = hashlib.sha256(
                    "|".join([scope.key, document_id, str(document_revision), source, relation, target, chunk_id, quote]).encode()
                ).hexdigest()[:24]
                edge_id = "auto-" + digest
            else:
                edge_id = identifier(edge_id, "id")
            validated.append({
                "id": edge_id,
                "source": source,
                "relation": relation,
                "target": target,
                "document_id": document_id,
                "document_revision": document_revision,
                "quote": quote,
            })
        applied = [self.store.add_edge(scope, edge) for edge in validated]
        return {"status": "indexed", "applied": applied, "reviewed_count": len(applied)}

    def delete(self, principal, data):
        fields(data, {"collection", "id", "expected_revision"}, {"collection", "id", "expected_revision"})
        scope = principal.scope(data["collection"], "ingest")
        return self.store.delete(scope, identifier(data["id"], "id"), integer(data["expected_revision"], "expected_revision", 1, 1_000_000))

    def query(self, principal, data):
        start = time.perf_counter()
        fields(data, {"collection", "question", "mode", "seeds", "hops", "top_k", "as_of", "jurisdiction", "language"}, {"collection", "question"})
        scope = principal.scope(data["collection"], "query")
        question = text(data["question"], "question", 2000)
        mode = data.get("mode", "rag")
        if mode not in ("rag", "graph", "hybrid"):
            raise APIError(422, "mode must be rag, graph or hybrid")
        seeds = data.get("seeds", [])
        if not isinstance(seeds, list) or len(seeds) > 3:
            raise APIError(422, "seeds must be an array of up to three entity labels")
        seeds = [text(s, "seed", 200) for s in seeds]
        hops = integer(data.get("hops", 3), "hops", 1, 3)
        top_k = integer(data.get("top_k", 8), "top_k", 1, 8)
        as_of = iso_date(data.get("as_of", date.today().isoformat()), "as_of")
        language = identifier(data.get("language", "en"), "language")
        jurisdiction = data.get("jurisdiction")
        if jurisdiction is not None:
            jurisdiction = identifier(jurisdiction, "jurisdiction")
        profile = PROFILES.get(scope.project, PROFILES["generic"])
        if profile.jurisdiction_required and (not jurisdiction or jurisdiction == "unspecified"):
            raise APIError(422, "This project requires an explicit jurisdiction filter")
        native_paths = None
        if hasattr(self.store, "snapshot_query"):
            rows, edges, native_paths = self.store.snapshot_query(scope, as_of, jurisdiction, language, question, mode, seeds, hops)
        else:
            rows, edges = self.store.snapshot(scope, as_of, jurisdiction, language)
        evidence, paths, retrieval = retrieve(question, rows, edges, mode, seeds, hops, top_k, self.provider, native_paths)
        retrieval["storage_backend"] = getattr(self.store, "backend", "sqlite")
        retrieval["graph_execution"] = "neo4j_cypher" if native_paths is not None and mode != "rag" else "python" if mode != "rag" else None
        usage = {}
        if not evidence:
            answer = "No supporting evidence was retrieved. Add an appropriate source or clarify the question."
            status = "insufficient_evidence"
            claims = []
        elif self.provider is None:
            answer = "Relevant source excerpts are available below. A language model is not enabled, so no generated answer has been produced."
            status = "evidence_only"
            claims = []
        else:
            generated, usage = self.provider.generate(question, evidence, paths, profile.instruction)
            claims = self._validate_generation(generated, {e["citation_id"] for e in evidence})
            status = "insufficient_evidence" if generated["insufficient"] else "draft"
            answer = "The retrieved evidence is insufficient to answer this question." if generated["insufficient"] else "\n".join(c["text"] + " " + " ".join(f"[{ref}]" for ref in c["citations"]) for c in claims)
        run_id = str(uuid.uuid4())
        elapsed = round((time.perf_counter() - start) * 1000, 2)
        # No question text, answer text, quotes or graph labels are persisted in traces.
        trace = {"id": run_id, "mode": mode, "status": status, "duration_ms": elapsed,
                 "source_chunks": [e["chunk_id"] for e in evidence],
                 "graph_edge_paths": [[e["id"] for e in p["edges"]] for p in paths],
                 "retrieval": retrieval, "usage": usage, "citation_references_checked": bool(claims),
                 "semantic_correctness_verified": False, "as_of": as_of,
                 "model": self.provider.chat_model if self.provider else None}
        self.store.save_trace(scope, trace)
        return {"run_id": run_id, "status": status, "answer": answer, "claims": claims,
                "evidence": evidence, "graph_paths": paths, "trace": trace,
                "review_required": True}

    @staticmethod
    def _validate_generation(data, available):
        if (not isinstance(data, dict) or set(data) != {"insufficient", "claims"}
                or type(data["insufficient"]) is not bool or not isinstance(data["claims"], list)
                or len(data["claims"]) > 12):
            raise APIError(502, "Model output did not match the answer schema")
        if data["insufficient"]:
            if data["claims"]:
                raise APIError(502, "An insufficient answer must not include claims")
            return []
        if not data["claims"]:
            raise APIError(502, "Model returned no supported claims")
        for claim in data["claims"]:
            if (not isinstance(claim, dict) or set(claim) != {"text", "citations"}
                    or not isinstance(claim["text"], str) or not 1 <= len(claim["text"].strip()) <= 3000
                    or not isinstance(claim["citations"], list) or not 1 <= len(claim["citations"]) <= 8
                    or any(not isinstance(c, str) or c not in available for c in claim["citations"])):
                raise APIError(502, "Model returned a claim without valid source references")
            # Citation IDs are validated; entailment still needs domain evaluation.
        return data["claims"]
