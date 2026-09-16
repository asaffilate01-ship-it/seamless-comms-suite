import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

from decision_intelligence import Access, DecisionJournal, compare_candidates, portfolio_review, meeting_brief, followup_draft


class JournalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.now = datetime(2026, 9, 15, 10, tzinfo=timezone.utc)
        self.j = DecisionJournal(Path(self.tmp.name) / 'journal.db', clock=lambda: self.now)
        self.access = Access('firm-a', 'adviser', 'client-a', 'author', frozenset({'record','outcome','read','propose','review','invalidate'}))
        self.reviewer = replace(self.access, subject='reviewer')
        self.versions = dict(task='meeting_prep', model_version='model-1', prompt_version='prompt-1', rule_version='rule-1')
        self.input = dict(decision_id='d1', **self.versions,
                          evidence=[dict(source_id='fact-find', revision=1, available_at='2026-09-15T09:00:00Z')],
                          summary='Request missing cash-needs information.', supporting=['The liquidity field is blank.'],
                          opposing=[], unknowns=['Client needs confirmation.'], predicted_success=.8,
                          outcome_definition='Adviser validates the requested missing field within one day.')

    def tearDown(self):
        self.j.close(); self.tmp.cleanup()

    def resolved(self, success=False, quality='verified'):
        self.j.record_decision(self.access, **self.input)
        self.now += timedelta(hours=1)
        self.j.record_outcome(self.access, 'd1', receipt_id='source-receipt-1', occurred_at=self.now.isoformat(), success=success, quality=quality)

    def propose(self):
        return self.j.propose_lesson(self.access, lesson_id='l1', **self.versions,
                                     lesson='Check whether the liquidity field uses an approved alternate name.',
                                     support_ids=['d1'], expires_at='2026-09-17T10:00:00Z')

    def test_scope_isolation_and_permission_checks(self):
        self.j.record_decision(self.access, **self.input)
        for other in [replace(self.access, tenant='firm-b'), replace(self.access, product='haccora'), replace(self.access, collection='client-b')]:
            with self.assertRaises(LookupError): self.j.read_decision(other, 'd1')
        with self.assertRaises(PermissionError): self.j.read_decision(replace(self.access, permissions=frozenset()), 'd1')

    def test_decision_is_immutable_and_retries_do_not_retimestamp(self):
        first = self.j.record_decision(self.access, **self.input)
        self.now += timedelta(hours=1)
        self.assertEqual(first, self.j.record_decision(self.access, **self.input))
        with self.assertRaises(ValueError): self.j.record_decision(self.access, **{**self.input, 'summary':'Changed after the event'})

    def test_future_evidence_and_invalid_probability_rejected(self):
        future = [dict(source_id='future', revision=1, available_at='2026-09-16T10:00:00Z')]
        with self.assertRaises(ValueError): self.j.record_decision(self.access, **{**self.input, 'evidence':future})
        for value in [float('nan'), float('inf'), True, 1.1]:
            with self.assertRaises(ValueError): self.j.record_decision(self.access, **{**self.input, 'predicted_success':value})

    def test_outcome_cannot_precede_record_and_conflicting_replay_rejected(self):
        self.j.record_decision(self.access, **self.input)
        with self.assertRaises(ValueError):
            self.j.record_outcome(self.access, 'd1', receipt_id='r', occurred_at='2026-09-15T09:00:00Z', success=True, quality='verified')
        self.now += timedelta(hours=1)
        kwargs = dict(receipt_id='r', occurred_at=self.now.isoformat(), success=False, quality='verified')
        self.j.record_outcome(self.access, 'd1', **kwargs)
        self.j.record_outcome(self.access, 'd1', **kwargs)
        with self.assertRaises(ValueError): self.j.record_outcome(self.access, 'd1', **{**kwargs, 'success':True})

    def test_review_preserves_original_evidence_and_does_not_infer_cause(self):
        self.resolved()
        review = self.j.outcome_review(self.access, 'd1')
        self.assertAlmostEqual(review['brier_loss'], .64)
        self.assertFalse(review['cause_established'])
        self.assertEqual(review['decision']['supporting'], self.input['supporting'])

    def test_unresolved_or_disputed_outcomes_cannot_support_lessons(self):
        self.j.record_decision(self.access, **self.input)
        self.assertEqual(self.j.outcome_review(self.access, 'd1')['status'], 'awaiting_outcome')
        with self.assertRaises(ValueError): self.propose()
        self.resolved(quality='disputed')
        with self.assertRaises(ValueError): self.propose()

    def test_independent_exact_proposal_review_required(self):
        self.resolved(); proposal=self.propose()
        self.assertEqual(self.j.lessons(self.access, **self.versions), [])
        with self.assertRaises(PermissionError): self.j.review_lesson(self.access, 'l1', expected_hash=proposal['hash'], approve=True)
        with self.assertRaises(ValueError): self.j.review_lesson(self.reviewer, 'l1', expected_hash='wrong', approve=True)
        result=self.j.review_lesson(self.reviewer, 'l1', expected_hash=proposal['hash'], approve=True)
        self.assertFalse(result['execution_authorised'])
        self.assertEqual(len(self.j.lessons(self.access, **self.versions)), 1)
        with self.assertRaises(ValueError): self.j.review_lesson(self.reviewer, 'l1', expected_hash=proposal['hash'], approve=True)

    def test_lesson_version_expiry_and_source_invalidation(self):
        self.resolved(); proposal=self.propose()
        self.j.review_lesson(self.reviewer, 'l1', expected_hash=proposal['hash'], approve=True)
        self.assertEqual(self.j.lessons(self.access, **{**self.versions,'model_version':'model-2'}), [])
        self.now += timedelta(days=3)
        self.assertEqual(self.j.lessons(self.access, **self.versions), [])
        self.now -= timedelta(days=3)
        self.assertEqual(len(self.j.lessons(self.access, **self.versions)), 1)
        result=self.j.invalidate_source(self.access,'fact-find',current_revision=2)
        self.assertEqual(result['invalidated_decisions'],1)
        self.assertEqual(self.j.lessons(self.access, **self.versions), [])
        with self.assertRaises(LookupError): self.j.read_decision(self.access, 'd1')

    def test_support_cannot_be_relabelled_for_another_workflow(self):
        self.resolved()
        with self.assertRaises(ValueError):
            self.j.propose_lesson(self.access, lesson_id='l1', **{**self.versions, 'task':'trade'},
                                 lesson='Different task', support_ids=['d1'], expires_at='2026-09-17T10:00:00Z')


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.context = dict(tenant='a',product='adviser',collection='quality-review',task='meeting-prep',
                            outcome_definition='reviewer-accepts-sourced-summary',baseline_version='b1',candidate_version='c1')
        self.options = dict(dataset_context=self.context, candidate_frozen_at='2026-09-10T00:00:00Z',
                            evaluated_at='2026-09-15T10:00:00Z', training_ids=['train-1'],
                            training_outcomes_available_at='2026-09-09T00:00:00Z')
        self.rows = [dict(id=f'h{i}', context=self.context, decided_at='2026-09-11T00:00:00Z',
                          resolved_at='2026-09-12T00:00:00Z',features_available_at='2026-09-10T23:00:00Z',
                          actual=i%2==0,quality='verified',baseline_probability=.5,
                          candidate_probability=.8 if i%2==0 else .2) for i in range(30)]

    def test_passing_evaluation_never_promotes(self):
        r=compare_candidates(self.rows,**self.options)
        self.assertEqual(r['status'],'ready_for_independent_review')
        self.assertAlmostEqual(r['candidate']['brier'],.04)
        self.assertFalse(r['automatic_promotion']);self.assertFalse(r['execution_authorised'])

    def test_small_sample_and_worse_candidate_fail_gate(self):
        self.assertEqual(compare_candidates(self.rows[:2],**self.options)['status'],'insufficient_data')
        bad=[{**r,'candidate_probability':1-r['candidate_probability']} for r in self.rows]
        self.assertEqual(compare_candidates(bad,**self.options)['status'],'blocked')

    def test_temporal_leakage_overlap_and_mixed_context_rejected(self):
        modifications=[{'id':'train-1'}, {'decided_at':'2026-09-09T00:00:00Z'},
                       {'features_available_at':'2026-09-12T00:00:00Z'},
                       {'context':{**self.context,'tenant':'other'}}, {'quality':'unknown'}]
        for change in modifications:
            with self.assertRaises(ValueError): compare_candidates([{**self.rows[0],**change},*self.rows[1:]],**self.options)
        with self.assertRaises(ValueError): compare_candidates(self.rows+[self.rows[0]],**self.options)
        with self.assertRaises(ValueError): compare_candidates(self.rows,**{**self.options,'training_outcomes_available_at':'2026-09-11T00:00:00Z'})


class AdviserTests(unittest.TestCase):
    def setUp(self):
        self.options=dict(as_of='2026-09-15',today='2026-09-15',concentration_review_threshold=.6)
        self.positions=[dict(position_id='a',instrument_id='fund-a',market_value_minor=6000,currency='GBP',asset_class='equity',source_ref='custody:a'),
                        dict(position_id='b',instrument_id='cash',market_value_minor=4000,currency='GBP',asset_class='cash',source_ref='custody:b'),
                        dict(position_id='c',instrument_id='fund-a',market_value_minor=1000,currency='USD',asset_class='equity',source_ref='custody:c')]

    def test_portfolio_does_not_mix_currencies_or_invent_total(self):
        r=portfolio_review(self.positions,**self.options)
        self.assertEqual([g['known_value_minor'] for g in r['currency_groups']],[10000,1000])
        self.assertEqual(r['currency_groups'][0]['instrument_weights_within_currency']['fund-a'],.6)
        self.assertIn('multiple_currencies',[f['kind'] for f in r['flags']])
        self.assertNotIn('portfolio_total',r)

    def test_missing_values_are_not_zero_and_stale_is_visible(self):
        r=portfolio_review([*self.positions,dict(position_id='d',currency='GBP',market_value_minor=None,source_ref='custody:d')],
                           **{**self.options,'as_of':'2026-09-01'})
        self.assertFalse(r['data_complete'])
        self.assertEqual(r['valued_position_count'],3)
        self.assertIn('stale_snapshot',[f['kind'] for f in r['flags']])

    def test_duplicate_and_short_positions_rejected(self):
        with self.assertRaises(ValueError):portfolio_review(self.positions+[self.positions[0]],**self.options)
        with self.assertRaises(ValueError):portfolio_review([{**self.positions[0],'market_value_minor':-1}],**self.options)
        with self.assertRaises(ValueError):portfolio_review(self.positions,**{**self.options,'concentration_review_threshold':float('nan')})

    def test_meeting_missing_and_unknown_due_dates_preserved(self):
        r=meeting_brief(client_reference='c1',meeting_date='2026-09-16',today='2026-09-15',
                        facts=[dict(key='goals',value='Discuss retirement',as_of='2026-07-01',review_due='2026-09-01',source_ref='crm:1')],
                        tasks=[dict(id='t1',title='Confirm documents',status='open',due=None,source_ref='crm:t1')])
        self.assertIn('risk_tolerance',r['missing_fact_find'])
        self.assertIn('goals',r['facts_due_for_review'])
        self.assertIsNone(r['open_tasks'][0]['overdue'])
        self.assertIsNone(r['suitability_decision'])

    def test_followup_is_unsent_and_requires_confirmed_meeting_actions(self):
        a=dict(id='a1',text='Send latest statement',owner='Client',due=None,source_ref='meeting:1',confirmed_in_meeting=True)
        r=followup_draft(client_reference='c1',meeting_reference='m1',actions=[a])
        self.assertFalse(r['sent']);self.assertTrue(r['requires_adviser_approval'])
        self.assertIn('to confirm',r['body'])
        with self.assertRaises(ValueError):followup_draft(client_reference='c1',meeting_reference='m1',actions=[{**a,'confirmed_in_meeting':False}])


if __name__=='__main__':unittest.main()
