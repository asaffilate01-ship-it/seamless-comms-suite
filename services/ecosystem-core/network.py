"""Dynamic SaaS registry, verified account links, signed events and discount engine."""
import hashlib,hmac,json,secrets,time,uuid,re
from extended import ExtendedCore
from core import Denied,Invalid
class Network(ExtendedCore):
 def __init__(self,path):
  super().__init__(path)
  self.db.executescript('''
  CREATE TABLE IF NOT EXISTS apps(id TEXT PRIMARY KEY,name TEXT,sector TEXT,country TEXT,active INTEGER DEFAULT 1);
  CREATE TABLE IF NOT EXISTS credentials(app TEXT PRIMARY KEY REFERENCES apps(id),api_hash TEXT,webhook_secret TEXT);
  CREATE TABLE IF NOT EXISTS links(app TEXT,org TEXT,group_id TEXT,PRIMARY KEY(app,org));
  CREATE TABLE IF NOT EXISTS link_codes(hash TEXT PRIMARY KEY,app TEXT,org TEXT,destination TEXT,expires INTEGER);
  CREATE TABLE IF NOT EXISTS subscriptions_v3(app TEXT,org TEXT,version INTEGER,status TEXT,valid_until INTEGER,promo INTEGER,PRIMARY KEY(app,org));
  CREATE TABLE IF NOT EXISTS events(app TEXT,id TEXT,digest TEXT,PRIMARY KEY(app,id));
  CREATE TABLE IF NOT EXISTS rules(id TEXT PRIMARY KEY,source TEXT REFERENCES apps(id),target TEXT REFERENCES apps(id),percent INTEGER CHECK(percent>0 AND percent<=100),active INTEGER DEFAULT 1);
  CREATE TABLE IF NOT EXISTS decisions(app TEXT,org TEXT,percent INTEGER,rule TEXT,revision INTEGER,PRIMARY KEY(app,org));
  CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,app TEXT,body TEXT,state TEXT DEFAULT 'pending',attempts INTEGER DEFAULT 0,next_attempt INTEGER DEFAULT 0,lease_until INTEGER DEFAULT 0);
  ''')
 def register(self,actor,d):
  self.admin('ecosystem-admin',actor)
  if not re.fullmatch('[a-z][a-z0-9-]{1,60}',d.get('id','')) or not all(isinstance(d.get(k),str) and 1<=len(d[k])<=150 for k in ('name','sector','country')):raise Invalid('App fields')
  with self.db:
   self.db.execute('INSERT INTO apps VALUES(?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sector=excluded.sector,country=excluded.country',(d['id'],d['name'],d['sector'],d['country']))
   self.audit_admin(actor,'app_saved',d['id'])
  return {'saved':True}
 def rotate(self,actor,app):
  self.admin('ecosystem-admin',actor)
  if not self.db.execute('SELECT 1 FROM apps WHERE id=?',(app,)).fetchone():raise Invalid('Unknown app')
  token=secrets.token_urlsafe(40); signing=secrets.token_hex(32)
  with self.db:
   self.db.execute('INSERT INTO credentials VALUES(?,?,?) ON CONFLICT(app) DO UPDATE SET api_hash=excluded.api_hash,webhook_secret=excluded.webhook_secret',(app,hashlib.sha256(token.encode()).hexdigest(),signing))
   self.audit_admin(actor,'credentials_rotated',app)
  return {'api_key':token,'webhook_secret':signing,'note':'Shown once. Store server-side. Rotation invalidates previous credentials immediately.'}
 def authenticate(self,app,token):
  r=self.db.execute('SELECT c.api_hash FROM credentials c JOIN apps a ON a.id=c.app WHERE c.app=? AND a.active=1',(app,)).fetchone()
  if not r or not hmac.compare_digest(r[0],hashlib.sha256(token.encode()).hexdigest()):raise Denied('Invalid app credential')
 def catalogue(self,app,sector,country):
  return [dict(id=r['id'],name=r['name'],description='Explore '+r['name'],providers=self.providers(r['id'],country),billing='Separate optional service; enquiry is free') for r in self.db.execute("SELECT * FROM apps WHERE active=1 AND id<>? AND country IN (?, 'GLOBAL') AND sector IN (?, 'all') ORDER BY name",(app,country,sector))]
 def provider_save(self,app,actor,d):
  # Parent validates against its fixed catalogue; dynamic providers need registry validation.
  self.admin(app,actor)
  if not self.db.execute('SELECT 1 FROM apps WHERE id=?',(d.get('service'),)).fetchone():raise Invalid('Unknown service')
  for k in ('id','app','org','name','service','country'):
   if not isinstance(d.get(k),str) or not 1<=len(d[k])<=200:raise Invalid(k)
  if type(d.get('active')) is not bool:raise Invalid('active')
  if d['app']!=d['service']:raise Invalid('Provider app must own the service')
  with self.db:
   old=self.db.execute('SELECT * FROM providers WHERE id=?',(d['id'],)).fetchone()
   if old and any(old[k]!=d[k] for k in ('app','org','service','country')):raise Invalid('Cannot reassign provider')
   self.db.execute('INSERT INTO providers VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active',tuple(d[k] for k in ('id','app','org','name','service','country'))+(int(d['active']),))
   self.audit_admin(actor,'provider_saved',d['id'])
  return {'saved':True}
 def link_start(self,app,actor,org,destination):
  self.authorize(app,actor,org)
  if destination==app or not self.db.execute('SELECT 1 FROM apps WHERE id=? AND active=1',(destination,)).fetchone():raise Invalid('Destination')
  code=secrets.token_urlsafe(32)
  with self.db:self.db.execute('INSERT INTO link_codes VALUES(?,?,?,?,?)',(hashlib.sha256(code.encode()).hexdigest(),app,org,destination,int(time.time())+600))
  return {'code':code,'expires_in':600,'instruction':'Enter this code while signed into the other business account. Linking authorises subscription eligibility checks between these accounts.'}
 def link_finish(self,app,actor,org,code):
  self.authorize(app,actor,org)
  with self.db:
   self.db.execute('BEGIN IMMEDIATE')
   r=self.db.execute('SELECT * FROM link_codes WHERE hash=?',(hashlib.sha256(code.encode()).hexdigest(),)).fetchone()
   if not r or r['destination']!=app or r['expires']<time.time():raise Invalid('Expired or invalid code')
   groups=[x[0] for x in self.db.execute('SELECT group_id FROM links WHERE (app=? AND org=?) OR (app=? AND org=?)',(app,org,r['app'],r['org']))]
   # Disallow implicit merging of existing groups; operator must resolve deliberately.
   if len(set(groups))>1:raise Invalid('Accounts belong to different linked groups')
   group=groups[0] if groups else str(uuid.uuid4())
   other=self.db.execute('SELECT org FROM links WHERE group_id=? AND app=?',(group,app)).fetchone()
   if other and other[0]!=org:raise Invalid('Another organisation from this app is already linked')
   other=self.db.execute('SELECT org FROM links WHERE group_id=? AND app=?',(group,r['app'])).fetchone()
   if other and other[0]!=r['org']:raise Invalid('Source app already linked')
   for a,o in ((app,org),(r['app'],r['org'])):self.db.execute('INSERT OR IGNORE INTO links VALUES(?,?,?)',(a,o,group))
   self.db.execute('DELETE FROM link_codes WHERE hash=?',(r['hash'],))
   self.audit_admin(actor,'accounts_linked',group)
  self.reconcile();return {'linked':True}
 def unlink(self,app,actor,org):
  self.authorize(app,actor,org)
  with self.db:
   self.db.execute('DELETE FROM links WHERE app=? AND org=?',(app,org));self.audit_admin(actor,'account_unlinked',app+':'+org)
  self.reconcile();return {'linked':False}
 def rule_save(self,actor,d):
  self.admin('ecosystem-admin',actor)
  if not isinstance(d.get('id'),str) or not 1<=len(d['id'])<=100 or type(d.get('percent')) is not int or not 1<=d['percent']<=100 or d.get('source')==d.get('target') or type(d.get('active')) is not bool:raise Invalid('Rule fields')
  if any(not self.db.execute('SELECT 1 FROM apps WHERE id=?',(d.get(k),)).fetchone() for k in ('source','target')):raise Invalid('Unknown app')
  with self.db:
   self.db.execute('INSERT INTO rules VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source=excluded.source,target=excluded.target,percent=excluded.percent,active=excluded.active',(d['id'],d['source'],d['target'],d['percent'],int(d['active'])))
   self.audit_admin(actor,'rule_saved',d['id'])
  self.reconcile();return {'saved':True}
 def webhook(self,app,raw,timestamp,signature):
  r=self.db.execute('SELECT c.webhook_secret FROM credentials c JOIN apps a ON a.id=c.app WHERE c.app=? AND a.active=1',(app,)).fetchone()
  try:age=abs(time.time()-int(timestamp))
  except (ValueError,TypeError):raise Denied('Webhook timestamp')
  if not r or age>300:raise Denied('Webhook expired')
  expected=hmac.new(r[0].encode(),timestamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
  if not hmac.compare_digest(expected,signature):raise Denied('Webhook signature')
  d=json.loads(raw)
  if not isinstance(d,dict) or not all(isinstance(d.get(k),str) and 1<=len(d[k])<=200 for k in ('id','org')) or type(d.get('version')) is not int or d['version']<1 or d.get('status') not in ('active','trial','past_due','cancelled') or type(d.get('valid_until')) is not int or type(d.get('promo')) is not bool:raise Invalid('Event fields')
  digest=hashlib.sha256(raw).hexdigest()
  with self.db:
   self.db.execute('BEGIN IMMEDIATE')
   old=self.db.execute('SELECT digest FROM events WHERE app=? AND id=?',(app,d['id'])).fetchone()
   if old:
    if old[0]!=digest:raise Invalid('Event ID reused')
    return {'duplicate':True}
   previous=self.db.execute('SELECT version FROM subscriptions_v3 WHERE app=? AND org=?',(app,d['org'])).fetchone()
   if previous and previous[0]==d['version']:raise Invalid('Version already used')
   self.db.execute('INSERT INTO events VALUES(?,?,?)',(app,d['id'],digest))
   if not previous or previous[0]<d['version']:
    self.db.execute('INSERT INTO subscriptions_v3 VALUES(?,?,?,?,?,?) ON CONFLICT(app,org) DO UPDATE SET version=excluded.version,status=excluded.status,valid_until=excluded.valid_until,promo=excluded.promo',(app,d['org'],d['version'],d['status'],d['valid_until'],int(d['promo'])))
  self.reconcile();return {'received':True}
 def reconcile(self):
  now=int(time.time())
  with self.db:
   self.db.execute('BEGIN IMMEDIATE')
   for sub in self.db.execute('SELECT * FROM subscriptions_v3').fetchall():
    percent=0;rule=None
    if sub['status']=='active' and sub['valid_until']>now and not sub['promo']:
     candidates=self.db.execute('''SELECT r.id,r.percent FROM rules r JOIN links target ON target.app=r.target JOIN links source ON source.group_id=target.group_id AND source.app=r.source JOIN subscriptions_v3 s ON s.app=source.app AND s.org=source.org WHERE target.app=? AND target.org=? AND r.active=1 AND s.status='active' AND s.valid_until>? ORDER BY r.percent DESC,r.id''',(sub['app'],sub['org'],now)).fetchall()
     if candidates:rule,percent=candidates[0]['id'],candidates[0]['percent']
    old=self.db.execute('SELECT * FROM decisions WHERE app=? AND org=?',(sub['app'],sub['org'])).fetchone()
    if old and (old['percent'],old['rule'])==(percent,rule):continue
    revision=old['revision']+1 if old else 1
    self.db.execute('INSERT INTO decisions VALUES(?,?,?,?,?) ON CONFLICT(app,org) DO UPDATE SET percent=excluded.percent,rule=excluded.rule,revision=excluded.revision',(sub['app'],sub['org'],percent,rule,revision))
    eid=str(uuid.uuid4());body=json.dumps(dict(id=eid,type='discount.eligibility.changed',org=sub['org'],percent=percent,rule=rule,revision=revision,effective='next_renewal',scope='subscription_only',stackable=False),separators=(',',':'))
    self.db.execute('INSERT INTO outbox(id,app,body) VALUES(?,?,?)',(eid,sub['app'],body))
 def discount(self,app,actor,org):
  self.authorize(app,actor,org);self.reconcile()
  r=self.db.execute('SELECT percent,rule,revision FROM decisions WHERE app=? AND org=?',(app,org)).fetchone()
  return dict(r) if r else {'percent':0,'rule':None,'revision':0}
 def dashboard(self,actor):
  self.admin('ecosystem-admin',actor)
  base=self.overview('ecosystem-admin',actor)
  base.update(apps=[dict(r) for r in self.db.execute('SELECT * FROM apps')],rules=[dict(r) for r in self.db.execute('SELECT * FROM rules')],deliveries=[dict(r) for r in self.db.execute('SELECT id,app,state,attempts FROM outbox ORDER BY rowid DESC LIMIT 100')])
  return base
