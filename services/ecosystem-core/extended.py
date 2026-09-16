"""Central administration and explicit product entitlements; no payment execution."""
import json
from core import Core, Denied, Invalid, CATALOG
class ExtendedCore(Core):
 def __init__(self,path):
  super().__init__(path)
  self.db.executescript('''
  CREATE TABLE IF NOT EXISTS operators(actor TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS entitlements(app TEXT,org TEXT,product TEXT,source TEXT,expires TEXT,PRIMARY KEY(app,org,product));
  CREATE TABLE IF NOT EXISTS bundles(id TEXT PRIMARY KEY,name TEXT,products TEXT);
  CREATE TABLE IF NOT EXISTS admin_audit(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,target TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
  ''')
 def admin(self,app,actor):
  if app!='ecosystem-admin' or not self.db.execute('SELECT 1 FROM operators WHERE actor=?',(actor,)).fetchone(): raise Denied('Central administrator required')
 def audit_admin(self,actor,action,target):
  self.db.execute('INSERT INTO admin_audit(actor,action,target) VALUES(?,?,?)',(actor,action,target))
 def overview(self,app,actor):
  self.admin(app,actor)
  return {'providers':[dict(x) for x in self.db.execute('SELECT * FROM providers ORDER BY name')], 'referrals':[dict(x) for x in self.db.execute('SELECT app AS source,service,status,count(*) AS count FROM referrals GROUP BY app,service,status')], 'bundles':[dict(x) for x in self.db.execute('SELECT * FROM bundles')], 'services':[{'id':x[0],'name':x[1]} for x in CATALOG]}
 def provider_save(self,app,actor,d):
  self.admin(app,actor)
  for key in ('id','app','org','name','service','country'):
   if not isinstance(d.get(key),str) or not 1<=len(d[key].strip())<=200: raise Invalid(key)
  if d['service'] not in [x[0] for x in CATALOG] or d.get('active') not in (True,False): raise Invalid('Provider settings')
  with self.db:
   old=self.db.execute('SELECT * FROM providers WHERE id=?',(d['id'],)).fetchone()
   if old and any(old[k]!=d[k] for k in ('app','org','service','country')): raise Invalid('Provider identity cannot be reassigned; create a new provider')
   self.db.execute('INSERT INTO providers VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active',tuple(d[k] for k in ('id','app','org','name','service','country'))+(int(d['active']),))
   self.audit_admin(actor,'provider_saved',d['id'])
  return {'saved':True}
 def subscriptions(self,app,actor,org):
  self.authorize(app,actor,org)
  return [dict(x) for x in self.db.execute("SELECT product,source,expires FROM entitlements WHERE app=? AND org=? AND (expires IS NULL OR expires>strftime('%Y-%m-%dT%H:%M:%SZ','now'))",(app,org))]
 def grant(self,app,actor,d):
  self.admin(app,actor)
  from datetime import datetime,timezone
  if any(not isinstance(d.get(k),str) or not 1<=len(d[k])<=200 for k in ('app','org','product','source')): raise Invalid('Grant fields')
  if d['product'] not in [x[0] for x in CATALOG]: raise Invalid('Unknown product')
  expiry=d.get('expires')
  if expiry is not None:
   try:
    parsed=datetime.strptime(expiry,'%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
    if parsed<=datetime.now(timezone.utc): raise ValueError()
   except (ValueError,TypeError): raise Invalid('Future UTC expiry required')
  with self.db:
   self.db.execute('INSERT INTO entitlements VALUES(?,?,?,?,?) ON CONFLICT(app,org,product) DO UPDATE SET source=excluded.source,expires=excluded.expires',(d['app'],d['org'],d['product'],d['source'],expiry))
   self.audit_admin(actor,'entitlement_granted',json.dumps({k:d[k] for k in ('app','org','product')}))
  return {'saved':True}
 def revoke(self,app,actor,d):
  self.admin(app,actor)
  with self.db:
   self.db.execute('DELETE FROM entitlements WHERE app=? AND org=? AND product=?',(d['app'],d['org'],d['product']))
   self.audit_admin(actor,'entitlement_revoked',json.dumps({k:d[k] for k in ('app','org','product')}))
  return {'saved':True}
 def bundle_save(self,app,actor,d):
  self.admin(app,actor)
  if any(not isinstance(d.get(k),str) or not 1<=len(d[k])<=200 for k in ('id','name')): raise Invalid('Bundle name')
  products=d.get('products')
  if not isinstance(products,list) or len(products)<2 or any(not isinstance(x,str) for x in products) or len(set(products))!=len(products) or any(x not in [r[0] for r in CATALOG] for x in products): raise Invalid('At least two distinct known products required')
  with self.db:
   self.db.execute('INSERT INTO bundles VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,products=excluded.products',(d['id'],d['name'],json.dumps(products)))
   self.audit_admin(actor,'bundle_saved',d['id'])
  return {'saved':True}
