"""Disposable PostgreSQL integration checks; never connects to a live database.
Requires pgserver==0.1.4 and psycopg[binary]>=3.2,<4 in the test environment.
"""
import sys,tempfile,unittest,json
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'services/transformation'))
import pgserver,psycopg
from transformation.engine import Engine,Actor
from transformation.postgres import connect
from knowledge_core.types import APIError
from transformation.ai_hub import AIHub,DEFAULT_POLICY

class PostgresIsolationTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();cls.server=pgserver.get_server(Path(cls.tmp.name)/'data',cleanup_mode='delete')
  cls.admin=cls.server.get_uri()
  with psycopg.connect(cls.admin,autocommit=True) as db:
   db.execute((ROOT/'supabase/migrations/20260916120000_business360_rls.sql').read_text())
   db.execute((ROOT/'supabase/migrations/20260916130000_business360_ai_rls.sql').read_text())
   db.execute((ROOT/'supabase/migrations/20260916140000_business360_bridges.sql').read_text())
   db.execute('CREATE ROLE b360_test LOGIN NOSUPERUSER NOBYPASSRLS')
   db.execute('GRANT business360_runtime TO b360_test')
  parts=urlsplit(cls.admin);cls.url=urlunsplit(parts._replace(netloc=parts.netloc.replace('postgres:', 'b360_test:')))
  cls.engine=Engine(cls.url);cls.owner=Actor('tenant-a','owner-a','owner');cls.viewer=Actor('tenant-a','viewer-a','member');cls.other=Actor('tenant-b','owner-b','owner');cls.analyst=Actor('tenant-a','analyst-a','member')
  cls.project=cls.engine.dispatch(cls.owner,'projects.create',None,{'name':'Business A','currency':'GBP'})['id']
  cls.foreign=cls.engine.dispatch(cls.other,'projects.create',None,{'name':'Business B','currency':'GBP'})['id']
  for actor,role in [(cls.viewer,'viewer'),(cls.analyst,'analyst')]:cls.engine.dispatch(cls.owner,'members.add',cls.project,{'user_id':actor.user,'role':role})
  cls.save('company',{'id':'business','name':'Business A','company_role':'operating','sector':'Services','countries':['GB'],'owner':'Director'})
  common={'company_id':'business','owner':'Director','evidence_ref':'urn:test:baseline'}
  cls.save('department',{**common,'id':'sales','name':'Sales','purpose':'Customer acquisition'})
  cls.save('person',{**common,'id':'sam','name':'Sam','department_id':'sales','job_title':'Manager','employment_type':'employee'})
  cls.save('person_private',{**common,'id':'pay','person_id':'sam','annual_salary':'50000','annual_benefits':'5000','currency':'GBP'})
 @classmethod
 def save(cls,kind,record):return cls.engine.dispatch(cls.owner,'records.save',cls.project,{'kind':kind,'record':record,'expected_revision':0})
 @classmethod
 def tearDownClass(cls):cls.server.cleanup();cls.tmp.cleanup()
 def test_real_database_forces_rls_on_every_table(self):
  with psycopg.connect(self.admin) as db:
   rows=db.execute("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='business360' AND relkind='r'").fetchall()
   self.assertEqual(len(rows),12);self.assertTrue(all(r[1] and r[2] for r in rows))
 def test_unfiltered_sql_cannot_read_other_tenant(self):
  with connect(self.url,self.owner) as db:self.assertEqual([r['id'] for r in db.execute('SELECT * FROM projects')],[self.project])
  with self.assertRaises(APIError):self.engine.dispatch(self.other,'snapshot',self.project,{})
 def test_same_tenant_requires_project_membership(self):
  stranger=Actor('tenant-a','stranger','admin')
  with connect(self.url,stranger) as db:self.assertEqual(list(db.execute('SELECT * FROM objects')),[])
  self.assertEqual(self.engine.dispatch(stranger,'projects.list',None,{}),[])
 def test_personnel_pay_hidden_at_database_and_api(self):
  with connect(self.url,self.viewer) as db:self.assertNotIn('person_private',[r['kind'] for r in db.execute('SELECT * FROM objects')])
  self.assertNotIn('person_private',[o['kind'] for o in self.engine.dispatch(self.viewer,'export',self.project,{})['objects']])
  with connect(self.url,self.owner) as db:self.assertIn('person_private',[r['kind'] for r in db.execute('SELECT * FROM objects')])
 def test_database_blocks_viewer_write_and_cross_tenant_insert(self):
  for actor,tenant,project in [(self.viewer,'tenant-a',self.project),(self.owner,'tenant-b',self.foreign)]:
   with self.assertRaises(psycopg.errors.InsufficientPrivilege):
    with connect(self.url,actor) as db:db.execute('INSERT INTO objects VALUES(?,?,?,?,?,?)',(tenant,project,'department','forbidden',1,'{}'))
 def test_private_finance_write_blocked_for_analyst(self):
  with self.assertRaises(psycopg.errors.InsufficientPrivilege):
   with connect(self.url,self.analyst) as db:db.execute('INSERT INTO objects VALUES(?,?,?,?,?,?)',('tenant-a',self.project,'business_financials','forbidden',1,'{}'))
 def test_audit_cannot_be_changed_or_deleted(self):
  with connect(self.url,self.owner) as db:
   self.assertEqual(db.execute("UPDATE audit SET event='tampered'").rowcount,0)
   self.assertEqual(db.execute('DELETE FROM audit').rowcount,0)
  self.assertTrue(self.engine.dispatch(self.owner,'audit',self.project,{})['chain_valid'])
 def test_snapshot_report_and_workstreams_use_postgres(self):
  self.engine.dispatch(self.owner,'workstreams.initialise',self.project,{})
  snap=self.engine.dispatch(self.owner,'snapshot',self.project,{})
  self.assertEqual(len(snap['business']['people']),1)
  self.assertEqual(len([o for o in snap['objects'] if o['kind']=='checkpoint']),36)
 def test_superuser_and_missing_actor_are_refused(self):
  with self.assertRaises(RuntimeError):
   with connect(self.admin,self.owner):pass
  with self.assertRaises(RuntimeError):
   with connect(self.url):pass
 def test_member_revocation_takes_effect(self):
  actor=Actor('tenant-a','temporary','member')
  self.engine.dispatch(self.owner,'members.add',self.project,{'user_id':actor.user,'role':'viewer'})
  self.assertEqual(len(self.engine.dispatch(actor,'projects.list',None,{})),1)
  self.engine.dispatch(self.owner,'members.remove',self.project,{'user_id':actor.user})
  with connect(self.url,actor) as db:self.assertEqual(list(db.execute('SELECT * FROM objects')),[])
 def test_ai_run_persists_and_accounts_usage_in_postgres(self):
  config={'models':[{'id':'fixture','label':'Offline fixture','provider':'openai','model':'fixture','credential_env':'OQ_SECRET_TEST','bindings':[{'tenant':self.owner.tenant,'project':self.project}]}],'connectors':[]}
  class FakeModel:
   def __init__(self,config):pass
   def decide(self,system,context,tokens):return {'type':'tool','tool':'business_report','arguments':{}},{'input_tokens':10,'output_tokens':5}
  engine=Engine(self.url);engine.ai=AIHub(engine,config,model_factory=FakeModel)
  policy={**DEFAULT_POLICY,'enabled':True,'data_sharing_approved':True,'routes':{'finance':'fixture'}}
  engine.dispatch(self.owner,'ai.policy.save',self.project,{'policy':policy,'expected_revision':0})
  engine.dispatch(self.owner,'ai.runs.start',self.project,{'id':'postgres-run','profile':'finance','goal':'Review business evidence'})
  result=engine.dispatch(self.owner,'ai.runs.step',self.project,{'id':'postgres-run'})
  self.assertEqual(result['step'],1)
  self.assertEqual(len(result['payload']['observations'][0]['result']['people']),1)
  status=engine.dispatch(self.owner,'ai.status',self.project,{})
  self.assertEqual(status['usage_today']['model_calls'],1)
  with self.assertRaises(APIError):engine.dispatch(self.other,'ai.runs.get',self.project,{'id':'postgres-run'})

 def test_bridge_receipt_is_hidden_from_other_project_members_at_database_level(self):
  request={'connection':'source-test','id':'receipt','product':'haccora','contract':'event','profile':'compliance','scope':{'tenantId':'external-org'},'payload':{'type':'integration.test'},'daily_limit':10}
  self.engine.dispatch(self.analyst,'bridges.submit',self.project,request)
  with connect(self.url,self.analyst) as db:self.assertEqual(len(list(db.execute('SELECT * FROM bridge_jobs'))),1)
  for actor in (self.owner,self.viewer,self.other):
   with connect(self.url,actor) as db:
    self.assertEqual(list(db.execute('SELECT * FROM bridge_jobs')),[])
    self.assertEqual(db.execute("UPDATE bridge_jobs SET status='failed'").rowcount,0)
  with self.assertRaises(APIError):self.engine.dispatch(self.owner,'bridges.get',self.project,{'connection':'source-test','id':'receipt'})

if __name__=='__main__':unittest.main(verbosity=2)
