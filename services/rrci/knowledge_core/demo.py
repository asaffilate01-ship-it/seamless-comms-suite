"""Entirely fictional fixtures. No operational or legal advice."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import secrets
import tempfile
from .service import KnowledgeService
from .store import Store
from .types import Principal
from . import __version__


def principal(project="haccora", tenant="demo-company", capabilities=("query", "ingest", "trace"), collections=("manuals",)):
    return Principal(project, tenant, collections, capabilities, "demo")


def document(doc_id, content, title=None, **extra):
    return {"collection": "manuals", "id": doc_id, "title": title or doc_id.replace("-", " "),
            "text": content, "source_uri": "urn:fictional:" + doc_id,
            "jurisdiction": "GB", "valid_from": "2020-01-01", **extra}


def seed(service):
    docs = [
        document("fridge-procedure", "Fictional training procedure: if the fridge fails, notify the duty manager, record the fault and follow the approved escalation procedure. Do not declare affected food safe based on this sample."),
        document("supplier-record", "Northstar Foods supplies Batch B17."),
        document("recipe-record", "Batch B17 is used in Lemon Tart."),
        document("distribution-luton", "Lemon Tart is served at Luton branch."),
        document("distribution-st-albans", "Lemon Tart is served at St Albans branch."),
        document("expired-manual", "The retired fridge procedure says contact Old Team.", valid_until="2022-01-01"),
    ]
    p = principal()
    revisions = {}
    for doc in docs:
        revisions[doc["id"]] = service.ingest(p, doc)["revision"]
    relationships = [
        ("supply", "Northstar Foods", "supplies", "Batch B17", "supplier-record", docs[1]["text"]),
        ("recipe", "Batch B17", "used_in", "Lemon Tart", "recipe-record", docs[2]["text"]),
        ("luton", "Lemon Tart", "served_at", "Luton branch", "distribution-luton", docs[3]["text"]),
        ("st-albans", "Lemon Tart", "served_at", "St Albans branch", "distribution-st-albans", docs[4]["text"]),
    ]
    for edge_id, source, relation, target, doc_id, quote in relationships:
        service.add_edge(p, {"collection": "manuals", "id": edge_id, "source": source, "relation": relation,
                            "target": target, "document_id": doc_id, "document_revision": revisions[doc_id], "quote": quote})
    service.ingest(principal(tenant="other-company"), document("private-record", "CONFIDENTIAL-CANARY other-company purchasing notes. Northstar Foods supplies Secret Depot."))
    service.ingest(principal("taxnuvia"), document("firm-guide", "Fictional Sample Ledger offers bookkeeping and payroll onboarding. Its onboarding guide asks clients for prior payroll reports and a company contact."))
    service.ingest(principal("lawquo"), document("case-intake", "Fictional Case Alpha intake checklist: the reviewing lawyer requests the signed agreement and relevant correspondence. This document makes no statement about legal rights."))


def provision(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    credentials_path = directory / "credentials.json"
    if credentials_path.exists():
        raise ValueError("Credentials already exist; use another directory to avoid overwriting them")
    credentials = []
    for project in ("haccora", "taxnuvia", "lawquo"):
        for role in ("reader", "writer"):
            token = secrets.token_urlsafe(40)
            key_id = f"{project}-demo-{role}"
            token_path = directory / (key_id + ".token")
            with token_path.open("x") as handle:
                handle.write(token)
            token_path.chmod(0o600)
            credentials.append({"key_id": key_id, "token_sha256": hashlib.sha256(token.encode()).hexdigest(),
                                "project": project, "tenant": "demo-company", "collections": ["manuals"],
                                "capabilities": ["query", "trace"] if role == "reader" else ["ingest"]})
    with credentials_path.open("x") as handle:
        json.dump(credentials, handle, indent=2)
    credentials_path.chmod(0o600)
    return credentials_path


def demo_report(service=None):
    if service is None:
        with tempfile.TemporaryDirectory() as directory:
            service = KnowledgeService(Store(Path(directory) / "knowledge.db"))
            seed(service)
            return demo_report(service)
    checks, outputs = [], {}
    p = principal()
    base = {"collection": "manuals", "as_of": "2026-09-15"}
    question = "Which locations are connected to Northstar Foods?"
    for mode in ("rag", "graph", "hybrid"):
        outputs[mode] = service.query(p, {**base, "question": question, "mode": mode})
    graph_docs = {e["document_id"] for e in outputs["graph"]["evidence"]}
    rag_docs = {e["document_id"] for e in outputs["rag"]["evidence"]}
    checks.append({"name": "Graph retrieves both downstream branch records", "passed": {"distribution-luton", "distribution-st-albans"} <= graph_docs})
    checks.append({"name": "Graph adds evidence absent from lexical baseline", "passed": bool(graph_docs - rag_docs)})
    outputs["fridge"] = service.query(p, {**base, "question": "What if the fridge fails?"})
    checks.append({"name": "Procedure retrieval", "passed": "fridge-procedure" in {e["document_id"] for e in outputs["fridge"]["evidence"]}})
    checks.append({"name": "Expired source excluded", "passed": "expired-manual" not in {e["document_id"] for e in outputs["fridge"]["evidence"]}})
    outputs["unknown"] = service.query(p, {**base, "question": "quantum astronomy"})
    checks.append({"name": "Unknown topic returns no evidence", "passed": outputs["unknown"]["status"] == "insufficient_evidence"})
    outputs["isolation"] = service.query(p, {**base, "question": "CONFIDENTIAL-CANARY"})
    checks.append({"name": "Other company document excluded", "passed": outputs["isolation"]["evidence"] == []})
    for project, query, expected in (("taxnuvia", "What payroll onboarding reports are requested?", "firm-guide"), ("lawquo", "What agreement does the lawyer request?", "case-intake")):
        outputs[project] = service.query(principal(project), {**base, "question": query, "jurisdiction": "GB"})
        checks.append({"name": f"Same engine reused for {project}", "passed": expected in {e["document_id"] for e in outputs[project]["evidence"]}})
    return {"version": __version__, "created_at": datetime.now(timezone.utc).isoformat(),
            "mode": "offline_evidence_retrieval", "llm_quality_evaluated": False,
            "scope": "Small synthetic fixture checks; not an accuracy benchmark or production qualification.",
            "passed": sum(c["passed"] for c in checks), "total": len(checks), "checks": checks, "outputs": outputs}
