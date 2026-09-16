import base64
import hashlib
import hmac
import io
import json
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import transformation
from transformation.engine import Engine, Actor
from transformation.finance import scenario
from transformation.auth import verify
from transformation.server import create_app
from transformation.technical import dependency_analysis
from knowledge_core.service import KnowledgeService
from knowledge_core.store import Store
from knowledge_core.types import APIError


class TransformationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.knowledge = KnowledgeService(Store(str(Path(self.temp.name)/"knowledge.db")))
        self.engine = Engine(Path(self.temp.name)/"project.db", self.knowledge)
        self.owner = Actor("tenant-a", "owner", "owner")
        self.reviewer = Actor("tenant-a", "reviewer", "member")
        self.viewer = Actor("tenant-a", "viewer", "member")
        self.p = self.engine.create_project(self.owner, {"name": "Fictional carve-out", "currency": "GBP"})["id"]
        self.engine.add_member(self.owner,self.p,{"user_id":"reviewer","role":"reviewer"})
        self.engine.add_member(self.owner,self.p,{"user_id":"viewer","role":"viewer"})

    def tearDown(self):
        self.temp.cleanup()

    def fails(self, code, fn, *args):
        with self.assertRaises(APIError) as e:
            fn(*args)
        self.assertEqual(e.exception.status, code)

    def task(self, id="task-1"):
        return {"id":id,"title":"Review payroll cutover","owner":"owner","status":"todo","critical":True}

    def proposal(self):
        return self.engine.propose(self.owner,self.p,{"kind":"create_task","payload":self.task()})["id"]

    def entry(self, id="cost-1", **kw):
        return {"id":id,"kind":"actual","category":"opex","amount":"10.20","currency":"GBP","period":"2026-09-01","source_ref":"urn:invoice:1",**kw}

    def test_cross_tenant_and_project_denial(self):
        self.fails(404,self.engine.snapshot,Actor("tenant-b","owner","owner"),self.p)
        self.fails(404,self.engine.snapshot,Actor("tenant-a","outsider","owner"),self.p)

    def test_viewer_cannot_write_or_plan(self):
        self.fails(403,self.engine.upsert,self.viewer,self.p,{"kind":"task","record":self.task(),"expected_revision":0})
        self.fails(403,self.engine.propose,self.viewer,self.p,{"kind":"create_task","payload":self.task()})

    def test_revision_conflict(self):
        args={"kind":"task","record":self.task(),"expected_revision":0}
        self.engine.upsert(self.owner,self.p,args)
        self.fails(409,self.engine.upsert,self.owner,self.p,args)

    def test_finance_idempotency_and_immutable_ids(self):
        self.engine.import_finance(self.owner,self.p,{"entries":[self.entry()]})
        self.engine.import_finance(self.owner,self.p,{"entries":[self.entry()]})
        self.assertEqual(self.engine.snapshot(self.owner,self.p)["financial"]["actual_cost"],"10.20")
        self.fails(409,self.engine.import_finance,self.owner,self.p,{"entries":[self.entry(amount="11.20")]})

    def test_finance_decimal_and_fx(self):
        self.engine.import_finance(self.owner,self.p,{"entries":[self.entry(amount="0.10"),self.entry("cost-2",amount="0.20"),self.entry("usd",amount="10.00",currency="USD",fx_rate="0.8",fx_as_of="2026-09-01",fx_source="urn:treasury:rate")]})
        self.assertEqual(self.engine.snapshot(self.owner,self.p)["financial"]["actual_cost"],"8.30")

    def test_invalid_finance_batch_is_atomic(self):
        self.fails(422,self.engine.import_finance,self.owner,self.p,{"entries":[self.entry(),self.entry("bad",currency="USD")]})
        self.assertEqual(self.engine.snapshot(self.owner,self.p)["financial"]["actual_cost"],"0.00")

    def test_finance_rejects_nan_float_and_precision(self):
        for amount in ["NaN", "Infinity", 0.1, "1.001", "-1"]:
            self.fails(422,self.engine.import_finance,self.owner,self.p,{"entries":[self.entry(amount=amount)]})

    def test_budget_estimate_and_revenue_separation(self):
        entries=[self.entry("budget",kind="budget",amount="100"),self.entry(amount="20"),self.entry("forecast",kind="forecast",amount="50"),self.entry("revenue",category="revenue",amount="200")]
        self.engine.import_finance(self.owner,self.p,{"entries":entries})
        r=self.engine.snapshot(self.owner,self.p)["financial"]
        self.assertEqual((r["estimate_at_completion"],r["budget_variance_at_completion"],r["actual_revenue"]),("70.00","30.00","200.00"))

    def test_scenario_known_cashflows_and_no_payback(self):
        r=scenario({"initial_cost":"100","monthly_saving":"20","months":12,"annual_discount_rate":"0","currency":"GBP"})
        self.assertEqual((r["npv"],r["payback_month"],r["roi_percent"]),("140.00",5,"140.00"))
        self.assertIsNone(scenario({"initial_cost":"100","months":2})["payback_month"])

    def test_delay_cost_and_npv(self):
        r=scenario({"initial_cost":"100","monthly_saving":"20","monthly_tsa_cost":"10","delay_months":2,"months":4,"annual_discount_rate":"0"})
        self.assertEqual((r["npv"],r["tsa_delay_cost"]),("-80.00","20.00"))

    def test_savings_needs_comparable_periods(self):
        self.engine.import_finance(self.owner,self.p,{"entries":[self.entry("baseline",kind="baseline",amount="20"),self.entry("actual",amount="10")]})
        self.assertEqual(self.engine.compare_savings(self.owner,self.p,{"baseline_id":"baseline","actual_id":"actual"})["difference"],"10.00")

    def test_empty_project_never_ready(self):
        self.assertEqual(self.engine.snapshot(self.owner,self.p)["technical"]["status"],"blocked")

    def test_dependency_order_and_impact(self):
        systems=[{"id":n} for n in ("identity","erp","payroll")]
        edges=[{"id":"d1","source":"erp","target":"identity"},{"id":"d2","source":"payroll","target":"erp"}]
        r=dependency_analysis(systems,edges,"identity")
        self.assertEqual(r["migration_waves"],[["identity"],["erp"],["payroll"]])
        self.assertEqual(r["impacted"][-1]["path"],["identity","erp","payroll"])

    def test_cycles_block_schedule(self):
        r=dependency_analysis([{"id":"a"},{"id":"b"}],[{"id":"d1","source":"a","target":"b"},{"id":"d2","source":"b","target":"a"}])
        self.assertEqual(r["blocked_by_cycles"],["a","b"])

    def test_self_approval_denied(self):
        aid=self.proposal()
        self.fails(403,self.engine.review,self.owner,self.p,{"id":aid,"decision":"approved"})

    def test_unapproved_action_denied(self):
        self.fails(403,self.engine.execute,self.owner,self.p,{"id":self.proposal()})

    def test_action_approval_execution_and_replay(self):
        aid=self.proposal()
        self.engine.review(self.reviewer,self.p,{"id":aid,"decision":"approved"})
        self.engine.execute(self.owner,self.p,{"id":aid})
        self.assertTrue(self.engine.execute(self.owner,self.p,{"id":aid})["replayed"])
        self.assertEqual(len(self.engine.snapshot(self.owner,self.p)["objects"]),1)

    def test_concurrent_execution_creates_one_effect(self):
        aid=self.proposal()
        self.engine.review(self.reviewer,self.p,{"id":aid,"decision":"approved"})
        with ThreadPoolExecutor(max_workers=2) as pool:
            rs=list(pool.map(lambda _:self.engine.execute(self.owner,self.p,{"id":aid}),range(2)))
        self.assertEqual(sum(not r["replayed"] for r in rs),1)

    def test_stale_approval_denied(self):
        aid=self.proposal()
        self.engine.review(self.reviewer,self.p,{"id":aid,"decision":"approved"})
        self.engine.upsert(self.owner,self.p,{"kind":"task","record":self.task("another"),"expected_revision":0})
        self.fails(409,self.engine.execute,self.owner,self.p,{"id":aid})

    def test_revoked_reviewer_invalidates_approval(self):
        aid=self.proposal()
        self.engine.review(self.reviewer,self.p,{"id":aid,"decision":"approved"})
        self.engine.remove_member(self.owner,self.p,{"user_id":"reviewer"})
        self.fails(409,self.engine.execute,self.owner,self.p,{"id":aid})
        self.fails(404,self.engine.snapshot,self.reviewer,self.p)

    def test_pause_stops_agent_and_actions(self):
        aid=self.proposal()
        self.engine.policy(self.owner,self.p,{"mode":"approval","paused":True})
        self.fails(409,self.engine.execute,self.owner,self.p,{"id":aid})
        self.fails(409,self.engine.agent_cycle,self.owner,self.p,{})

    def test_auto_agent_is_bounded_and_no_duplicate_tasks(self):
        self.engine.policy(self.owner,self.p,{"mode":"auto_low_risk","paused":False})
        r=self.engine.agent_cycle(self.owner,self.p,{})
        self.assertTrue(r["actions"])
        self.assertLessEqual(len(r["actions"]),8)
        self.assertEqual(self.engine.agent_cycle(self.owner,self.p,{})["actions"],[])

    def test_arbitrary_tool_and_fake_completion_denied(self):
        self.fails(422,self.engine.propose,self.owner,self.p,{"kind":"shell","payload":{"command":"rm"}})
        self.fails(422,self.engine.propose,self.owner,self.p,{"kind":"create_task","payload":{**self.task(),"status":"done"}})

    def test_diagnostic_template_idempotent_conflict(self):
        r=self.engine.diagnostic(self.owner,self.p,{"start_date":"2026-09-15"})
        self.assertEqual(len(r["task_ids"]),10)
        self.fails(409,self.engine.diagnostic,self.owner,self.p,{"start_date":"2026-09-15"})

    def test_audit_integrity_and_tamper_detection(self):
        self.assertTrue(self.engine.audit(self.owner,self.p)["chain_valid"])
        with self.engine.connection() as db:
            db.execute("UPDATE audit SET event='tampered' WHERE seq=1")
        self.assertFalse(self.engine.audit(self.owner,self.p)["chain_valid"])

    def ingest(self):
        return self.engine.evidence(self.owner,self.p,"ingest",{"id":"contract","title":"Fictional payroll dependency","text":"Payroll depends on Identity. Seller support ends on 30 November 2026.","source_uri":"urn:fictional:contract","expected_revision":0})

    def test_rag_graph_paths_and_project_isolation(self):
        self.ingest()
        self.engine.evidence(self.owner,self.p,"add_edge",{"id":"link1","source":"Payroll","relation":"DEPENDS_ON","target":"Identity","document_id":"contract","document_revision":1,"quote":"Payroll depends on Identity."})
        r=self.engine.evidence(self.viewer,self.p,"query",{"question":"What does Payroll depend on?","mode":"hybrid","seeds":["Payroll"]})
        self.assertEqual(r["status"],"evidence_only")
        self.assertTrue(r["graph_paths"])
        p2=self.engine.create_project(self.owner,{"name":"Other deal","currency":"GBP"})["id"]
        r2=self.engine.evidence(self.owner,p2,"query",{"question":"Payroll","mode":"hybrid"})
        self.assertEqual(r2["status"],"insufficient_evidence")

    def test_evidence_change_invalidates_action(self):
        aid=self.proposal()
        self.engine.review(self.reviewer,self.p,{"id":aid,"decision":"approved"})
        self.ingest()
        self.fails(409,self.engine.execute,self.owner,self.p,{"id":aid})

    def test_unreviewed_graph_edge_and_unknown_citation(self):
        self.ingest()
        self.fails(422,self.engine.evidence,self.owner,self.p,"add_edge",{"id":"x","source":"Payroll","relation":"DEPENDS_ON","target":"Bank","document_id":"contract","document_revision":1,"quote":"Payroll depends on Bank."})
        self.fails(502,KnowledgeService._validate_generation,{"insufficient":False,"claims":[{"text":"Wrong source","citations":["C99"]}]},{"C1"})

    def signed(self, raw=b'{}', stamp="1000", nonce="1234567890abcdef"):
        context=base64.urlsafe_b64encode(json.dumps({"tenant":"tenant-a","user":"owner","tenant_role":"owner"}).encode()).decode().rstrip("=")
        signature=hmac.new(b"x"*40,stamp.encode()+b"\n"+nonce.encode()+b"\n"+context.encode()+b"\n"+raw,hashlib.sha256).hexdigest()
        return {"X-OQ-Timestamp":stamp,"X-OQ-Nonce":nonce,"X-OQ-Context":context,"X-OQ-Signature":signature}

    def test_signed_context_replay_and_tamper(self):
        headers=self.signed()
        self.assertEqual(verify(self.engine,b'{}',headers,"x"*40,now=1000).user,"owner")
        self.fails(409,verify,self.engine,b'{}',headers,"x"*40,1000)
        self.fails(401,verify,self.engine,b'{"changed":true}',self.signed(nonce="abcdefgh12345678"),"x"*40,1000)

    def test_expired_signature_and_http_no_unsigned_access(self):
        self.fails(401,verify,self.engine,b'{}',self.signed(),"x"*40,1200)
        app=create_app(self.engine,"x"*40)
        status=[]
        result=b''.join(app({"PATH_INFO":"/rpc","REQUEST_METHOD":"POST","CONTENT_TYPE":"application/json","CONTENT_LENGTH":"2","wsgi.input":io.BytesIO(b'{}')},lambda s,h:status.append(s)))
        self.assertTrue(status[0].startswith("401"))
        self.assertIn(b"error",result)

    def test_generation_provider_uses_retrieved_sources(self):
        class Provider:
            embedding_id="none"
            chat_model="contract-test-model"
            def embed(self,texts): return [None]*len(texts)
            def generate(self,question,evidence,paths,instruction):
                return {"insufficient":False,"claims":[{"text":"Payroll depends on Identity.","citations":[evidence[0]["citation_id"]]}]},{"input_tokens":1,"output_tokens":1}
        self.ingest()
        self.knowledge.provider=Provider()
        r=self.engine.evidence(self.owner,self.p,"query",{"question":"Payroll","mode":"hybrid"})
        self.assertEqual(r["status"],"draft")
        self.assertIn("[C1]",r["answer"])
        self.assertFalse(r["trace"]["semantic_correctness_verified"])

if __name__ == "__main__":
    unittest.main()
