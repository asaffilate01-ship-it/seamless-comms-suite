from pathlib import Path
import tempfile
import unittest
from transformation.engine import Engine,Actor
from transformation.workstreams import validate,reconciliation
from knowledge_core.types import APIError

class WorkstreamTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.e=Engine(Path(self.temp.name)/"db.sqlite")
        self.owner=Actor("t1","owner","owner")
        self.finance=Actor("t1","finance","member")
        self.p=self.e.create_project(self.owner,{"name":"Test","currency":"GBP"})["id"]
        self.e.add_member(self.owner,self.p,{"user_id":"finance","role":"finance"})
    def tearDown(self):self.temp.cleanup()
    def test_templates_are_additive_and_all_six_block_initially(self):
        self.assertEqual(self.e.initialise_workstreams(self.owner,self.p,{})["created_records"],42)
        self.assertEqual(self.e.initialise_workstreams(self.owner,self.p,{})["created_records"],0)
        r=self.e.snapshot(self.owner,self.p)["workstreams"]
        self.assertEqual(len(r["streams"]),6)
        self.assertTrue(all(s["status"]=="blocked" for s in r["streams"]))
    def test_per_account_reconciliation_catches_offsetting_errors(self):
        data={"id":"r1","tolerance_amount":"0","lines":[{"key":"receivables","currency":"GBP","source_amount":"100","target_amount":"110","source_count":1,"target_count":1},{"key":"payables","currency":"GBP","source_amount":"200","target_amount":"190","source_count":1,"target_count":1}]}
        self.assertEqual(reconciliation(data)["exception_count"],2)
    def test_counts_are_checked_even_when_money_matches(self):
        self.assertEqual(reconciliation({"id":"r","tolerance_amount":"0","lines":[{"key":"cash","currency":"GBP","source_amount":"100","target_amount":"100","source_count":10,"target_count":9}]})["status"],"exceptions")
    def test_control_assessment_cannot_skip_evidence(self):
        with self.assertRaises(APIError):validate("security_mapping",{"id":"nca1","framework":"NCA","edition":"operator-selected","control_ref":"control-1","scope":"project","owner":"security","applicability":"applicable","status":"assessed"})
    def test_benefits_require_independent_finance_and_prevent_double_count(self):
        self.e.import_finance(self.owner,self.p,{"entries":[{"id":"base","kind":"baseline","category":"opex","amount":"100","currency":"GBP","period":"2026-09-01","source_ref":"urn:base"},{"id":"actual","kind":"actual","category":"opex","amount":"70","currency":"GBP","period":"2026-09-01","source_ref":"urn:actual"}]})
        data={"id":"b1","baseline_id":"base","actual_id":"actual","title":"Hosting savings","attribution_note":"Same service scope and month"}
        self.e.propose_benefit(self.owner,self.p,data)
        with self.assertRaises(APIError):self.e.verify_benefit(self.owner,self.p,{"id":"b1","evidence_ref":"urn:review"})
        self.e.verify_benefit(self.finance,self.p,{"id":"b1","evidence_ref":"urn:review"})
        self.e.propose_benefit(self.owner,self.p,{**data,"id":"b2"})
        with self.assertRaises(APIError):self.e.verify_benefit(self.finance,self.p,{"id":"b2","evidence_ref":"urn:review2"})
        self.assertEqual(self.e.snapshot(self.owner,self.p)["workstreams"]["finance_reviewed_benefits"],{"GBP":"30.00"})

if __name__=="__main__":unittest.main()
