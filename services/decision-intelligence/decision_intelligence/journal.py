"""Trusted-backend local journal. Access objects MUST come from verified host auth.

The kernel isolates records, but does not authenticate callers, manage entitlements,
discover source ACLs or execute approvals. It has no browser/HTTP endpoint.
"""
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from .common import canonical, digest, iso, probability, text, timestamp


@dataclass(frozen=True)
class Access:
    tenant: str
    product: str
    collection: str
    subject: str
    permissions: frozenset[str]

    def require(self, permission):
        for value in (self.tenant, self.product, self.collection, self.subject):
            text(value, 'verified access context', 200)
        if permission not in self.permissions:
            raise PermissionError('Operation not allowed')

    @property
    def scope(self):
        return (self.tenant, self.product, self.collection)


class DecisionJournal:
    def __init__(self, path, clock=None):
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS decisions (
            tenant TEXT, product TEXT, collection TEXT, id TEXT, author TEXT,
            recorded_at TEXT, request_hash TEXT, payload TEXT, valid INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY(tenant, product, collection, id));
          CREATE TABLE IF NOT EXISTS outcomes (
            tenant TEXT, product TEXT, collection TEXT, decision_id TEXT,
            payload TEXT, request_hash TEXT,
            PRIMARY KEY(tenant, product, collection, decision_id),
            FOREIGN KEY(tenant, product, collection, decision_id)
              REFERENCES decisions(tenant, product, collection, id));
          CREATE TABLE IF NOT EXISTS lessons (
            tenant TEXT, product TEXT, collection TEXT, id TEXT, author TEXT,
            payload TEXT, request_hash TEXT, status TEXT, reviewed_by TEXT,
            PRIMARY KEY(tenant, product, collection, id));
          CREATE TABLE IF NOT EXISTS audit (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant TEXT, product TEXT, collection TEXT, subject TEXT,
            event TEXT, item_id TEXT, at TEXT);
        ''')

    def close(self):
        self.db.close()

    def _audit(self, access, event, identity):
        self.db.execute('INSERT INTO audit(tenant,product,collection,subject,event,item_id,at) VALUES(?,?,?,?,?,?,?)',
                        (*access.scope, access.subject, event, identity, iso(self.clock())))

    def _decision(self, access, identity):
        row = self.db.execute('SELECT * FROM decisions WHERE tenant=? AND product=? AND collection=? AND id=?',
                              (*access.scope, identity)).fetchone()
        if row is None:
            raise LookupError('Decision not available in this scope')
        return row

    def record_decision(self, access, *, decision_id, task, model_version, prompt_version,
                        rule_version, evidence, summary, supporting, opposing, unknowns,
                        predicted_success=None, outcome_definition=None):
        access.require('record')
        for value, name in [(decision_id, 'decision id'), (task, 'task'), (model_version, 'model'),
                            (prompt_version, 'prompt'), (rule_version, 'rule')]:
            text(value, name, 200)
        text(summary, 'decision summary', 4000)
        if not isinstance(evidence, list) or not 1 <= len(evidence) <= 50:
            raise ValueError('One to fifty authorised source references required')
        seen = set()
        for e in evidence:
            if not isinstance(e, dict) or set(e) != {'source_id', 'revision', 'available_at'}:
                raise ValueError('Evidence needs source ID, revision and availability time')
            text(e['source_id'], 'source ID', 200)
            if type(e['revision']) is not int or e['revision'] < 1:
                raise ValueError('Positive source revision required')
            if e['source_id'] in seen:
                raise ValueError('Duplicate source ID')
            seen.add(e['source_id'])
            timestamp(e['available_at'])
        for reasons in (supporting, opposing, unknowns):
            if not isinstance(reasons, list) or len(reasons) > 20:
                raise ValueError('Bounded reason lists required')
            for reason in reasons:
                text(reason, 'reason summary', 1000)
        if predicted_success is not None:
            probability(predicted_success)
            text(outcome_definition, 'measurable outcome definition', 1000)
        elif outcome_definition is not None:
            text(outcome_definition, 'outcome definition', 1000)
        payload = dict(task=task, model_version=model_version, prompt_version=prompt_version,
                       rule_version=rule_version, evidence=evidence, summary=summary,
                       supporting=supporting, opposing=opposing, unknowns=unknowns,
                       predicted_success=predicted_success, outcome_definition=outcome_definition)
        request_hash = digest(payload)
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            old = self.db.execute('SELECT * FROM decisions WHERE tenant=? AND product=? AND collection=? AND id=?',
                                  (*access.scope, decision_id)).fetchone()
            if old:
                if old['request_hash'] != request_hash:
                    raise ValueError('Decision ID already has different immutable content')
                return {'id': decision_id, 'recorded_at': old['recorded_at'], 'hash': request_hash}
            now = self.clock()
            if any(timestamp(e['available_at']) > now for e in evidence):
                raise ValueError('Future evidence cannot support this decision')
            self.db.execute('INSERT INTO decisions VALUES(?,?,?,?,?,?,?,?,1)',
                            (*access.scope, decision_id, access.subject, iso(now), request_hash, canonical(payload)))
            self._audit(access, 'decision.recorded', decision_id)
        return {'id': decision_id, 'recorded_at': iso(now), 'hash': request_hash}

    def record_outcome(self, access, decision_id, *, receipt_id, occurred_at, success, quality):
        access.require('outcome')
        text(receipt_id, 'authoritative outcome receipt', 200)
        if success is not None and type(success) is not bool:
            raise ValueError('Success must be true, false or unknown')
        if quality not in {'verified', 'disputed', 'unknown'}:
            raise ValueError('Invalid outcome quality')
        if quality == 'verified' and success is None:
            raise ValueError('Verified binary outcome needs an observed label')
        payload = dict(receipt_id=receipt_id, occurred_at=occurred_at, success=success, quality=quality)
        h = digest(payload)
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            decision = self._decision(access, decision_id)
            if not decision['valid']:
                raise ValueError('Decision evidence is invalidated')
            at = timestamp(occurred_at)
            if not timestamp(decision['recorded_at']) <= at <= self.clock():
                raise ValueError('Outcome must occur after capture and no later than now')
            old = self.db.execute('SELECT request_hash FROM outcomes WHERE tenant=? AND product=? AND collection=? AND decision_id=?',
                                  (*access.scope, decision_id)).fetchone()
            if old:
                if old['request_hash'] != h:
                    raise ValueError('Conflicting outcome; corrections require a reviewed supersession workflow')
                return {'decision_id': decision_id, 'recorded': True}
            self.db.execute('INSERT INTO outcomes VALUES(?,?,?,?,?,?)',
                            (*access.scope, decision_id, canonical(payload), h))
            self._audit(access, 'outcome.recorded', decision_id)
        return {'decision_id': decision_id, 'recorded': True}

    def read_decision(self, access, decision_id):
        access.require('read')
        row = self._decision(access, decision_id)
        if not row['valid']:
            raise LookupError('Decision evidence no longer eligible')
        result = json.loads(row['payload'])
        return {'id': row['id'], 'recorded_at': row['recorded_at'], 'hash': row['request_hash'], **result}

    def _usable_support(self, access, identity):
        d = self._decision(access, identity)
        o = self.db.execute('SELECT payload FROM outcomes WHERE tenant=? AND product=? AND collection=? AND decision_id=?',
                            (*access.scope, identity)).fetchone()
        return bool(d['valid'] and o and json.loads(o['payload'])['quality'] == 'verified')

    def outcome_review(self, access, decision_id):
        access.require('read')
        decision = self.read_decision(access, decision_id)
        row = self.db.execute('SELECT payload FROM outcomes WHERE tenant=? AND product=? AND collection=? AND decision_id=?',
                              (*access.scope, decision_id)).fetchone()
        if not row:
            return {'status': 'awaiting_outcome', 'decision': decision, 'cause_established': False}
        outcome = json.loads(row['payload'])
        p = decision['predicted_success']
        eligible = outcome['quality'] == 'verified' and outcome['success'] is not None
        residual = int(outcome['success']) - p if eligible and p is not None else None
        return {'status': 'observed' if eligible else 'outcome_needs_review', 'decision': decision,
                'outcome': outcome, 'probability_residual': residual,
                'brier_loss': residual ** 2 if residual is not None else None,
                'cause_established': False,
                'next_step': 'Review frozen supporting/opposing evidence, data quality and execution receipts before proposing a change.'}

    def propose_lesson(self, access, *, lesson_id, task, model_version, prompt_version,
                       rule_version, lesson, support_ids, expires_at):
        access.require('propose')
        for value in (lesson_id, task, model_version, prompt_version, rule_version):
            text(value, 'lesson identity or version', 200)
        text(lesson, 'reviewable lesson', 2000)
        if not isinstance(support_ids, list) or not 1 <= len(support_ids) <= 100 or len(set(support_ids)) != len(support_ids):
            raise ValueError('Unique bounded supporting decision IDs required')
        if timestamp(expires_at) <= self.clock():
            raise ValueError('Lesson expiry must be in the future')
        payload = dict(task=task, model_version=model_version, prompt_version=prompt_version,
                       rule_version=rule_version, lesson=lesson, support_ids=support_ids, expires_at=expires_at,
                       interpretation='reviewed_association_not_causal_proof', executable=False)
        h = digest(payload)
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            for identity in support_ids:
                if not self._usable_support(access, identity):
                    raise ValueError('Verified, valid source outcomes are required')
                source = json.loads(self._decision(access, identity)['payload'])
                if any(source[key] != payload[key] for key in ('task', 'model_version', 'prompt_version', 'rule_version')):
                    raise ValueError('Lesson support must match its task and exact version scope')
            old = self.db.execute('SELECT request_hash FROM lessons WHERE tenant=? AND product=? AND collection=? AND id=?',
                                  (*access.scope, lesson_id)).fetchone()
            if old:
                if old['request_hash'] != h:
                    raise ValueError('Lesson ID conflict')
                return {'id': lesson_id, 'hash': h}
            self.db.execute('INSERT INTO lessons VALUES(?,?,?,?,?,?,?,?,NULL)',
                            (*access.scope, lesson_id, access.subject, canonical(payload), h, 'proposed'))
            self._audit(access, 'lesson.proposed', lesson_id)
        return {'id': lesson_id, 'hash': h}

    def review_lesson(self, access, lesson_id, *, expected_hash, approve):
        access.require('review')
        if type(approve) is not bool:
            raise ValueError('Explicit approval decision required')
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            row = self.db.execute('SELECT * FROM lessons WHERE tenant=? AND product=? AND collection=? AND id=?',
                                  (*access.scope, lesson_id)).fetchone()
            if not row:
                raise LookupError('Lesson unavailable')
            if row['author'] == access.subject:
                raise PermissionError('A different authorised reviewer is required')
            if row['request_hash'] != expected_hash or row['status'] != 'proposed':
                raise ValueError('Proposal changed or already reviewed')
            payload = json.loads(row['payload'])
            if approve and (timestamp(payload['expires_at']) <= self.clock() or
                            not all(self._usable_support(access, i) for i in payload['support_ids'])):
                raise ValueError('Expired or invalid lesson support')
            state = 'approved' if approve else 'rejected'
            self.db.execute('UPDATE lessons SET status=?,reviewed_by=? WHERE tenant=? AND product=? AND collection=? AND id=?',
                            (state, access.subject, *access.scope, lesson_id))
            self._audit(access, 'lesson.' + state, lesson_id)
        return {'id': lesson_id, 'status': state, 'execution_authorised': False}

    def lessons(self, access, *, task, model_version, prompt_version, rule_version):
        access.require('read')
        rows = self.db.execute('SELECT * FROM lessons WHERE tenant=? AND product=? AND collection=? AND status=? ORDER BY id',
                               (*access.scope, 'approved')).fetchall()
        result = []
        for row in rows:
            p = json.loads(row['payload'])
            if any(p[k] != v for k, v in dict(task=task, model_version=model_version,
                                             prompt_version=prompt_version, rule_version=rule_version).items()):
                continue
            if timestamp(p['expires_at']) <= self.clock() or not all(self._usable_support(access, i) for i in p['support_ids']):
                continue
            result.append({'id': row['id'], 'hash': row['request_hash'], **p})
            if len(result) == 20:
                break
        return result

    def invalidate_source(self, access, source_id, current_revision=None):
        access.require('invalidate')
        text(source_id, 'source id', 200)
        if current_revision is not None and (type(current_revision) is not int or current_revision < 1):
            raise ValueError('Positive revision or None for revoked/deleted source')
        invalidated = 0
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            rows = self.db.execute('SELECT id,payload FROM decisions WHERE tenant=? AND product=? AND collection=? AND valid=1', access.scope).fetchall()
            for row in rows:
                refs = json.loads(row['payload'])['evidence']
                if any(e['source_id'] == source_id and (current_revision is None or e['revision'] != current_revision) for e in refs):
                    self.db.execute('UPDATE decisions SET valid=0 WHERE tenant=? AND product=? AND collection=? AND id=?', (*access.scope, row['id']))
                    invalidated += 1
            self._audit(access, 'source.invalidated', source_id)
        return {'invalidated_decisions': invalidated}
