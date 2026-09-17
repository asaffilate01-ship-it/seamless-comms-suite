"""Fictional offline Business360 onboarding and report; no external calls."""
import sys,tempfile,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'omniqora-update/services/transformation'))
from transformation.engine import Engine,Actor
with tempfile.TemporaryDirectory() as directory:
 engine=Engine(Path(directory)/'demo.db');actor=Actor('fictional-tenant','demo-owner','owner')
 project=engine.dispatch(actor,'projects.create',None,{'name':'Fictional service business','currency':'GBP'})['id']
 def save(kind,data):return engine.dispatch(actor,'records.save',project,{'kind':kind,'expected_revision':0,'record':data})
 def common(id):return {'id':id,'company_id':'business','owner':'Demo director','evidence_ref':'urn:fictional:'+id}
 save('company',{'id':'business','name':'Fictional service business','company_role':'operating','sector':'Business services','countries':['GB'],'owner':'Demo director'})
 save('department',{**common('sales'),'name':'Sales','purpose':'Win and retain customers'})
 save('person',{**common('manager'),'name':'Demo manager','department_id':'sales','job_title':'Sales manager','employment_type':'employee'})
 save('stakeholder',{**common('customer'),'name':'Demo customer contact','party':'customer','organisation':'Fictional customer Ltd','interest':'Faster response and accurate invoices'})
 save('discovery_answer',{**common('purpose'),'domain':'purpose','question':'What does the business do, for whom and why?','answer':'Fictional business providing contracted support to business customers. Illustrative input only.','source_kind':'interview','evidence_status':'reported'})
 save('business_financials',{**common('september'),'period_start':'2026-09-01','period_end':'2026-09-30','currency':'GBP','revenue':'100000','cogs':'40000','opex':'35000','credit_sales':'100000','average_receivables':'150000','marketing_cost':'5000','new_customers':'20','leads':'200','won_leads':'20','calls':'300','missed_calls':'30'})
 save('stakeholder_issue',{**common('invoice-delay'),'name':'Late invoicing','party':'customer','domain':'collections','problem':'Invoices are raised weekly after work is completed','impact':'Cash arrives later and customers need clarifications','recommendation':'Review job-completion and invoice handoff','severity':'high','status':'open'})
 save('improvement',{**common('licences'),'name':'Review duplicate licences','benefit_type':'cost_saving','amount':'500','frequency':'monthly','implementation_cost':'600','recurring_cost':'0','overlap_group':'licence-review','assumptions':'Fictional estimate; confirm contract exit rights and operational need','action':'Review licence usage and renewal dates','target_date':'2026-10-16'})
 save('receivable',{**common('invoice'),'customer_ref':'fictional-customer','invoice_ref':'F-001','currency':'GBP','outstanding':'2500','due_date':'2026-09-01','disputed':False,'collection_hold':False,'last_verified':'2026-09-16'})
 print(json.dumps(engine.dispatch(actor,'business.report',project,{'as_of':'2026-09-16'}),indent=2))
