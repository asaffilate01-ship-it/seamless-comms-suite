import unittest,tempfile,subprocess,os,secrets,time,json,urllib.request,urllib.error,base64,socket
class HTTPTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory();cls.password=secrets.token_urlsafe(30)
  sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close();cls.url='http://127.0.0.1:'+str(port)
  cls.proc=subprocess.Popen(['python3','app.py'],env={**os.environ,'PORT':str(port),'ECOSYSTEM_DB':cls.temp.name+'/db','ECOSYSTEM_ADMIN_PASSWORD':cls.password},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  for _ in range(50):
   try:urllib.request.urlopen(cls.url,timeout=.2)
   except urllib.error.HTTPError:break
   except OSError:time.sleep(.05)
 @classmethod
 def tearDownClass(cls):cls.proc.terminate();cls.proc.wait();cls.temp.cleanup()
 def call(self,path,data,headers):
  req=urllib.request.Request(self.url+path,data=json.dumps(data).encode(),headers=headers)
  try:
   with urllib.request.urlopen(req) as r:return r.status,json.loads(r.read())
  except urllib.error.HTTPError as r:return r.code,json.loads(r.read())
 def admin(self,path,data):return self.call(path,data,{'Authorization':'Basic '+base64.b64encode(('admin:'+self.password).encode()).decode(),'X-Ecosystem-Admin':'1'})
 def test_full_http_flow(self):
  self.assertEqual(self.admin('/admin/app',dict(id='haccora',name='Haccora',sector='food',country='GB'))[0],200)
  status,keys=self.admin('/admin/rotate',{'app':'haccora'});self.assertEqual(status,200)
  h={'X-App':'haccora','Authorization':'Bearer '+keys['api_key']}
  self.assertEqual(self.call('/members/sync',{'members':[dict(actor='alice',org='r',role='owner')]},h)[0],200)
  self.assertEqual(self.call('/catalogue',dict(actor='alice',org='r'),h)[0],200)
  self.assertEqual(self.call('/catalogue',dict(actor='alice',org='someone-else'),h)[0],403)
  self.assertEqual(self.call('/admin/dashboard',{},h)[0],401)
 def test_csrf_header_required(self):
  status,_=self.call('/admin/dashboard',{}, {'Authorization':'Basic '+base64.b64encode(('admin:'+self.password).encode()).decode()});self.assertEqual(status,403)
 def test_static_requires_login(self):
  with self.assertRaises(urllib.error.HTTPError) as ctx:urllib.request.urlopen(self.url)
  self.assertEqual(ctx.exception.code,401)
