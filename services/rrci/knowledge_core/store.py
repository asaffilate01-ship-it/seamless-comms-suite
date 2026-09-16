from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import sqlite3
from .types import APIError


SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
 scope TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
 digest TEXT NOT NULL, title TEXT NOT NULL, source_uri TEXT NOT NULL,
 jurisdiction TEXT NOT NULL, language TEXT NOT NULL,
 valid_from TEXT NOT NULL, valid_until TEXT,
 embedding_id TEXT NOT NULL, PRIMARY KEY(scope,id));
CREATE TABLE IF NOT EXISTS chunks (
 scope TEXT NOT NULL, id TEXT NOT NULL, document_id TEXT NOT NULL,
 ordinal INTEGER NOT NULL, content TEXT NOT NULL, embedding TEXT,
 PRIMARY KEY(scope,id), FOREIGN KEY(scope,document_id) REFERENCES documents(scope,id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS chunk_document ON chunks(scope,document_id);
CREATE TABLE IF NOT EXISTS edges (
 scope TEXT NOT NULL, id TEXT NOT NULL, source TEXT NOT NULL,
 relation TEXT NOT NULL, target TEXT NOT NULL,
 chunk_id TEXT NOT NULL, quote TEXT NOT NULL,
 PRIMARY KEY(scope,id), FOREIGN KEY(scope,chunk_id) REFERENCES chunks(scope,id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS traces (
 scope TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL,
 payload TEXT NOT NULL, PRIMARY KEY(scope,id));
"""


def chunk_text(text, size=900, overlap=120):
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            boundary = text.rfind(" ", start + size // 2, end)
            if boundary > start:
                end = boundary
        chunks.append(text[start:end])
        if end == len(text):
            break
        next_start = max(start + 1, end - overlap)
        while next_start < end and next_start > 0 and not text[next_start - 1].isspace():
            next_start += 1
        start = next_start
    return chunks


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def ingest(self, scope, document, provider=None):
        body = {k: v for k, v in document.items() if k != "expected_revision"}
        embedding_id = provider.embedding_id if provider else "none"
        digest = hashlib.sha256(json.dumps([body, embedding_id], sort_keys=True).encode()).hexdigest()
        pieces = chunk_text(document["text"])
        # A retry does not call the embedding provider a second time.
        with self.connect() as db:
            old = db.execute("SELECT * FROM documents WHERE scope=? AND id=?", (scope.key, document["id"])).fetchone()
            if old and old["digest"] == digest:
                return {"id": document["id"], "revision": old["revision"], "unchanged": True}
            if document["expected_revision"] != (old["revision"] if old else 0):
                raise APIError(409, "Revision conflict; read the current source revision before updating")
        vectors = provider.embed(pieces) if provider else [None] * len(pieces)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM documents WHERE scope=? AND id=?", (scope.key, document["id"])).fetchone()
            if old and old["digest"] == digest:
                return {"id": document["id"], "revision": old["revision"], "unchanged": True}
            current = old["revision"] if old else 0
            if document["expected_revision"] != current:
                raise APIError(409, "Revision conflict; read the current source revision before updating")
            # Deleting old chunks also invalidates every graph edge based on them.
            db.execute("DELETE FROM documents WHERE scope=? AND id=?", (scope.key, document["id"]))
            db.execute("INSERT INTO documents (scope,id,revision,digest,title,source_uri,jurisdiction,language,valid_from,valid_until,embedding_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
                scope.key, document["id"], current + 1, digest, document["title"], document["source_uri"],
                document["jurisdiction"], document["language"], document["valid_from"], document["valid_until"], embedding_id))
            for index, (piece, vector) in enumerate(zip(pieces, vectors)):
                chunk_id = f'{document["id"]}:v{current + 1}:{index}'
                db.execute("INSERT INTO chunks VALUES (?,?,?,?,?,?)", (scope.key, chunk_id, document["id"], index, piece, json.dumps(vector) if vector else None))
            # Retrieval traces contain identifiers only. Purge on source changes anyway.
            db.execute("DELETE FROM traces WHERE scope=?", (scope.key,))
        return {"id": document["id"], "revision": current + 1, "chunks": len(pieces), "unchanged": False}

    def delete(self, scope, document_id, expected_revision):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT revision FROM documents WHERE scope=? AND id=?", (scope.key, document_id)).fetchone()
            if not row:
                raise APIError(404, "Document not found")
            if row["revision"] != expected_revision:
                raise APIError(409, "Revision conflict")
            db.execute("DELETE FROM documents WHERE scope=? AND id=?", (scope.key, document_id))
            db.execute("DELETE FROM traces WHERE scope=?", (scope.key,))
        return {"deleted": True, "id": document_id}

    def add_edge(self, scope, edge):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            rows = db.execute("SELECT c.id,c.content,d.revision FROM chunks c JOIN documents d ON c.scope=d.scope AND c.document_id=d.id WHERE c.scope=? AND c.document_id=? ORDER BY c.ordinal", (scope.key, edge["document_id"])).fetchall()
            if not rows or rows[0]["revision"] != edge["document_revision"]:
                raise APIError(409, "Missing or changed supporting document")
            support = next((r for r in rows if edge["quote"] in r["content"]), None)
            if support is None:
                raise APIError(422, "Quote must occur exactly within a current source chunk")
            db.execute("INSERT INTO edges VALUES (?,?,?,?,?,?,?) ON CONFLICT(scope,id) DO UPDATE SET source=excluded.source,relation=excluded.relation,target=excluded.target,chunk_id=excluded.chunk_id,quote=excluded.quote", (scope.key, edge["id"], edge["source"], edge["relation"], edge["target"], support["id"], edge["quote"]))
        return {"id": edge["id"], "support_chunk": support["id"], "status": "indexed"}

    def snapshot(self, scope, as_of, jurisdiction, language):
        with self.connect() as db:
            db.execute("BEGIN")
            clauses = ["c.scope=?", "d.valid_from<=?", "(d.valid_until IS NULL OR d.valid_until>?)", "d.language=?"]
            args = [scope.key, as_of, as_of, language]
            if jurisdiction:
                clauses.append("d.jurisdiction=?")
                args.append(jurisdiction)
            rows = [dict(r) for r in db.execute("SELECT c.*,d.title,d.source_uri,d.revision,d.jurisdiction,d.embedding_id FROM chunks c JOIN documents d ON c.scope=d.scope AND c.document_id=d.id WHERE " + " AND ".join(clauses) + " ORDER BY c.id LIMIT 2001", args)]
            if len(rows) > 2000:
                raise APIError(413, "Pilot collection limit reached; split collections or move retrieval to an indexed store")
            edges = [dict(r) for r in db.execute("SELECT * FROM edges WHERE scope=? ORDER BY id LIMIT 5001", (scope.key,))]
            if len(edges) > 5000:
                raise APIError(413, "Pilot graph limit reached")
        valid_chunks = {r["id"] for r in rows}
        return rows, [e for e in edges if e["chunk_id"] in valid_chunks]

    def save_trace(self, scope, trace):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        with self.connect() as db:
            db.execute("DELETE FROM traces WHERE created_at<?", ((now - timedelta(days=7)).isoformat(),))
            db.execute("INSERT INTO traces VALUES (?,?,?,?)", (scope.key, trace["id"], now.isoformat(), json.dumps(trace)))

    def get_trace(self, scope, trace_id):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM traces WHERE scope=? AND id=?", (scope.key, trace_id)).fetchone()
        if not row:
            raise APIError(404, "Trace not found")
        return json.loads(row["payload"])
