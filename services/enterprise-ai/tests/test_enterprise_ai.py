import copy
from dataclasses import replace
from decimal import Decimal
from pathlib import Path
import tempfile
import unittest
from enterprise_ai import Actor, Registry, Conflict, Denied, forecast

SPEC = {'name': 'Research briefing', 'owner': 'owner', 'purpose': 'Draft cited research for staff review',
        'data_classification': 'confidential', 'action_mode': 'draft', 'decision_impact': 'investment_decision',
        'data_sources': ['synthetic:research'], 'model_reference': 'unconfigured', 'jurisdiction': 'GB',
        'currency': 'GBP', 'monthly_budget_minor': 10000}
MODEL = {'name': 'illustrative', 'calls_per_task': 2, 'input_tokens_per_call': 4000,
         'output_tokens_per_call': 500, 'input_price_per_million': '3', 'output_price_per_million': '15',
         'cached_input_tokens_per_call': 1000, 'cached_price_per_million': '0.3'}


class GovernanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.now = 1000
        self.path = str(Path(self.temp.name)/'test.db')
        self.registry = Registry(self.path, clock=lambda: self.now)
        self.author = Actor('tenant-a', 'workspace-a', 'author', frozenset({'read','write','approve','operate','audit'}), 2000, 3000)
        self.reviewer = replace(self.author, subject='reviewer')

    def tearDown(self):
        self.registry.close()
        self.temp.cleanup()

    def ready(self):
        r = self.registry
        case = r.create(self.author, SPEC)
        case = r.assess(self.author, case['id'], case['revision'])
        return r.attach_evidence(self.author, case['id'], case['revision'],
                                 {k: 'synthetic-evidence:'+k for k in case['assessment']['required_controls']})

    def test_full_pilot_and_suspend(self):
        case = self.ready()
        self.assertEqual(case['assessment']['risk_tier'], 'high')
        case = self.registry.approve(self.reviewer, case['id'], case['revision'])
        case = self.registry.begin_pilot(self.author, case['id'], case['revision'], forecast_minor=10000)
        self.assertEqual(case['status'], 'pilot')
        case = self.registry.suspend(self.author, case['id'], case['revision'], 'Review source change')
        self.assertIsNone(case['approval'])
        self.assertEqual(len(self.registry.audit(self.author)), 6)

    def test_tenant_boundary(self):
        case = self.ready()
        other = replace(self.author, tenant='tenant-b')
        with self.assertRaises(KeyError): self.registry.get(other, case['id'])
        self.assertEqual(self.registry.list_cases(other), [])
        self.assertEqual(self.registry.audit(other), [])

    def test_workspace_boundary(self):
        case = self.ready()
        with self.assertRaises(KeyError): self.registry.approve(replace(self.reviewer, workspace='other'), case['id'], case['revision'])

    def test_self_approval_denied(self):
        case = self.ready()
        with self.assertRaises(Denied): self.registry.approve(self.author, case['id'], case['revision'])

    def test_owner_approval_denied(self):
        case = self.ready()
        with self.assertRaises(Denied): self.registry.approve(replace(self.reviewer, subject='owner'), case['id'], case['revision'])

    def test_prior_contributor_cannot_approve(self):
        case = self.ready()
        case = self.registry.revise(replace(self.author, subject='second-editor'), case['id'], case['revision'], SPEC)
        case = self.registry.assess(replace(self.author, subject='second-editor'), case['id'], case['revision'])
        case = self.registry.attach_evidence(replace(self.author, subject='second-editor'), case['id'], case['revision'], {k:'evidence' for k in case['assessment']['required_controls']})
        with self.assertRaises(Denied): self.registry.approve(self.author, case['id'], case['revision'])

    def test_agent_cannot_review(self):
        case = self.ready()
        with self.assertRaises(Denied): self.registry.approve(replace(self.reviewer, human=False), case['id'], case['revision'])

    def test_missing_control_evidence(self):
        case = self.registry.create(self.author, SPEC)
        case = self.registry.assess(self.author, case['id'], case['revision'])
        with self.assertRaises(Conflict): self.registry.approve(self.reviewer, case['id'], case['revision'])

    def test_stale_revision(self):
        case = self.ready()
        with self.assertRaises(Conflict): self.registry.approve(self.reviewer, case['id'], 1)

    def test_changes_invalidate_approval(self):
        case = self.ready()
        case = self.registry.approve(self.reviewer, case['id'], case['revision'])
        case = self.registry.revise(self.author, case['id'], case['revision'], dict(SPEC, purpose='Changed purpose'))
        self.assertIsNone(case['approval'])
        with self.assertRaises(Conflict): self.registry.begin_pilot(self.author, case['id'], case['revision'], forecast_minor=500)

    def test_expired_approval(self):
        case = self.ready()
        case = self.registry.approve(self.reviewer, case['id'], case['revision'], valid_for_seconds=10)
        self.now += 10
        with self.assertRaises(Conflict): self.registry.begin_pilot(self.author, case['id'], case['revision'], forecast_minor=500)

    def test_budget_failure_is_atomic(self):
        case = self.ready()
        case = self.registry.approve(self.reviewer, case['id'], case['revision'])
        before = self.registry.audit(self.author)
        with self.assertRaises(Conflict): self.registry.begin_pilot(self.author, case['id'], case['revision'], forecast_minor=10001)
        self.assertEqual(before, self.registry.audit(self.author))
        self.assertEqual(self.registry.get(self.author, case['id'])['status'], 'approved')

    def test_expired_and_nan_leases(self):
        for actor in [replace(self.author, expires_at=1000), replace(self.author, entitlement_until=999), replace(self.author, expires_at=float('nan'))]:
            with self.assertRaises(Denied): self.registry.list_cases(actor)

    def test_reader_cannot_write(self):
        with self.assertRaises(Denied): self.registry.create(replace(self.author, permissions=frozenset({'read'})), SPEC)

    def test_persists_after_restart(self):
        case = self.ready()
        self.registry.close()
        self.registry = Registry(self.path, clock=lambda: self.now)
        self.assertEqual(self.registry.get(self.author, case['id']), case)

    def test_client_cannot_set_risk_or_status(self):
        with self.assertRaises(ValueError): self.registry.create(self.author, dict(SPEC, risk='low'))

    def test_lease_expiry_rolls_back(self):
        moments = iter([1000, 1000, 1000, 2000])
        self.registry.clock = lambda: next(moments)
        with self.assertRaises(Denied): self.registry.create(self.author, SPEC)
        self.registry.clock = lambda: 1000
        self.assertEqual(self.registry.list_cases(self.author), [])
        self.assertEqual(self.registry.audit(self.author), [])


class ForecastTests(unittest.TestCase):
    def estimate(self, **changes):
        args = dict(users=100, tasks_per_user_day=5, working_days=20, models=[copy.deepcopy(MODEL)], currency='GBP')
        args.update(changes)
        return forecast(**args)

    def test_token_arithmetic_and_cache(self):
        result = self.estimate()
        # 20k calls * (3k*3 + 1k*.3 + 500*15) / 1m = 336.
        self.assertEqual(result['model_cost'], '336.00')

    def test_total_cost_retries_and_contingency(self):
        model = dict(MODEL, expected_retry_fraction='0.1')
        result = self.estimate(models=[model], fixed_monthly=100, tools_monthly=20,
                               review_monthly=200, contingency_fraction='0.2', successful_fraction='0.8')
        self.assertEqual(result['budget_with_contingency'], '827.52')
        self.assertEqual(result['cost_per_successful_task'], '0.10')

    def test_multiple_models_add(self):
        self.assertEqual(self.estimate(models=[MODEL, MODEL])['model_cost'], '672.00')

    def test_invalid_values(self):
        for kwargs in [{'users': -1}, {'users': 'NaN'}, {'users': True}, {'successful_fraction': 2}, {'currency': 'XYZ'}]:
            with self.assertRaises(ValueError): self.estimate(**kwargs)

    def test_impossible_cached_tokens(self):
        with self.assertRaises(ValueError): self.estimate(models=[dict(MODEL, cached_input_tokens_per_call=4001)])

    def test_no_successful_tasks(self):
        self.assertIsNone(self.estimate(successful_fraction=0)['cost_per_successful_task'])


if __name__ == '__main__':
    unittest.main()
