"""Six delivery domains, reconciliation and evidence-based acceptance gates."""
from decimal import Decimal
import re
from .finance import number, money, currency
from knowledge_core.types import APIError, fields, text, identifier, integer, iso_date

CATALOG = {
 "enterprise": {"name":"Enterprise systems and processes", "platforms":"Oracle, SAP, Workday", "checks":[
   ("discovery","Inventory legal entities, ledgers, modules, integrations and licensing"),
   ("build","Approve separation rules for master data, transactions and history"),
   ("rehearsal","Reconcile trial balance, AP/AR, payroll and open transactions"),
   ("rehearsal","Rehearse period close and obtain finance-owner acceptance"),
   ("cutover","Approve freeze window, backup, delta loads and rollback criteria"),
   ("handover","Complete post-cutover reconciliation and operational handover")]},
 "identity": {"name":"Identity, endpoint and workplace", "platforms":"Active Directory, Entra ID, Microsoft 365, endpoint management", "checks":[
   ("discovery","Map identities, groups, privileged roles, devices and application trust"),
   ("build","Approve target tenant, identity matching, MFA and access policies"),
   ("rehearsal","Test mailboxes, files, sharing, devices and application sign-in"),
   ("rehearsal","Validate user mapping and revoked or orphaned access"),
   ("cutover","Approve domain, mail routing and migration-wave procedures"),
   ("handover","Verify endpoint coverage, support handover and rollback evidence")]},
 "cloud": {"name":"Cloud, infrastructure and networks", "platforms":"AWS, Azure, GCP, OCI, data centres", "checks":[
   ("discovery","Map workloads, network routes, DNS, certificates and dependencies"),
   ("build","Review landing zones, regional placement, network boundaries and quotas"),
   ("build","Review infrastructure changes and security policies"),
   ("rehearsal","Test restore, failover, capacity and agreed recovery objectives"),
   ("cutover","Approve workload waves, routing changes and rollback conditions"),
   ("handover","Verify monitoring, cost ownership and decommissioning acceptance")]},
 "security": {"name":"Security and GCC control assurance", "platforms":"ISO 27001, SOC 2, NCA, SAMA and applicable UAE requirements", "checks":[
   ("discovery","Confirm applicable frameworks, editions, scope and responsible assessors"),
   ("build","Map controls to systems, owners, evidence and exceptions"),
   ("build","Establish access, logging, vulnerability and incident-response baselines"),
   ("rehearsal","Test control operation and resolve blocking findings"),
   ("cutover","Review outstanding risk acceptances and evidence freshness"),
   ("handover","Assemble audit evidence and record independent assessor findings")]},
 "integration": {"name":"Software development and integration", "platforms":"Microservices, APIs, events, middleware and CI/CD", "checks":[
   ("discovery","Inventory APIs, events, batch jobs, consumers and interface owners"),
   ("build","Approve contracts, schema mappings, versioning and separation boundaries"),
   ("build","Implement reviewed adapters and deployment procedures"),
   ("rehearsal","Pass contract, regression, authentication and recovery tests"),
   ("cutover","Approve routing switch, retry, replay and rollback procedures"),
   ("handover","Verify observability, support ownership and legacy retirement")]},
 "data": {"name":"Data, BI and governance", "platforms":"Fabric, Databricks, Power BI and finance reporting", "checks":[
   ("discovery","Map data assets, lineage, stewards, reports and business definitions"),
   ("build","Approve target pipelines, access rules and data-quality thresholds"),
   ("rehearsal","Reconcile source-to-target datasets and critical report totals"),
   ("rehearsal","Verify KPI definitions and finance benefit attribution"),
   ("cutover","Approve report-switch procedures and finance reporting acceptance"),
   ("handover","Record lineage, retention, operational ownership and benefits evidence")]},
}

SCHEMAS={
 "workstream":({"id","name","owner","scope","platforms"},{"id","name","owner","scope","platforms"}),
 "checkpoint":({"id","workstream_id","title","phase","owner","status","blocking","evidence_ref","exception_reason"},{"id","workstream_id","title","phase","owner","status","blocking"}),
 "migration_wave":({"id","name","workstream_id","owner","system_ids","scheduled_date","freeze_ref","rollback_ref","status","evidence_ref"},{"id","name","workstream_id","owner","system_ids","scheduled_date","status"}),
 "security_mapping":({"id","framework","edition","control_ref","scope","owner","applicability","status","evidence_ref","reviewed_on","exception_reason"},{"id","framework","edition","control_ref","scope","owner","applicability","status"}),
 "interface":({"id","name","owner","producer","consumer","contract_ref","auth_scope","status","test_evidence_ref","rollback_ref"},{"id","name","owner","producer","consumer","contract_ref","auth_scope","status"}),
 "data_asset":({"id","name","owner","source_system","target_system","classification","lineage_ref","quality_rule","status","evidence_ref"},{"id","name","owner","source_system","target_system","classification","lineage_ref","quality_rule","status"}),
 "reconciliation":({"id","title","workstream_id","owner","period","source_manifest_sha256","target_manifest_sha256","source_ref","target_ref","lines","tolerance_amount"},{"id","title","workstream_id","owner","period","source_manifest_sha256","target_manifest_sha256","source_ref","target_ref","lines","tolerance_amount"}),
}

def reconciliation(data):
    tolerance=number(data["tolerance_amount"],"tolerance_amount","0","1000000")
    if not isinstance(data["lines"],list) or not 1<=len(data["lines"])<=5000:
        raise APIError(422,"Reconciliation needs 1–5000 account or dataset lines")
    result=[];seen=set()
    for row in data["lines"]:
        fields(row,{"key","currency","source_amount","target_amount","source_count","target_count"},{"key","currency","source_amount","target_amount","source_count","target_count"})
        key=text(row["key"],"key",200);ccy=currency(row["currency"])
        if (key,ccy) in seen:
            raise APIError(422,"Duplicate reconciliation key and currency")
        seen.add((key,ccy))
        source=number(row["source_amount"],"source_amount","-1000000000000")
        target=number(row["target_amount"],"target_amount","-1000000000000")
        source_count=integer(row["source_count"],"source_count",0,1000000000)
        target_count=integer(row["target_count"],"target_count",0,1000000000)
        delta=target-source
        result.append({"key":key,"currency":ccy,"amount_delta":money(delta),"count_delta":target_count-source_count,
                       "passed":abs(delta)<=tolerance and source_count==target_count})
    return {"id":data["id"],"status":"matched" if all(r["passed"] for r in result) else "exceptions",
            "lines":result,"exception_count":sum(not r["passed"] for r in result),
            "limitation":"Matching supplied lines does not prove extract completeness, period-close success or source authenticity. Manifests and accountant review remain required."}

def validate(kind,data):
    fields(data,*SCHEMAS[kind])
    identifier(data["id"],"id")
    for key,value in data.items():
        if isinstance(value,str):text(value,key,6000)
    if kind=="workstream" and data["id"] not in CATALOG:
        raise APIError(422,"Choose a supported workstream ID")
    if "workstream_id" in data and data["workstream_id"] not in CATALOG:
        raise APIError(422,"Invalid workstream")
    for key in ("period","reviewed_on","scheduled_date"):
        if key in data:iso_date(data[key],key)
    if kind=="checkpoint":
        if data["status"] not in {"pending","passed","failed","not_applicable"} or data["phase"] not in {"discovery","build","rehearsal","cutover","handover"} or type(data["blocking"]) is not bool:
            raise APIError(422,"Invalid checkpoint status, phase or blocking flag")
        if data["status"] in {"passed","not_applicable"} and not data.get("evidence_ref"):
            raise APIError(422,"Checkpoint acceptance requires evidence")
        if data["status"]=="not_applicable" and not data.get("exception_reason"):
            raise APIError(422,"An applicability exception needs a reason")
    if kind=="migration_wave":
        if data["status"] not in {"planned","rehearsing","ready","completed","rolled_back"} or not isinstance(data["system_ids"],list) or not data["system_ids"]:
            raise APIError(422,"Invalid migration wave")
        for id in data["system_ids"]:identifier(id,"system_id")
        if data["status"] in {"ready","completed"} and not all(data.get(k) for k in ("freeze_ref","rollback_ref","evidence_ref")):
            raise APIError(422,"Wave readiness needs freeze, rollback and test evidence")
    if kind=="security_mapping":
        if data["applicability"] not in {"applicable","not_applicable","under_review"} or data["status"] not in {"gap","in_progress","evidenced","assessed"}:
            raise APIError(422,"Invalid control assessment")
        if data["status"] in {"evidenced","assessed"} and not all(data.get(k) for k in ("evidence_ref","reviewed_on")):
            raise APIError(422,"Control assessment needs dated evidence")
        if data["applicability"]=="not_applicable" and not data.get("exception_reason"):
            raise APIError(422,"Applicability exception needs a documented reason")
    if kind in {"interface","data_asset"} and data["status"] not in {"planned","building","tested","accepted","retired"}:
        raise APIError(422,"Invalid delivery status")
    if kind=="reconciliation":
        for key in ("source_manifest_sha256","target_manifest_sha256"):
            if not re.fullmatch(r"[a-fA-F0-9]{64}",data[key]):raise APIError(422,"Manifest hashes must be SHA-256 hex")
        reconciliation(data)
    return data

def report(objects):
    rows=lambda kind:[o["data"] for o in objects if o["kind"]==kind]
    streams={r["id"]:r for r in rows("workstream")}
    checkpoints={r["id"]:r for r in rows("checkpoint")}
    reconciliations=[{**reconciliation(r),"workstream_id":r["workstream_id"],"period":r["period"]} for r in rows("reconciliation")]
    result=[]
    for id,definition in CATALOG.items():
        blockers=[]
        if id not in streams:blockers.append("Workstream has not been scoped and assigned")
        for index,(_,title) in enumerate(definition["checks"],1):
            c=checkpoints.get(f"{id}-{index:02}")
            if not c or c["workstream_id"]!=id or c["status"] not in {"passed","not_applicable"}:
                blockers.append(title)
        for c in rows("checkpoint"):
            if c["workstream_id"]==id and c["blocking"] and c["status"] not in {"passed","not_applicable"} and c["title"] not in blockers:
                blockers.append(c["title"])
        rs=[r for r in reconciliations if r["workstream_id"]==id]
        if id in {"enterprise","data"} and (not rs or any(r["status"]!="matched" for r in rs)):
            blockers.append("Account or dataset reconciliation is missing or has exceptions")
        if id=="security":
            mappings=rows("security_mapping")
            if not mappings or any(m["applicability"]=="under_review" or (m["applicability"]=="applicable" and m["status"]!="assessed") for m in mappings):
                blockers.append("Applicable framework controls require assessment")
        result.append({"id":id,"name":definition["name"],"platforms":definition["platforms"],"owner":streams.get(id,{}).get("owner"),
                       "status":"ready_for_owner_review" if not blockers else "blocked","blockers":blockers,
                       "total_template_checks":len(definition["checks"])})
    benefits=rows("benefit")
    totals={}
    for b in benefits:
        if b["status"]=="finance_reviewed":totals[b["currency"]]=totals.get(b["currency"],Decimal(0))+Decimal(b["difference"])
    return {"streams":result,"reconciliations":reconciliations,"benefits":benefits,"finance_reviewed_benefits":{c:money(v) for c,v in totals.items()},
            "overall_status":"ready_for_owner_review" if all(r["status"]!="blocked" for r in result) else "blocked",
            "assurance":"No automatic audit certification, finance close guarantee or production migration execution."}
