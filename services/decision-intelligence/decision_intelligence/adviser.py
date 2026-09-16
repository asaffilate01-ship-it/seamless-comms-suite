"""Deterministic adviser review utilities; authorised inputs are resolved by the host.

These functions create review materials. They do not give a suitability determination,
recommend securities, send messages, rebalance portfolios or submit trades.
"""
from collections import defaultdict
from datetime import date
from .common import digest, number, text


def portfolio_review(positions, *, as_of, today, concentration_review_threshold,
                     maximum_age_days=2):
    as_at, current = date.fromisoformat(as_of), date.fromisoformat(today)
    if as_at > current:
        raise ValueError('Future portfolio snapshot')
    threshold = number(concentration_review_threshold, 'firm-provided review threshold')
    if not 0 < threshold <= 1 or type(maximum_age_days) is not int or maximum_age_days < 0:
        raise ValueError('Invalid review policy')
    if not isinstance(positions, list) or len(positions) > 10000:
        raise ValueError('Bounded positions required')
    totals = defaultdict(int)
    instruments, asset_classes = defaultdict(lambda: defaultdict(int)), defaultdict(lambda: defaultdict(int))
    seen, refs, missing = set(), set(), []
    for p in positions:
        identity = text(p['position_id'], 'position id', 200)
        if identity in seen:
            raise ValueError('Duplicate position id')
        seen.add(identity)
        currency = text(p['currency'], 'currency', 3)
        if len(currency) != 3 or not currency.isascii() or not currency.isupper() or not currency.isalpha():
            raise ValueError('Three-letter currency code required')
        text(p['source_ref'], 'source record reference', 300); refs.add(p['source_ref'])
        value = p.get('market_value_minor')
        if value is None:
            missing.append(identity)
            continue
        if type(value) is not int or value < 0:
            raise ValueError('Long-only non-negative integer market values required; shorts/leverage need a separate model')
        instrument = text(p['instrument_id'], 'instrument identifier', 200)
        asset = text(p.get('asset_class') or 'unknown', 'asset class', 100)
        totals[currency] += value
        instruments[currency][instrument] += value
        asset_classes[currency][asset] += value
    groups, flags = [], []
    for currency, total in sorted(totals.items()):
        weights = {identity: value / total if total else None for identity, value in sorted(instruments[currency].items())}
        groups.append({'currency': currency, 'known_value_minor': total, 'instrument_weights_within_currency': weights,
                       'asset_class_value_minor': dict(sorted(asset_classes[currency].items()))})
        for identity, weight in weights.items():
            if weight is not None and weight >= threshold:
                flags.append({'kind': 'concentration_review', 'currency': currency, 'instrument_id': identity,
                              'weight_within_currency': weight, 'threshold': threshold})
    if (current - as_at).days > maximum_age_days:
        flags.append({'kind': 'stale_snapshot', 'age_days': (current - as_at).days})
    if missing:
        flags.append({'kind': 'missing_valuations', 'position_ids': missing})
    if len(totals) > 1:
        flags.append({'kind': 'multiple_currencies', 'message': 'No FX conversion or cross-currency portfolio weights computed'})
    return {'status': 'review_required', 'as_of': as_of, 'position_count': len(positions),
            'valued_position_count': len(positions)-len(missing), 'currency_groups': groups,
            'data_complete': bool(positions) and not missing, 'flags': flags,
            'source_refs': sorted(refs), 'input_hash': digest(positions),
            'limitations': ['Concentration is direct-instrument exposure among supplied known values, within each currency.',
                            'Fund look-through, issuer overlap, returns, risk and suitability are not calculated.',
                            'No trades or rebalancing instructions are produced.']}


def meeting_brief(*, client_reference, meeting_date, today, facts, tasks):
    text(client_reference, 'authorised client reference', 200)
    meeting, current = date.fromisoformat(meeting_date), date.fromisoformat(today)
    if not isinstance(facts, list) or not isinstance(tasks, list) or len(facts) > 100 or len(tasks) > 200:
        raise ValueError('Bounded client context required')
    known, stale, refs = {}, [], set()
    for f in facts:
        key = text(f['key'], 'fact key', 100)
        if key in known:
            raise ValueError('Conflicting duplicate facts require source resolution')
        text(f['value'], 'fact value', 2000); text(f['source_ref'], 'fact source', 300)
        if date.fromisoformat(f['as_of']) > current:
            raise ValueError('Future client fact')
        known[key] = {'value': f['value'], 'as_of': f['as_of'], 'source_ref': f['source_ref']}
        refs.add(f['source_ref'])
        if f.get('review_due') and date.fromisoformat(f['review_due']) < current:
            stale.append(key)
    open_tasks, ids = [], set()
    for task in tasks:
        identity = text(task['id'], 'task id', 200)
        if identity in ids:
            raise ValueError('Duplicate task')
        ids.add(identity)
        text(task['title'], 'task title', 1000); text(task['source_ref'], 'task source', 300)
        if task['status'] not in {'open', 'complete'}:
            raise ValueError('Task status must be known')
        if task['status'] == 'complete':
            continue
        due = date.fromisoformat(task['due']) if task.get('due') else None
        open_tasks.append({'id': identity, 'title': task['title'], 'due': task.get('due'),
                           'overdue': due < current if due else None, 'source_ref': task['source_ref']})
        refs.add(task['source_ref'])
    required = ['goals', 'time_horizon', 'risk_tolerance', 'capacity_for_loss', 'liquidity_needs']
    missing = [key for key in required if key not in known]
    return {'status': 'draft_for_adviser_review', 'client_reference': client_reference,
            'meeting_date': meeting.isoformat(), 'facts': known, 'open_tasks': open_tasks,
            'missing_fact_find': missing, 'facts_due_for_review': stale, 'source_refs': sorted(refs),
            'agenda': ['Confirm client circumstances and the source dates',
                       'Review portfolio observations and information gaps',
                       'Resolve outstanding actions and agree the next review'],
            'questions': [f'Please confirm {key.replace("_", " ")}.' for key in missing + stale],
            'suitability_decision': None, 'publication_authorised': False}


def followup_draft(*, client_reference, meeting_reference, actions):
    text(client_reference, 'client reference', 200); text(meeting_reference, 'meeting reference', 200)
    if not isinstance(actions, list) or len(actions) > 30:
        raise ValueError('Bounded meeting actions required')
    prepared, seen = [], set()
    for action in actions:
        identity = text(action['id'], 'meeting action ID', 200)
        if identity in seen:
            raise ValueError('Duplicate action ID')
        seen.add(identity)
        if action.get('confirmed_in_meeting') is not True:
            raise ValueError('Unconfirmed actions cannot be presented as agreed')
        text(action['text'], 'agreed action', 2000); text(action['source_ref'], 'meeting evidence', 300)
        owner = text(action['owner'], 'action owner', 200)
        due = date.fromisoformat(action['due']).isoformat() if action.get('due') else None
        prepared.append({'id': identity, 'text': action['text'], 'owner': owner,
                         'due': due, 'source_ref': action['source_ref']})
    return {'status': 'unsent_draft', 'client_reference': client_reference,
            'meeting_reference': meeting_reference, 'subject': 'Follow-up from our meeting',
            'body': 'Thank you for meeting with us. Please review the recorded next steps:\n' +
                    '\n'.join(f"- {a['text']} Owner: {a['owner']}. Due: {a['due'] or 'to confirm'}." for a in prepared),
            'actions': prepared, 'requires_adviser_approval': True, 'sent': False}
