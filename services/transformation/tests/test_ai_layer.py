from copy import deepcopy
from pathlib import Path
import json
import os
import tempfile
import threading
import unittest
from unittest.mock import patch

from transformation.engine import Engine, Actor
from transformation.ai_hub import AIHub, DEFAULT_POLICY
from transformation.ai_providers import ModelAdapter, endpoint, secret
from transformation.ai_connectors import ConnectorAdapter
from transformation.ai_config import validate_config
from knowledge_core.service import KnowledgeService
from knowledge_core.store import Store
from knowledge_core.types import APIError


def tool(name, **args):
    return {"type": "tool", "tool": name, "arguments": args}


def final(source="obs-1"):
    return {"type": "final", "claims": [{"text": "The report contains entered project costs.", "sources": [source]}], "uncertainties": ["Inputs require business review."]}


class AIHubTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.e = Engine(Path(self.temp.name)/"project.db", KnowledgeService(Store(str(Path(self.temp.name)/"knowledge.db"))))
        self.owner, self.reviewer = Actor("tenant-a", "owner", "owner"), Actor("tenant-a", "reviewer", "member")
        self.p = self.e.create_project(self.owner, {"name": "Agent pilot", "currency": "GBP"})["id"]
        self.e.add_member(self.owner, self.p, {"user_id": "reviewer", "role": "reviewer"})
        self.config = {"models": [{"id": "model-a", "label": "Contract fixture", "provider": "openai", "model": "configured-model", "credential_env": "OQ_SECRET_TEST", "bindings": [{"tenant": "tenant-a", "project": self.p}]}],
                       "connectors": [{"id": "repo-a", "label": "Repository", "kind": "github", "owner": "fictional", "repository": "pilot", "operations": ["repository"], "bindings": [{"tenant": "tenant-a", "project": self.p}]}]}
        self.decisions, self.calls = [], []
        parent = self
        class FakeModel:
            def __init__(self, config): self.config = config
            def decide(self, system, context, tokens):
                parent.calls.append(context)
                result = parent.decisions.pop(0)
                if callable(result): result = result()
                return result, {"input_tokens": 100, "output_tokens": 50}
        self.model_factory = FakeModel
        self.e.ai = AIHub(self.e, self.config, model_factory=FakeModel)
        self.policy = {**deepcopy(DEFAULT_POLICY), "enabled": True, "data_sharing_approved": True, "routes": {k: "model-a" for k in ("discovery", "finance", "technical", "compliance", "product", "transaction")}, "connectors": ["repo-a"]}
        self.e.ai.save_policy(self.owner, self.p, {"policy": self.policy, "expected_revision": 0})

    def tearDown(self): self.temp.cleanup()

    def start(self, profile="finance", rid="run-1", actor=None):
        return self.e.dispatch(actor or self.owner, "ai.runs.start", self.p, {"id": rid, "profile": profile, "goal": "Review the project using evidence"})

    def step(self, rid="run-1", actor=None):
        return self.e.dispatch(actor or self.owner, "ai.runs.step", self.p, {"id": rid})

    def test_model_reads_report_then_returns_cited_draft(self):
        self.decisions = [tool("financial_report"), final()]
        self.start()
        first = self.step()
        self.assertEqual(first["status"], "ready")
        self.assertEqual(first["payload"]["observations"][0]["result"]["currency"], "GBP")
        result = self.step()
        self.assertEqual(result["status"], "completed")
        self.assertFalse(result["payload"]["semantic_correctness_verified"])
        self.assertEqual(self.e.ai.status(self.owner, self.p)["usage_today"]["model_calls"], 2)
        self.assertEqual(self.e.ai.status(self.owner, self.p)["usage_today"]["input_tokens"], 200)
        self.assertTrue(self.e.audit(self.owner, self.p)["chain_valid"])

    def test_tool_proposal_never_executes_without_human_workflow(self):
        self.decisions = [tool("propose_task", title="Validate continuity", owner="Service owner", critical=True)]
        self.start("technical")
        self.step()
        snap = self.e.snapshot(self.owner, self.p)
        self.assertEqual(snap["actions"][0]["status"], "pending")
        self.assertFalse(any(o["kind"] == "task" for o in snap["objects"]))
        with self.assertRaises(APIError): self.e.review(self.owner, self.p, {"id": snap["actions"][0]["id"], "decision": "approved"})
        self.e.review(self.reviewer, self.p, {"id": snap["actions"][0]["id"], "decision": "approved"})
        self.e.execute(self.owner, self.p, {"id": snap["actions"][0]["id"]})
        self.assertTrue(self.e.ai.get(self.owner, self.p, {"id": "run-1"})["stale"])

    def test_arbitrary_or_approval_tool_is_rejected(self):
        for i, name in enumerate(("shell", "actions.execute", "actions.review", "http_request")):
            self.decisions = [tool(name)]
            rid = f"run-{i}"
            self.start(rid=rid)
            with self.assertRaises(APIError): self.step(rid)
            self.assertEqual(self.e.ai.get(self.owner, self.p, {"id": rid})["status"], "failed")

    def test_invented_citation_and_cross_scope_arguments_rejected(self):
        self.decisions = [final("made-up")]
        self.start()
        with self.assertRaises(APIError): self.step()
        self.decisions = [tool("project_records", kind="cost_item", tenant="other")]
        self.start(rid="run-2")
        with self.assertRaises(APIError): self.step("run-2")

    def test_changed_inputs_block_before_model_call(self):
        self.start()
        self.e.upsert(self.owner, self.p, {"kind": "task", "record": {"id": "new", "title": "New input", "owner": "owner", "status": "todo", "critical": False}, "expected_revision": 0})
        with self.assertRaises(APIError): self.step()
        self.assertEqual(self.calls, [])

    def test_access_revocation_during_call_blocks_result_and_proposal(self):
        self.e.add_member(self.owner, self.p, {"user_id": "analyst", "role": "analyst"})
        analyst = Actor("tenant-a", "analyst", "member")
        self.start("technical", actor=analyst)
        def revoke():
            self.e.remove_member(self.owner, self.p, {"user_id": "analyst"})
            return tool("propose_task", title="Should not happen", owner="x", critical=True)
        self.decisions = [revoke]
        with self.assertRaises(APIError): self.step(actor=analyst)
        self.assertEqual(self.e.snapshot(self.owner, self.p)["actions"], [])

    def test_cancel_during_model_call_discards_result(self):
        self.start()
        def cancel():
            self.e.ai.cancel(self.owner, self.p, {"id": "run-1"})
            return tool("financial_report")
        self.decisions = [cancel]
        with self.assertRaises(APIError): self.step()
        self.assertEqual(self.e.ai.get(self.owner, self.p, {"id": "run-1"})["status"], "cancelled")

    def test_cancel_between_model_and_write_cannot_create_proposal(self):
        self.start("technical")
        original = self.e.ai._tool
        def intercepted(*args):
            self.e.ai.cancel(self.owner, self.p, {"id": "run-1"})
            return original(*args)
        self.e.ai._tool = intercepted
        self.decisions = [tool("propose_task", title="No task", owner="x", critical=True)]
        with self.assertRaises(APIError): self.step()
        self.assertEqual(self.e.snapshot(self.owner, self.p)["actions"], [])

    def test_concurrent_step_is_rejected_without_second_charge(self):
        self.start()
        entered, finish = threading.Event(), threading.Event()
        def wait():
            entered.set()
            finish.wait(5)
            return tool("financial_report")
        self.decisions = [wait]
        errors = []
        def advance():
            try: self.step()
            except Exception as exc: errors.append(exc)
        thread = threading.Thread(target=advance)
        thread.start()
        try:
            self.assertTrue(entered.wait(2))
            with self.assertRaises(APIError): self.step()
        finally:
            finish.set(); thread.join(5)
        self.assertFalse(errors)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.e.ai.status(self.owner, self.p)["usage_today"]["model_calls"], 1)

    def test_daily_budget_is_reserved_and_failed_calls_count(self):
        self.policy["daily_model_calls"] = 1
        self.e.ai.save_policy(self.owner, self.p, {"policy": self.policy, "expected_revision": 1})
        self.decisions = [tool("financial_report")]
        self.start(); self.step()
        with self.assertRaises(APIError) as err: self.step()
        self.assertEqual(err.exception.status, 429)
        self.assertEqual(len(self.calls), 1)

    def test_pause_and_disabled_data_sharing_block_calls(self):
        self.start()
        self.e.policy(self.owner, self.p, {"mode": "approval", "paused": True})
        with self.assertRaises(APIError): self.step()
        self.assertEqual(len(self.calls), 0)
        self.e.policy(self.owner, self.p, {"mode": "approval", "paused": False})
        self.policy["data_sharing_approved"] = False
        self.e.ai.save_policy(self.owner, self.p, {"policy": self.policy, "expected_revision": 1})
        with self.assertRaises(APIError): self.start(rid="run-2")

    def test_project_binding_cannot_be_replaced_by_tenant_membership(self):
        other = self.e.create_project(self.owner, {"name": "Other", "currency": "GBP"})["id"]
        self.assertEqual(self.e.ai.status(self.owner, other)["models"], [])
        with self.assertRaises(APIError): self.e.ai.save_policy(self.owner, other, {"policy": self.policy, "expected_revision": 0})
        self.start()
        with self.assertRaises(APIError): self.e.ai.get(Actor("tenant-b", "owner", "owner"), self.p, {"id": "run-1"})
        self.assertNotIn("OQ_SECRET", json.dumps(self.e.ai.status(self.owner, self.p)))

    def test_viewer_and_finance_role_tool_restrictions(self):
        self.e.add_member(self.owner, self.p, {"user_id": "viewer", "role": "viewer"})
        with self.assertRaises(APIError): self.start(actor=Actor("tenant-a", "viewer", "member"))
        self.e.add_member(self.owner, self.p, {"user_id": "fin", "role": "finance"})
        fin = Actor("tenant-a", "fin", "member")
        with self.assertRaises(APIError): self.start("technical", actor=fin)
        self.start(actor=fin)
        self.decisions = [tool("propose_task", title="No authority", owner="fin", critical=True)]
        with self.assertRaises(APIError): self.step(actor=fin)

    def test_resume_uses_saved_state_and_start_id_is_idempotent(self):
        self.start()
        self.start()
        self.decisions = [tool("financial_report"), final()]
        self.step()
        self.e.ai = AIHub(self.e, self.config, model_factory=self.model_factory)
        self.assertEqual(self.step()["status"], "completed")
        self.assertEqual(len(self.e.ai.list_runs(self.owner, self.p, {})), 1)

    def test_step_limit_cannot_be_exceeded(self):
        self.policy["max_steps"] = 1
        self.e.ai.save_policy(self.owner, self.p, {"policy": self.policy, "expected_revision": 1})
        self.start(); self.decisions = [tool("financial_report")]
        self.assertEqual(self.step()["status"], "limit_reached")
        with self.assertRaises(APIError): self.step()

    def test_connector_snapshot_is_explicitly_ingested_not_auto_imported(self):
        parent = self
        class Connector:
            def __init__(self, config): pass
            def read(self, operation, args):
                return {"items": [{"full_name": "fictional/pilot"}], "source_url": "https://api.github.com/repos/fictional/pilot", "has_more": False, "complete_inventory": False}
        self.e.ai.connector_factory = Connector
        result = self.e.ai.connector_read(self.owner, self.p, {"connection_id": "repo-a", "operation": "repository"})
        self.assertEqual(self.e.snapshot(self.owner, self.p)["objects"], [])
        self.e.ai.connector_ingest(self.owner, self.p, {"snapshot_id": result["snapshot_id"], "document_id": "repo-evidence", "expected_revision": 0})
        found = self.e.evidence(self.owner, self.p, "query", {"question": "fictional pilot repository"})
        self.assertTrue(found["evidence"])
        with self.assertRaises(APIError): self.e.ai.connector_read(self.owner, self.p, {"connection_id": "repo-a", "operation": "delete"})

    def test_evidence_search_is_retrieval_only_and_scoped(self):
        self.e.evidence(self.owner, self.p, "ingest", {"id": "architecture", "title": "Architecture", "source_uri": "urn:architecture", "text": "Payroll depends on the ERP and identity services.", "expected_revision": 0})
        self.start("technical"); self.decisions = [tool("evidence_search", question="Payroll ERP identity")]
        result = self.step()
        self.assertEqual(result["payload"]["observations"][0]["result"]["status"], "evidence_only")
        self.assertEqual(len(self.calls), 1)


class AdapterTests(unittest.TestCase):
    def test_all_six_model_wire_contracts_and_usage(self):
        expected = {"type": "final", "claims": [], "uncertainties": ["More evidence needed"]}
        raw = json.dumps(expected)
        cases = {
            "openai": {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": raw}]}], "usage": {"input_tokens": 4, "output_tokens": 5}},
            "azure_openai": {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": raw}]}], "usage": {"input_tokens": 4, "output_tokens": 5}},
            "anthropic": {"stop_reason": "end_turn", "content": [{"type": "text", "text": raw}], "usage": {"input_tokens": 4, "output_tokens": 5}},
            "gemini": {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": raw}]}}], "usageMetadata": {"promptTokenCount": 4, "candidatesTokenCount": 5}},
            "ollama": {"done": True, "message": {"content": raw}, "prompt_eval_count": 4, "eval_count": 5},
            "bedrock": {"stopReason": "end_turn", "output": {"message": {"content": [{"text": raw}]}}, "usage": {"inputTokens": 4, "outputTokens": 5}},
        }
        for provider, response in cases.items():
            with self.subTest(provider=provider), patch.dict(os.environ, {"OQ_SECRET_TEST": "fictional-token"}):
                calls = []
                def transport(url, body, headers):
                    calls.append((url, body, headers)); return response
                class Bedrock:
                    def converse(self, **kwargs): calls.append(kwargs); return response
                config = {"provider": provider, "model": "operator-selected-model", "credential_env": "OQ_SECRET_TEST", "endpoint": "https://test.openai.azure.com", "region": "eu-west-2"}
                result, usage = ModelAdapter(config, transport, Bedrock()).decide("Return JSON", {"goal": "Test"}, 256)
                self.assertEqual(result, expected)
                self.assertEqual(usage, {"input_tokens": 4, "output_tokens": 5})
                self.assertEqual(len(calls), 1)
                if provider in {"openai", "azure_openai"}: self.assertFalse(calls[0][1]["store"])
                if provider == "gemini": self.assertNotIn("fictional-token", calls[0][0])

    def test_truncated_refused_and_invalid_json_do_not_execute(self):
        for provider, response in [("openai", {"status": "incomplete"}), ("anthropic", {"stop_reason": "max_tokens"}), ("gemini", {"candidates": [{"finishReason": "SAFETY"}]}), ("ollama", {"done": True, "done_reason": "length"}), ("bedrock", {"stopReason": "max_tokens"})]:
            with self.subTest(provider=provider), self.assertRaises(APIError):
                ModelAdapter({"provider": provider, "model": "m"}).parse(response)
        with self.assertRaises(APIError): ModelAdapter({"provider": "ollama", "model": "m"}).parse({"done": True, "message": {"content": "not JSON"}})

    def test_endpoint_and_secret_reference_restrictions(self):
        for url in ["http://remote.example", "https://user:pass@example.com", "https://example.com?token=bad", "file:///etc/passwd"]:
            with self.assertRaises(ValueError): endpoint(url)
        self.assertEqual(endpoint("http://127.0.0.1:11434", local=True), "http://127.0.0.1:11434")
        with self.assertRaises(APIError): secret("HOME")

    def test_graph_projection_and_pagination_are_explicit(self):
        calls = []
        def transport(url, **kwargs):
            calls.append((url, kwargs)); return {"value": [{"id": "1", "displayName": "ERP", "passwordCredentials": ["hidden"]}], "@odata.nextLink": "https://evil.example/collect"}
        config = {"id": "graph", "kind": "microsoft_graph", "operations": ["applications"], "credential_env": "OQ_SECRET_TEST"}
        with patch.dict(os.environ, {"OQ_SECRET_TEST": "fictional"}): result = ConnectorAdapter(config, transport).read("applications", {})
        self.assertEqual(result["items"], [{"id": "1", "displayName": "ERP"}])
        self.assertTrue(result["has_more"])
        self.assertEqual(len(calls), 1)

    def test_generic_feed_accepts_only_fixed_fields_and_no_agent_query(self):
        config = {"id": "feed", "kind": "json_feed", "operations": ["read"], "endpoint": "https://approved.example/inventory", "fields": ["id", "name"]}
        adapter = ConnectorAdapter(config, lambda *a, **k: {"items": [{"id": "1", "name": "ERP", "secret": "hidden"}]})
        self.assertEqual(adapter.read("read", {})["items"], [{"id": "1", "name": "ERP"}])
        with self.assertRaises(APIError): adapter.read("read", {"url": "https://other.example"})


if __name__ == "__main__": unittest.main()
