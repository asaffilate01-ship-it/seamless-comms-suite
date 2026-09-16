import tempfile,unittest
from pathlib import Path
from transformation.engine import Engine,Actor
from transformation.business import metrics
from knowledge_core.types import APIError
class Business360Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.engine=Engine(Path(self.tmp.name)/'data.db');self.owner=Actor('tenant-one','owner','owner');self.viewer=Actor('tenant-one','viewer','member');self.analyst=Actor('tenant-one','analyst','member')
  self.p=self.engine.create_project(self.owner,{'name':'Business','currency':'GBP'})['id']
  self.engine.add_member(self.owner,self.p,{'user_id':'viewer','role':'viewer'});self.engine.add_member(self.owner,self.p,{'user_id':'analyst','role':'analyst'})
  self.save('company',{'id':'business','name':'Business','company_role':'operating','sector':'Services','countries':['GB'],'owner':'Director'})
 def tearDown(self): self.tmp.cleanup()
 def save(self,kind,data,actor=None): return self.engine.upsert(actor or self.owner,self.p,{'kind':kind,'record':data,'expected_revision':0})
 def base(self,id): return {'id':id,'company_id':'business','owner':'Director','evidence_ref':'urn:test:'+id}
 def test_onboarding_requires_business_then_department_then_person(self):
  person={**self.base('sam'),'name':'Sam','department_id':'sales','job_title':'Manager','employment_type':'employee'}
  with self.assertRaises(APIError): self.save('person',person)
  self.save('department',{**self.base('sales'),'name':'Sales','purpose':'Acquire and retain customers'})
  self.save('person',person)
  report=self.engine.dispatch(self.owner,'business.report',self.p,{})
  self.assertEqual(len(report['people']),1);self.assertEqual(report['coverage_summary']['unassessed'],12)
 def test_restricted_pay_hidden_from_viewer_and_analyst_exports(self):
  self.test_onboarding_requires_business_then_department_then_person()
  self.save('person_private',{**self.base('pay'),'person_id':'sam','annual_salary':'50000','annual_benefits':'5000','currency':'GBP'})
  for actor in [self.viewer,self.analyst]:
   data=self.engine.dispatch(actor,'export',self.p,{})
   self.assertNotIn('person_private',[o['kind'] for o in data['objects']])
  self.assertIn('person_private',[o['kind'] for o in self.engine.snapshot(self.owner,self.p)['objects']])
 def test_metrics_are_matched_period_decimal_calculations(self):
  r=metrics({**self.base('month'),'period_start':'2026-09-01','period_end':'2026-09-30','currency':'GBP','revenue':'10000','cogs':'4000','opex':'3500','average_receivables':'5000','credit_sales':'10000','marketing_cost':'1000','new_customers':'10'})
  self.assertEqual(r['gross_margin_percent'],'60.00');self.assertEqual(r['operating_profit'],'2500.00');self.assertEqual(r['dso_days'],'15.00');self.assertEqual(r['cac'],'100.00');self.assertIsNone(r['cash_conversion_days'])
 def test_missing_and_zero_inputs_are_unavailable(self):
  r=metrics({**self.base('empty'),'period_start':'2026-09-01','period_end':'2026-09-30','currency':'GBP','revenue':'0','cogs':'0','new_customers':'0','marketing_cost':'100'})
  self.assertIsNone(r['gross_margin_percent']);self.assertIsNone(r['cac'])
 def test_only_current_undisputed_overdue_balances_are_candidates(self):
  for id,hold,disputed,verified in [('good',False,False,'2026-09-16'),('held',True,False,'2026-09-16'),('disputed',False,True,'2026-09-16'),('stale',False,False,'2026-09-15')]:
   self.save('receivable',{**self.base(id),'customer_ref':'customer','invoice_ref':id,'currency':'GBP','outstanding':'100','due_date':'2026-09-01','disputed':disputed,'collection_hold':hold,'last_verified':verified})
  r=self.engine.dispatch(self.owner,'business.report',self.p,{'as_of':'2026-09-16'})
  self.assertEqual(r['collections']['eligible_invoice_ids'],['good']);self.assertEqual(r['collections']['overdue_total'],'400.00')
 def test_duplicate_invoice_is_rejected(self):
  row={**self.base('inv'),'customer_ref':'customer','invoice_ref':'same','currency':'GBP','outstanding':'100','due_date':'2026-09-01','disputed':False,'collection_hold':False,'last_verified':'2026-09-16'}
  self.save('receivable',row)
  with self.assertRaises(APIError):self.save('receivable',{**row,'id':'different-id'})
 def test_verification_and_access_are_enforced_at_backend(self):
  answer={**self.base('a'),'domain':'purpose','question':'Purpose?','answer':'Service delivery','source_kind':'interview','evidence_status':'verified'}
  with self.assertRaises(APIError): self.save('discovery_answer',answer,self.analyst)
  with self.assertRaises(APIError): self.save('discovery_answer',{**answer,'evidence_status':'reported'},self.viewer)
  with self.assertRaises(APIError): self.engine.dispatch(Actor('other','owner','owner'),'business.report',self.p,{})
 def test_overlapping_estimates_are_flagged_not_totalled(self):
  for id in ['one','two']:
   self.save('improvement',{**self.base(id),'name':id,'benefit_type':'cost_saving','amount':'1000','frequency':'monthly','implementation_cost':'1500','recurring_cost':'150','overlap_group':'same-licences','assumptions':'Subject to contract review','action':'Review licences','target_date':'2026-10-16'})
  r=self.engine.dispatch(self.owner,'business.report',self.p,{})
  self.assertEqual(r['opportunities'][0]['first_year_net'],'8700.00');self.assertTrue(all(x['overlap'] for x in r['opportunities']));self.assertNotIn('total_savings',r)
 def test_saved_records_survive_engine_restart(self):
  self.save('department',{**self.base('ops'),'name':'Operations','purpose':'Deliver work'})
  other=Engine(self.engine.path);self.assertEqual(len(other.dispatch(self.owner,'business.report',self.p,{})['departments']),1)

 def test_reporting_cycle_is_rejected(self):
  self.test_onboarding_requires_business_then_department_then_person()
  self.save('person',{**self.base('lee'),'name':'Lee','department_id':'sales','job_title':'Director','employment_type':'employee','reports_to':'sam'})
  with self.assertRaises(APIError):
   self.engine.dispatch(self.owner,'records.save',self.p,{'kind':'person','expected_revision':1,'record':{**self.base('sam'),'name':'Sam','department_id':'sales','job_title':'Manager','employment_type':'employee','reports_to':'lee'}})
 def test_financial_write_role_and_integral_counts(self):
  reviewer=Actor('tenant-one','reviewer','member')
  self.engine.add_member(self.owner,self.p,{'user_id':'reviewer','role':'reviewer'})
  baseline={**self.base('numbers'),'period_start':'2026-09-01','period_end':'2026-09-30','currency':'GBP','revenue':'1000','new_customers':'3'}
  with self.assertRaises(APIError):self.save('business_financials',baseline,reviewer)
  with self.assertRaises(APIError):self.save('business_financials',{**baseline,'new_customers':'3.5'})
