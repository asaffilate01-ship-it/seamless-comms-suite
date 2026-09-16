import copy
from pathlib import Path
import tempfile
import unittest
from knowledge_core.rrci import ComplianceService
from knowledge_core.rrci.control import Control, digest
from knowledge_core.store import Store
from knowledge_core.types import Principal, APIError


class GovernanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.now = 2000000000
        self.service = ComplianceService(Store(Path(self.temp.name)/'index.db'),
              Control(Path(self.temp.name)/'control.db'), clock=lambda: self.now)
        self.principal = Principal('omniqora', 'tenant-a', ('workspace-a',), ('rrci',), 'host-a')
        self.actor = {'subject':'alice', 'permissions':['read','write','approve','sync','admin','audit','execute'],
                      'human':True, 'expires_at':self.now+60, 'entitlement_until':self.now+3600}
        self.source('policies', 90)

    def call(self, operation, payload, actor=None, principal=None):
        return self.service.handle(principal or self.principal, {'workspace':'workspace-a',
            'operation':operation,'actor':actor or self.actor,'payload':payload})

    def source(self, id, rank=90):
        self.call('source.upsert', {'id':id,'name':id,'owner_tenant':'tenant-a','connector_id':'fixture',
          'authority':{'policy':rank},'application_permissions':['read','changes','acl'],
          'ownership_evidence':'Fictional ownership review','data_boundary':'This workspace only',
          'residency':'Local test','outage_policy':'deny','acl_ttl_seconds':120,
          'content_ttl_seconds':3600,'expected_revision':0})
        self.call('source.health',{'id':id,'status':'available','expected_revision':1})

    def event(self, id='doc-1', sequence=1, kind='upsert', source='policies', acl=None, value='Seven years'):
        p={'id':f'{id}-{sequence}', 'source_id':source,'document_id':id,'sequence':sequence,'kind':kind}
        if kind != 'delete': p['readers'] = ['alice','bob'] if acl is None else acl
        if kind == 'upsert':
            p.update(document={'title':'Retention policy','text':f'Retention policy requires {value} of record retention.',
                       'source_uri':'urn:fixture:'+id},domain='policy',fact_key='retention',fact_value=value)
        return p

    def query(self, actor=None):
        return self.call('query',{'question':'What is the retention policy?'},actor=actor)

    def test_authorised_evidence(self):
        self.call('event.apply',self.event())
        self.assertEqual(self.query()['evidence'][0]['document_id'],'doc-1')

    def test_tenant_scope_blocks_identical_workspace(self):
        self.call('event.apply',self.event())
        other=Principal('omniqora','tenant-b',('workspace-a',),('rrci',),'host-b')
        self.assertEqual(self.call('query',{'question':'retention policy'},principal=other)['evidence'],[])

    def test_actor_cannot_read_other_document(self):
        self.call('event.apply',self.event(acl=['bob']))
        self.assertEqual(self.query()['evidence'],[])

    def test_permission_change_applies_before_next_query(self):
        self.call('event.apply',self.event())
        self.call('event.apply',self.event(sequence=2,kind='permissions',acl=['bob']))
        self.assertEqual(self.query()['evidence'],[])

    def test_delete_retry_and_old_event_cannot_resurrect(self):
        first=self.event()
        self.call('event.apply',first)
        delete=self.event(sequence=2,kind='delete')
        self.call('event.apply',delete)
        self.assertTrue(self.call('event.apply',delete)['duplicate'])
        self.call('event.apply',first) # old acknowledged duplicate performs no writes
        self.assertEqual(self.query()['evidence'],[])
        with self.assertRaises(APIError): self.call('event.apply',self.event(sequence=3))

    def test_reused_event_id_rejected(self):
        event=self.event();self.call('event.apply',event)
        event['readers']=[]
        with self.assertRaises(APIError): self.call('event.apply',event)

    def test_authority_selects_configured_winner(self):
        self.source('notes',10)
        self.call('event.apply',self.event())
        self.call('event.apply',self.event(id='doc-2',source='notes',value='Three years'))
        r=self.query()
        self.assertEqual([e['document_id'] for e in r['evidence']],['doc-1'])
        self.assertEqual(r['governance']['authority_decisions'][0]['status'],'authority_selected')

    def test_authority_tie_requires_review(self):
        self.source('notes',90)
        self.call('event.apply',self.event())
        self.call('event.apply',self.event(id='doc-2',source='notes',value='Three years'))
        self.assertEqual(self.query()['status'],'source_conflict')

    def test_outage_denies_evidence(self):
        self.call('event.apply',self.event())
        self.call('source.health',{'id':'policies','status':'unavailable','expected_revision':1})
        self.assertEqual(self.query()['evidence'],[])

    def test_expired_identity_and_entitlement_denied(self):
        for field in ('expires_at','entitlement_until'):
            actor=dict(self.actor);actor[field]=self.now
            with self.assertRaises(APIError): self.query(actor)

    def test_expired_acl_denied_with_fresh_identity(self):
        self.call('event.apply',self.event())
        self.now+=121;self.actor['expires_at']=self.now+60
        self.assertEqual(self.query()['evidence'],[])

    def test_sensitive_action_independent_approval_and_single_claim(self):
        self.call('event.apply',self.event())
        p=self.call('action.propose',{'id':'send-1','kind':'send','payload':{'to':'urn:fixture'},'evidence_documents':['doc-1']})
        review={'id':'send-1','decision':'approved','proposal_hash':digest(p),'reason':'Fixture review'}
        with self.assertRaises(APIError): self.call('action.review',review)
        bob=dict(self.actor,subject='bob')
        self.call('action.review',review,actor=bob)
        with self.assertRaises(APIError): self.call('action.claim',{'id':'send-1','payload_hash':'wrong'})
        claimed=self.call('action.claim',{'id':'send-1','payload_hash':p['payload_hash']})
        self.assertFalse(claimed['external_execution'])
        with self.assertRaises(APIError): self.call('action.claim',{'id':'send-1','payload_hash':p['payload_hash']})

    def test_source_ownership_cannot_cross_tenant(self):
        p=self.call('catalogue',{})['sources'][0]
        p={k:v for k,v in p.items() if k not in ('revision','health','verified_at')}
        p.update(owner_tenant='tenant-b',expected_revision=1)
        with self.assertRaises(APIError): self.call('source.upsert',p)

    def test_audit_is_scoped_append_only_hash_chain(self):
        self.call('event.apply',self.event())
        events=self.call('audit',{})['events']
        for previous,current in zip(events,events[1:]): self.assertEqual(current['previous_hash'],previous['hash'])
        with self.service.control.tx() as db:
            with self.assertRaises(Exception): db.execute('DELETE FROM audit')

if __name__=='__main__': unittest.main()
