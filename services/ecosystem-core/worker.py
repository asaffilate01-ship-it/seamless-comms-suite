"""One reconciliation/delivery pass. Schedule once per minute."""
import os,json,time,hmac,hashlib,urllib.request,urllib.parse
from network import Network
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
def run():
 c=Network(os.environ.get('ECOSYSTEM_DB','ecosystem.db'));c.reconcile()
 # Operator-controlled endpoint allowlist, never URLs from tenants or events.
 endpoints=json.loads(os.environ.get('ECOSYSTEM_WEBHOOK_ENDPOINTS','{}'))
 now=int(time.time())
 with c.db:
  c.db.execute('BEGIN IMMEDIATE')
  jobs=c.db.execute("SELECT * FROM outbox WHERE state='pending' AND next_attempt<=? AND lease_until<=? LIMIT 25",(now,now)).fetchall()
  for job in jobs:c.db.execute('UPDATE outbox SET lease_until=? WHERE id=?',(now+600,job['id']))
 for job in jobs:
  okay=False
  try:
   url=endpoints[job['app']];parsed=urllib.parse.urlparse(url)
   if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:raise ValueError('HTTPS endpoint required')
   key=c.db.execute('SELECT webhook_secret FROM credentials WHERE app=?',(job['app'],)).fetchone()[0]
   raw=job['body'].encode();stamp=str(int(time.time()));sig=hmac.new(key.encode(),stamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
   request=urllib.request.Request(url,data=raw,headers={'Content-Type':'application/json','X-Timestamp':stamp,'X-Signature':sig},method='POST')
   with urllib.request.build_opener(NoRedirect).open(request,timeout=10) as response:okay=200<=response.status<300
  except Exception:pass
  count=job['attempts']+1
  with c.db:c.db.execute('UPDATE outbox SET state=?,attempts=?,next_attempt=?,lease_until=0 WHERE id=?',('delivered' if okay else ('failed' if count>=10 else 'pending'),count,int(time.time())+min(3600,30*2**min(count,7)),job['id']))
 c.db.close()
if __name__=='__main__':run()
