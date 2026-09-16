"""Business360: validated discovery, reproducible KPIs and evidence-linked plans."""
from datetime import date, timedelta
from decimal import Decimal
from .finance import number, money, currency
from knowledge_core.types import APIError, fields, identifier, text, iso_date

DOMAINS = ['purpose', 'customers', 'revenue', 'processes', 'people', 'assets', 'technology', 'costs', 'collections', 'suppliers', 'compliance', 'goals']
QUESTIONS = {
 'purpose': 'What does the business do, for whom, and why do customers choose it?',
 'customers': 'Who buys, uses and pays; what problems and complaints do they experience?',
 'revenue': 'How does an enquiry become an order, delivered work, an invoice and cash?',
 'processes': 'What are the main steps, handoffs, approvals and waiting points?',
 'people': 'Which departments, roles, skills, reporting lines, salaries and benefits support delivery?',
 'assets': 'What tangible and intangible resources are owned, leased, licensed or shared?',
 'technology': 'Which applications, hardware, data and integrations are business-critical?',
 'costs': 'What recurring costs, commitments, professional fees and avoidable losses exist?',
 'collections': 'What is overdue, why, and how are disputes and payment allocations handled?',
 'suppliers': 'Which suppliers are critical and what bottlenecks do they encounter?',
 'compliance': 'Which obligations, advisers, controls and approvals apply to this scope?',
 'goals': 'What are the short-, medium- and long-term goals and constraints?'
}
COMMON = {'id', 'company_id', 'owner', 'evidence_ref'}
SCHEMAS = {
 'department': (COMMON | {'name','purpose'}, COMMON | {'name','purpose'}),
 'person': (COMMON | {'name','department_id','job_title','reports_to','email','employment_type'}, COMMON | {'name','department_id','job_title','employment_type'}),
 'person_private': (COMMON | {'person_id','annual_salary','annual_benefits','currency'}, COMMON | {'person_id','annual_salary','annual_benefits','currency'}),
 'stakeholder': (COMMON | {'name','party','organisation','interest','email'}, COMMON | {'name','party','organisation','interest'}),
 'discovery_answer': (COMMON | {'domain','question','answer','source_kind','evidence_status'}, COMMON | {'domain','question','answer','source_kind','evidence_status'}),
 'business_process': (COMMON | {'name','trigger','steps','outcome','bottleneck','cycle_minutes','waiting_minutes'}, COMMON | {'name','trigger','steps','outcome'}),
 'stakeholder_issue': (COMMON | {'name','party','domain','problem','impact','recommendation','severity','status'}, COMMON | {'name','party','domain','problem','impact','recommendation','severity','status'}),
 'business_financials': (COMMON | {'period_start','period_end','currency','revenue','cogs','opex','average_receivables','credit_sales','average_inventory','average_payables','credit_purchases','marketing_cost','new_customers','leads','won_leads','calls','missed_calls','cash'}, COMMON | {'period_start','period_end','currency'}),
 'improvement': (COMMON | {'name','benefit_type','amount','frequency','implementation_cost','recurring_cost','overlap_group','assumptions','action','target_date'}, COMMON | {'name','benefit_type','amount','frequency','implementation_cost','recurring_cost','overlap_group','assumptions','action','target_date'}),
 'receivable': (COMMON | {'customer_ref','invoice_ref','currency','outstanding','due_date','disputed','collection_hold','last_verified'}, COMMON | {'customer_ref','invoice_ref','currency','outstanding','due_date','disputed','collection_hold','last_verified'}),
}
NUMBERS={'annual_salary','annual_benefits','cycle_minutes','waiting_minutes','revenue','cogs','opex','average_receivables','credit_sales','average_inventory','average_payables','credit_purchases','marketing_cost','new_customers','leads','won_leads','calls','missed_calls','cash','amount','implementation_cost','recurring_cost','outstanding'}
ENUMS={'employment_type':{'employee','contractor','adviser'},'domain':set(DOMAINS),'source_kind':{'interview','document','inspection','system'},'evidence_status':{'reported','verified','disputed','unknown'},'party':{'customer','supplier','staff','management','investor','adviser','regulator'},'severity':{'low','medium','high','critical'},'status':{'open','mitigating','closed'},'benefit_type':{'cost_saving','incremental_contribution','cash_recovery','working_capital','capacity_hours'},'frequency':{'monthly','one_off'}}

def validate(kind, data):
    fields(data,*SCHEMAS[kind])
    for k,v in data.items():
        if k in {'disputed','collection_hold'}:
            if type(v) is not bool: raise APIError(422,f'{k} must be boolean')
        elif k in ENUMS:
            if not isinstance(v,str) or v not in ENUMS[k]: raise APIError(422,f'Invalid {k}')
        elif k in NUMBERS:
            n=number(v,k, '-1000000000000' if k=='cash' else '0')
            if n!=n.quantize(Decimal('.01')): raise APIError(422,f'{k} needs at most two decimals')
            if k in {'new_customers','leads','won_leads','calls','missed_calls'} and n!=n.to_integral_value(): raise APIError(422,f'{k} must be a whole-number count')
        elif k in {'period_start','period_end','due_date','target_date','last_verified'}: iso_date(v,k)
        elif k=='currency': currency(v)
        elif k=='id' or k.endswith('_id'): identifier(v,k)
        elif k=='steps':
            if not isinstance(v,list) or not 1<=len(v)<=100: raise APIError(422,'Supply 1–100 process steps')
            for step in v: text(step,'step',2000)
        else: text(v,k,6000)
    if kind=='business_financials':
        if data['period_end']<data['period_start']: raise APIError(422,'Period ends before it starts')
        for numerator,denominator in [('credit_sales','revenue'),('won_leads','leads'),('missed_calls','calls')]:
            if numerator in data and denominator in data and number(data[numerator],numerator)>number(data[denominator],denominator): raise APIError(422,f'{numerator} exceeds {denominator}')
    if kind=='business_process' and 'waiting_minutes' in data and 'cycle_minutes' in data and number(data['waiting_minutes'],'waiting')>number(data['cycle_minutes'],'cycle'): raise APIError(422,'Waiting time exceeds cycle time')
    if kind=='improvement' and data['benefit_type'] in {'cash_recovery','working_capital'} and data['frequency']!='one_off': raise APIError(422,'Cash recovery and working-capital release use one-off amounts')
    return dict(data)

def validate_links(kind, data, objects, base):
    if not any(o['kind']=='company' and o['id']==data['company_id'] for o in objects): raise APIError(422,'Company must exist in this project')
    if data.get('currency',base)!=base: raise APIError(422,'Business metrics require the project currency; convert and document the basis before entry')
    for key,linked in [('department_id','department'),('person_id','person'),('reports_to','person')]:
        if key in data and not any(o['kind']==linked and o['id']==data[key] and o['data'].get('company_id')==data['company_id'] for o in objects): raise APIError(422,f'{key} must belong to this business')
    if kind=='person' and data.get('reports_to')==data['id']: raise APIError(422,'A person cannot report to themselves')
    if kind=='person':
        parents={o['id']:o['data'].get('reports_to') for o in objects if o['kind']=='person' and o['data']['company_id']==data['company_id']}
        parents[data['id']]=data.get('reports_to');seen=set();current=data['id']
        while current:
            if current in seen: raise APIError(422,'Reporting lines cannot contain a cycle')
            seen.add(current);current=parents.get(current)
    for o in objects:
        if kind in {'department','person','person_private'} and o['kind']==kind and o['id']==data['id'] and o['data']['company_id']!=data['company_id']: raise APIError(409,'Create a new record to move between businesses; existing hierarchy links must remain valid')
        if o['kind']!=kind or o['id']==data['id']: continue
        r=o['data']
        if kind=='receivable' and (r['company_id'],r['customer_ref'],r['invoice_ref'])==(data['company_id'],data['customer_ref'],data['invoice_ref']): raise APIError(409,'Invoice already exists; update the existing record')
        if kind=='business_financials' and (r['company_id'],r['period_start'],r['period_end'])==(data['company_id'],data['period_start'],data['period_end']): raise APIError(409,'A baseline exists for that company and period; update it')

def metrics(r):
    def n(k): return Decimal(r[k]) if k in r else None
    def ratio(a,b,m=100): return money(a/b*Decimal(m)) if a is not None and b is not None and b>0 else None
    revenue,cogs,opex=(n(k) for k in ['revenue','cogs','opex'])
    gross=revenue-cogs if revenue is not None and cogs is not None else None
    operating=gross-opex if gross is not None and opex is not None else None
    days=(date.fromisoformat(r['period_end'])-date.fromisoformat(r['period_start'])).days+1
    dso=ratio(n('average_receivables'),n('credit_sales'),days)
    dio=ratio(n('average_inventory'),cogs,days)
    dpo=ratio(n('average_payables'),n('credit_purchases'),days)
    return {'id':r['id'],'company_id':r['company_id'],'period_start':r['period_start'],'period_end':r['period_end'],'currency':r['currency'],'gross_profit':money(gross) if gross is not None else None,'operating_profit':money(operating) if operating is not None else None,'gross_margin_percent':ratio(gross,revenue),'operating_margin_percent':ratio(operating,revenue),'dso_days':dso,'inventory_days':dio,'dpo_days':dpo,'cash_conversion_days':money(Decimal(dso)+Decimal(dio)-Decimal(dpo)) if all(v is not None for v in (dso,dio,dpo)) else None,'cac':ratio(n('marketing_cost'),n('new_customers'),1),'lead_conversion_percent':ratio(n('won_leads'),n('leads')),'missed_call_percent':ratio(n('missed_calls'),n('calls')),'evidence_ref':r['evidence_ref'],'basis':'Management figures for the stated period. Missing inputs or non-positive denominators are unavailable. DSO/DIO/DPO use average balances and matching period flows. CAC uses only the supplied acquisition cost. No causation or assurance is implied.'}

def report(objects, base, as_of, company_id=None):
    iso_date(as_of,'as_of')
    companies=[o['data'] for o in objects if o['kind']=='company' and (not company_id or o['id']==company_id)]
    if company_id and not companies: raise APIError(404,'Company not found')
    ids={c['id'] for c in companies}
    rows=lambda kind:[o['data'] for o in objects if o['kind']==kind and o['data'].get('company_id') in ids]
    answers=rows('discovery_answer')
    coverage=[]; actions=[]
    for c in companies:
        for domain in DOMAINS:
            found=[a for a in answers if a['company_id']==c['id'] and a['domain']==domain]
            status='verified' if found and all(a['evidence_status']=='verified' for a in found) else 'disputed' if any(a['evidence_status']=='disputed' for a in found) else 'unknown' if found and all(a['evidence_status']=='unknown' for a in found) else 'reported' if found else 'unassessed'
            coverage.append({'company_id':c['id'],'company':c['name'],'domain':domain,'status':status,'question':QUESTIONS[domain],'source_ids':[a['id'] for a in found]})
            if status!='verified': actions.append({'id':f'discover-{c["id"]}-{domain}','title':f'Confirm {domain} for {c["name"]}','owner':c['owner'],'phase':'Discover','due_date':(date.fromisoformat(as_of)+timedelta(days=7)).isoformat(),'acceptance':QUESTIONS[domain]+' Record and review supporting evidence.','source_ids':[a['id'] for a in found] or [c['id']],'status':'proposed'})
    for issue in rows('stakeholder_issue'):
        if issue['status']!='closed': actions.append({'id':'issue-'+issue['id'],'title':issue['recommendation'],'owner':issue['owner'],'phase':'Improve','due_date':(date.fromisoformat(as_of)+timedelta(days=30)).isoformat(),'acceptance':'Validate the suspected cause, agree an outcome measure and compare results with the baseline.','source_ids':[issue['id']],'status':'proposed'})
    improvements=rows('improvement'); groups={}; estimates=[]
    for r in improvements:
        group=(r['company_id'],r['overlap_group'])
        groups.setdefault(group,[]).append(r['id'])
    for r in improvements:
        recurring=r['frequency']=='monthly'; economic=r['benefit_type'] in {'cost_saving','incremental_contribution'}
        annual=Decimal(r['amount'])*12 if recurring else None
        first=annual-Decimal(r['recurring_cost'])*12-Decimal(r['implementation_cost']) if recurring and economic else None
        estimates.append({**r,'annual_gross':money(annual) if annual is not None else None,'first_year_net':money(first) if first is not None else None,'overlap':len(groups[(r['company_id'],r['overlap_group'])])>1,'status':'estimate_not_realised'})
        actions.append({'id':'improve-'+r['id'],'title':r['action'],'owner':r['owner'],'phase':'Implement','due_date':r['target_date'],'acceptance':r['assumptions']+' Validate benefits separately from forecast values.','source_ids':[r['id']],'status':'proposed'})
    receivables=rows('receivable'); overdue=[r for r in receivables if r['due_date']<as_of and Decimal(r['outstanding'])>0]
    eligible=[r for r in overdue if not r['disputed'] and not r['collection_hold'] and r['last_verified']==as_of]
    return {'as_of':as_of,'currency':base,'companies':companies,'coverage':coverage,'coverage_summary':{s:sum(c['status']==s for c in coverage) for s in ['verified','reported','disputed','unknown','unassessed']},'departments':rows('department'),'people':rows('person'),'stakeholders':rows('stakeholder'),'metrics':[metrics(r) for r in rows('business_financials')],'processes':rows('business_process'),'issues':rows('stakeholder_issue'),'opportunities':estimates,'overlap_groups':[{'company_id':k[0],'group':k[1],'ids':v} for k,v in groups.items() if len(v)>1],'collections':{'overdue_total':money(sum((Decimal(r['outstanding']) for r in overdue),Decimal(0))),'overdue_count':len(overdue),'eligible_draft_count':len(eligible),'eligible_invoice_ids':[r['id'] for r in eligible],'basis':'Draft candidates only. Balance must be checked today; disputed, held, not-due and zero balances are excluded. No customer is contacted.'},'actions':actions,'generation':'deterministic_rules','status':'draft_for_review','benefit_basis':'Amounts retain their benefit category. No grand total mixes cash recovery, profit, working capital and hours; overlapping opportunities are flagged. All opportunity figures are estimates.'}
