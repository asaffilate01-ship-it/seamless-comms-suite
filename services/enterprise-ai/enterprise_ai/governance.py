"""Single-process pilot register with scoped records and independent review.

This is an internal library, not an authenticated server. Only a trusted host may
construct Actor after verifying identity, membership, role and entitlement.
No provider invocation or production approval is implemented here.
"""
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import sqlite3
import time
import uuid


class Denied(PermissionError):
    pass


class Conflict(ValueError):
    pass


@dataclass(frozen=True)
class Actor:
    tenant: str
    workspace: str
    subject: str
    permissions: frozenset[str]
    expires_at: float
    entitlement_until: float
    human: bool = True


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def text(value, name, maximum=2000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(f'{name} must be nonempty text up to {maximum} characters')
    return value.strip()


def validate_spec(spec):
    required = {'name', 'owner', 'purpose', 'data_classification', 'action_mode', 'decision_impact',
                'data_sources', 'model_reference', 'jurisdiction', 'currency', 'monthly_budget_minor'}
    if not isinstance(spec, dict) or set(spec) != required:
        raise ValueError('Specification fields must exactly match the documented contract')
    clean = {key: text(spec[key], key) for key in ['name', 'owner', 'purpose', 'model_reference', 'jurisdiction']}
    choices = {'data_classification': {'public', 'internal', 'confidential', 'restricted'},
               'action_mode': {'read_only', 'draft', 'external_write'},
               'decision_impact': {'internal_productivity', 'client_communication', 'investment_decision'},
               'currency': {'GBP', 'EUR', 'USD'}}
    for key, options in choices.items():
        if spec[key] not in options:
            raise ValueError(f'Invalid {key}')
        clean[key] = spec[key]
    budget = spec['monthly_budget_minor']
    if type(budget) is not int or not 0 <= budget <= 10**12:
        raise ValueError('Budget must be a nonnegative integer in currency minor units')
    clean['monthly_budget_minor'] = budget
    if not isinstance(spec['data_sources'], list) or not 1 <= len(spec['data_sources']) <= 100:
        raise ValueError('One to 100 data source references required')
    clean['data_sources'] = [text(source, 'data_source', 300) for source in spec['data_sources']]
    return clean


def assessment(spec):
    controls = {'access_review', 'evaluation_results', 'named_owner', 'rollback_plan', 'cost_forecast'}
    risk = 'low'
    if spec['data_classification'] in {'confidential', 'restricted'}:
        controls |= {'data_owner_approval', 'retention_review', 'permission_negative_tests'}
        risk = 'high' if spec['data_classification'] == 'restricted' else 'medium'
    if spec['action_mode'] == 'external_write':
        controls |= {'tool_allowlist', 'independent_action_approval', 'idempotency_test'}
        risk = 'high'
    if spec['decision_impact'] != 'internal_productivity':
        controls |= {'domain_reviewer_approval', 'human_output_review'}
        risk = 'high'
    return {'risk_tier': risk, 'required_controls': sorted(controls), 'policy_version': 'enterprise-ai-pilot-v1'}


class Registry:
    def __init__(self, path, clock=time.time):
        self.clock = clock
        self.db = sqlite3.connect(path, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute('PRAGMA busy_timeout=5000')
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS cases (
              tenant TEXT NOT NULL, workspace TEXT NOT NULL, id TEXT NOT NULL,
              revision INTEGER NOT NULL, body TEXT NOT NULL,
              PRIMARY KEY (tenant,workspace,id));
            CREATE TABLE IF NOT EXISTS audit (
              sequence INTEGER PRIMARY KEY AUTOINCREMENT,
              tenant TEXT NOT NULL, workspace TEXT NOT NULL, body TEXT NOT NULL);
        ''')

    def close(self):
        self.db.close()

    def check(self, actor, permission):
        if not isinstance(actor, Actor):
            raise Denied('Verified host actor required')
        now = self.clock()
        if not all(isinstance(v, str) and v.strip() for v in (actor.tenant, actor.workspace, actor.subject)):
            raise Denied('Incomplete actor')
        if not isinstance(actor.permissions, frozenset) or permission not in actor.permissions:
            raise Denied('Permission required')
        # Comparison against NaN fails closed.
        if not actor.expires_at > now or not actor.entitlement_until > now:
            raise Denied('Actor or entitlement expired')

    @contextmanager
    def transaction(self, actor, permission):
        self.check(actor, permission)
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.check(actor, permission)
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def _load(self, actor, case_id):
        row = self.db.execute('SELECT body FROM cases WHERE tenant=? AND workspace=? AND id=?',
                              (actor.tenant, actor.workspace, case_id)).fetchone()
        if not row:
            raise KeyError('Case not found')
        return json.loads(row['body'])

    def _save(self, actor, case, event):
        case['revision'] += 1
        self.db.execute('INSERT INTO cases VALUES(?,?,?,?,?) ON CONFLICT(tenant,workspace,id) DO UPDATE SET revision=excluded.revision,body=excluded.body',
                        (actor.tenant, actor.workspace, case['id'], case['revision'], encoded(case)))
        record = {'event': event, 'case_id': case['id'], 'revision': case['revision'],
                  'subject': actor.subject, 'time': self.clock(), 'record_hash': digest(case)}
        self.db.execute('INSERT INTO audit(tenant,workspace,body) VALUES(?,?,?)',
                        (actor.tenant, actor.workspace, encoded(record)))

    def _current(self, actor, case_id, revision):
        case = self._load(actor, case_id)
        if type(revision) is not int or case['revision'] != revision:
            raise Conflict('Stale revision; reload before retrying')
        return case

    def create(self, actor, spec):
        self.check(actor, 'write')
        spec = validate_spec(spec)
        with self.transaction(actor, 'write'):
            case = {'id': str(uuid.uuid4()), 'revision': 0, 'status': 'draft', 'spec': spec,
                    'editor': actor.subject, 'contributors': [actor.subject], 'assessment': None, 'evidence': {}, 'approval': None}
            self._save(actor, case, 'created')
        return case

    def revise(self, actor, case_id, revision, spec):
        self.check(actor, 'write')
        spec = validate_spec(spec)
        with self.transaction(actor, 'write'):
            case = self._current(actor, case_id, revision)
            if case['status'] in {'pilot', 'retired'}:
                raise Conflict('Suspend the pilot first; retired cases cannot be edited')
            case.update(spec=spec, status='draft', editor=actor.subject, assessment=None, evidence={}, approval=None)
            case['contributors'] = sorted(set(case['contributors']) | {actor.subject})
            self._save(actor, case, 'revised_approval_invalidated')
        return case

    def assess(self, actor, case_id, revision):
        with self.transaction(actor, 'write'):
            case = self._current(actor, case_id, revision)
            if case['status'] != 'draft':
                raise Conflict('Only a draft may be assessed')
            case.update(status='assessed', assessment=assessment(case['spec']), editor=actor.subject)
            case['contributors'] = sorted(set(case['contributors']) | {actor.subject})
            self._save(actor, case, 'assessed')
        return case

    def attach_evidence(self, actor, case_id, revision, evidence):
        with self.transaction(actor, 'write'):
            case = self._current(actor, case_id, revision)
            if case['status'] != 'assessed':
                raise Conflict('Evidence can be attached only during assessment')
            controls = set(case['assessment']['required_controls'])
            if not isinstance(evidence, dict) or set(evidence) != controls:
                raise ValueError('Evidence references required for every control, with no unknown controls')
            case.update(evidence={key: text(value, key, 1000) for key, value in evidence.items()}, editor=actor.subject)
            case['contributors'] = sorted(set(case['contributors']) | {actor.subject})
            self._save(actor, case, 'evidence_attached')
        return case

    def approve(self, actor, case_id, revision, *, valid_for_seconds=86400):
        with self.transaction(actor, 'approve'):
            case = self._current(actor, case_id, revision)
            if not actor.human or actor.subject in case['contributors'] or actor.subject == case['spec']['owner']:
                raise Denied('Independent human reviewer required')
            if case['status'] != 'assessed' or set(case['evidence']) != set(case['assessment']['required_controls']):
                raise Conflict('Completed assessment and control evidence required')
            if type(valid_for_seconds) is not int or not 0 < valid_for_seconds <= 604800:
                raise ValueError('Approval duration must be between 1 and 604800 seconds')
            case['approval'] = {'reviewer': actor.subject, 'expires_at': self.clock()+valid_for_seconds,
                                'content_hash': digest([case['spec'], case['assessment'], case['evidence']])}
            case['status'] = 'approved'
            self._save(actor, case, 'pilot_plan_approved')
        return case

    def begin_pilot(self, actor, case_id, revision, *, forecast_minor):
        with self.transaction(actor, 'operate'):
            case = self._current(actor, case_id, revision)
            approval = case['approval']
            if case['status'] != 'approved' or not approval or not approval['expires_at'] > self.clock():
                raise Conflict('Valid pilot approval required')
            if approval['content_hash'] != digest([case['spec'], case['assessment'], case['evidence']]):
                raise Conflict('Approval does not match content')
            if type(forecast_minor) is not int or forecast_minor < 0:
                raise ValueError('Forecast must be nonnegative minor units in the case currency')
            if forecast_minor > case['spec']['monthly_budget_minor']:
                raise Conflict('Forecast exceeds approved budget')
            case.update(status='pilot', approved_forecast_minor=forecast_minor)
            self._save(actor, case, 'pilot_registered')
        return case

    def suspend(self, actor, case_id, revision, reason):
        with self.transaction(actor, 'operate'):
            case = self._current(actor, case_id, revision)
            if case['status'] == 'retired':
                raise Conflict('Case retired')
            case.update(status='suspended', suspension_reason=text(reason, 'reason'), approval=None)
            self._save(actor, case, 'suspended')
        return case

    def get(self, actor, case_id):
        self.check(actor, 'read')
        result = self._load(actor, case_id)
        self.check(actor, 'read')
        return result

    def list_cases(self, actor):
        self.check(actor, 'read')
        rows = self.db.execute('SELECT body FROM cases WHERE tenant=? AND workspace=? ORDER BY id',
                               (actor.tenant, actor.workspace)).fetchall()
        self.check(actor, 'read')
        return [json.loads(row['body']) for row in rows]

    def audit(self, actor):
        self.check(actor, 'audit')
        rows = self.db.execute('SELECT body FROM audit WHERE tenant=? AND workspace=? ORDER BY sequence',
                              (actor.tenant, actor.workspace)).fetchall()
        self.check(actor, 'audit')
        return [json.loads(row['body']) for row in rows]
