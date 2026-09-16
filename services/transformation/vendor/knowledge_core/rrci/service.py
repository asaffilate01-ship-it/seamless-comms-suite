from datetime import date
import time
import uuid
from ..service import KnowledgeService
from ..types import APIError, Principal, fields, identifier, integer, text
from .control import Control, digest

OPS = {
    'catalogue': 'read', 'query': 'read', 'audit': 'audit',
    'source.upsert': 'admin', 'source.health': 'sync', 'event.apply': 'sync',
    'relationship.propose': 'write', 'relationship.review': 'approve',
    'action.propose': 'write', 'action.review': 'approve', 'action.claim': 'execute',
}
ACTIONS = {'draft': False, 'send': True, 'publish': True, 'delete': True,
           'change_access': True, 'export': True, 'external_write': True}


def require(condition, status=403, message='Access denied'):
    if not condition:
        raise APIError(status, message)


def readers(value):
    require(isinstance(value, list) and len(value) <= 200, 422, 'readers must be an array of at most 200 subject IDs')
    return sorted(set(identifier(v, 'reader') for v in value))


class ComplianceService:
    def __init__(self, index, control, provider=None, clock=time.time):
        self.index, self.control, self.provider, self.clock = index, control, provider, clock

    def handle(self, principal, data):
        fields(data, {'operation', 'workspace', 'actor', 'payload'}, {'operation', 'workspace', 'actor', 'payload'})
        op = data['operation']
        require(isinstance(op, str) and op in OPS, 422, 'Unknown operation')
        scope = principal.scope(data['workspace'], 'rrci')
        a = data['actor']
        fields(a, {'subject', 'permissions', 'expires_at', 'entitlement_until', 'human'},
               {'subject', 'permissions', 'expires_at', 'entitlement_until', 'human'})
        identifier(a['subject'], 'subject')
        require(isinstance(a['permissions'], list) and all(isinstance(p, str) for p in a['permissions']), 422)
        require(type(a['human']) is bool, 422)
        # Actor assertions are accepted only from a tenant-scoped trusted host credential.
        # Omniqora resolves them from current membership/entitlement; browsers never receive this credential.
        self.check_lease(a)
        require(OPS[op] in a['permissions'])
        with self.control.tx() as db:
            self.control.log(db, scope, a['subject'], 'request.' + op, '', {'payload_hash': digest(data['payload'])})
        try:
            result = getattr(self, op.replace('.', '_'))(scope, a, data['payload'])
            self.check_lease(a)
        except Exception as error:
            with self.control.tx() as db:
                self.control.log(db, scope, a['subject'], 'failed.' + op, '', {'status': getattr(error, 'status', 500)})
            raise
        with self.control.tx() as db:
            self.control.log(db, scope, a['subject'], 'completed.' + op, '', {'result_hash': digest(result)})
        return result

    def check_lease(self, a):
        now = self.clock()
        require(type(a['expires_at']) in (int, float) and now < a['expires_at'] <= now + 65,
                403, 'Identity assertion expired or invalid')
        require(type(a['entitlement_until']) in (int, float) and now < a['entitlement_until'],
                403, 'An active add-on entitlement is required')

    def source_upsert(self, scope, a, p):
        allowed = {'id', 'name', 'owner_tenant', 'connector_id', 'authority', 'application_permissions',
                   'ownership_evidence', 'data_boundary', 'residency', 'outage_policy',
                   'acl_ttl_seconds', 'content_ttl_seconds', 'expected_revision'}
        fields(p, allowed, allowed)
        require(p['owner_tenant'] == scope.tenant, 403, 'Cross-organisation ingestion is disabled')
        require(p['outage_policy'] in ('deny', 'bounded_cache'), 422)
        require(isinstance(p['authority'], dict) and len(p['authority']) <= 30, 422)
        authority = {identifier(k, 'domain'): integer(v, 'authority rank', 0, 100) for k, v in p['authority'].items()}
        require(isinstance(p['application_permissions'], list) and
                set(p['application_permissions']) == {'read', 'changes', 'acl'}, 422,
                'Onboard a least-privilege connector with read, changes and ACL access')
        source = {k: text(p[k], k, 500) for k in ('name', 'ownership_evidence', 'data_boundary', 'residency')}
        source.update({k: identifier(p[k], k) for k in ('id', 'owner_tenant', 'connector_id')})
        source.update(authority=authority, application_permissions=p['application_permissions'],
                      outage_policy=p['outage_policy'],
                      acl_ttl_seconds=integer(p['acl_ttl_seconds'], 'acl_ttl_seconds', 1, 300),
                      content_ttl_seconds=integer(p['content_ttl_seconds'], 'content_ttl_seconds', 1, 86400))
        expected = integer(p['expected_revision'], 'expected_revision', 0, 1000000)
        with self.control.tx() as db:
            old = self.control.get(db, scope, 'source', source['id'])
            require(expected == (old['revision'] if old else 0), 409, 'Source policy changed')
            source.update(revision=expected+1, health='unverified', verified_at=0)
            self.control.put(db, scope, 'source', source['id'], source)
        return source

    def source_health(self, scope, a, p):
        fields(p, {'id', 'status', 'expected_revision'}, {'id', 'status', 'expected_revision'})
        require(p['status'] in ('available', 'unavailable', 'revoked'), 422)
        with self.control.tx() as db:
            s = self.source(db, scope, p['id'])
            require(p['expected_revision'] == s['revision'], 409, 'Source policy changed')
            s.update(health=p['status'], verified_at=self.clock())
            self.control.put(db, scope, 'source', s['id'], s)
        return {'id': s['id'], 'health': s['health']}

    def source(self, db, scope, id):
        s = self.control.get(db, scope, 'source', identifier(id, 'source_id'))
        require(s is not None, 404, 'Source not onboarded')
        return s

    def event_apply(self, scope, a, p):
        fields(p, {'id', 'source_id', 'document_id', 'sequence', 'kind', 'readers', 'document',
                   'domain', 'fact_key', 'fact_value', 'restore'},
               {'id', 'source_id', 'document_id', 'sequence', 'kind'})
        id, docid = identifier(p['id'], 'event_id'), identifier(p['document_id'], 'document_id')
        seq = integer(p['sequence'], 'sequence', 1, 1000000000)
        require(p['kind'] in ('upsert', 'delete', 'permissions'), 422)
        if p['kind'] != 'delete':
            acl = readers(p.get('readers'))
        fingerprint = digest(p)
        with self.control.tx() as db:
            source = self.source(db, scope, p['source_id'])
            require(source['health'] == 'available', 503, 'Source must be verified before applying changes')
            receipt = self.control.get(db, scope, 'event', id)
            if receipt:
                require(receipt['hash'] == fingerprint, 409, 'Event ID reused with different content')
                if receipt['status'] == 'applied':
                    return {'id': id, 'status': 'applied', 'duplicate': True}
            old = self.control.get(db, scope, 'document', docid)
            require(not old or old['source_id'] == source['id'], 409, 'Document belongs to another source')
            retry = old and old.get('event_id') == id
            require(not old or seq > old['sequence'] or retry, 409, 'Out-of-order change rejected')
            require(p['kind'] != 'permissions' or old and old['status'] == 'ready' or retry, 409,
                    'Permissions require a current document')
            require(not old or old['status'] != 'deleted' or p['kind'] == 'delete' or p.get('restore') is True,
                    409, 'Restoring a tombstone requires an explicit newer restore event')
            state = dict(old or {'id': docid, 'core_revision': 0})
            state.update(source_id=source['id'], sequence=seq, event_id=id, status='pending')
            self.control.put(db, scope, 'document', docid, state)
            self.control.put(db, scope, 'event', id, {'id': id, 'hash': fingerprint, 'status': 'pending',
                             'document_id': docid, 'payload': p})
        # Pending state commits before indexing: crashes and model failures cannot expose an old index.
        with self.control.tx() as db:
            state = self.control.get(db, scope, 'document', docid)
            require(state['event_id'] == id, 409, 'A newer event superseded this change')
            source = self.source(db, scope, p['source_id'])
            require(source['health'] == 'available', 503, 'Source unavailable')
            service = KnowledgeService(self.index, self.provider)
            writer = Principal(scope.project, scope.tenant, (scope.collection,), ('ingest',), 'projection')
            if p['kind'] == 'upsert':
                document = dict(p.get('document') or {})
                fields(document, {'title', 'text', 'source_uri', 'jurisdiction', 'language', 'valid_from', 'valid_until'},
                       {'title', 'text', 'source_uri'})
                document.update(collection=scope.collection, id=docid, expected_revision=state['core_revision'])
                result = service.ingest(writer, document)
                state.update(core_revision=result['revision'], domain=identifier(p.get('domain', 'general'), 'domain'),
                             fact_key=text(p.get('fact_key', docid), 'fact_key'),
                             fact_value=text(p.get('fact_value', document['text']), 'fact_value', 100000),
                             indexed_at=self.clock())
            elif p['kind'] == 'delete':
                if state['core_revision']:
                    try:
                        service.delete(writer, {'collection': scope.collection, 'id': docid,
                                                'expected_revision': state['core_revision']})
                    except APIError as e:
                        if e.status != 404:
                            raise
                state['core_revision'] = 0
            state['status'] = 'deleted' if p['kind'] == 'delete' else 'ready'
            state.update(readers=[] if p['kind'] == 'delete' else acl, acl_verified_at=self.clock())
            self.control.put(db, scope, 'document', docid, state)
            # Any source/ACL change invalidates previous semantic relationship reviews.
            for e in self.control.items(db, scope, 'relationship'):
                if e['document_id'] == docid:
                    e['status'] = 'invalidated'
                    self.control.put(db, scope, 'relationship', e['id'], e)
            self.control.put(db, scope, 'event', id, {'id': id, 'hash': fingerprint, 'status': 'applied', 'document_id': docid})
        return {'id': id, 'status': 'applied', 'document_status': state['status']}

    def allowed(self, document, source, actor):
        now = self.clock()
        return (document['status'] == 'ready' and actor['subject'] in document.get('readers', [])
                and source['health'] in ('available', 'unavailable')
                and now < document['acl_verified_at'] + source['acl_ttl_seconds']
                and now < document['indexed_at'] + source['content_ttl_seconds']
                and (source['health'] == 'available' and now < source['verified_at'] + source['acl_ttl_seconds']
                     or source['outage_policy'] == 'bounded_cache'))

    def snapshot(self, scope, actor, as_of, jurisdiction, language):
        with self.control.tx() as db:
            epoch = self.control.epoch(db, scope)
            sources = {s['id']: s for s in self.control.items(db, scope, 'source')}
            docs = {d['id']: d for d in self.control.items(db, scope, 'document')}
            eligible = {id: d for id, d in docs.items() if self.allowed(d, sources[d['source_id']], actor)}
            rows, edges = self.index.snapshot(scope, as_of, jurisdiction, language)
            rows = [r for r in rows if r['document_id'] in eligible and
                    r['revision'] == eligible[r['document_id']]['core_revision']]
            # Authority is evaluated only on visible, currently valid evidence. Never reveal hidden alternatives.
            valid_ids = {r['document_id'] for r in rows}
            groups = {}
            for id in valid_ids:
                d = eligible[id]
                groups.setdefault((d['domain'], d['fact_key']), []).append(d)
            decisions, excluded, unresolved = [], set(), False
            for (domain, key), variants in groups.items():
                if len({d['fact_value'] for d in variants}) < 2:
                    continue
                rank = lambda d: sources[d['source_id']]['authority'].get(domain, 0)
                best = max(map(rank, variants))
                winners = [d for d in variants if rank(d) == best]
                tied = best == 0 or len({d['fact_value'] for d in winners}) > 1
                unresolved |= tied
                excluded.update(d['id'] for d in variants if tied or rank(d) < best)
                decisions.append({'domain': domain, 'fact_key': key, 'status': 'unresolved' if tied else 'authority_selected',
                                  'winner_documents': [] if tied else [d['id'] for d in winners],
                                  'competing_documents': [d['id'] for d in variants]})
            rows = [r for r in rows if r['document_id'] not in excluded]
            chunks = {r['id'] for r in rows}
            reviewed = {e['id']: e for e in self.control.items(db, scope, 'relationship') if e['status'] == 'approved'}
            edges = [e for e in edges if e['chunk_id'] in chunks and e['id'] in reviewed
                     and e['quote'] == reviewed[e['id']]['quote']
                     and reviewed[e['id']]['document_revision'] == eligible[reviewed[e['id']]['document_id']]['core_revision']]
            stale = sorted({d['source_id'] for d in eligible.values() if sources[d['source_id']]['health'] != 'available'
                            or self.clock() >= sources[d['source_id']]['verified_at'] + sources[d['source_id']]['acl_ttl_seconds']})
            return rows, edges, epoch, decisions, unresolved, stale

    def query(self, scope, a, p):
        fields(p, {'question', 'mode', 'seeds', 'hops', 'top_k', 'as_of', 'jurisdiction', 'language'}, {'question'})
        outer = self
        class View:
            backend = getattr(outer.index, 'backend', 'sqlite')
            def snapshot(view, scope_, as_of, jurisdiction, language):
                rows, edges, view.epoch, view.decisions, view.conflict, view.stale = outer.snapshot(scope_, a, as_of, jurisdiction, language)
                # Unresolved contradictions require review; do not ask a model to choose.
                return ([], []) if view.conflict else (rows, edges)
            def save_trace(view, scope_, trace):
                outer.check_lease(a)
                with outer.control.tx() as db:
                    require(outer.control.epoch(db, scope_) == view.epoch, 409, 'Evidence or access changed; retry query')
                    # Expiring ACL/source leases must also be checked after a slow provider call.
                    current = outer.control.items(db, scope_, 'document')
                    sources = {s['id']: s for s in outer.control.items(db, scope_, 'source')}
                    used = set(trace['source_chunks'])
                    require(all(outer.allowed(d, sources[d['source_id']], a) for d in current
                                if any(c.startswith(d['id'] + ':v') for c in used)), 403, 'Evidence access expired')
                    outer.control.log(db, scope_, a['subject'], 'query.evidence', trace['id'], trace)
        view = View()
        reader = Principal(scope.project, scope.tenant, (scope.collection,), ('query',), a['subject'])
        result = KnowledgeService(view, self.provider).query(reader, dict(p, collection=scope.collection))
        if view.conflict:
            result.update(status='source_conflict', answer='Sources disagree without a unique configured authority. Review the source decisions.', claims=[])
        result['governance'] = {'authority_decisions': view.decisions, 'stale_sources': view.stale,
                                'snapshot_version': view.epoch, 'semantic_relationship_review': 'human',
                                'authority_scope': 'explicit fact keys; unstructured contradictions need review'}
        return result

    def relationship_propose(self, scope, a, p):
        allowed = {'id', 'source', 'relation', 'target', 'document_id', 'document_revision', 'quote'}
        fields(p, allowed, allowed)
        with self.control.tx() as db:
            d = self.control.get(db, scope, 'document', p['document_id'])
            require(d and self.allowed(d, self.source(db, scope, d['source_id']), a), 403)
            require(p['document_revision'] == d['core_revision'], 409, 'Supporting document changed')
            writer = Principal(scope.project, scope.tenant, (scope.collection,), ('ingest',), a['subject'])
            KnowledgeService(self.index).add_edge(writer, dict(p, collection=scope.collection))
            record = dict(p, status='proposed', proposed_by=a['subject'], quote_hash=digest(p['quote']),
                          evidence_event=d['event_id'], proposed_at=self.clock())
            self.control.put(db, scope, 'relationship', p['id'], record)
        return record

    def relationship_review(self, scope, a, p):
        fields(p, {'id', 'decision', 'proposal_hash', 'reason'}, {'id', 'decision', 'proposal_hash', 'reason'})
        require(a['human'], 403, 'Human review is required')
        require(p['decision'] in ('approved', 'rejected'), 422)
        with self.control.tx() as db:
            e = self.control.get(db, scope, 'relationship', identifier(p['id'], 'id'))
            require(e and e['status'] == 'proposed', 409, 'No pending relationship')
            require(e['proposed_by'] != a['subject'], 403, 'Independent review required')
            require(digest(e) == p['proposal_hash'], 409, 'Proposal changed')
            d = self.control.get(db, scope, 'document', e['document_id'])
            require(d and self.allowed(d, self.source(db, scope, d['source_id']), a), 403)
            require(d['event_id'] == e['evidence_event'], 409, 'Evidence changed')
            e.update(status=p['decision'], reviewed_by=a['subject'], reviewed_at=self.clock(), reason=text(p['reason'], 'reason', 500))
            self.control.put(db, scope, 'relationship', e['id'], e)
        return e

    def action_propose(self, scope, a, p):
        fields(p, {'id', 'kind', 'payload', 'evidence_documents'}, {'id', 'kind', 'payload', 'evidence_documents'})
        require(p['kind'] in ACTIONS, 422, 'Action kind is not allowlisted')
        require(isinstance(p['payload'], dict) and len(str(p['payload'])) <= 10000, 422)
        ids = readers(p['evidence_documents'])
        with self.control.tx() as db:
            require(not self.control.get(db, scope, 'action', p['id']), 409, 'Action ID already exists')
            bindings = {}
            for id in ids:
                d = self.control.get(db, scope, 'document', id)
                require(d and self.allowed(d, self.source(db, scope, d['source_id']), a), 403)
                bindings[id] = d['event_id']
            record = {'id': identifier(p['id'], 'id'), 'kind': p['kind'], 'payload': p['payload'],
                      'payload_hash': digest(p['payload']), 'evidence': bindings,
                      'proposed_by': a['subject'], 'expires_at': self.clock()+900,
                      'status': 'pending' if ACTIONS[p['kind']] else 'approved', 'reviewed_by': None}
            self.control.put(db, scope, 'action', record['id'], record)
        return record

    def check_action_evidence(self, db, scope, action, a):
        require(self.clock() < action['expires_at'], 409, 'Action expired')
        for id, event in action['evidence'].items():
            d = self.control.get(db, scope, 'document', id)
            require(d and d['event_id'] == event and self.allowed(d, self.source(db, scope, d['source_id']), a),
                    409, 'Action evidence changed or access expired')

    def action_review(self, scope, a, p):
        fields(p, {'id', 'decision', 'proposal_hash', 'reason'}, {'id', 'decision', 'proposal_hash', 'reason'})
        require(a['human'], 403, 'Human approval is required')
        require(p['decision'] in ('approved', 'rejected'), 422)
        with self.control.tx() as db:
            action = self.control.get(db, scope, 'action', identifier(p['id'], 'id'))
            require(action and action['status'] == 'pending', 409, 'No pending action')
            require(action['proposed_by'] != a['subject'], 403, 'Independent approval required')
            require(digest(action) == p['proposal_hash'], 409, 'Action changed; review exact proposal')
            self.check_action_evidence(db, scope, action, a)
            action.update(status=p['decision'], reviewed_by=a['subject'], reason=text(p['reason'], 'reason', 500))
            self.control.put(db, scope, 'action', action['id'], action)
        return action

    def action_claim(self, scope, a, p):
        fields(p, {'id', 'payload_hash'}, {'id', 'payload_hash'})
        with self.control.tx() as db:
            action = self.control.get(db, scope, 'action', identifier(p['id'], 'id'))
            require(action and action['status'] == 'approved', 409, 'Action is not approved or already claimed')
            require(p['payload_hash'] == action['payload_hash'], 409, 'Payload changed')
            self.check_action_evidence(db, scope, action, a)
            if ACTIONS[action['kind']]:
                require(action['reviewed_by'] is not None)
            action.update(status='claimed', claimed_by=a['subject'], claimed_at=self.clock())
            self.control.put(db, scope, 'action', action['id'], action)
        return {'status': 'claimed', 'dispatch': action, 'external_execution': False}

    def catalogue(self, scope, a, p):
        fields(p, set())
        with self.control.tx() as db:
            sources = {s['id']: s for s in self.control.items(db, scope, 'source')}
            docs = [d for d in self.control.items(db, scope, 'document') if self.allowed(d, sources[d['source_id']], a)]
            ids = {d['id'] for d in docs}
            relationships = [dict(e, proposal_hash=digest(e)) for e in self.control.items(db, scope, 'relationship') if e['document_id'] in ids]
            actions = [dict(e, proposal_hash=digest(e)) for e in self.control.items(db, scope, 'action')
                       if set(e['evidence']) <= ids and (e['proposed_by'] == a['subject'] or 'approve' in a['permissions'])]
            return {'sources': list(sources.values()), 'documents': docs, 'relationships': relationships, 'actions': actions,
                    'module': 'rrci', 'workspace': scope.collection, 'tenant': scope.tenant,
                    'cross_organisation_sharing': 'disabled'}

    def audit(self, scope, a, p):
        fields(p, {'after'})
        after = integer(p.get('after', 0), 'after', 0, 1000000000)
        with self.control.tx() as db:
            rows = [dict(r) for r in db.execute('SELECT * FROM audit WHERE scope=? AND seq>? ORDER BY seq LIMIT 200', (scope.key, after))]
        return {'events': rows, 'next_after': rows[-1]['seq'] if rows else after,
                'integrity': 'hash chain; export checkpoints to independent retention for tamper evidence'}
