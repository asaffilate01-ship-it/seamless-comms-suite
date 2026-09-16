"""Product discovery, prioritisation, release gates and adoption calculations."""
from datetime import date
from decimal import Decimal
from .finance import number, money
from knowledge_core.types import APIError, fields, identifier, integer, iso_date, text

SCHEMAS = {
    "spec": ({"id","title","type","owner","problem","requirements","acceptance_criteria","success_metrics","research_ids","status","evidence_ref"}, {"id","title","type","owner","problem","requirements","acceptance_criteria","success_metrics","research_ids","status"}),
    "sprint": ({"id","title","owner","goal","start_date","end_date","capacity_points","status"}, {"id","title","owner","goal","start_date","end_date","capacity_points","status"}),
    "research": ({"id","title","method","segment","finding","jtbd","source_ref","observed_on","reviewed"}, {"id","title","method","segment","finding","jtbd","source_ref","observed_on","reviewed"}),
    "opportunity": ({"id","title","owner","reach","reach_period","reach_population","impact","confidence_percent","effort_person_months","moscow","jtbd","evidence_ref","status","target_release"}, {"id","title","owner","reach","reach_period","reach_population","impact","confidence_percent","effort_person_months","moscow","jtbd","evidence_ref","status"}),
    "story": ({"id","title","owner","opportunity_id","sprint","status","acceptance_criteria","evidence_ref","estimate_points"}, {"id","title","owner","opportunity_id","status","acceptance_criteria"}),
    "uat": ({"id","title","story_id","tester","status","tested_on","evidence_ref","blocking"}, {"id","title","story_id","tester","status","blocking"}),
    "release": ({"id","title","owner","target_date","story_ids","changelog_ref","rollback_ref","gtm_ref","status"}, {"id","title","owner","target_date","story_ids","status"}),
    "gtm": ({"id","title","owner","audience","positioning","channels","success_metric","launch_date","status","evidence_ref"}, {"id","title","owner","audience","positioning","channels","success_metric","status"}),
    "competitor": ({"id","name","proposition","strengths","gaps","source_ref","checked_on"}, {"id","name","proposition","strengths","gaps","source_ref","checked_on"}),
    "adoption": ({"id","cohort","period_start","period_end","eligible_users","activated_users","retained_users","feature_users","source_ref"}, {"id","cohort","period_start","period_end","eligible_users","activated_users","retained_users","feature_users","source_ref"}),
}

def validate(kind, data):
    fields(data,*SCHEMAS[kind])
    identifier(data["id"],"id")
    for key,value in data.items():
        if isinstance(value,str):
            text(value,key,6000)
    for key in ("observed_on","tested_on","target_date","launch_date","checked_on","period_start","period_end","start_date","end_date"):
        if key in data:
            iso_date(data[key],key)
    for key in ("blocking","reviewed"):
        if key in data and type(data[key]) is not bool:
            raise APIError(422,f"{key} must be boolean")
    if kind=="research" and data["method"] not in {"interview","survey","observation","support","analytics","desk_research"}:
        raise APIError(422,"Invalid research method")
    if kind=="opportunity":
        number(data["reach"],"reach","0","1000000000")
        number(data["impact"],"impact","0","3")
        number(data["confidence_percent"],"confidence_percent","0","100")
        number(data["effort_person_months"],"effort_person_months","0.01","100000")
        if data["moscow"] not in {"must","should","could","wont_now"}:
            raise APIError(422,"Invalid MoSCoW category")
    statuses={"spec":{"draft","review","approved"},"sprint":{"planned","active","closed"},"opportunity":{"discovery","planned","building","measuring","done"},
              "story":{"backlog","ready","in_progress","review","done"},"uat":{"pending","passed","failed","blocked"},
              "release":{"planned","testing","review","released"},"gtm":{"draft","review","approved","launched"}}
    if kind in statuses and data["status"] not in statuses[kind]:
        raise APIError(422,"Invalid product status")
    if kind=="story" and "estimate_points" in data:
        integer(data["estimate_points"],"estimate_points",0,1000)
    if kind=="spec":
        if data["type"] not in {"prd","technical","design"} or not isinstance(data["research_ids"],list) or len(data["research_ids"])>100:
            raise APIError(422,"Invalid specification type or research references")
        for rid in data["research_ids"]:
            identifier(rid,"research_id")
        if data["status"]=="approved" and not data.get("evidence_ref"):
            raise APIError(422,"Approved specifications require review evidence")
    if kind=="sprint":
        integer(data["capacity_points"],"capacity_points",0,10000)
        if data["end_date"]<data["start_date"]:
            raise APIError(422,"Sprint end precedes start")
    if kind=="release":
        if not isinstance(data["story_ids"],list) or not 1<=len(data["story_ids"])<=500:
            raise APIError(422,"Release needs 1–500 story IDs")
        for sid in data["story_ids"]:
            identifier(sid,"story_id")
        if len(set(data["story_ids"]))!=len(data["story_ids"]):
            raise APIError(422,"Duplicate release story")
    if kind=="uat" and data["status"]=="passed" and (not data.get("tested_on") or not data.get("evidence_ref")):
        raise APIError(422,"Passed UAT needs dated evidence")
    if kind=="adoption":
        if data["period_end"]<data["period_start"]:
            raise APIError(422,"Invalid adoption period")
        for k in ("eligible_users","activated_users","retained_users","feature_users"):
            integer(data[k],k,0,1000000000)
        if not 0<=data["retained_users"]<=data["activated_users"]<=data["eligible_users"] or data["feature_users"]>data["eligible_users"]:
            raise APIError(422,"Counts must refer to the same eligible cohort")
    return data

def prioritise(opportunities):
    groups={}
    for o in opportunities:
        score=Decimal(o["reach"])*Decimal(o["impact"])*(Decimal(o["confidence_percent"])/100)/Decimal(o["effort_person_months"])
        groups.setdefault(o["reach_period"] + " | " + o["reach_population"],[]).append({**o,"rice_score":money(score),"_score":score})
    for period,rows in groups.items():
        rows.sort(key=lambda r:(-r["_score"],r["id"]))
        for i,r in enumerate(rows):
            r.pop("_score")
            r["rank"]=i+1
    return {"groups":groups,"formula":"reach × impact × (confidence percent / 100) ÷ effort in person-months",
            "notes":["Only compare reach for the same population and time period.","Confidence is an input judgement, not a model probability.","MoSCoW remains a separate commitment decision; RICE does not override must-have obligations."]}

def release_readiness(release, objects):
    stories={o["data"]["id"]:o["data"] for o in objects if o["kind"]=="story"}
    uat=[o["data"] for o in objects if o["kind"]=="uat"]
    blockers=[]
    for sid in release["story_ids"]:
        story=stories.get(sid)
        if not story or story["status"]!="done":
            blockers.append({"id":sid,"reason":"Story missing or unfinished"})
        tests=[t for t in uat if t["story_id"]==sid]
        if not any(t["status"]=="passed" for t in tests):
            blockers.append({"id":sid,"reason":"No passed UAT evidence"})
        for t in tests:
            if t["blocking"] and t["status"]!="passed":
                blockers.append({"id":t["id"],"reason":"Blocking UAT is unresolved"})
    for key in ("changelog_ref","rollback_ref","gtm_ref"):
        if not release.get(key):
            blockers.append({"id":key,"reason":"Release evidence missing"})
    return {"release_id":release["id"],"status":"ready_for_owner_review" if not blockers else "blocked",
            "blockers":blockers,"publishes_software":False}

def product_report(objects,as_of):
    rows=lambda kind:[o["data"] for o in objects if o["kind"]==kind]
    adoption=[]
    for a in rows("adoption"):
        rate=lambda n,d:money(Decimal(n)/d*100) if d else None
        adoption.append({**a,"activation_percent":rate(a["activated_users"],a["eligible_users"]),
                         "retention_percent_of_activated":rate(a["retained_users"],a["activated_users"]),
                         "feature_adoption_percent":rate(a["feature_users"],a["eligible_users"])})
    competitors=[{**c,"age_days":(date.fromisoformat(as_of)-date.fromisoformat(c["checked_on"])).days} for c in rows("competitor")]
    sprints=[]
    for s in rows("sprint"):
        stories=[r for r in rows("story") if r.get("sprint")==s["id"]]
        planned=sum(r.get("estimate_points",0) for r in stories)
        done=sum(r.get("estimate_points",0) for r in stories if r["status"]=="done")
        sprints.append({**s,"planned_points":planned,"completed_points":done,"over_capacity":planned>s["capacity_points"],
                        "unestimated_story_ids":[r["id"] for r in stories if "estimate_points" not in r]})
    return {"priorities":prioritise(rows("opportunity")),"releases":[release_readiness(r,objects) for r in rows("release")],
            "adoption":adoption,"competitors":competitors,"sprints":sprints,"research_count":len(rows("research")),
            "story_count":len(rows("story")),"analytics_basis":"Imported aggregate counts for explicitly defined cohorts; no live analytics connector is configured."}
