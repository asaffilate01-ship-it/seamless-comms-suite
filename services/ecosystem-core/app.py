"""Standalone private admin and integration API. Run behind TLS gateway."""
import os,json,base64,hmac,hashlib,time
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from network import Network
from core import Denied,Invalid
DB=os.environ.get('ECOSYSTEM_DB','ecosystem.db')
def main():
 password=os.environ['ECOSYSTEM_ADMIN_PASSWORD'];user=os.environ.get('ECOSYSTEM_ADMIN_USER','admin')
 if len(password)<20:raise RuntimeError('Use an admin password of at least 20 characters')
 c=Network(DB)
 with c.db:c.db.execute('INSERT OR IGNORE INTO operators VALUES(?)',(user,))
 c.db.close()
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def respond(self,status,value,mime='application/json'):
   raw=json.dumps(value).encode() if mime=='application/json' else value
   self.send_response(status)
   if status==401:self.send_header('WWW-Authenticate','Basic realm="Ecosystem"')
   for k,v in {'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'",'Content-Length':str(len(raw))}.items():self.send_header(k,v)
   self.end_headers();self.wfile.write(raw)
  def admin_auth(self):
   expected='Basic '+base64.b64encode((user+':'+password).encode()).decode()
   return hmac.compare_digest(self.headers.get('Authorization',''),expected)
  def do_GET(self):
   if not self.admin_auth():return self.respond(401,{'error':'Sign in required'})
   file={'/':'index.html','/ui.js':'ui.js','/style.css':'style.css'}.get(self.path)
   if not file:return self.respond(404,{'error':'Not found'})
   return self.respond(200,(Path(__file__).parent/'web'/file).read_bytes(),{'index.html':'text/html; charset=utf-8','ui.js':'text/javascript','style.css':'text/css'}[file])
  def do_POST(self):
   core=None
   try:
    n=int(self.headers.get('Content-Length','0'))
    if n<1 or n>16384:raise Invalid('Body size')
    raw=self.rfile.read(n);core=Network(DB)
    if self.path.startswith('/webhooks/'):
     app=self.path.split('/')[-1];result=core.webhook(app,raw,self.headers.get('X-Timestamp',''),self.headers.get('X-Signature',''))
    elif self.path.startswith('/admin/'):
     if not self.admin_auth():return self.respond(401,{'error':'Sign in required'})
     if self.headers.get('X-Ecosystem-Admin')!='1':raise Denied('Missing CSRF header')
     # No CORS support; custom header prevents browser cross-origin form posts.
     d=json.loads(raw);p=self.path
     if p=='/admin/dashboard':result=core.dashboard(user)
     elif p=='/admin/app':result=core.register(user,d)
     elif p=='/admin/rotate':result=core.rotate(user,d['app'])
     elif p=='/admin/provider':result=core.provider_save('ecosystem-admin',user,d)
     elif p=='/admin/rule':result=core.rule_save(user,d)
     elif p=='/admin/retry':
      with core.db:core.db.execute("UPDATE outbox SET state='pending',attempts=0,next_attempt=0,lease_until=0 WHERE id=? AND state='failed'",(d['id'],))
      result={'queued':True}
     elif p=='/admin/member':
      if d.get('role') not in ('owner','manager','staff','remove') or not all(isinstance(d.get(k),str) and 1<=len(d[k])<=200 for k in ('app','actor','org')):raise Invalid('Membership fields')
      if not core.db.execute('SELECT 1 FROM apps WHERE id=?',(d['app'],)).fetchone():raise Invalid('Unknown app')
      with core.db:
       if d['role']=='remove':core.db.execute('DELETE FROM memberships WHERE app=? AND actor=? AND org=?',(d['app'],d['actor'],d['org']))
       else:core.db.execute('INSERT INTO memberships VALUES(?,?,?,?) ON CONFLICT(app,actor,org) DO UPDATE SET role=excluded.role',(d['app'],d['actor'],d['org'],d['role']))
       core.audit_admin(user,'membership_updated',json.dumps(d))
      result={'saved':True}
     else:return self.respond(404,{'error':'Not found'})
    else:
     app=self.headers.get('X-App','');core.authenticate(app,self.headers.get('Authorization','').removeprefix('Bearer '));d=json.loads(raw)
     if self.path=='/members/sync':
      members=d.get('members')
      if not isinstance(members,list) or not 1<=len(members)<=50:raise Invalid('Membership batch')
      with core.db:
       for m in members:
        if not isinstance(m,dict) or not all(isinstance(m.get(k),str) and 1<=len(m[k])<=200 for k in ('actor','org')) or m.get('role') not in ('owner','manager','staff','remove'):raise Invalid('Membership fields')
        if m['role']=='remove':core.db.execute('DELETE FROM memberships WHERE app=? AND actor=? AND org=?',(app,m['actor'],m['org']))
        else:core.db.execute('INSERT INTO memberships VALUES(?,?,?,?) ON CONFLICT(app,actor,org) DO UPDATE SET role=excluded.role',(app,m['actor'],m['org'],m['role']))
       core.audit_admin(app,'members_synced',str(len(members)))
      return self.respond(200,{'synced':len(members)})
     actor=d['actor'];org=d['org'];core.authorize(app,actor,org)
     p=self.path
     if p=='/catalogue':result=core.catalogue(app,d.get('sector','all'),d.get('country','GB'))
     elif p=='/referrals':result=core.create(app,actor,org,d['referral'])
     elif p=='/inbox':result=core.inbox(app,actor,org)
     elif p=='/outgoing':result=core.outgoing(app,actor,org)
     elif p=='/status':result=core.transition(app,actor,org,d['id'],d['status'])
     elif p=='/subscriptions':result=core.subscriptions(app,actor,org)
     elif p=='/discount':result=core.discount(app,actor,org)
     elif p=='/link/list':
      result=[dict(r) for r in core.db.execute('SELECT l.app FROM links l JOIN links own ON own.group_id=l.group_id WHERE own.app=? AND own.org=?',(app,org))]
     elif p=='/link/start':result=core.link_start(app,actor,org,d['destination'])
     elif p=='/link/finish':result=core.link_finish(app,actor,org,d['code'])
     elif p=='/link/remove':result=core.unlink(app,actor,org)
     else:return self.respond(404,{'error':'Not found'})
    self.respond(200,result)
   except Denied as e:self.respond(403,{'error':str(e)})
   except (Invalid,ValueError,KeyError,TypeError) as e:self.respond(400,{'error':'Invalid request: '+str(e)[:100]})
   except Exception:self.respond(500,{'error':'Internal error'})
   finally:
    if core:core.db.close()
 server=ThreadingHTTPServer((os.environ.get('BIND','127.0.0.1'),int(os.environ.get('PORT','8787'))),Handler)
 server.serve_forever()
if __name__=='__main__':main()
