"""Fictional planning example; no network, messages or live accounts."""
import json
import tempfile
import time
from dataclasses import replace
from pathlib import Path
from enterprise_ai import Actor, Registry, forecast

def run():
    now = time.time()
    author = Actor('fictional-tenant', 'fictional-workspace', 'author',
                   frozenset({'read', 'write', 'approve', 'operate', 'audit'}), now+3600, now+3600)
    reviewer = replace(author, subject='independent-reviewer')
    cost = forecast(users=100, tasks_per_user_day=5, working_days=20, currency='GBP',
        models=[{'name':'illustrative-model-not-a-price-quote','calls_per_task':2,
                 'input_tokens_per_call':4000,'output_tokens_per_call':500,
                 'input_price_per_million':'3','output_price_per_million':'15'}],
        fixed_monthly=100, tools_monthly=20, review_monthly=200, contingency_fraction='0.2')
    with tempfile.TemporaryDirectory() as folder:
        registry = Registry(str(Path(folder)/'demo.db'))
        try:
            case = registry.create(author, {'name':'Fictional research brief','owner':'business-owner',
                'purpose':'Prepare research for human review','data_classification':'confidential',
                'action_mode':'draft','decision_impact':'investment_decision',
                'data_sources':['synthetic:research-notes'],'model_reference':'not-connected',
                'jurisdiction':'GB','currency':'GBP','monthly_budget_minor':100000})
            case = registry.assess(author, case['id'], case['revision'])
            case = registry.attach_evidence(author, case['id'], case['revision'],
                    {control:'fictional-evidence:'+control for control in case['assessment']['required_controls']})
            case = registry.approve(reviewer, case['id'], case['revision'])
            from decimal import Decimal
            case = registry.begin_pilot(author, case['id'], case['revision'], forecast_minor=int(Decimal(cost['budget_with_contingency'])*100))
            return {'label':'FICTIONAL LOCAL DEMONSTRATION','case':case,'forecast':cost,'audit':registry.audit(author),
                    'live_provider_calls':0,'meaning':'Pilot registration only; no execution or production approval'}
        finally:
            registry.close()

if __name__ == '__main__':
    print(json.dumps(run(), indent=2))
