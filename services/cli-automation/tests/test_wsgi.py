import io
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from wsgi_app import create_app


class FakeService:
    def __init__(self): self.closed = False
    def close(self): self.closed = True
    def list_jobs(self, scope): return {'jobs':[], 'next':None}


class WsgiTests(unittest.TestCase):
    def setUp(self):
        self.services=[]
        def factory():
            service=FakeService(); self.services.append(service); return service
        self.app=create_app(service_factory=factory, verify_bearer=lambda token: {'tenant':'a','product':'kindelo','actor':'u'})
    def call(self, **extra):
        env={'REQUEST_METHOD':'GET','PATH_INFO':'/v1/documents','HTTP_AUTHORIZATION':'Bearer valid',
             'wsgi.input':io.BytesIO(b''), **extra}
        response=[]
        body=b''.join(self.app(env,lambda status,headers:response.extend([status,dict(headers)])))
        return response[0],response[1],body
    def test_closes_connection_and_sets_exact_length(self):
        status,headers,body=self.call()
        self.assertEqual(status,'200 OK')
        self.assertEqual(int(headers['content-length']),len(body))
        self.assertTrue(self.services[0].closed)
    def test_factory_is_per_request(self):
        self.call(); self.call()
        self.assertEqual(len(self.services),2)
        self.assertTrue(all(s.closed for s in self.services))
    def test_rejects_ambiguous_length_chunked_oversized_without_reading(self):
        class MustNotRead:
            def read(self,size): raise AssertionError('must not read')
        for env,code in [({'CONTENT_LENGTH':'64001'},413),({'CONTENT_LENGTH':'1,2'},400),
                         ({'CONTENT_LENGTH':'1','HTTP_TRANSFER_ENCODING':'chunked'},400),
                         ({'REQUEST_METHOD':'POST'},411),({'CONTENT_LENGTH':'-1'},400)]:
            status,_,_=self.call(**{'wsgi.input':MustNotRead(),**env})
            self.assertTrue(status.startswith(str(code)))
        self.assertEqual(self.services,[])
    def test_truncated_body_is_rejected(self):
        status,_,_=self.call(CONTENT_LENGTH='3',**{'wsgi.input':io.BytesIO(b'a')})
        self.assertTrue(status.startswith('400'))
        self.assertEqual(self.services,[])
    def test_errors_are_private_and_connection_closes(self):
        def fail(scope): raise RuntimeError('private password')
        def factory():
            s=FakeService(); s.list_jobs=fail; self.services.append(s); return s
        self.app=create_app(service_factory=factory,verify_bearer=lambda t: {'tenant':'a','product':'kindelo','actor':'u'})
        status,headers,body=self.call()
        self.assertTrue(status.startswith('503'))
        self.assertTrue(self.services[0].closed)
        self.assertNotIn(b'password',body)
        self.assertEqual(headers['cache-control'],'private, no-store')

if __name__=='__main__': unittest.main()
