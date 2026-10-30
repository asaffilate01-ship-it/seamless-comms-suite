from concurrent.futures import ThreadPoolExecutor
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.request
from wsgiref.simple_server import make_server, WSGIRequestHandler
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from automation import Service, WorkerJobError, LibreOfficeHarness, UPSTREAM_COMMIT
from worker import WorkerPassError, run_once
from wsgi_app import create_app
from test_automation import Backend, odt

class Quiet(WSGIRequestHandler):
    def log_message(self,*args): pass

class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.db=Path(self.tmp.name)/'jobs.db'
        self.scope={'tenant':'a','product':'kindelo','actor':'user'}
        self.other={**self.scope,'tenant':'b'}
        self.backend=Backend();self.authorise=lambda s,a:True
        self.service=self.factory()
    def tearDown(self):
        self.service.close();self.tmp.cleanup()
    def factory(self):
        return Service(self.db,authorise=self.authorise,backend=self.backend,daily_limit=100)
    def submit(self,key,scope=None):
        return self.service.submit(scope or self.scope,key,{'title':key,'paragraphs':['Synthetic text']})
    def pass_once(self,scopes=None,**kw):
        return run_once(service_factory=self.factory,approved_scopes=scopes or [self.scope],enabled=True,**kw)
    def test_disabled_duplicate_or_invalid_scopes_cannot_execute(self):
        self.submit('first')
        with self.assertRaises(ValueError): self.service.run(self.scope,None)
        with self.assertRaises(PermissionError): run_once(service_factory=self.factory,approved_scopes=[self.scope])
        for scopes in [[self.scope,self.scope],[{**self.scope,'actor':'../escape'}],[{**self.scope,'product':'unknown'}],[self.scope]*11,[]]:
            with self.assertRaises(ValueError): run_once(service_factory=self.factory,approved_scopes=scopes,enabled=True)
        self.assertEqual(self.backend.calls,0)
    def test_fifo_one_per_scope_and_no_implicit_cross_scope_discovery(self):
        first=self.submit('first');second=self.submit('second');foreign=self.submit('foreign',self.other)
        result=self.pass_once()
        self.assertEqual(result[0]['jobId'],first);self.assertEqual(result[0]['outcome'],'completed')
        self.assertEqual(self.service.status(self.scope,second)['status'],'queued')
        self.assertEqual(self.service.status(self.other,foreign)['status'],'queued')
        self.assertEqual(self.pass_once()[0]['jobId'],second)
        self.assertEqual(self.pass_once()[0]['outcome'],'idle')
    def test_concurrent_workers_claim_each_job_only_once(self):
        jobs=[self.submit(str(i)) for i in range(6)]
        barrier=threading.Barrier(8)
        def invoke(_):
            barrier.wait();return self.pass_once()[0]
        with ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(invoke,range(8)))
        completed=[r['jobId'] for r in results if r['outcome']=='completed']
        self.assertCountEqual(completed,jobs);self.assertEqual(len(set(completed)),6)
        self.assertEqual(self.backend.calls,6)
    def test_submission_permission_does_not_grant_execution(self):
        job=self.submit('first');self.authorise=lambda s,a:a!='document.execute'
        result=self.pass_once()
        self.assertEqual(result[0]['outcome'],'blocked');self.assertEqual(self.backend.calls,0)
        self.assertEqual(self.service.status(self.scope,job)['status'],'queued')
        self.service.authorise=self.authorise
        with self.assertRaises(PermissionError):self.service.run(self.scope,job)
    def test_revoked_execution_after_claim_prevents_rendering(self):
        job=self.submit('first');checks=0
        def authorise(scope,action):
            nonlocal checks
            if action=='document.execute': checks+=1;return checks<2
            return True
        self.authorise=authorise
        result=self.pass_once()[0]
        self.assertEqual(result['outcome'],'needs_review');self.assertEqual(result['jobId'],job)
        self.assertEqual(self.backend.calls,0)
        self.assertEqual(self.service.status(self.scope,job)['status'],'failed')
    def test_revoked_execution_during_render_blocks_artifact(self):
        job=self.submit('first');allowed=True
        def authorise(scope,action):return action!='document.execute' or allowed
        def render(payload):
            nonlocal allowed
            allowed=False;return odt()
        self.authorise=authorise;self.backend.render=render
        self.assertEqual(self.pass_once()[0]['outcome'],'needs_review')
        with self.assertRaises(ValueError):self.service.download(self.scope,job)
    def test_backend_failure_returns_claim_identity_without_retry(self):
        job=self.submit('first')
        def fail(payload):raise ValueError('SECRET backend failure')
        self.backend.render=fail
        result=self.pass_once()
        self.assertEqual(result[0]['jobId'],job);self.assertEqual(result[0]['outcome'],'needs_review')
        self.assertNotIn('SECRET',json.dumps(result));self.assertEqual(self.pass_once()[0]['outcome'],'idle')
    def test_process_interruption_leaves_running_job_for_operator_recovery(self):
        class Crash(BaseException):pass
        job=self.submit('first')
        def crash(payload):raise Crash()
        self.backend.render=crash
        with self.assertRaises(Crash):self.pass_once()
        self.assertEqual(self.service.status(self.scope,job)['status'],'running')
        self.assertEqual(self.pass_once()[0]['outcome'],'idle')
    def test_failed_stop_check_preserves_completed_receipt_and_leaves_next_job_queued(self):
        first = self.submit('first')
        second = self.submit('second', self.other)
        calls = 0
        def stop():
            nonlocal calls
            calls += 1
            if calls > 1: raise OSError('private stop path')
            return False
        with self.assertRaises(WorkerPassError) as caught:
            self.pass_once([self.scope, self.other], should_stop=stop)
        self.assertEqual(caught.exception.results, [{'scope': self.scope, 'outcome': 'completed', 'jobId': first}])
        self.assertEqual(str(caught.exception), 'Worker stop check unavailable')
        self.assertEqual(self.service.status(self.scope, first)['status'], 'completed')
        self.assertEqual(self.service.status(self.other, second)['status'], 'queued')
        self.assertEqual(self.backend.calls, 1)

    def test_partial_failure_preserves_blocked_result_without_claiming_next_scope(self):
        first = self.submit('first')
        self.authorise = lambda *_: False
        calls = 0
        def stop():
            nonlocal calls
            calls += 1
            if calls > 1: raise RuntimeError('secret')
            return False
        with self.assertRaises(WorkerPassError) as caught:
            self.pass_once([self.scope, self.other], should_stop=stop)
        self.assertEqual(caught.exception.results, [{'scope': self.scope, 'outcome': 'blocked', 'jobId': None}])
        self.assertEqual(self.service.status(self.scope, first)['status'], 'queued')

    def test_stop_callback_stops_between_scopes_and_failure_is_redacted(self):
        first=self.submit('first');second=self.submit('second',self.other);checks=0
        def stop():
            nonlocal checks
            checks+=1;return checks>1
        self.assertEqual(len(self.pass_once([self.scope,self.other],should_stop=stop)),1)
        self.assertEqual(self.service.status(self.other,second)['status'],'queued')
        def broken():raise RuntimeError('SECRET')
        with self.assertRaisesRegex(RuntimeError,'^Worker stop check unavailable$'):
            self.pass_once(should_stop=broken)
    def test_scope_failure_does_not_block_next_approved_scope(self):
        self.submit('first');second=self.submit('second',self.other)
        self.authorise=lambda s,a:s['tenant']=='b'
        result=self.pass_once([self.scope,self.other])
        self.assertEqual([r['outcome'] for r in result],['blocked','completed'])
        self.assertEqual(result[1]['jobId'],second)
    def test_all_connections_close_including_failed_jobs(self):
        self.submit('first');opened=[]
        def factory():
            service=self.factory();opened.append(service);return service
        run_once(service_factory=factory,approved_scopes=[self.scope,self.other],enabled=True)
        for service in opened:
            with self.assertRaises(Exception):service.db.execute('SELECT 1')
    def test_http_submission_worker_pass_and_http_download(self):
        # A real HTTP request queues the work; only the private worker renders it.
        executable=os.environ.get('CLI_ANYTHING_TEST_EXECUTABLE')
        if executable:self.backend=LibreOfficeHarness(executable,reviewed_commit=UPSTREAM_COMMIT)
        def verify(token):
            if token!='synthetic':raise PermissionError()
            return dict(self.scope)
        server=make_server('127.0.0.1',0,create_app(service_factory=self.factory,verify_bearer=verify),handler_class=Quiet)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            origin=f'http://127.0.0.1:{server.server_port}'
            def request(path,data=None):
                req=urllib.request.Request(origin+path,data=data,headers={'Authorization':'Bearer synthetic','Content-Type':'application/json'})
                with urllib.request.urlopen(req,timeout=5) as response:return response.read()
            payload=json.dumps({'requestId':'http','document':{'title':'HTTP worker draft','paragraphs':['Synthetic only']}}).encode()
            job=json.loads(request('/v1/documents',payload))['id']
            self.assertEqual(json.loads(request('/v1/documents/'+job))['status'],'queued')
            self.assertEqual(self.pass_once()[0]['jobId'],job)
            self.assertEqual(json.loads(request('/v1/documents/'+job))['status'],'completed')
            self.assertTrue(request('/v1/documents/'+job+'/artifact').startswith(b'PK'))
        finally:
            server.shutdown();thread.join(timeout=2);server.server_close()

if __name__=='__main__':unittest.main()
