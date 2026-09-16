import io,json,tempfile,unittest
from pathlib import Path
from server import Accounts,create_app,Actor
from transformation.engine import Engine

class StandaloneSecurityTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();root=Path(cls.tmp.name)
  cls.accounts=Accounts(root/'auth.db');cls.engine=Engine(root/'engine.db')
  cls.owner=cls.accounts.add_user('tenant-one','owner@example.test','correct-long-password','owner')
  cls.other=cls.accounts.add_user('tenant-two','other@example.test','another-long-password','owner')
  with cls.accounts.db() as db:db.execute('UPDATE tenants SET enabled=1')
  cls.project=cls.engine.dispatch(Actor('tenant-one',cls.owner,'owner'),'projects.create',None,{'name':'First business','currency':'GBP'})['id']
  cls.app=staticmethod(create_app(cls.engine,cls.accounts,'https://business.example.test'))
 @classmethod
 def tearDownClass(cls):cls.tmp.cleanup()
 def setUp(self):
  self.cookie='';self.csrf=''
  with self.accounts.db() as db:db.execute('DELETE FROM attempts');db.execute('UPDATE tenants SET enabled=1');db.execute('UPDATE users SET active=1')
 def request(self,path,data=None,origin='https://business.example.test',csrf=None):
  raw=json.dumps(data or {}).encode();env={'PATH_INFO':path,'REQUEST_METHOD':'GET' if data is None else 'POST','HTTP_ORIGIN':origin,'CONTENT_TYPE':'application/json','CONTENT_LENGTH':str(len(raw)),'wsgi.input':io.BytesIO(raw),'REMOTE_ADDR':'127.0.0.1','HTTP_COOKIE':self.cookie,'HTTP_X_CSRF_TOKEN':self.csrf if csrf is None else csrf}
  info={}
  body=b''.join(self.app(env,lambda s,h:info.update(status=int(s.split()[0]),headers=dict(h))))
  return info,json.loads(body) if info['headers']['Content-Type'].startswith('application/json') else body
 def login(self,email='owner@example.test',password='correct-long-password'):
  info,result=self.request('/api/login',{'email':email,'password':password})
  self.assertEqual(info['status'],200);self.cookie=info['headers']['Set-Cookie'].split(';')[0];self.csrf=result['csrf'];return info,result
 def test_login_cookie_session_and_logout(self):
  info,_=self.login();cookie=info['headers']['Set-Cookie']
  for flag in ['HttpOnly','Secure','SameSite=Strict']:self.assertIn(flag,cookie)
  self.assertEqual(self.request('/api/me')[1]['id'],self.owner)
  self.assertEqual(self.request('/api/logout',{})[0]['status'],200)
  self.assertEqual(self.request('/api/me')[0]['status'],401)
 def test_anonymous_cannot_read_or_mutate(self):
  self.assertEqual(self.request('/api/me')[0]['status'],401)
  self.assertEqual(self.request('/api/rpc',{'command':'projects.list','data':{}})[0]['status'],401)
 def test_origin_and_csrf_required(self):
  self.assertEqual(self.request('/api/login',{'email':'owner@example.test','password':'correct-long-password'},origin='https://evil.test')[0]['status'],403)
  self.login();data={'command':'projects.list','data':{}}
  self.assertEqual(self.request('/api/rpc',data,csrf='wrong')[0]['status'],403)
  self.assertEqual(self.request('/api/rpc',data,origin='https://evil.test')[0]['status'],403)
 def test_entitlement_rechecked_during_session(self):
  self.login()
  with self.accounts.db() as db:db.execute('UPDATE tenants SET enabled=0 WHERE id=?',('tenant-one',))
  self.assertEqual(self.request('/api/rpc',{'command':'projects.list','data':{}})[0]['status'],403)
 def test_cannot_invite_another_tenants_user(self):
  self.login()
  self.assertEqual(self.request('/api/rpc',{'command':'members.add','project_id':self.project,'data':{'user_id':self.other,'role':'analyst'}})[0]['status'],403)
 def test_cross_tenant_reads_and_browser_identity_spoof_fail(self):
  self.login('other@example.test','another-long-password')
  self.assertEqual(self.request('/api/rpc',{'command':'snapshot','project_id':self.project,'data':{}})[0]['status'],404)
  self.assertEqual(self.request('/api/rpc',{'command':'projects.list','tenant':'tenant-one','role':'owner','data':{}})[0]['status'],422)
 def test_deactivated_user_loses_existing_session(self):
  self.login()
  with self.accounts.db() as db:db.execute('UPDATE users SET active=0 WHERE id=?',(self.owner,))
  self.assertEqual(self.request('/api/me')[0]['status'],401)
 def test_login_errors_generic_and_rate_limited(self):
  known=self.request('/api/login',{'email':'owner@example.test','password':'incorrect'})
  unknown=self.request('/api/login',{'email':'absent@example.test','password':'incorrect'})
  self.assertEqual(known[1],unknown[1]);self.assertEqual(known[0]['status'],401)
  import hashlib,time
  key=hashlib.sha256(b'email:owner@example.test').hexdigest()
  with self.accounts.db() as db:db.execute('UPDATE attempts SET count=12,reset=? WHERE key=?',(int(time.time())+900,key))
  self.assertEqual(self.request('/api/login',{'email':'owner@example.test','password':'correct-long-password'})[0]['status'],429)
 def test_password_reset_revokes_sessions(self):
  self.login()
  self.accounts.reset_password('owner@example.test','new-long-password-123')
  self.assertEqual(self.request('/api/me')[0]['status'],401)
  self.assertEqual(self.request('/api/login',{'email':'owner@example.test','password':'correct-long-password'})[0]['status'],401)
  self.login(password='new-long-password-123')
  self.accounts.reset_password('owner@example.test','correct-long-password')
 def test_static_asset_allowlist_and_security_headers(self):
  info,body=self.request('/');self.assertEqual(info['status'],200);self.assertIn(b'<div id="root">',body)
  self.assertIn("frame-ancestors 'none'",info['headers']['Content-Security-Policy'])
  self.assertEqual(self.request('/../server.py')[0]['status'],404)

if __name__=='__main__':unittest.main()
