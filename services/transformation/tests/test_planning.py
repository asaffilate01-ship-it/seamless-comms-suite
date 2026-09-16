from pathlib import Path
import tempfile
import unittest

from transformation.engine import Engine, Actor
from transformation.planning import validate
from knowledge_core.types import APIError


class PlanningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.e = Engine(Path(self.temp.name)/"db.sqlite")
        self.owner = Actor("t1", "owner", "owner")
        self.reviewer = Actor("t1", "reviewer", "member")
        self.p = self.e.create_project(self.owner, {"name": "Plan", "currency": "GBP"})["id"]
        self.e.add_member(self.owner, self.p, {"user_id": "reviewer", "role": "reviewer"})
        for cid in ("seller", "newco"):
            self.save("company", {"id": cid, "name": cid, "company_role": cid, "sector": "Services", "countries": ["GB"], "owner": "sponsor"})
        self.scope = {"id": "scope", "name": "Separation", "deal_type": "carve_out", "company_ids": ["seller", "newco"], "target_company_id": "newco", "owner": "sponsor", "start_date": "2026-09-16", "day_one_date": "2026-10-01", "horizon_days": 100, "constraints": "Protect payroll", "requirements_ref": "urn:requirements", "inventory_complete": True, "workforce_complete": True, "costs_complete": True, "transition_budget": "1000"}
        self.save("planning_scope", self.scope)
        self.asset = {"id": "erp", "name": "ERP", "company_id": "seller", "asset_type": "technology", "quantity": 1, "owner": "cio", "criticality": "critical", "day_one_required": True, "disposition": "separate", "target_company_id": "newco", "transferability": "confirmed", "workstream_id": "enterprise", "evidence_ref": "urn:erp"}
        self.save("asset", self.asset)
        self.save("workforce", {"id": "ops", "name": "Operations", "company_id": "seller", "owner": "hr", "headcount": 10, "fte": "8.5", "skills": ["operations"], "transition_approach": "HR reviews and confirms coverage", "target_company_id": "newco", "evidence_ref": "urn:team"})
        self.save("objective", {"id": "goal", "name": "Reduce run costs", "company_id": "newco", "owner": "cfo", "metric": "Annual cost", "baseline": "12000", "target": "9600", "unit": "GBP", "direction": "decrease", "moscow": "must", "target_date": "2026-12-31"})
        for state, amount, freq, cid in [("current", "1000", "monthly", "seller"), ("target", "9600", "annual", "newco"), ("transition", "500", "one_off", "newco")]:
            self.save("cost_item", {"id": state, "name": state, "company_id": cid, "cost_key": "hosting", "cost_state": state, "cost_category": "technology", "amount": amount, "currency": "GBP", "frequency": freq, "owner": "cfo", "basis": "estimated", "evidence_ref": "urn:cost"})

    def tearDown(self):
        self.temp.cleanup()

    def save(self, kind, row, revision=0, actor=None):
        return self.e.upsert(actor or self.owner, self.p, {"kind": kind, "record": row, "expected_revision": revision})

    def plan(self):
        return self.e.dispatch(self.owner, "planning.generate", self.p, {"scope_id": "scope", "as_of": "2026-09-16"})

    def test_complete_intake_generates_traceable_day_one_and_100_days(self):
        plan = self.plan()["payload"]
        self.assertEqual(plan["blocking_gap_count"], 0)
        self.assertEqual(len(plan["day_one_gates"]), 13)
        self.assertEqual(plan["phases"][-1]["end"], "2027-01-08")
        self.assertTrue(all(a["source_ids"] and a["owner"] for a in plan["actions"]))
        self.assertTrue(all(g["status"] == "evidence_required" for g in plan["day_one_gates"]))
        self.assertEqual(plan["company_comparison"][0]["incoming_assets"], ["erp"])

    def test_costs_compare_states_and_normalise_periods_without_double_counting(self):
        cost = self.plan()["payload"]["financial"]
        self.assertEqual(cost["annual_recurring"], {"current": "12000.00", "transition": "0.00", "target": "9600.00"})
        self.assertEqual(cost["annual_run_rate_difference"], "2400.00")
        self.assertEqual(cost["transition_total"], "500.00")

    def test_transition_duration_and_budget_overrun(self):
        row = {"id": "tsa-cost", "name": "TSA", "company_id": "newco", "cost_key": "tsa", "cost_state": "transition", "cost_category": "tsa", "amount": "100", "currency": "GBP", "frequency": "monthly", "owner": "cfo", "basis": "confirmed", "evidence_ref": "urn:tsa"}
        self.save("cost_item", row)
        p = self.plan()["payload"]
        self.assertIsNone(p["financial"]["transition_total"])
        self.assertIn("transition_duration", [g["code"] for g in p["gaps"]])
        self.save("cost_item", {**row, "duration_months": "6"}, 1)
        p = self.plan()["payload"]
        self.assertEqual(p["financial"]["transition_total"], "1100.00")
        self.assertIn("budget", [g["code"] for g in p["gaps"]])

    def test_missing_state_is_unknown_not_zero(self):
        self.save("planning_scope", {**self.scope, "company_ids": ["newco"]}, 1)
        self.assertIsNone(self.plan()["payload"]["financial"]["annual_recurring"]["current"])

    def test_partial_carveout_excludes_retained_assets_and_costs(self):
        self.save("asset", {**self.asset, "id": "retained", "name": "Retained ERP"})
        self.save("cost_item", {"id": "retained-cost", "name": "Retained business", "company_id": "seller", "cost_key": "retained", "cost_state": "current", "cost_category": "operations", "amount": "9000", "currency": "GBP", "frequency": "monthly", "owner": "cfo", "basis": "confirmed", "evidence_ref": "urn:retained"})
        self.save("planning_scope", {**self.scope, "asset_ids": ["erp"], "workforce_ids": ["ops"], "cost_item_ids": ["current", "target", "transition"]}, 1)
        p = self.plan()["payload"]
        self.assertEqual([a["id"] for a in p["asset_dispositions"]], ["erp"])
        self.assertEqual(p["financial"]["annual_recurring"]["current"], "12000.00")
        self.save("asset_dependency", {"id": "retained-dependency", "source": "erp", "target": "retained", "reviewed": True, "evidence_ref": "urn:dep"})
        self.assertIn("external_dependency", [g["code"] for g in self.plan()["payload"]["gaps"]])

    def test_foreign_cost_requires_explicit_fx_and_converts(self):
        row = {"id": "fx", "name": "Foreign", "company_id": "newco", "cost_key": "foreign", "cost_state": "target", "cost_category": "other", "amount": "100", "currency": "USD", "frequency": "annual", "owner": "cfo", "basis": "confirmed", "evidence_ref": "urn:fx"}
        with self.assertRaises(APIError): self.save("cost_item", row)
        self.save("cost_item", {**row, "fx_rate": "0.8", "fx_as_of": "2026-09-16", "fx_source": "Fictional assumption"})
        self.assertEqual(self.plan()["payload"]["financial"]["annual_recurring"]["target"], "9680.00")

    def test_duplicate_cost_key_rejected(self):
        row = next(o["data"] for o in self.e.snapshot(self.owner, self.p)["objects"] if o["kind"] == "cost_item" and o["id"] == "current")
        with self.assertRaises(APIError): self.save("cost_item", {**row, "id": "duplicate"})

    def test_cross_project_references_and_read_access_rejected(self):
        self.save("company", {"id": "outside", "name": "Outside", "company_role": "operating", "sector": "Services", "countries": ["GB"], "owner": "sponsor"})
        other = self.e.create_project(self.owner, {"name": "Other", "currency": "GBP"})["id"]
        with self.assertRaises(APIError): self.e.upsert(self.owner, other, {"kind": "asset", "record": {**self.asset, "company_id": "outside"}, "expected_revision": 0})
        plan = self.plan()
        with self.assertRaises(APIError): self.e.plan_get(Actor("other-tenant", "owner", "owner"), self.p, {"id": plan["id"]})
        with self.assertRaises(APIError): self.e.plan_get(self.owner, other, {"id": plan["id"]})

    def test_independent_review_then_input_change_marks_stale(self):
        plan = self.plan()
        with self.assertRaises(APIError): self.e.plan_review(self.owner, self.p, {"id": plan["id"], "decision": "reviewed", "evidence_ref": "urn:review"})
        r = self.e.plan_review(self.reviewer, self.p, {"id": plan["id"], "decision": "reviewed", "evidence_ref": "urn:review"})
        self.assertEqual(r["status"], "reviewed")
        self.save("asset", {**self.asset, "transferability": "restricted"}, 1)
        self.assertTrue(self.e.plan_get(self.owner, self.p, {"id": plan["id"]})["stale"])
        self.assertTrue(self.e.audit(self.owner, self.p)["chain_valid"])

    def test_stale_and_incomplete_drafts_cannot_be_reviewed(self):
        plan = self.plan()
        self.save("planning_scope", {**self.scope, "inventory_complete": False}, 1)
        with self.assertRaises(APIError): self.e.plan_review(self.reviewer, self.p, {"id": plan["id"], "decision": "reviewed", "evidence_ref": "urn:review"})
        fresh = self.plan()
        with self.assertRaises(APIError): self.e.plan_review(self.reviewer, self.p, {"id": fresh["id"], "decision": "reviewed", "evidence_ref": "urn:review"})

    def test_generation_is_idempotent_at_same_input_version(self):
        first = self.plan()
        self.assertEqual(first["id"], self.plan()["id"])
        self.assertEqual(len(self.e.snapshot(self.owner, self.p)["plans"]), 1)

    def test_dependency_cycles_and_day_one_scheduling_conflicts(self):
        self.save("asset", {**self.asset, "id": "identity", "day_one_required": False})
        self.save("asset_dependency", {"id": "dep", "source": "erp", "target": "identity", "reviewed": True, "evidence_ref": "urn:dep"})
        self.assertIn("schedule_dependency", [g["code"] for g in self.plan()["payload"]["gaps"]])
        self.save("asset_dependency", {"id": "dep2", "source": "identity", "target": "erp", "reviewed": True, "evidence_ref": "urn:dep"})
        self.assertIn("dependency_cycle", [g["code"] for g in self.plan()["payload"]["gaps"]])

    def test_outside_company_dependency_is_visible(self):
        self.save("company", {"id": "outside", "name": "Outside", "company_role": "operating", "sector": "Services", "countries": ["GB"], "owner": "sponsor"})
        self.save("asset", {**self.asset, "id": "external", "company_id": "outside"})
        self.save("asset_dependency", {"id": "dep", "source": "erp", "target": "external", "reviewed": True, "evidence_ref": "urn:dep"})
        self.assertIn("external_dependency", [g["code"] for g in self.plan()["payload"]["gaps"]])

    def test_mandates_require_lead_adviser_and_diligence_feeds_plan(self):
        mandate = {"id": "mandate", "name": "Embedded delivery", "company_id": "newco", "owner": "lead", "delivery_model": "sub_contract", "client": "Client", "delivery_partner": "Partner", "branding": "white_label", "display_brand": "Prime", "workstream_ids": ["enterprise"], "decision_rights": "Prime approves, partner delivers", "reporting_cadence": "Weekly", "acceptance_criteria": "Reviewed milestones", "commercial_ref": "urn:contract"}
        with self.assertRaises(APIError): self.save("delivery_mandate", mandate)
        self.save("delivery_mandate", {**mandate, "prime_adviser": "Prime"})
        self.save("tdd_finding", {"id": "finding", "name": "Unsupported ERP", "company_id": "seller", "owner": "cto", "severity": "high", "finding_status": "open", "business_impact": "Continuity exposure", "recommendation": "Confirm support arrangement", "cost_item_ids": ["transition"], "evidence_ref": "urn:tdd"})
        p = self.plan()["payload"]
        self.assertEqual(p["delivery_mandates"][0]["prime_adviser"], "Prime")
        self.assertIn("due_diligence", [g["code"] for g in p["gaps"]])
        self.assertIn("transition", next(a for a in p["actions"] if a["id"] == "finding-finding")["source_ids"])

    def test_tsa_obligations_generate_exit_roadmap_and_consent_gap(self):
        self.save("tsa", {"id": "tsa", "name": "Identity", "supplier": "Seller", "owner": "cio", "exit_date": "2026-11-01", "monthly_cost": "100", "currency": "GBP", "status": "active", "exit_conditions": "Independent sign-in works"})
        self.save("tsa_obligation", {"id": "obligation", "name": "Identity service", "company_id": "newco", "owner": "cio", "tsa_id": "tsa", "provider_company_id": "seller", "recipient_company_id": "newco", "asset_ids": ["erp"], "service_scope": "Identity support", "service_levels": "Agreed service targets", "charging_basis": "Monthly fee", "responsibilities": "Seller operates; buyer migrates", "exit_roadmap": "Build, test, accept", "consent_status": "negotiating", "evidence_ref": "urn:tsa"})
        p = self.plan()["payload"]
        self.assertIn("tsa_consent", [g["code"] for g in p["gaps"]])
        self.assertEqual(next(a for a in p["actions"] if a["id"] == "tsa-obligation")["target_date"], "2026-11-01")

    def test_viewer_cannot_generate_and_analyst_cannot_accept_decisions(self):
        self.e.add_member(self.owner, self.p, {"user_id": "viewer", "role": "viewer"})
        with self.assertRaises(APIError): self.e.plan_generate(Actor("t1", "viewer", "member"), self.p, {"scope_id": "scope", "as_of": "2026-09-16"})
        self.e.add_member(self.owner, self.p, {"user_id": "analyst", "role": "analyst"})
        with self.assertRaises(APIError): self.save("decision", {"id": "decision", "name": "Target", "company_id": "newco", "owner": "lead", "decision_date": "2026-09-16", "decision_status": "accepted", "rationale": "Evidence", "alternatives": "Other options", "evidence_ref": "urn:decision"}, actor=Actor("t1", "analyst", "member"))


if __name__ == "__main__":
    unittest.main()
