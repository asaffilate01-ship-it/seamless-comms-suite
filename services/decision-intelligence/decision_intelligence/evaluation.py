"""Offline binary prediction comparison; never trains, promotes or executes a model."""
import math
from .common import digest, probability, text, timestamp


def _metrics(rows, key):
    n = len(rows)
    if not n:
        return {'n': 0, 'brier': None, 'log_loss': None, 'calibration_error': None}
    brier = sum((r[key] - int(r['actual'])) ** 2 for r in rows) / n
    log_loss = -sum(math.log(max(1e-15, min(1 - 1e-15, r[key] if r['actual'] else 1-r[key]))) for r in rows) / n
    calibration = 0.0
    for index in range(10):
        group = [r for r in rows if min(9, int(r[key] * 10)) == index]
        if group:
            calibration += len(group) / n * abs(sum(r[key] for r in group) / len(group) - sum(r['actual'] for r in group) / len(group))
    return {'n': n, 'brier': brier, 'log_loss': log_loss, 'calibration_error': calibration}


def compare_candidates(rows, *, dataset_context, candidate_frozen_at, evaluated_at, training_ids,
                       training_outcomes_available_at, minimum_samples=30):
    """Compare paired predictions on later decisions with no overlapping training IDs.

    Host supplies trusted frozen predictions and authoritative labels. This cannot
    prove an externally supplied dataset was untouched or its provenance genuine.
    Versioned storage/evaluation ledgers and independent review are still required.
    """
    fields = {'tenant', 'product', 'collection', 'task', 'outcome_definition', 'baseline_version', 'candidate_version'}
    if not isinstance(dataset_context, dict) or set(dataset_context) != fields:
        raise ValueError('Exact evaluation scope, outcome definition and model versions required')
    for value in dataset_context.values():
        text(value, 'evaluation context', 300)
    frozen, evaluated = timestamp(candidate_frozen_at), timestamp(evaluated_at)
    if timestamp(training_outcomes_available_at) >= frozen or frozen >= evaluated:
        raise ValueError('Training labels must be available before the candidate is frozen')
    if type(minimum_samples) is not int or minimum_samples < 30:
        raise ValueError('This screening gate requires at least 30 samples')
    if not isinstance(rows, list) or len(rows) > 100000:
        raise ValueError('Bounded evaluation rows required')
    training = set(training_ids)
    if len(training) != len(training_ids) or not training:
        raise ValueError('Unique training identities required')
    seen = set()
    for row in rows:
        if row.get('context') != dataset_context:
            raise ValueError('Mixed client/product/task/outcome/model evaluation scope')
        identity = text(row['id'], 'example id', 200)
        if identity in seen or identity in training:
            raise ValueError('Duplicate or overlapping holdout identity')
        seen.add(identity)
        decision, resolution = timestamp(row['decided_at']), timestamp(row['resolved_at'])
        if not frozen < decision < resolution <= evaluated:
            raise ValueError('Holdout predictions must precede outcomes and follow candidate freeze')
        if timestamp(row['features_available_at']) > decision:
            raise ValueError('Future information in prediction features')
        if type(row['actual']) is not bool or row.get('quality') != 'verified':
            raise ValueError('Only verified binary outcomes are eligible')
        probability(row['baseline_probability']); probability(row['candidate_probability'])
    baseline = _metrics(rows, 'baseline_probability')
    candidate = _metrics(rows, 'candidate_probability')
    if len(rows) < minimum_samples:
        status = 'insufficient_data'
    elif candidate['brier'] <= baseline['brier'] and candidate['log_loss'] <= baseline['log_loss']:
        status = 'ready_for_independent_review'
    else:
        status = 'blocked'
    return {'status': status, 'context': dataset_context, 'baseline': baseline, 'candidate': candidate,
            'paired_dataset_hash': digest(rows), 'candidate_frozen_at': candidate_frozen_at,
            'automatic_promotion': False, 'execution_authorised': False,
            'remaining_gates': ['domain quality and harm review', 'representative segment coverage',
                                'holdout reuse/selection-bias audit', 'fresh shadow evaluation',
                                'independent activation and rollback controls']}
