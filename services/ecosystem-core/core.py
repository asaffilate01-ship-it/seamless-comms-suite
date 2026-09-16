"""Internal referral service. Never expose directly to browsers; see README."""
import json, sqlite3, uuid, hashlib, hmac, os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CATALOG = [
 ('haccora','Haccora','Digital food safety',['food']),
 ('dishbee','Dishbee','EPOS and online ordering',['food']),
 ('taxnuvia','TaxNuvia','Accounting and payroll',['all']),
 ('zarvane','Zarvane Foods','Trade food supplies',['food']),
 ('legal','Legal partners','Business legal support',['all']),
 ('eventplanr','EventPlanr','Offer catering and event services',['food','events']),
 ('insure360','Insure360','Business insurance enquiries',['all']),
 ('veyumo','Veyumo','Mobile, broadband and business VoIP',['all']),
 ('omniqora','Omniqora','Business intelligence and automation',['all']),
 ('xpertjobs','XpertJobs','Recruitment',['all']),
 ('craftvaro','Craftvaro','Repairs and refits',['all']),
 ('waste','Waste partners','Commercial waste collection',['food','trades']),
 ('zoryn-pay','Zoryn Pay','Merchant services',['all']),
 ('zoryn-rewards','Zoryn Rewards','Customer loyalty',['food','retail']),
 ('skillfinch','Skillfinch','Staff training',['all'])]

class Denied(Exception): pass
class Invalid(Exception): pass

class Core:
 def __init__(self, path):
  self.db=sqlite3.connect(path)
  self.db.row_factory=sqlite3.Row
  self.db.executescript('''
  PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS memberships(app TEXT, actor TEXT, org TEXT, role TEXT CHECK(role IN ('owner','manager','staff')), PRIMARY KEY(app,actor,org));
  CREATE TABLE IF NOT EXISTS providers(id TEXT PRIMARY KEY, app TEXT NOT NULL, org TEXT NOT NULL, name TEXT NOT NULL, service TEXT NOT NULL, country TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS referrals(id TEXT PRIMARY KEY, app TEXT, org TEXT, actor TEXT, provider TEXT REFERENCES providers(id), service TEXT, brief TEXT, contact TEXT, notice TEXT, status TEXT, created TEXT, request_key TEXT, payload_hash TEXT, UNIQUE(app,org,request_key));
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, referral TEXT, event TEXT, actor TEXT, at TEXT);
  ''')
 def authorize(self,app,actor,org):
  row=self.db.execute('SELECT role FROM memberships WHERE app=? AND actor=? AND org=?',(app,actor,org)).fetchone()
  if not row or row['role'] not in ('owner','manager'): raise Denied('Business owner or manager access required')
 def providers(self,service,country):
  return [dict(r) for r in self.db.execute('SELECT id,name,service,country FROM providers WHERE service=? AND country=? AND active=1',(service,country))]
 def catalogue(self,app,sector,country):
  return [dict(id=i,name=n,description=d,providers=self.providers(i,country),billing='Separate optional service; enquiry is free') for i,n,d,sectors in CATALOG if i!=app and ('all' in sectors or sector in sectors)]
 def create(self,app,actor,org,data):
  self.authorize(app,actor,org)
  if data.get('approved') is not True or data.get('notice')!='introduction-v1': raise Invalid('Explicit introduction approval required')
  if not isinstance(data.get('contact'),dict) or set(data['contact'])!={'name','email'}: raise Invalid('Only contact name and email may be shared')
  for k,limit in [('provider',100),('service',100),('brief',2000),('request_key',100)]:
   if not isinstance(data.get(k),str) or not 1<=len(data[k].strip())<=limit: raise Invalid('Invalid '+k)
  if any(not isinstance(v,str) or not 1<=len(v.strip())<=254 for v in data['contact'].values()) or '@' not in data['contact']['email']: raise Invalid('Invalid contact')
  p=self.db.execute('SELECT * FROM providers WHERE id=? AND service=? AND active=1',(data['provider'],data['service'])).fetchone()
  if not p: raise Invalid('Provider is unavailable')
  digest=hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
  old=self.db.execute('SELECT id,payload_hash FROM referrals WHERE app=? AND org=? AND request_key=?',(app,org,data['request_key'])).fetchone()
  if old:
   if old['payload_hash']!=digest: raise Invalid('Request key already used with different data')
   return {'id':old['id'],'status':'existing'}
  ident=str(uuid.uuid4()); now=datetime.now(timezone.utc).isoformat()
  with self.db:
   self.db.execute('INSERT INTO referrals VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(ident,app,org,actor,data['provider'],data['service'],data['brief'],json.dumps(data['contact']),data['notice'],'submitted',now,data['request_key'],digest))
   self.db.execute('INSERT INTO audit(referral,event,actor,at) VALUES(?,?,?,?)',(ident,'approved_and_submitted',actor,now))
  return {'id':ident,'status':'submitted'}
 def inbox(self,app,actor,org):
  self.authorize(app,actor,org)
  return [dict(r) for r in self.db.execute('SELECT r.id,r.service,r.brief,r.contact,r.status,r.created FROM referrals r JOIN providers p ON p.id=r.provider WHERE p.app=? AND p.org=? AND p.active=1 AND r.status IN (\'submitted\',\'accepted\',\'declined\')',(app,org))]
 def outgoing(self,app,actor,org):
  self.authorize(app,actor,org)
  return [dict(r) for r in self.db.execute('SELECT r.id,p.name AS provider,r.service,r.status,r.created FROM referrals r JOIN providers p ON p.id=r.provider WHERE r.app=? AND r.org=?',(app,org))]
 def transition(self,app,actor,org,ident,status):
  self.authorize(app,actor,org)
  with self.db:
   r=self.db.execute('SELECT r.*,p.app AS provider_app,p.org AS provider_org FROM referrals r JOIN providers p ON p.id=r.provider WHERE r.id=?',(ident,)).fetchone()
   if not r: raise Denied('Referral unavailable')
   source=r['app']==app and r['org']==org
   recipient=r['provider_app']==app and r['provider_org']==org and bool(self.db.execute('SELECT 1 FROM providers WHERE id=? AND active=1',(r['provider'],)).fetchone())
   if status=='withdrawn' and source and r['status']!='withdrawn':
    self.db.execute("UPDATE referrals SET status='withdrawn',contact='{}',brief='' WHERE id=?",(ident,))
   elif recipient and status in ('accepted','declined') and r['status']=='submitted':
    self.db.execute('UPDATE referrals SET status=? WHERE id=?',(status,ident))
   else: raise Denied('Transition unavailable')
   self.db.execute('INSERT INTO audit(referral,event,actor,at) VALUES(?,?,?,?)',(ident,status,actor,datetime.now(timezone.utc).isoformat()))
  return {'id':ident,'status':status}

def serve():
 from extended import ExtendedCore
 keys=json.loads(os.environ['ECOSYSTEM_APP_KEYS'])
 if not keys or any(len(k)<32 for k in keys.values()) or len(set(keys.values()))!=len(keys): raise RuntimeError('Unique app keys of at least 32 characters required')
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args): pass # avoid contact information in access logs
  def do_POST(self):
   status=200; core=None
   try:
    app=self.headers.get('X-App',''); expected=keys.get(app)
    if not expected or not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+expected): raise Denied('Unauthorised app')
    length=int(self.headers.get('Content-Length','0'))
    if length<1 or length>16384: raise Invalid('Invalid body size')
    data=json.loads(self.rfile.read(length)); actor=data['actor']; org=data['org']
    core=ExtendedCore(os.environ.get('ECOSYSTEM_DB','ecosystem.db'))
    if self.path.startswith('/admin/'):
     core.admin(app,actor)
    else: core.authorize(app,actor,org)
    if self.path=='/admin/overview': result=core.overview(app,actor)
    elif self.path=='/admin/provider': result=core.provider_save(app,actor,data['provider'])
    elif self.path=='/admin/grant': result=core.grant(app,actor,data['grant'])
    elif self.path=='/admin/revoke': result=core.revoke(app,actor,data['grant'])
    elif self.path=='/admin/bundle': result=core.bundle_save(app,actor,data['bundle'])
    elif self.path=='/subscriptions': result=core.subscriptions(app,actor,org)
    elif self.path=='/catalogue': result=core.catalogue(app,data.get('sector','all'),data.get('country','GB'))
    elif self.path=='/referrals': result=core.create(app,actor,org,data['referral'])
    elif self.path=='/inbox': result=core.inbox(app,actor,org)
    elif self.path=='/outgoing': result=core.outgoing(app,actor,org)
    elif self.path=='/status': result=core.transition(app,actor,org,data['id'],data['status'])
    else: status=404; result={'error':'Not found'}
   except Denied as e: status=403; result={'error':str(e)}
   except (Invalid,ValueError,KeyError,TypeError): status=400; result={'error':'Invalid request'}
   except Exception: status=500; result={'error':'Internal error'}
   finally:
    if core: core.db.close()
   body=json.dumps(result).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body)
 ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('PORT','8787'))),Handler).serve_forever()
if __name__=='__main__':
 import core
 core.serve()
