"""Optional Neo4j backend. All customer data and derived links share one transaction store."""
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from urllib.parse import urlparse

from .retrieval import graph_starts
from .store import chunk_text
from .types import APIError


CONSTRAINTS = {
    "knowledge_scope": "FOR (n:KnowledgeScope) REQUIRE n.key IS UNIQUE",
    "knowledge_document": "FOR (n:KnowledgeDocument) REQUIRE (n.scope,n.id) IS UNIQUE",
    "knowledge_chunk": "FOR (n:KnowledgeChunk) REQUIRE (n.scope,n.id) IS UNIQUE",
    "knowledge_entity": "FOR (n:KnowledgeEntity) REQUIRE (n.scope,n.id) IS UNIQUE",
    "knowledge_trace": "FOR (n:KnowledgeTrace) REQUIRE (n.scope,n.id) IS UNIQUE",
}

# Limits and relationship types are fixed by the service, never supplied as Cypher.
PATH_QUERY = """
MATCH path=(start:KnowledgeEntity)-[:KNOWLEDGE_LINK*1..3]-(finish:KnowledgeEntity)
WHERE start.scope=$scope AND start.id IN $starts AND length(path)<=$hops
  AND all(n IN nodes(path) WHERE n.scope=$scope)
  AND all(r IN relationships(path) WHERE r.scope=$scope AND r.id IN $edge_ids)
  AND all(n IN nodes(path) WHERE single(m IN nodes(path) WHERE m=n))
RETURN [n IN nodes(path) | n.id] AS nodes,
       [r IN relationships(path) | {id:r.id,source:r.source,relation:r.relation,
          target:r.target,chunk_id:r.chunk_id,quote:r.quote}] AS edges
ORDER BY length(path), [r IN relationships(path) | r.id], [n IN nodes(path) | n.id]
LIMIT 24
"""


class Neo4jStore:
    backend = "neo4j"

    def __init__(self, driver, database="neo4j", bookmark_manager=None, errors=(), decorate=None):
        self.driver = driver
        self.database = database
        self.bookmark_manager = bookmark_manager
        self._errors = errors
        self._decorate = decorate or (lambda callback: callback)

    @classmethod
    def from_env(cls, require_schema=True):
        try:
            from neo4j import GraphDatabase, unit_of_work
            from neo4j.exceptions import Neo4jError, DriverError
        except ImportError:
            raise RuntimeError("Install requirements-neo4j.txt to enable Neo4j") from None
        uri = os.environ.get("NEO4J_URI", "bolt://127.0.0.1:7687")
        parsed = urlparse(uri)
        allowed = {"bolt", "neo4j", "bolt+s", "neo4j+s"}
        if (parsed.scheme not in allowed or not parsed.hostname or parsed.username
                or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
            raise ValueError("Use a valid Neo4j connection URI without embedded credentials")
        if "+s" not in parsed.scheme and parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError("Remote Neo4j connections require bolt+s:// or neo4j+s://")
        password = os.environ.get("NEO4J_PASSWORD")
        if not password:
            raise ValueError("NEO4J_PASSWORD is required")
        driver = GraphDatabase.driver(uri, auth=(os.environ.get("NEO4J_USERNAME", "neo4j"), password),
                                     connection_timeout=10, connection_acquisition_timeout=15,
                                     max_transaction_retry_time=10, max_connection_pool_size=10)
        store = cls(driver, os.environ.get("NEO4J_DATABASE", "neo4j"),
                    GraphDatabase.bookmark_manager(), (Neo4jError, DriverError), unit_of_work(timeout=15))
        try:
            driver.verify_connectivity()
            if require_schema:
                store.verify_schema()
        except Exception:
            store.close()
            raise RuntimeError("Neo4j startup failed. Check connection settings and run init-neo4j to provision the schema.") from None
        return store

    def close(self):
        self.driver.close()

    def _execute(self, write, callback):
        try:
            with self.driver.session(database=self.database, bookmark_manager=self.bookmark_manager) as session:
                execute = session.execute_write if write else session.execute_read
                return execute(self._decorate(callback))
        except self._errors:
            # Raw driver errors can contain query parameters and topology information.
            raise APIError(502, "Neo4j request failed; inspect the database health and server configuration") from None

    def initialize_schema(self):
        for name, definition in CONSTRAINTS.items():
            query = f"CREATE CONSTRAINT {name} IF NOT EXISTS {definition}"
            self._execute(True, lambda tx, q=query: tx.run(q).consume())
        self._execute(True, lambda tx: tx.run("CREATE INDEX knowledge_trace_expiry IF NOT EXISTS FOR (n:KnowledgeTrace) ON (n.scope,n.created_at)").consume())
        return {"backend": self.backend, "constraints": sorted(CONSTRAINTS)}

    def verify_schema(self):
        names = self._execute(False, lambda tx: {r["name"] for r in tx.run("SHOW CONSTRAINTS YIELD name RETURN name")})
        if not set(CONSTRAINTS) <= names:
            raise RuntimeError("Neo4j schema is not initialized")

    @staticmethod
    def _lock(tx, scope):
        # Serialize mutations and retrieval snapshots within a collection. A lost
        # update is avoided by reading the incremented property under Neo4j's lock.
        tx.run("MERGE (n:KnowledgeScope {key:$scope}) SET n.lock_version=coalesce(n.lock_version,0)+1", scope=scope.key).consume()

    @staticmethod
    def _document(tx, scope, document_id):
        row = tx.run("MATCH (d:KnowledgeDocument {scope:$scope,id:$id}) RETURN properties(d) AS document", scope=scope.key, id=document_id).single()
        return row["document"] if row else None

    @staticmethod
    def _clear_source(tx, scope, document_id):
        # Relationships reference source documents/chunks explicitly; invalidate
        # them before deleting their source nodes in the same transaction.
        tx.run("MATCH (:KnowledgeEntity {scope:$scope})-[r:KNOWLEDGE_LINK {scope:$scope,document_id:$id}]->(:KnowledgeEntity {scope:$scope}) DELETE r", scope=scope.key, id=document_id).consume()
        tx.run("MATCH (c:KnowledgeChunk {scope:$scope,document_id:$id}) DETACH DELETE c", scope=scope.key, id=document_id).consume()
        tx.run("MATCH (d:KnowledgeDocument {scope:$scope,id:$id}) DETACH DELETE d", scope=scope.key, id=document_id).consume()
        tx.run("MATCH (t:KnowledgeTrace {scope:$scope}) DETACH DELETE t", scope=scope.key).consume()
        tx.run("MATCH (n:KnowledgeEntity {scope:$scope}) WHERE NOT (n)-[:KNOWLEDGE_LINK]-() DELETE n", scope=scope.key).consume()

    def ingest(self, scope, document, provider=None):
        body = {k: v for k, v in document.items() if k != "expected_revision"}
        embedding_id = provider.embedding_id if provider else "none"
        digest = hashlib.sha256(json.dumps([body, embedding_id], sort_keys=True).encode()).hexdigest()
        old = self._execute(False, lambda tx: self._document(tx, scope, document["id"]))
        if old and old["digest"] == digest:
            return {"id": document["id"], "revision": old["revision"], "unchanged": True}
        if document["expected_revision"] != (old["revision"] if old else 0):
            raise APIError(409, "Revision conflict; read the current source revision before updating")
        pieces = chunk_text(document["text"])
        # Model/network calls occur once outside retryable Neo4j transactions.
        vectors = provider.embed(pieces) if provider else [None] * len(pieces)
        if len(vectors) != len(pieces):
            raise APIError(502, "Embedding count mismatch")

        def write(tx):
            self._lock(tx, scope)
            current_doc = self._document(tx, scope, document["id"])
            if current_doc and current_doc["digest"] == digest:
                return {"id": document["id"], "revision": current_doc["revision"], "unchanged": True}
            current = current_doc["revision"] if current_doc else 0
            if document["expected_revision"] != current:
                raise APIError(409, "Revision conflict; read the current source revision before updating")
            self._clear_source(tx, scope, document["id"])
            properties = {k: document[k] for k in ("id", "title", "source_uri", "jurisdiction", "language", "valid_from", "valid_until")}
            properties.update(scope=scope.key, revision=current+1, digest=digest, embedding_id=embedding_id)
            tx.run("CREATE (d:KnowledgeDocument) SET d=$properties", properties=properties).consume()
            chunks = [{"scope": scope.key, "id": f'{document["id"]}:v{current+1}:{i}',
                       "document_id": document["id"], "ordinal": i, "content": piece,
                       "embedding": json.dumps(vector) if vector is not None else None}
                      for i, (piece, vector) in enumerate(zip(pieces, vectors))]
            tx.run("MATCH (d:KnowledgeDocument {scope:$scope,id:$id}) UNWIND $chunks AS properties CREATE (c:KnowledgeChunk) SET c=properties CREATE (d)-[:KNOWLEDGE_CONTAINS]->(c)", scope=scope.key, id=document["id"], chunks=chunks).consume()
            return {"id": document["id"], "revision": current+1, "chunks": len(pieces), "unchanged": False}
        return self._execute(True, write)

    def delete(self, scope, document_id, expected_revision):
        def write(tx):
            self._lock(tx, scope)
            old = self._document(tx, scope, document_id)
            if not old:
                raise APIError(404, "Document not found")
            if old["revision"] != expected_revision:
                raise APIError(409, "Revision conflict")
            self._clear_source(tx, scope, document_id)
            return {"deleted": True, "id": document_id}
        return self._execute(True, write)

    def add_edge(self, scope, edge):
        def write(tx):
            self._lock(tx, scope)
            old = self._document(tx, scope, edge["document_id"])
            if not old or old["revision"] != edge["document_revision"]:
                raise APIError(409, "Missing or changed supporting document")
            row = tx.run("MATCH (c:KnowledgeChunk {scope:$scope,document_id:$id}) WHERE c.content CONTAINS $quote RETURN c.id AS id ORDER BY c.ordinal LIMIT 1", scope=scope.key, id=edge["document_id"], quote=edge["quote"]).single()
            if row is None:
                raise APIError(422, "Quote must occur exactly within a current source chunk")
            # The per-scope lock also makes replacing an edge ID atomic.
            tx.run("MATCH (:KnowledgeEntity {scope:$scope})-[r:KNOWLEDGE_LINK {scope:$scope,id:$id}]->(:KnowledgeEntity {scope:$scope}) DELETE r", scope=scope.key, id=edge["id"]).consume()
            properties = {**edge, "scope": scope.key, "chunk_id": row["id"]}
            tx.run("MERGE (a:KnowledgeEntity {scope:$scope,id:$source}) MERGE (b:KnowledgeEntity {scope:$scope,id:$target}) CREATE (a)-[r:KNOWLEDGE_LINK]->(b) SET r=$properties", scope=scope.key, source=edge["source"], target=edge["target"], properties=properties).consume()
            return {"id": edge["id"], "support_chunk": row["id"], "status": "indexed"}
        return self._execute(True, write)

    @staticmethod
    def _snapshot(tx, scope, as_of, jurisdiction, language):
        result = tx.run("""
          MATCH (d:KnowledgeDocument {scope:$scope})-[:KNOWLEDGE_CONTAINS]->(c:KnowledgeChunk {scope:$scope})
          WHERE d.valid_from<=$as_of AND (d.valid_until IS NULL OR d.valid_until>$as_of)
            AND d.language=$language AND ($jurisdiction IS NULL OR d.jurisdiction=$jurisdiction)
          RETURN c{.*,title:d.title,source_uri:d.source_uri,revision:d.revision,
                   jurisdiction:d.jurisdiction,embedding_id:d.embedding_id} AS chunk
          ORDER BY c.id LIMIT 2001
        """, scope=scope.key, as_of=as_of, language=language, jurisdiction=jurisdiction)
        rows = [dict(r["chunk"]) for r in result]
        if len(rows) > 2000:
            raise APIError(413, "Pilot collection limit reached; split collections or add indexed retrieval")
        for row in rows:
            row.setdefault("embedding", None)
        edges = [dict(r["edge"]) for r in tx.run("MATCH (:KnowledgeEntity {scope:$scope})-[r:KNOWLEDGE_LINK {scope:$scope}]->(:KnowledgeEntity {scope:$scope}) RETURN properties(r) AS edge ORDER BY r.id LIMIT 5001", scope=scope.key)]
        if len(edges) > 5000:
            raise APIError(413, "Pilot graph limit reached")
        valid_chunks = {r["id"] for r in rows}
        return rows, [e for e in edges if e["chunk_id"] in valid_chunks]

    def snapshot(self, scope, as_of, jurisdiction, language):
        def read_locked(tx):
            self._lock(tx, scope)
            return self._snapshot(tx, scope, as_of, jurisdiction, language)
        return self._execute(True, read_locked)

    def snapshot_query(self, scope, as_of, jurisdiction, language, question, mode, seeds, hops):
        def read_locked(tx):
            self._lock(tx, scope)
            rows, edges = self._snapshot(tx, scope, as_of, jurisdiction, language)
            starts = graph_starts(question, edges, seeds) if mode != "rag" else []
            paths = []
            if starts:
                paths = [dict(r) for r in tx.run(PATH_QUERY, scope=scope.key, starts=starts,
                         hops=hops, edge_ids=[e["id"] for e in edges])]
                # Keep one path per ordered edge sequence, matching the local engine.
                unique = {}
                for path in paths:
                    unique.setdefault(tuple(e["id"] for e in path["edges"]), path)
                paths = list(unique.values())
            return rows, edges, paths
        # Consistent evidence and paths: all adapter writes take this same lock.
        return self._execute(True, read_locked)

    def save_trace(self, scope, trace):
        now = datetime.now(timezone.utc)
        def write(tx):
            self._lock(tx, scope)
            tx.run("MATCH (t:KnowledgeTrace {scope:$scope}) WHERE t.created_at<$cutoff DETACH DELETE t", scope=scope.key, cutoff=(now-timedelta(days=7)).isoformat()).consume()
            tx.run("MERGE (t:KnowledgeTrace {scope:$scope,id:$id}) SET t.created_at=$created_at,t.payload=$payload", scope=scope.key, id=trace["id"], created_at=now.isoformat(), payload=json.dumps(trace)).consume()
        self._execute(True, write)

    def get_trace(self, scope, trace_id):
        row = self._execute(False, lambda tx: tx.run("MATCH (t:KnowledgeTrace {scope:$scope,id:$id}) WHERE t.created_at >= $cutoff RETURN t.payload AS payload", scope=scope.key, id=trace_id, cutoff=(datetime.now(timezone.utc)-timedelta(days=7)).isoformat()).single())
        if row is None:
            raise APIError(404, "Trace not found")
        return json.loads(row["payload"])
