import json
import sys
from pathlib import Path
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from automation import Service
from product_api import ProductAPI
from test_automation import Backend, odt


class Lifecycle(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.scope = dict(tenant='tenant-a', product='kindelo', actor='user-a')
        self.payload = dict(title='Draft', paragraphs=['Private fact'])
        self.allowed = True
        self.backend = Backend()
        self.service = Service(Path(self.tmp.name)/'jobs.db', authorise=lambda s,a:self.allowed,
                               backend=self.backend, daily_limit=100)
        def verify(token):
            if token != 'valid': raise PermissionError('secret verifier internals')
            return dict(self.scope)
        self.api = ProductAPI(service=self.service, verify_bearer=verify)
        self.headers = {'authorization':'Bearer valid', 'content-type':'application/json'}
    def tearDown(self):
        self.service.close()
        self.tmp.cleanup()
    def submit(self, request='first', scope=None):
        return self.service.submit(scope or self.scope, request, self.payload)
    def call(self, method='GET', path='/v1/documents', body=b'', headers=None):
        return self.api.handle(method, path, self.headers if headers is None else headers, body)
    def make_stale(self, job):
        self.service.db.execute("UPDATE jobs SET status='running' WHERE id=?", (job,))
        self.service.db.execute("INSERT INTO audit(job,event,at) VALUES(?,'running',datetime('now','-11 minutes'))", (job,))
    def test_list_keyset_pages_remain_isolated_during_new_insert(self):
        ids = [self.submit(str(i)) for i in range(4)]
        foreign = {**self.scope,'tenant':'other'}
        self.submit('foreign', foreign)
        first = self.service.list_jobs(self.scope, limit=2)
        self.submit('new')
        second = self.service.list_jobs(self.scope, limit=2, before=first['next'])
        self.assertEqual([x['id'] for x in first['jobs']+second['jobs']], list(reversed(ids)))
        self.assertIsNone(second['next'])
        self.assertNotIn('Private fact', json.dumps(first))
    def test_history_is_paginated_and_foreign_jobs_denied(self):
        job = self.submit()
        self.service.run(self.scope, job)
        first = self.service.history(self.scope, job, limit=2)
        last = self.service.history(self.scope, job, after=first['next'])
        self.assertEqual([x['event'] for x in first['events']+last['events']], ['queued','running','completed'])
        with self.assertRaises(PermissionError): self.service.history({**self.scope,'actor':'other'},job)
    def test_delete_is_idempotent_and_cannot_flood_audit(self):
        job = self.submit()
        for _ in range(10): self.service.delete(self.scope, job)
        self.assertEqual(len(self.service.history(self.scope,job)['events']), 2)
    def test_recovery_requires_stale_running_job_and_separate_permission(self):
        job = self.submit()
        with self.assertRaises(ValueError): self.service.reconcile_interrupted(self.scope,job)
        self.make_stale(job)
        self.service.authorise = lambda s,a:a != 'document.reconcile'
        with self.assertRaises(PermissionError): self.service.reconcile_interrupted(self.scope,job)
        self.service.authorise = lambda s,a:True
        self.service.reconcile_interrupted(self.scope,job)
        self.assertEqual(self.service.status(self.scope,job)['status'],'interrupted')
        with self.assertRaises(ValueError): self.service.run(self.scope,job)
    def test_recent_running_job_cannot_be_recovered(self):
        job = self.submit()
        self.make_stale(job)
        self.service.db.execute("UPDATE audit SET at=CURRENT_TIMESTAMP WHERE event='running'")
        with self.assertRaises(ValueError): self.service.reconcile_interrupted(self.scope,job)
    def test_late_worker_completion_cannot_resurrect_recovered_job(self):
        job = self.submit()
        def render(payload):
            self.service.db.execute("UPDATE audit SET at=datetime('now','-11 minutes') WHERE event='running'")
            self.service.reconcile_interrupted(self.scope,job)
            return odt()
        self.backend.render = render
        with self.assertRaises(RuntimeError): self.service.run(self.scope,job)
        self.assertEqual(self.service.status(self.scope,job)['status'],'interrupted')
        with self.assertRaises(ValueError): self.service.download(self.scope,job)
    def test_expiry_clears_content_excludes_running_and_foreign_and_retains_dedup(self):
        old = self.submit('old'); active=self.submit('active')
        foreign=self.submit('foreign', {**self.scope,'product':'haccora'})
        self.service.run(self.scope,old)
        self.make_stale(active)
        self.service.db.execute("UPDATE jobs SET day=date('now','-8 days')")
        self.assertEqual(self.service.expire(self.scope),1)
        self.assertEqual(self.service.status(self.scope,old)['status'],'expired')
        self.assertEqual(self.service.status(self.scope,active)['status'],'running')
        self.assertEqual(self.submit('old'),old)
        row=self.service.db.execute('SELECT payload,artifact FROM jobs WHERE id=?',(old,)).fetchone()
        self.assertEqual(tuple(row),(None,None))
        self.assertEqual(self.service.expire(self.scope),0)
    def test_invalid_pagination_and_retention(self):
        for value in [True,0,-1,101,'1']:
            with self.assertRaises(ValueError): self.service.list_jobs(self.scope,limit=value)
        for value in [True,0,91,'7']:
            with self.assertRaises(ValueError): self.service.expire(self.scope,days=value)
    def test_authentication_fail_closed_and_no_cookie_fallback(self):
        for headers in [{},{'cookie':'session=valid'},{'authorization':'Bearer wrong'}]:
            status,_,body=self.call(headers=headers)
            self.assertEqual(status,401)
            self.assertNotIn(b'secret',body)
        self.assertEqual(self.backend.calls,0)
    def test_submit_status_download_and_delete_through_api(self):
        payload=json.dumps({'requestId':'one','document':self.payload}).encode()
        status,_,body=self.call('POST',body=payload)
        self.assertEqual(status,200)
        job=json.loads(body)['id']
        self.assertEqual(self.call('POST',body=payload)[2],body)
        self.service.run(self.scope,job)
        status,headers,artifact=self.call(path=f'/v1/documents/{job}/artifact')
        self.assertEqual(status,200)
        self.assertEqual(artifact,odt())
        self.assertEqual(headers['cache-control'],'private, no-store')
        self.assertIn('attachment',headers['content-disposition'])
        self.assertEqual(self.call('DELETE',f'/v1/documents/{job}')[0],200)
        self.assertEqual(self.call(path=f'/v1/documents/{job}/artifact')[0],400)
    def test_api_scope_injection_and_worker_methods_are_rejected(self):
        payload={'requestId':'one','document':self.payload,'tenant':'other'}
        self.assertEqual(self.call('POST',body=json.dumps(payload).encode())[0],400)
        job=self.submit()
        for action in ['run','reconcile','expire']:
            self.assertEqual(self.call('POST',f'/v1/documents/{job}/{action}')[0],404)
        self.assertEqual(self.backend.calls,0)
    def test_api_revocation_and_foreign_job_denied(self):
        foreign=self.submit('foreign',{**self.scope,'tenant':'other'})
        self.assertEqual(self.call(path=f'/v1/documents/{foreign}')[0],403)
        self.allowed=False
        self.assertEqual(self.call()[0],403)
    def test_api_pagination_and_bad_queries(self):
        for i in range(3): self.submit(str(i))
        status,_,body=self.call(path='/v1/documents?limit=2')
        self.assertEqual(status,200)
        cursor=json.loads(body)['next']
        self.assertEqual(len(json.loads(self.call(path=f'/v1/documents?before={cursor}')[2])['jobs']),1)
        for path in ['/v1/documents?limit=2&limit=3','/v1/documents?tenant=1','/v1/documents?limit=0',
                     '/v1/documents?limit=abc','https://example.com/v1/documents']:
            self.assertEqual(self.call(path=path)[0],400)
    def test_api_size_content_type_and_failure_redaction(self):
        self.assertEqual(self.call('POST',body=b'x'*64001)[0],413)
        self.assertEqual(self.call('POST',headers={'authorization':'Bearer valid'},body=b'{}')[0],415)
        self.assertEqual(self.call('POST',body=b'{')[0],400)
        def fail(*args,**kwargs): raise RuntimeError('SECRET DATABASE PASSWORD')
        self.service.list_jobs=fail
        status,_,body=self.call()
        self.assertEqual(status,503)
        self.assertNotIn(b'SECRET',body)

if __name__=='__main__': unittest.main()
