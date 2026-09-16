"""A fictional local example. No model calls, live accounts or external actions."""
from pathlib import Path
import json
import tempfile
from transformation.engine import Engine, Actor
from knowledge_core.service import KnowledgeService
from knowledge_core.store import Store
from planning_example import seed_planning

def seed(engine):
    owner = Actor("demo-tenant", "demo-owner", "owner")
    p = engine.create_project(owner, {"name": "Northstar acquisition · fictional", "currency": "GBP"})["id"]
    engine.add_member(owner,p,{"user_id":"demo-reviewer","role":"reviewer"})
    engine.initialise_workstreams(owner,p,{})
    def save(kind,record):
        engine.upsert(owner,p,{"kind":kind,"record":record,"expected_revision":0})
    save("engagement",{"id":"engagement-1","name":"Northstar separation","client":"Northstar Group (fictional)","adviser":"Adviser team (fictional)","delivery_lead":"Programme director","branding":"co_branded","display_brand":"Northstar Transformation","deal_type":"carve_out","scope":"Identity, payroll and ERP separation; product adoption","start_date":"2026-09-15","target_date":"2026-11-30"})
    for id,name,owner_name in [("identity","Identity platform","Workplace lead"),("erp","Finance ERP","Finance lead"),("payroll","Payroll service","People operations"),("portal","Employee portal","Product lead")]:
        save("system",{"id":id,"name":name,"owner":owner_name,"criticality":"high","status":"active","evidence_ref":"urn:fictional:architecture","reviewed":True})
    for id,src,tgt in [("dep-1","erp","identity"),("dep-2","payroll","erp"),("dep-3","portal","identity")]:
        save("dependency",{"id":id,"source":src,"target":tgt,"evidence_ref":"urn:fictional:architecture","reviewed":True})
    save("risk",{"id":"risk-1","title":"Payroll cutover rehearsal is incomplete","owner":"People operations","severity":"high","status":"mitigating","mitigation":"Complete a parallel payroll reconciliation","evidence_ref":"urn:fictional:review"})
    save("task",{"id":"task-1","title":"Reconcile parallel payroll results","owner":"People operations","due_date":"2026-10-15","status":"doing","critical":True})
    save("task",{"id":"task-2","title":"Confirm identity inventory","owner":"Workplace lead","status":"done","critical":True,"evidence_ref":"urn:fictional:identity-review"})
    save("control",{"id":"control-1","title":"Privileged access review","owner":"Security lead","status":"passed","evidence_ref":"urn:fictional:access-review"})
    save("tsa",{"id":"tsa-identity","name":"Seller identity support","supplier":"Seller IT (fictional)","owner":"Workplace lead","exit_date":"2026-11-30","monthly_cost":"18000","currency":"GBP","status":"active","exit_conditions":"Independent login, tested recovery, signed service acceptance","evidence_ref":"urn:fictional:tsa"})
    entries=[]
    for id,kind,category,amount in [("b1","budget","migration","240000"),("a1","actual","migration","42000"),("a2","actual","tsa","18000"),("f1","forecast","migration","115000"),("f2","forecast","tsa","36000"),("base1","baseline","opex","25000"),("actual1","actual","opex","16000")]:
        entries.append({"id":id,"kind":kind,"category":category,"amount":amount,"currency":"GBP","period":"2026-09-01","source_ref":f"urn:fictional:finance:{id}"})
    engine.import_finance(owner,p,{"entries":entries})
    save("research",{"id":"research-1","title":"Managers need a single readiness view","method":"interview","segment":"Department managers","finding":"Managers struggle to find the current owner and evidence for a blocker.","jtbd":"When preparing for cutover, I want a clear view of blockers so I can assign the next action.","source_ref":"urn:fictional:interviews","observed_on":"2026-09-15","reviewed":True})
    for id,title,reach,impact,confidence,effort,moscow in [("opp-1","Guided employee onboarding","800","2","80","3","must"),("opp-2","Unified readiness dashboard","200","3","90","2","should"),("opp-3","Self-service knowledge search","600","1","50","2","could")]:
        save("opportunity",{"id":id,"title":title,"owner":"Product lead","reach":reach,"reach_period":"2026-Q4","reach_population":"employees","impact":impact,"confidence_percent":confidence,"effort_person_months":effort,"moscow":moscow,"jtbd":"When changing systems, I want clear guidance so I can keep working.","evidence_ref":"urn:fictional:interviews","status":"planned","target_release":"release-1"})
    save("spec",{"id":"prd-1","title":"Transition readiness workspace","type":"prd","owner":"Product lead","problem":"Managers cannot find the latest blockers","requirements":"Display owners, evidence and pending decisions","acceptance_criteria":"Every blocker links to a responsible owner and source","success_metrics":"Reduce time to assign unresolved blockers","research_ids":["research-1"],"status":"draft"})
    save("sprint",{"id":"sprint-1","title":"Readiness workspace sprint","owner":"Product lead","goal":"Make blockers and owners visible","start_date":"2026-09-15","end_date":"2026-09-28","capacity_points":20,"status":"active"})
    save("story",{"id":"story-1","title":"View blockers by service owner","owner":"Product lead","opportunity_id":"opp-2","sprint":"sprint-1","status":"done","acceptance_criteria":"Show only authorised project blockers, each with an owner","estimate_points":8})
    save("uat",{"id":"uat-1","title":"Department manager acceptance","story_id":"story-1","tester":"Business reviewer","status":"pending","blocking":True})
    save("release",{"id":"release-1","title":"Readiness workspace release","owner":"Product lead","target_date":"2026-10-01","story_ids":["story-1"],"status":"testing","changelog_ref":"urn:fictional:changes","rollback_ref":"urn:fictional:rollback","gtm_ref":"urn:fictional:launch"})
    save("adoption",{"id":"cohort-1","cohort":"Pilot employees · September","period_start":"2026-09-01","period_end":"2026-09-15","eligible_users":200,"activated_users":142,"retained_users":98,"feature_users":121,"source_ref":"urn:fictional:analytics"})
    engine.evidence(owner,p,"ingest",{"id":"architecture","title":"Fictional separation architecture","source_uri":"urn:fictional:architecture","text":"Payroll depends on ERP. ERP depends on Identity. The employee Portal depends on Identity. Seller identity support costs GBP 18,000 per month and is planned to end on 30 November 2026. Payroll still requires a parallel reconciliation before cutover.","expected_revision":0})
    for id,source,target,quote in [("e1","Payroll","ERP","Payroll depends on ERP."),("e2","ERP","Identity","ERP depends on Identity.")]:
        engine.evidence(owner,p,"add_edge",{"id":id,"source":source,"relation":"DEPENDS_ON","target":target,"document_id":"architecture","document_revision":1,"quote":quote})
    engine.evidence(owner,p,"ingest",{"id":"research","title":"Fictional product research","source_uri":"urn:fictional:interviews","text":"Department managers need one readiness view showing current blockers, responsible owners and supporting evidence. The product goal is to reduce the time to assign blockers. A user story is: as a manager I want to see blockers by service owner so that I can coordinate remediation. Acceptance requires project-only access and an owner on each blocker.","expected_revision":0})
    seed_planning(engine, owner, p)
    engine.plan_generate(owner, p, {"scope_id": "northstar-plan", "as_of": "2026-09-16"})
    engine.propose(owner,p,{"kind":"readiness_report","payload":{"as_of":"2026-09-15"}})
    engine.propose(owner,p,{"kind":"cutover_plan","payload":{"as_of":"2026-09-15"}})
    return owner,p

if __name__=="__main__":
    with tempfile.TemporaryDirectory() as directory:
        engine=Engine(Path(directory)/"transformation.db",KnowledgeService(Store(str(Path(directory)/"knowledge.db"))))
        owner,p=seed(engine)
        result=engine.snapshot(owner,p,"2026-09-15")
        result["fictional_example"]=True
        result["example_company_plan"]=engine.plan_get(owner, p, {"id": result["plans"][0]["id"]})
        result["example_query"]=engine.evidence(owner,p,"query",{"question":"What does Payroll depend on?","mode":"hybrid","seeds":["Payroll"]})
        print(json.dumps(result,indent=2))
