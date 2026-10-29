import io
from concurrent.futures import ThreadPoolExecutor
import threading
import subprocess
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from automation import Service, LibreOfficeHarness, UPSTREAM_COMMIT, portfolio, content


def odt():
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w') as z:
        z.writestr('mimetype', 'application/vnd.oasis.opendocument.text')
        z.writestr('content.xml', '<document/>')
    return b.getvalue()


class Backend:
    calls = 0
    def render(self, payload):
        self.calls += 1
        return odt()


class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.backend = Backend()
        self.enabled = True
        self.scope = dict(tenant='tenant-a', product='kindelo', actor='user-a')
        self.payload = dict(title='Inspection draft', paragraphs=['Verified source records only.'])
        self.service = Service(Path(self.tmp.name) / 'jobs.db', authorise=lambda s,a: self.enabled,
                               backend=self.backend, daily_limit=2)
    def tearDown(self):
        self.service.close()
        self.tmp.cleanup()
    def submit(self, request='event-1'):
        return self.service.submit(self.scope, request, self.payload)
    def test_success_receipt_and_payload_clearance(self):
        job = self.submit()
        result = self.service.run(self.scope, job)
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(len(result['sha256']), 64)
        self.assertEqual(self.service.download(self.scope, job), odt())
        row = self.service.db.execute('SELECT payload FROM jobs').fetchone()
        self.assertIsNone(row[0])
        self.assertEqual([x[0] for x in self.service.db.execute('SELECT event FROM audit')],
                         ['queued', 'running', 'completed'])
    def test_retry_deduplicates_and_conflict_denies(self):
        job = self.submit()
        self.assertEqual(self.submit(), job)
        with self.assertRaises(ValueError):
            self.service.submit(self.scope, 'event-1', dict(title='Different', paragraphs=['x']))
        self.service.run(self.scope, job)
        with self.assertRaises(ValueError): self.service.run(self.scope, job)
        self.assertEqual(self.backend.calls, 1)
    def test_tenant_product_actor_isolation(self):
        job = self.submit()
        for field, value in [('tenant','tenant-b'), ('product','haccora'), ('actor','user-b')]:
            foreign = {**self.scope, field:value}
            for operation in [self.service.status, self.service.run, self.service.download, self.service.delete]:
                with self.assertRaises(PermissionError): operation(foreign, job)
        self.assertEqual(self.backend.calls, 0)
    def test_revocation_before_execution(self):
        job = self.submit()
        self.enabled = False
        with self.assertRaises(PermissionError): self.service.run(self.scope, job)
        self.assertEqual(self.backend.calls, 0)
    def test_revocation_during_execution(self):
        job = self.submit()
        def render(payload):
            self.enabled = False
            return odt()
        self.backend.render = render
        with self.assertRaises(RuntimeError): self.service.run(self.scope, job)
        self.enabled = True
        self.assertEqual(self.service.status(self.scope, job)['status'], 'failed')
        with self.assertRaises(ValueError): self.service.download(self.scope, job)
    def test_quota_and_deleted_requests_still_count(self):
        first = self.submit()
        self.service.delete(self.scope, first)
        self.submit('event-2')
        with self.assertRaises(ValueError): self.submit('event-3')
        with self.assertRaises(ValueError): self.service.download(self.scope, first)
    def test_failure_is_redacted_and_never_automatically_retried(self):
        job = self.submit()
        def fail(payload): raise ValueError('SECRET-TOKEN')
        self.backend.render = fail
        with self.assertRaisesRegex(RuntimeError, '^Document job failed; no artifact released$'):
            self.service.run(self.scope, job)
        with self.assertRaises(ValueError): self.service.run(self.scope, job)
        self.assertNotIn('SECRET', str(list(self.service.db.execute('SELECT * FROM audit'))))
    def test_arbitrary_commands_paths_and_input_limits(self):
        for value in [{**self.payload, 'command':'rm'}, {'title':'x','paragraphs':['x']*21},
                      {'title':'x','paragraphs':['\0']}, {'title':'x','paragraphs':['x'*4001]}]:
            with self.assertRaises(ValueError): content(value)
        with self.assertRaises(PermissionError):
            self.service.submit({**self.scope, 'product':'unknown'}, 'a', self.payload)
        with self.assertRaises(ValueError): self.submit('../escape')
    def test_all_catalogue_products_use_same_scoped_contract(self):
        for product in portfolio():
            scope = {**self.scope, 'product': product}
            job = self.service.submit(scope, 'portfolio-example', self.payload)
            self.assertEqual(self.service.run(scope, job)['status'], 'completed')
    def test_database_persistence_and_claim_across_instances(self):
        job = self.submit()
        other = Service(Path(self.tmp.name) / 'jobs.db', authorise=lambda s,a:True, backend=self.backend)
        try:
            other.run(self.scope, job)
            with self.assertRaises(ValueError): self.service.run(self.scope, job)
        finally: other.close()
        self.assertEqual(self.backend.calls, 1)
    def test_concurrent_quota_is_atomic(self):
        barrier = threading.Barrier(3)
        def submit(index):
            service = Service(Path(self.tmp.name) / 'jobs.db', authorise=lambda s,a:True,
                              backend=Backend(), daily_limit=2)
            try:
                barrier.wait()
                return service.submit(self.scope, f'concurrent-{index}', self.payload)
            except ValueError:
                return None
            finally:
                service.close()
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(submit, range(3)))
        self.assertEqual(sum(x is not None for x in results), 2)

    def test_backend_timeout_is_redacted(self):
        executable = Path(self.tmp.name) / 'fake-cli'
        executable.touch()
        backend = LibreOfficeHarness(str(executable), reviewed_commit=UPSTREAM_COMMIT)
        with patch('automation.subprocess.run', side_effect=subprocess.TimeoutExpired('secret', 5)):
            with self.assertRaisesRegex(RuntimeError, '^Document backend failed$'):
                backend.render(self.payload)

    def test_invalid_artifact_is_not_completed(self):
        job = self.submit()
        self.backend.render = lambda payload:b'not an ODT'
        with self.assertRaises(RuntimeError): self.service.run(self.scope, job)
        self.assertEqual(self.service.status(self.scope, job)['status'], 'failed')
    def test_no_shell_and_no_inherited_secrets(self):
        executable = Path(self.tmp.name) / 'fake-cli'
        executable.touch()
        backend = LibreOfficeHarness(str(executable), reviewed_commit=UPSTREAM_COMMIT)
        calls = []
        def fake_run(argv, **kwargs):
            calls.append((argv, kwargs))
            if 'render' in argv: Path(argv[argv.index('render')+1]).write_bytes(odt())
        with patch('automation.subprocess.run', fake_run), patch.dict(os.environ, {'SECRET':'hidden'}):
            backend.render(dict(title='$(touch /tmp/bad)', paragraphs=['; rm -rf /']))
        self.assertTrue(all(k['shell'] is False and 'SECRET' not in k['env'] for _,k in calls))
        self.assertIn('$(touch /tmp/bad)', calls[0][0])


@unittest.skipUnless(os.environ.get('CLI_ANYTHING_TEST_EXECUTABLE'), 'Opt-in installed upstream E2E')
class RealHarness(unittest.TestCase):
    def test_actual_upstream_creates_draft_odt(self):
        backend = LibreOfficeHarness(os.environ['CLI_ANYTHING_TEST_EXECUTABLE'], reviewed_commit=UPSTREAM_COMMIT)
        artifact = backend.render(dict(title='Portfolio acceptance', paragraphs=['Synthetic tenant data.', '<test> & literal text']))
        with zipfile.ZipFile(io.BytesIO(artifact)) as z:
            xml = z.read('content.xml').decode()
            self.assertIn('Portfolio acceptance', xml)
            self.assertIn('DRAFT', xml)
            self.assertIn('&lt;test&gt;', xml)

if __name__ == '__main__': unittest.main()
