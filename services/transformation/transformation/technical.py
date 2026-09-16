"""Explainable rules for dependency impact, readiness and delivery sequencing."""
from collections import deque
from datetime import date
from knowledge_core.types import APIError
from .workstreams import report as workstream_report

def dependency_analysis(systems, dependencies, root=None):
    nodes = {s["id"]: s for s in systems}
    parents = {i: set() for i in nodes}
    dependants = {i: set() for i in nodes}
    unknown = []
    for edge in dependencies:
        a, b = edge["source"], edge["target"]  # source DEPENDS_ON target
        if a not in nodes or b not in nodes:
            unknown.append(edge["id"])
            continue
        parents[a].add(b)
        dependants[b].add(a)
    waves = []
    remaining = {i: set(v) for i, v in parents.items()}
    while remaining:
        ready = sorted(i for i, v in remaining.items() if not v)
        if not ready:
            break
        waves.append(ready)
        for i in ready:
            del remaining[i]
        for v in remaining.values():
            v.difference_update(ready)
    impacted = []
    if root:
        if root not in nodes:
            raise APIError(404, "System not found")
        seen, queue = {root}, deque([(root, [root])])
        while queue:
            current, path = queue.popleft()
            for n in sorted(dependants[current]):
                if n not in seen:
                    seen.add(n)
                    impacted.append({"system_id": n, "path": path + [n]})
                    queue.append((n, path + [n]))
    return {"migration_waves": waves, "blocked_by_cycles": sorted(remaining),
            "invalid_dependency_ids": unknown, "impacted": impacted,
            "direction": "source depends on target; migrate prerequisites first",
            "basis": "Reviewed dependency records; this is not automatic infrastructure discovery."}

def readiness(objects, as_of):
    today = date.fromisoformat(as_of)
    grouped = {}
    for obj in objects:
        grouped.setdefault(obj["kind"], []).append(obj["data"])
    systems = grouped.get("system", [])
    tasks = grouped.get("task", [])
    risks = grouped.get("risk", [])
    controls = grouped.get("control", [])
    tsa = grouped.get("tsa", [])
    checks = []
    def check(key, passed, detail, evidence=None):
        checks.append({"id": key, "passed": bool(passed), "detail": detail, "evidence_ids": evidence or []})
    check("inventory", bool(systems), "At least one system must be recorded", [s["id"] for s in systems])
    incomplete = [s["id"] for s in systems if not s.get("owner") or not s.get("evidence_ref") or not s.get("reviewed")]
    check("inventory_review", bool(systems) and not incomplete, "Each system needs an owner and reviewed evidence", incomplete)
    critical = [r["id"] for r in risks if r["severity"] in ("critical", "high") and r["status"] != "closed"]
    check("critical_risks", not critical, "No unresolved high or critical risks", critical)
    pending = [t["id"] for t in tasks if t.get("critical") and (t["status"] != "done" or not t.get("evidence_ref"))]
    check("critical_tasks", bool(tasks) and not pending, "Critical tasks need completed status and test evidence", pending)
    missing = [c["id"] for c in controls if c["status"] != "passed" or not c.get("evidence_ref")]
    check("controls", bool(controls) and not missing, "At least one control and evidence for all recorded controls", missing)
    graph = dependency_analysis(systems, grouped.get("dependency", []))
    check("dependencies", not graph["blocked_by_cycles"] and not graph["invalid_dependency_ids"], "No unresolved dependency cycles or missing endpoints", graph["blocked_by_cycles"])
    risk_register = [r for r in risks]
    check("risk_review", bool(risk_register), "Risk assessment must be recorded, including a closed assessment if no risks were found")
    delivery = workstream_report(objects)
    check("workstream_acceptance", delivery["overall_status"] != "blocked", "All six scoped delivery workstreams need reviewed acceptance evidence", [s["id"] for s in delivery["streams"] if s["status"] == "blocked"])
    expiries = []
    for service in tsa:
        days = (date.fromisoformat(service["exit_date"]) - today).days
        if service["status"] != "exited":
            expiries.append({"id": service["id"], "days_to_exit": days, "overdue": days < 0,
                             "monthly_cost": service["monthly_cost"], "currency": service["currency"]})
    return {"as_of": as_of, "status": "ready_for_review" if all(c["passed"] for c in checks) else "blocked",
            "passed_checks": sum(c["passed"] for c in checks), "total_checks": len(checks), "checks": checks,
            "dependencies": graph, "tsa_exposure": expiries,
            "human_cutover_authorisation_required": True,
            "limitations": "Readiness is based on supplied records. It does not prove completeness or live service health."}
