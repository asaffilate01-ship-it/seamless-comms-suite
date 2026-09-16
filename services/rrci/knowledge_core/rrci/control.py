"""Durable, scoped control plane. Indexes are disposable projections of this state."""
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import sqlite3
import time


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


class Control:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.tx() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS records(scope TEXT,kind TEXT,id TEXT,payload TEXT NOT NULL,
              PRIMARY KEY(scope,kind,id));
            CREATE TABLE IF NOT EXISTS epochs(scope TEXT PRIMARY KEY,version INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL,
              at REAL NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,object_id TEXT NOT NULL,
              detail_hash TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS audit_scope ON audit(scope,seq);
            CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
              BEGIN SELECT RAISE(ABORT,'Append-only audit'); END;
            CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
              BEGIN SELECT RAISE(ABORT,'Append-only audit'); END;
            ''')

    @contextmanager
    def tx(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def get(db, scope, kind, id):
        row = db.execute('SELECT payload FROM records WHERE scope=? AND kind=? AND id=?',
                         (scope.key, kind, id)).fetchone()
        return json.loads(row[0]) if row else None

    @staticmethod
    def items(db, scope, kind):
        return [json.loads(r[0]) for r in db.execute(
            'SELECT payload FROM records WHERE scope=? AND kind=? ORDER BY id', (scope.key, kind))]

    @staticmethod
    def put(db, scope, kind, id, payload):
        db.execute('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(scope,kind,id) DO UPDATE SET payload=excluded.payload',
                   (scope.key, kind, id, canonical(payload)))
        db.execute('INSERT INTO epochs VALUES(?,1) ON CONFLICT(scope) DO UPDATE SET version=version+1', (scope.key,))

    @staticmethod
    def epoch(db, scope):
        row = db.execute('SELECT version FROM epochs WHERE scope=?', (scope.key,)).fetchone()
        return row[0] if row else 0

    @staticmethod
    def log(db, scope, actor, action, id, detail):
        old = db.execute('SELECT hash FROM audit WHERE scope=? ORDER BY seq DESC LIMIT 1', (scope.key,)).fetchone()
        values = [scope.key, time.time(), actor, action, id, digest(detail), old[0] if old else '0'*64]
        db.execute('INSERT INTO audit(scope,at,actor,action,object_id,detail_hash,previous_hash,hash) VALUES(?,?,?,?,?,?,?,?)',
                   (*values, digest(values)))
