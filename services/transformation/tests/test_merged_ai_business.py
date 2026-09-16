import test_ai_layer as fixtures
from transformation.ai_hub import PROFILES
from transformation.engine import Engine
from knowledge_core.types import APIError
import json
import unittest


class MergedBusinessAITests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixtures.AIHubTests();self.fixture.setUp()
        self.e,self.owner,self.project=self.fixture.e,self.fixture.owner,self.fixture.p
        def save(kind,data):
            self.e.upsert(self.owner,self.project,{'kind':kind,'record':data,'expected_revision':0})
        save('company',{'id':'company','name':'Service business','company_role':'operating','sector':'Services','countries':['GB'],'owner':'Director'})
        base={'company_id':'company','owner':'Director','evidence_ref':'urn:test:source'}
        save('department',{**base,'id':'sales','name':'Sales','purpose':'Acquire customers'})
        save('person',{**base,'id':'employee','name':'Person','department_id':'sales','job_title':'Manager','employment_type':'employee'})
        save('person_private',{**base,'id':'pay','person_id':'employee','annual_salary':'51234','annual_benefits':'6789','currency':'GBP'})
        save('business_financials',{**base,'id':'month','period_start':'2026-09-01','period_end':'2026-09-30','currency':'GBP','revenue':'10000','cogs':'4000','opex':'3500'})

    def tearDown(self):self.fixture.tearDown()

    def test_finance_specialist_can_use_business_kpis_without_private_pay(self):
        self.fixture.decisions=[fixtures.tool('business_report'),fixtures.final()]
        self.fixture.start()
        first=self.fixture.step()
        report=first['payload']['observations'][0]['result']
        self.assertEqual(report['metrics'][0]['operating_profit'],'2500.00')
        self.fixture.step()
        context=json.dumps(self.fixture.calls)
        self.assertNotIn('51234',context);self.assertNotIn('6789',context)
        self.assertNotIn('annual_salary',context)

    def test_every_specialist_denies_private_personnel_tool_access(self):
        for profile in PROFILES:
            self.assertNotIn('person_private',PROFILES[profile]['kinds'])
            self.fixture.decisions=[fixtures.tool('project_records',kind='person_private')]
            self.fixture.start(profile=profile,rid='private-'+profile)
            with self.assertRaises(APIError):self.fixture.step('private-'+profile)

    def test_postgres_initialisation_waits_for_migrations_and_retains_ai_hub(self):
        engine=Engine('postgresql://not-a-live-connection/database')
        self.assertTrue(engine.postgres)
        self.assertIsNotNone(engine.ai)
