"""Example durable recipient inbox, to port into each SaaS's existing database.
No processor calls are implemented. Entries describe the desired renewal discount.
"""
import json,sqlite3
class BillingInbox:
 def __init__(self,path):
  self.db=sqlite3.connect(path)
  self.db.executescript('''CREATE TABLE IF NOT EXISTS received(id TEXT PRIMARY KEY,body TEXT); CREATE TABLE IF NOT EXISTS desired_discount(org TEXT PRIMARY KEY,revision INTEGER,percent INTEGER,event_id TEXT,state TEXT);''')
 def accept_verified(self,event):
  # Signature and schema must be verified by the endpoint BEFORE this method.
  with self.db:
   self.db.execute('BEGIN IMMEDIATE')
   old=self.db.execute('SELECT body FROM received WHERE id=?',(event['id'],)).fetchone();body=json.dumps(event,sort_keys=True)
   if old:
    if old[0]!=body:raise ValueError('Event id conflict')
    return
   current=self.db.execute('SELECT revision FROM desired_discount WHERE org=?',(event['org'],)).fetchone()
   if current and current[0]==event['revision']:raise ValueError('Revision conflict')
   self.db.execute('INSERT INTO received VALUES(?,?)',(event['id'],body))
   if not current or current[0]<event['revision']:
    self.db.execute("INSERT INTO desired_discount VALUES(?,?,?,?,'pending') ON CONFLICT(org) DO UPDATE SET revision=excluded.revision,percent=excluded.percent,event_id=excluded.event_id,state='pending'",(event['org'],event['revision'],event['percent'],event['id']))
 # Billing worker must lock org, recheck latest revision, apply processor discount
 # with event_id as idempotency key, then mark that revision applied. Never mark
 # applied merely because it was received. Notify customer of renewal changes.
