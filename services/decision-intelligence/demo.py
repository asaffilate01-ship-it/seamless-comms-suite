"""Fictional local example. Does not call an AI, custodian, CRM or broker."""
import json
import tempfile
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from decision_intelligence import Access, DecisionJournal, portfolio_review, meeting_brief, followup_draft


def main():
    now = [datetime(2026, 9, 15, 10, tzinfo=timezone.utc)]
    access = Access('fictional-firm', 'adviser', 'fictional-client', 'author',
                    frozenset({'record', 'outcome', 'read', 'propose', 'review', 'invalidate'}))
    versions = dict(task='meeting-preparation', model_version='fixture-v1', prompt_version='prep-v1', rule_version='firm-policy-v1')
    with tempfile.TemporaryDirectory() as temporary:
        journal = DecisionJournal(Path(temporary) / 'demo.db', clock=lambda: now[0])
        journal.record_decision(access, decision_id='decision-1', **versions,
            evidence=[dict(source_id='fact-find-1', revision=1, available_at='2026-09-15T09:00:00Z')],
            summary='Request confirmation of the liquidity-needs field.',
            supporting=['The reviewed field is blank.'], opposing=['An alternate form may contain it.'],
            unknowns=['Whether an alternate form exists.'], predicted_success=.8,
            outcome_definition='Reviewer confirms the field needs a client follow-up.')
        now[0] += timedelta(hours=1)
        journal.record_outcome(access, 'decision-1', receipt_id='review-receipt-1',
                               occurred_at=now[0].isoformat(), success=False, quality='verified')
        proposal = journal.propose_lesson(access, lesson_id='lesson-1', **versions,
            lesson='Check the approved alternate form before asking the client to repeat information.',
            support_ids=['decision-1'], expires_at='2026-10-15T10:00:00Z')
        journal.review_lesson(replace(access, subject='independent-reviewer'), 'lesson-1', expected_hash=proposal['hash'], approve=True)
        output = {'fixture': 'Fictional demonstration; no real client, AI inference or validated investment performance.',
            'review': journal.outcome_review(access, 'decision-1'),
            'approved_lesson_context': journal.lessons(access, **versions),
            'portfolio': portfolio_review([
                dict(position_id='p1', instrument_id='fictional-fund', market_value_minor=600000,
                     currency='GBP', asset_class='equity', source_ref='fixture:holding1'),
                dict(position_id='p2', instrument_id='cash', market_value_minor=400000,
                     currency='GBP', asset_class='cash', source_ref='fixture:holding2')],
                as_of='2026-09-15', today='2026-09-15', concentration_review_threshold=.5),
            'meeting_brief': meeting_brief(client_reference='fictional-client', meeting_date='2026-09-16',
                today='2026-09-15', facts=[dict(key='goals', value='Review retirement plans',
                    as_of='2026-09-01', source_ref='fixture:fact-find')],
                tasks=[dict(id='task-1', title='Confirm the meeting time', due='2026-09-15',
                            status='open', source_ref='fixture:crm-task')]),
            'followup': followup_draft(client_reference='fictional-client', meeting_reference='fictional-meeting',
                actions=[dict(id='action-1', text='Provide the latest pension statement', owner='Client',
                              due=None, source_ref='fixture:meeting', confirmed_in_meeting=True)])}
        journal.close()
    print(json.dumps(output, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
