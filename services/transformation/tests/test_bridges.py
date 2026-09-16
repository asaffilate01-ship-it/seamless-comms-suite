from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from transformation.engine import Engine, Actor
from transformation.ai_hub import AIHub, DEFAULT_POLICY
from transformation.bridge_contracts import prepare, validate_result, epos_totals
from knowledge_core.types import APIError

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.e=Engine(Path(self.tmp.name)/'bridge.db')
        self.actor=Actor('tenant-a','source-a','member');self.other=Actor('tenant-b','source-b','owner')
        self.owner=Actor('tenant-a','owner','owner')
        self.project=self.e.create_project(self.owner,{'name':'Bridge test','currency':'GBP'})['id']
        self.e.add_member(self.owner,self.project,{'user_id':self.actor.user,'role':'analyst'})
        self.calls=[]; self.reply={'text':'Review the supplied stock.','sources':['part-1']}; parent=self
        class Model:
            def __init__(self,c):pass
            def decide(self,system,context,tokens):
                parent.calls.append(context)
                if parent.callback:parent.callback()
                return deepcopy(parent.reply),{'input_tokens':5,'output_tokens':10}
        self.callback=None
        self.e.ai=AIHub(self.e,{'models':[{'id':'model','label':'Fixture','provider':'openai','model':'fixture','credential_env':'OQ_SECRET_TEST','bindings':[{'tenant':self.actor.tenant,'project':self.project}]}],'connectors':[]},model_factory=Model)
        self.policy={**deepcopy(DEFAULT_POLICY),'enabled':True,'data_sharing_approved':True,'routes':{'product':'model','discovery':'model','finance':'model'}}
        self.e.ai.save_policy(self.owner,self.project,{'policy':self.policy,'expected_revision':0})
        self.input={'connection':'spares-a','id':'event-1','product':'sparesgrid','contract':'sparesgrid_question','profile':'product','scope':{'tenantId':'source-tenant','scopeId':'source-tenant'},'payload':{'question':'What needs review?','context':[{'id':'part-1','kind':'part','data':{'title':'Used door','defects':'scratched'}}]},'daily_limit':10}
        self.ref={'connection':'spares-a','id':'event-1'}
    def tearDown(self):self.tmp.cleanup()
    def submit(self,value=None,actor=None):return self.e.dispatch(actor or self.actor,'bridges.submit',self.project,value or self.input)
    def process(self,data=None):return self.e.dispatch(self.actor,'bridges.process',self.project,data or self.ref)
    def test_duplicate_is_single_receipt_and_changed_payload_rejected(self):
        self.assertEqual(self.submit(),self.submit())
        changed=deepcopy(self.input);changed['payload']['question']='Different'
        with self.assertRaises(APIError) as c:self.submit(changed)
        self.assertEqual(c.exception.status,409)
    def test_cross_tenant_and_other_project_member_cannot_read(self):
        self.submit()
        for actor in (self.other,self.owner):
            with self.assertRaises(APIError):self.e.dispatch(actor,'bridges.get',self.project,self.ref)
    def test_same_principal_different_connection_cannot_read(self):
        self.submit()
        with self.assertRaises(APIError):self.e.dispatch(self.actor,'bridges.get',self.project,{**self.ref,'connection':'other'})
    def test_only_source_context_sent_and_result_is_reviewed_draft(self):
        self.submit();result=self.process()
        self.assertEqual(result['status'],'draft');self.assertTrue(result['reviewRequired'])
        self.assertEqual(self.calls,[self.input['payload']])
        self.process();self.assertEqual(len(self.calls),1)
    def test_unknown_citations_fail_without_persisting_output(self):
        self.reply['sources']=['other-tenant-record'];self.submit()
        with self.assertRaises(APIError):self.process()
        result=self.e.dispatch(self.actor,'bridges.get',self.project,self.ref)
        self.assertEqual(result['status'],'failed');self.assertIsNone(result['result'])
        with self.assertRaises(APIError):self.process()
        self.assertEqual(len(self.calls),1)
    def test_revoked_project_member_cannot_process_or_read(self):
        self.submit();self.e.remove_member(self.owner,self.project,{'user_id':self.actor.user})
        with self.assertRaises(APIError):self.process()
        self.assertEqual(len(self.calls),0)
    def test_policy_changed_during_model_call_discards_output(self):
        self.submit()
        self.callback=lambda:self.e.ai.save_policy(self.owner,self.project,{'policy':{**self.policy,'enabled':False},'expected_revision':1})
        with self.assertRaises(APIError):self.process()
        self.assertIsNone(self.e.dispatch(self.actor,'bridges.get',self.project,self.ref)['result'])
    def test_private_source_receipt_not_in_project_export(self):
        self.submit();self.process()
        export=self.e.dispatch(self.owner,'export',self.project,{})
        self.assertNotIn('Review the supplied stock.',str(export));self.assertNotIn('scratched',str(export))
    def test_request_and_model_budgets_are_enforced(self):
        self.input['daily_limit']=1;self.submit()
        with self.assertRaises(APIError):self.submit({**self.input,'id':'event-2'})
        self.e.ai.save_policy(self.owner,self.project,{'policy':{**self.policy,'daily_model_calls':1},'expected_revision':1})
        self.process();self.submit({**self.input,'id':'event-2','daily_limit':10})
        with self.assertRaises(APIError):self.process({**self.ref,'id':'event-2'})
    def test_metadata_event_does_not_run_model(self):
        self.submit({**self.input,'contract':'event','payload':{'eventType':'inspection.updated'}})
        with self.assertRaises(APIError):self.process()
        self.assertEqual(self.calls,[])
    def law(self):
        scope={'schema_version':1,'operation':'prepare_assessment','firm_id':'firm-a','case_id':'case-a','request_id':'request-a','context_revision':2,'kind':'legal'}
        data={**self.input,'product':'lawquo','contract':'lawquo_assessment','scope':scope,'payload':{}}
        context={'scope':scope,'context':{'jurisdiction':'GB','as_of':'2026-09-16'},'sources':[{'id':'evidence-1','text':'Approved case evidence'}]}
        a={'summary':'Review needed','client_summary':'Please review','issues':[{'issue':'Evidence gap','analysis':'Evidence requires review','source_ids':['evidence-1'],'counterargument':'Missing chronology'}],'missing_evidence':['Chronology'],'questions':[],'limitations':['Not a final opinion'],'actions':[]}
        self.reply={'assessment':a};return data,context
    def test_lawquo_requires_authorised_context_and_exact_revision(self):
        data,context=self.law();self.submit(data)
        with self.assertRaises(APIError):self.process()
        bad=deepcopy(context);bad['scope']['context_revision']=3
        with self.assertRaises(APIError):self.process({**self.ref,'context':bad})
        result=self.process({**self.ref,'context':context})
        self.assertEqual(result['result']['case_id'],'case-a')
        self.assertEqual(result['result']['assessment'],self.reply['assessment'])
        self.process({**self.ref,'context':context});self.assertEqual(len(self.calls),1)
        context['sources'][0]['text']='Changed evidence without revision'
        with self.assertRaises(APIError):self.process({**self.ref,'context':context})
    def test_lawquo_cannot_return_unknown_citations_or_actions(self):
        data,context=self.law();self.submit(data);self.reply['assessment']['issues'][0]['source_ids']=['foreign']
        with self.assertRaises(APIError):self.process({**self.ref,'context':context})
    def test_taxnuvia_requires_exact_candidate_set(self):
        payload={'brief':{'services':['accounts']},'candidates':[{'accountant_profile_id':'firm-1'},{'accountant_profile_id':'firm-2'}]}
        _,_,ids=prepare('taxnuvia_matching',payload,{})
        row={'accountant_profile_id':'firm-1','score':50,'reasons':['Service fit'],'watchouts':[],'explanation':'Review service scope'}
        for rows in ([row],[row,row],[row,{**row,'accountant_profile_id':'foreign'}]):
            with self.assertRaises(APIError):validate_result('taxnuvia_matching',{'matches':rows},{},ids)
        self.assertEqual(len(validate_result('taxnuvia_matching',{'matches':[row,{**row,'accountant_profile_id':'firm-2'}]},{},ids)['matches']),2)
    def test_epos_arithmetic_and_invalid_periods(self):
        c={'period_start':'2026-09-01','period_end':'2026-09-16','currency':'GBP','gross_sales':'1000','refunds':'50','discounts':'50','cost_of_goods':'450','source_ids':['summary-1']}
        self.assertEqual(epos_totals(c)['gross_margin_pct'],'50.00')
        for bad in ({'gross_sales':'NaN'},{'cost_of_goods':'-1'},{'period_end':'2026-08-01'},{'currency':'mixed'}):
            with self.assertRaises(APIError):epos_totals({**c,**bad})
    def test_browser_user_cannot_replace_source_context(self):
        self.submit()
        with self.assertRaises(APIError):self.process({**self.ref,'context':{'question':'Replace evidence'}})
        self.assertEqual(self.calls,[])

if __name__=='__main__':unittest.main()
