import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from automation import Service
from test_automation import Backend
from worker_command import execute, load_config, main, pass_lock

ROOT = Path(__file__).resolve().parents[1]
COMMAND = ROOT / 'worker_command.py'


class WorkerCommandTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.path = self.root / 'config.json'
        self.scope = {'tenant': 'synthetic', 'product': 'kindelo', 'actor': 'test-user'}
        self.config = {'enabled': True, 'factory': 'test_factory:service', 'scopes': [self.scope],
                       'stopFile': str(self.root / 'stop'), 'lockFile': str(self.root / 'lock')}
        self.save()
    def tearDown(self):
        self.tmp.cleanup()
    def save(self):
        self.path.write_text(json.dumps(self.config)); self.path.chmod(0o600)
    def run_cli(self, mode='--run'):
        return subprocess.run([sys.executable, str(COMMAND), '--config', str(self.path), mode],
                              capture_output=True, text=True, timeout=10, env=self.environment())
    def environment(self):
        return {**os.environ, 'PYTHONPATH': os.pathsep.join([str(self.root), str(ROOT), str(ROOT / 'tests')])}
    def loader(self, factory):
        return lambda _: factory

    def test_check_validates_without_importing_factory_or_creating_lock(self):
        self.config['factory'] = 'nonexistent_module:factory'; self.config['enabled'] = False; self.save()
        result = self.run_cli('--check')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), {'status': 'configuration_valid', 'enabled': False,
                                                    'scopeCount': 1, 'runtimeVerified': False})
        self.assertFalse(Path(self.config['lockFile']).exists())

    def test_invalid_config_rejected_before_any_factory(self):
        cases = [dict(self.config, enabled='true'), dict(self.config, factory='module:run()'),
                 dict(self.config, scopes=[self.scope, self.scope]), dict(self.config, scopes=[]),
                 dict(self.config, scopes=[{**self.scope, 'product': 'not-a-product'}]),
                 dict(self.config, stopFile='relative'), dict(self.config, lockFile=str(self.path)),
                 dict(self.config, stopFile=self.config['lockFile']), dict(self.config, secret='must-not-print')]
        for value in cases:
            self.path.write_text(json.dumps(value))
            with self.assertRaises(Exception): load_config(str(self.path))
        for raw in ['{"enabled":true,"enabled":false}', 'x' * 16001]:
            self.path.write_text(raw)
            with self.assertRaises(Exception): load_config(str(self.path))

    def test_config_permissions_symlinks_and_fifo_rejected_without_blocking(self):
        self.path.chmod(0o644)
        with self.assertRaises(ValueError): load_config(str(self.path))
        self.path.chmod(0o600)
        link = self.root / 'link'; link.symlink_to(self.path)
        with self.assertRaises(OSError): load_config(str(link))
        hard = self.root / 'hard'; os.link(self.path, hard)
        with self.assertRaises(ValueError): load_config(str(hard))
        hard.unlink()
        fifo = self.root / 'fifo'; os.mkfifo(fifo, 0o600)
        with self.assertRaises(ValueError): load_config(str(fifo))

    def test_disabled_and_stop_file_prevent_factory_import(self):
        def unexpected(_): self.fail('Factory must not be imported')
        self.assertEqual(execute({**self.config, 'enabled': False}, factory_loader=unexpected)[0], 2)
        Path(self.config['stopFile']).symlink_to(self.root / 'absent')
        self.assertEqual(execute(self.config, factory_loader=unexpected)[0], 4)
        self.assertEqual(execute(self.config, stop_requested=lambda: True, factory_loader=unexpected)[0], 4)

    def test_busy_lock_prevents_import_and_is_reusable(self):
        with pass_lock(self.config['lockFile']):
            code, receipt = execute(self.config, factory_loader=lambda _: self.fail('imported'))
            self.assertEqual((code, receipt['status']), (5, 'busy'))
        with pass_lock(self.config['lockFile']): pass
        self.assertEqual(Path(self.config['lockFile']).stat().st_mode & 0o777, 0o600)

    def test_unsafe_lock_cannot_be_used(self):
        lock = Path(self.config['lockFile']); lock.symlink_to(self.path)
        self.assertEqual(execute(self.config)[0], 1)
        lock.unlink(); lock.write_text(''); lock.chmod(0o666)
        self.assertEqual(execute(self.config)[0], 1)

    def test_stop_between_jobs_preserves_completed_receipt_and_closes(self):
        self.config['scopes'].append({**self.scope, 'actor': 'second'})
        closed = []
        class Fake:
            def run_next(inner, scope):
                Path(self.config['stopFile']).touch()
                return {'id': 'synthetic-job'}
            def close(inner): closed.append(True)
        code, receipt = execute(self.config, factory_loader=self.loader(Fake))
        self.assertEqual(code, 4); self.assertEqual(len(receipt['results']), 1)
        self.assertEqual(receipt['results'][0]['outcome'], 'completed'); self.assertEqual(closed, [True])

    def test_permission_failures_need_review_and_errors_are_redacted(self):
        class Denied:
            def run_next(inner, scope): raise PermissionError('private-token')
            def close(inner): pass
        code, receipt = execute(self.config, factory_loader=self.loader(Denied))
        self.assertEqual(code, 3); self.assertNotIn('private-token', json.dumps(receipt))
        def broken(_): raise RuntimeError('private-token')
        self.assertEqual(execute(self.config, factory_loader=broken), (1, {'status': 'unavailable', 'results': []}))

    def test_real_process_drains_one_job_and_preserves_idempotency(self):
        database = self.root / 'jobs.db'
        with_service = Service(database, authorise=lambda *_: True, backend=Backend())
        try:
            first = with_service.submit(self.scope, 'first', {'title': 'Synthetic', 'paragraphs': ['Test only']})
            second = with_service.submit(self.scope, 'second', {'title': 'Synthetic', 'paragraphs': ['Test only']})
            (self.root / 'test_factory.py').write_text(
                'from automation import Service\nfrom test_automation import Backend\n'
                f'def service(): return Service({str(database)!r}, authorise=lambda *_: True, backend=Backend())\n')
            result = self.run_cli(); self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['results'][0]['jobId'], first)
            self.assertEqual(with_service.status(self.scope, first)['status'], 'completed')
            self.assertEqual(with_service.status(self.scope, second)['status'], 'queued')
            self.assertEqual(with_service.submit(self.scope, 'first', {'title': 'Synthetic', 'paragraphs': ['Test only']}), first)
        finally: with_service.close()

    def test_sigterm_finishes_current_scope_and_stops_before_next(self):
        self.config['scopes'].append({**self.scope, 'actor': 'second'}); self.save()
        ready = self.root / 'ready'
        (self.root / 'test_factory.py').write_text(
            'import time\nfrom pathlib import Path\nclass Worker:\n'
            f' def run_next(self, scope):\n  Path({str(ready)!r}).touch()\n  time.sleep(1)\n  return None\n'
            ' def close(self): pass\ndef service(): return Worker()\n')
        process = subprocess.Popen([sys.executable, str(COMMAND), '--config', str(self.path), '--run'],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=self.environment())
        try:
            deadline = time.monotonic() + 5
            while not ready.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue(ready.exists()); process.send_signal(signal.SIGTERM)
            out, err = process.communicate(timeout=5)
            self.assertEqual(process.returncode, 4, err)
            self.assertEqual(len(json.loads(out)['results']), 1)
            with pass_lock(self.config['lockFile']): pass
        finally:
            if process.poll() is None: process.kill(); process.communicate()

    def test_main_redacts_invalid_configuration(self):
        output = io.StringIO()
        with redirect_stdout(output): code = main(['--config', '/missing/private-token', '--run'])
        self.assertEqual(code, 2); self.assertNotIn('private-token', output.getvalue())


if __name__ == '__main__': unittest.main()
