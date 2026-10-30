"""Server-only CLI-Anything document pilot. No HTTP listener or implicit activation."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
import uuid
import zipfile
from storage import connect_private_database

UPSTREAM_COMMIT = '34f519533bc175d2fe287ab8316b0dd99bb9cc43'
CAPABILITY = 'document.draft'
REGISTRY = Path(__file__).resolve().parents[2] / 'src/modules/control-plane/portfolio-factory-registry.json'


def portfolio():
    """Discovery only: inclusion never authorises a product or tenant."""
    return {p['productKey']: {'name': p['displayName'], 'repositories': p['repositories'],
            'capability': CAPABILITY, 'activation': 'not_connected'}
            for p in json.loads(REGISTRY.read_text())['products']}


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', value):
        raise ValueError('Invalid identifier')
    return value


def content(value):
    if not isinstance(value, dict) or set(value) != {'title', 'paragraphs'}:
        raise ValueError('Expected title and paragraphs only')
    title, paragraphs = value['title'], value['paragraphs']
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 160:
        raise ValueError('Invalid title')
    if not isinstance(paragraphs, list) or not 1 <= len(paragraphs) <= 20:
        raise ValueError('Expected 1–20 paragraphs')
    for text in [title, *paragraphs]:
        if not isinstance(text, str) or not 1 <= len(text) <= 4000 or any(
                ord(c) < 32 and c not in '\n\t' for c in text):
            raise ValueError('Invalid document text')
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False)
    if len(encoded.encode()) > 40000:
        raise ValueError('Document too large')
    return encoded


def validate_odt(data):
    if not isinstance(data, bytes) or not 1 <= len(data) <= 2_000_000:
        raise ValueError('Invalid output size')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        entries = z.infolist()
        if len(entries) > 30 or sum(x.file_size for x in entries) > 4_000_000:
            raise ValueError('Invalid output archive')
        if any('..' in Path(x.filename).parts or x.filename.startswith('/') for x in entries):
            raise ValueError('Invalid output paths')
        if z.read('mimetype') != b'application/vnd.oasis.opendocument.text':
            raise ValueError('Invalid document type')
        if 'content.xml' not in z.namelist():
            raise ValueError('Missing document content')
    return data


class LibreOfficeHarness:
    """Operator-provisioned executable only; invoke reviewed upstream commands without a shell.

    Run in an OS container with no network or host mounts. This class is NOT a sandbox.
    The executable and installed dependencies must be immutable and pinned by the image.
    """
    def __init__(self, executable, *, reviewed_commit):
        path = Path(executable)
        if not path.is_absolute() or not path.is_file() or reviewed_commit != UPSTREAM_COMMIT:
            raise ValueError('A pinned, reviewed CLI-Anything executable is required')
        self.executable = str(path)

    def render(self, payload):
        content(payload)
        with tempfile.TemporaryDirectory(prefix='oq-cli-') as directory:
            root = Path(directory)
            project, output = root / 'project.json', root / 'draft.odt'
            env = {'HOME': directory, 'TMPDIR': directory, 'LANG': 'C.UTF-8',
                   'PATH': '/usr/bin:/bin', 'PYTHONNOUSERSITE': '1'}
            def invoke(args):
                try:
                    subprocess.run([self.executable, '--json', *args], cwd=directory,
                                   env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, check=True, timeout=5, shell=False)
                except (OSError, subprocess.SubprocessError):
                    raise RuntimeError('Document backend failed') from None
            invoke(['document', 'new', '--type', 'writer', '--name', payload['title'], '-o', str(project)])
            invoke(['--project', str(project), 'writer', 'add-heading', '--text', payload['title']])
            invoke(['--project', str(project), 'writer', 'add-paragraph', '--text',
                    'DRAFT — review before use. This document does not approve or certify its contents.'])
            for paragraph in payload['paragraphs']:
                invoke(['--project', str(project), 'writer', 'add-paragraph', '--text', paragraph])
            invoke(['--project', str(project), 'export', 'render', str(output), '--preset', 'odt'])
            if output.is_symlink() or not output.is_file() or output.stat().st_size > 2_000_000:
                raise RuntimeError('Document output unavailable')
            return validate_odt(output.read_bytes())


class WorkerJobError(RuntimeError):
    def __init__(self, job_id):
        super().__init__('Claimed document job requires review')
        self.job_id = job_id


class Service:
    """Single-host durable pilot. authorise(scope, action) MUST query current server permissions.

    Scope is trusted server context, never a browser-supplied identity. Callbacks must
    check tenant membership, region, active product, entitlement and the operation.
    No default authoriser, backend, enabled tenants or credentials are supplied.
    """
    def __init__(self, database, *, authorise, backend, daily_limit=10):
        if not callable(authorise) or type(daily_limit) is not int or not 1 <= daily_limit <= 100:
            raise ValueError('Explicit authoriser and bounded quota required')
        self.authorise, self.backend, self.daily_limit = authorise, backend, daily_limit
        self.db = connect_private_database(database)
        try:
            self.db.row_factory = sqlite3.Row
            self.db.execute('PRAGMA secure_delete=ON')
            self.db.executescript('''
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY, tenant TEXT NOT NULL, product TEXT NOT NULL, actor TEXT NOT NULL,
              request TEXT NOT NULL, digest TEXT NOT NULL, payload TEXT,
              status TEXT NOT NULL, day TEXT NOT NULL DEFAULT (date('now')), artifact BLOB,
              UNIQUE(tenant,product,request));
            CREATE TABLE IF NOT EXISTS audit (
              id INTEGER PRIMARY KEY, job TEXT NOT NULL, event TEXT NOT NULL,
              at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE INDEX IF NOT EXISTS jobs_scope_day ON jobs(tenant,product,day);
            CREATE INDEX IF NOT EXISTS audit_job ON audit(job,id);
            CREATE INDEX IF NOT EXISTS jobs_scope_state ON jobs(tenant,product,actor,status);
            COMMIT;
            ''')
        except Exception:
            self.db.close()
            raise

    def close(self):
        self.db.close()

    def _scope(self, scope, action):
        if not isinstance(scope, dict) or set(scope) != {'tenant', 'product', 'actor'}:
            raise PermissionError('Invalid server scope')
        for value in scope.values():
            identifier(value)
        if scope['product'] not in portfolio() or self.authorise(dict(scope), action) is not True:
            raise PermissionError('Operation unavailable')

    def _job(self, scope, job):
        row = self.db.execute('SELECT * FROM jobs WHERE id=? AND tenant=? AND product=? AND actor=?',
                              (job, scope['tenant'], scope['product'], scope['actor'])).fetchone()
        if row is None:
            raise PermissionError('Job unavailable')
        return row

    def submit(self, scope, request, payload):
        self._scope(scope, CAPABILITY)
        identifier(request)
        encoded = content(payload)
        digest = hashlib.sha256(encoded.encode()).hexdigest()
        self.db.execute('BEGIN IMMEDIATE')
        try:
            old = self.db.execute('SELECT * FROM jobs WHERE tenant=? AND product=? AND request=?',
                                  (scope['tenant'], scope['product'], request)).fetchone()
            if old:
                if old['digest'] != digest or old['actor'] != scope['actor']:
                    raise ValueError('Request ID conflict')
                job = old['id']
            else:
                count = self.db.execute("SELECT count(*) FROM jobs WHERE tenant=? AND product=? AND day=date('now')",
                                        (scope['tenant'], scope['product'])).fetchone()[0]
                if count >= self.daily_limit:
                    raise ValueError('Daily document allowance exhausted')
                job = str(uuid.uuid4())
                self.db.execute('INSERT INTO jobs(id,tenant,product,actor,request,digest,payload,status) VALUES(?,?,?,?,?,?,?,?)',
                                (job, scope['tenant'], scope['product'], scope['actor'], request, digest, encoded, 'queued'))
                self.db.execute('INSERT INTO audit(job,event) VALUES(?,?)', (job, 'queued'))
            self.db.execute('COMMIT')
            return job
        except Exception:
            self.db.execute('ROLLBACK')
            raise

    def _claim(self, scope, job=None):
        # Execution is a distinct host permission; product HTTP cannot invoke it.
        self._scope(scope, 'document.execute')
        self._scope(scope, CAPABILITY)
        self._scope(scope, 'document.read')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            if job is None:
                row = self.db.execute(
                    "SELECT * FROM jobs WHERE tenant=? AND product=? AND actor=? AND status='queued' "
                    "ORDER BY rowid LIMIT 1", (scope['tenant'], scope['product'], scope['actor'])).fetchone()
                if row is None:
                    self.db.execute('COMMIT')
                    return None
            else:
                row = self._job(scope, job)
            if row['status'] != 'queued':
                raise ValueError('Job is not queued; execution is never automatically retried')
            self.db.execute("UPDATE jobs SET status='running' WHERE id=?", (row['id'],))
            self.db.execute('INSERT INTO audit(job,event) VALUES(?,?)', (row['id'], 'running'))
            self.db.execute('COMMIT')
            return row
        except Exception:
            self.db.execute('ROLLBACK')
            raise

    def _execute(self, scope, row):
        job = row['id']
        try:
            # Revalidate between claim and external work, and again before delivery.
            self._scope(scope, 'document.execute')
            self._scope(scope, CAPABILITY)
            self._scope(scope, 'document.read')
            artifact = validate_odt(self.backend.render(json.loads(row['payload'])))
            self._scope(scope, 'document.execute')
            self._scope(scope, CAPABILITY)
            self._scope(scope, 'document.read')
        except Exception:
            self._finish(job, 'failed', None)
            raise RuntimeError('Document job failed; no artifact released') from None
        self._finish(job, 'completed', artifact)
        return self.status(scope, job)

    def run(self, scope, job):
        identifier(job)
        return self._execute(scope, self._claim(scope, job))

    def run_next(self, scope):
        """Claim and render at most one oldest queued job in an exact approved scope."""
        row = self._claim(scope)
        if row is None:
            return None
        try:
            return self._execute(scope, row)
        except Exception:
            # Preserve claim identity for operator reconciliation, never raw backend errors.
            raise WorkerJobError(row['id']) from None

    def _finish(self, job, state, artifact):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            changed = self.db.execute(
                "UPDATE jobs SET status=?,artifact=?,payload=NULL WHERE id=? AND status='running'",
                (state, artifact, job)).rowcount
            if changed != 1:
                raise RuntimeError('Execution claim is no longer active')
            self.db.execute('INSERT INTO audit(job,event) VALUES(?,?)', (job, state))
            self.db.execute('COMMIT')
        except Exception:
            self.db.execute('ROLLBACK')
            raise

    def status(self, scope, job):
        self._scope(scope, 'document.read')
        row = self._job(scope, job)
        return {'id': row['id'], 'status': row['status'], 'draft': True,
                'sha256': hashlib.sha256(row['artifact']).hexdigest() if row['artifact'] else None}

    def download(self, scope, job):
        self._scope(scope, 'document.read')
        row = self._job(scope, job)
        if row['status'] != 'completed':
            raise ValueError('Artifact not available')
        return bytes(row['artifact'])

    def delete(self, scope, job):
        self._scope(scope, 'document.delete')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            row = self._job(scope, job)
            if row['status'] == 'running':
                raise ValueError('Cannot delete an executing job')
            if row['status'] == 'deleted':
                self.db.execute('COMMIT')
                return
            self.db.execute("UPDATE jobs SET payload=NULL,artifact=NULL,status='deleted' WHERE id=?", (job,))
            self.db.execute('INSERT INTO audit(job,event) VALUES(?,?)', (job, 'deleted'))
            self.db.execute('COMMIT')
        except Exception:
            self.db.execute('ROLLBACK')
            raise


    def list_jobs(self, scope, *, before=None, limit=25):
        """Newest-first keyset page; never includes content, actor or foreign job data."""
        self._scope(scope, 'document.read')
        if type(limit) is not int or not 1 <= limit <= 100:
            raise ValueError('Invalid page size')
        if before is not None and (type(before) is not int or not 1 <= before <= 2**63-1):
            raise ValueError('Invalid cursor')
        rows = self.db.execute(
            'SELECT rowid AS cursor,id,status,day FROM jobs WHERE tenant=? AND product=? AND actor=? '
            'AND rowid < ? ORDER BY rowid DESC LIMIT ?',
            (scope['tenant'], scope['product'], scope['actor'], before or 2**63-1, limit+1)).fetchall()
        return {'jobs': [{'id': r['id'], 'status': r['status'], 'day': r['day'], 'draft': True}
                         for r in rows[:limit]],
                'next': rows[limit-1]['cursor'] if len(rows) > limit else None}

    def history(self, scope, job, *, after=0, limit=25):
        self._scope(scope, 'document.read')
        self._job(scope, job)
        if type(after) is not int or not 0 <= after < 2**63-1 or type(limit) is not int or not 1 <= limit <= 100:
            raise ValueError('Invalid history page')
        rows = self.db.execute('SELECT id,event,at FROM audit WHERE job=? AND id>? ORDER BY id LIMIT ?',
                               (job, after, limit+1)).fetchall()
        return {'events': [dict(r) for r in rows[:limit]],
                'next': rows[limit-1]['id'] if len(rows) > limit else None}

    def reconcile_interrupted(self, scope, job):
        """Operator-only terminal recovery after ten minutes. Never retries external execution."""
        self._scope(scope, 'document.reconcile')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            row = self._job(scope, job)
            started = self.db.execute(
                "SELECT at <= datetime('now','-10 minutes') FROM audit "
                "WHERE job=? AND event='running' ORDER BY id DESC LIMIT 1", (job,)).fetchone()
            if row['status'] != 'running' or not started or started[0] != 1:
                raise ValueError('Job is not eligible for interrupted recovery')
            self.db.execute("UPDATE jobs SET status='interrupted',payload=NULL,artifact=NULL WHERE id=?", (job,))
            self.db.execute('INSERT INTO audit(job,event) VALUES(?,?)', (job, 'interrupted'))
            self.db.execute('COMMIT')
        except Exception:
            self.db.execute('ROLLBACK')
            raise

    def expire(self, scope, *, days=7):
        """Explicit host maintenance; clear at most 100 old non-running jobs, retaining tombstones."""
        self._scope(scope, 'document.retention')
        if type(days) is not int or not 1 <= days <= 90:
            raise ValueError('Retention must be 1–90 days')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            rows = self.db.execute(
                "SELECT id FROM jobs WHERE tenant=? AND product=? AND actor=? "
                "AND day < date('now',?) AND status NOT IN ('running','deleted','expired') "
                "ORDER BY rowid LIMIT 100",
                (scope['tenant'], scope['product'], scope['actor'], f'-{days} days')).fetchall()
            for row in rows:
                self.db.execute("UPDATE jobs SET status='expired',payload=NULL,artifact=NULL WHERE id=?", (row['id'],))
                self.db.execute('INSERT INTO audit(job,event) VALUES(?,?)', (row['id'], 'expired'))
            self.db.execute('COMMIT')
            return len(rows)
        except Exception:
            self.db.execute('ROLLBACK')
            raise
