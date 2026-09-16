"""Evidence-linked company discovery and deterministic, versionable planning drafts."""
from datetime import date, timedelta
from decimal import Decimal
import hashlib
import json

from knowledge_core.types import APIError, fields, identifier, integer, iso_date, text
from .finance import number, money, currency
from .technical import dependency_analysis, readiness
from .product import product_report
from .workstreams import CATALOG, report as workstream_report

SCHEMAS = {
    "company": ({"id", "name", "company_role", "sector", "countries", "sites", "owner", "description", "evidence_ref"},
                {"id", "name", "company_role", "sector", "countries", "owner"}),
    "business_service": ({"id", "name", "company_id", "owner", "criticality", "day_one_required", "acceptance_criteria", "evidence_ref"},
                         {"id", "name", "company_id", "owner", "criticality", "day_one_required", "acceptance_criteria"}),
    "asset": ({"id", "name", "company_id", "asset_type", "quantity", "owner", "criticality", "day_one_required", "disposition", "target_company_id", "transferability", "workstream_id", "system_id", "evidence_ref"},
              {"id", "name", "company_id", "asset_type", "quantity", "owner", "criticality", "day_one_required", "disposition", "transferability"}),
    "workforce": ({"id", "name", "company_id", "owner", "headcount", "fte", "skills", "key_dependencies", "target_company_id", "transition_approach", "evidence_ref"},
                  {"id", "name", "company_id", "owner", "headcount", "fte", "skills", "transition_approach"}),
    "cost_item": ({"id", "name", "company_id", "cost_key", "cost_state", "cost_category", "amount", "currency", "frequency", "duration_months", "owner", "basis", "asset_id", "workforce_id", "fx_rate", "fx_as_of", "fx_source", "evidence_ref"},
                  {"id", "name", "company_id", "cost_key", "cost_state", "cost_category", "amount", "currency", "frequency", "owner", "basis", "evidence_ref"}),
    "objective": ({"id", "name", "company_id", "owner", "metric", "baseline", "target", "unit", "direction", "moscow", "target_date", "evidence_ref"},
                  {"id", "name", "company_id", "owner", "metric", "target", "unit", "direction", "moscow", "target_date"}),
    "asset_dependency": ({"id", "source", "target", "reviewed", "evidence_ref"},
                         {"id", "source", "target", "reviewed", "evidence_ref"}),
    "planning_scope": ({"id", "name", "deal_type", "company_ids", "target_company_id", "asset_ids", "workforce_ids", "business_service_ids", "cost_item_ids", "owner", "start_date", "day_one_date", "horizon_days", "constraints", "requirements_ref", "inventory_complete", "workforce_complete", "costs_complete", "transition_budget"},
                       {"id", "name", "deal_type", "company_ids", "target_company_id", "owner", "start_date", "day_one_date", "horizon_days", "constraints", "inventory_complete", "workforce_complete", "costs_complete"}),
    "delivery_mandate": ({"id", "name", "company_id", "owner", "delivery_model", "client", "prime_adviser", "delivery_partner", "branding", "display_brand", "workstream_ids", "decision_rights", "reporting_cadence", "acceptance_criteria", "commercial_ref"},
                         {"id", "name", "company_id", "owner", "delivery_model", "client", "delivery_partner", "branding", "display_brand", "workstream_ids", "decision_rights", "reporting_cadence", "acceptance_criteria", "commercial_ref"}),
    "tdd_finding": ({"id", "name", "company_id", "owner", "severity", "finding_status", "business_impact", "recommendation", "cost_item_ids", "evidence_ref"},
                    {"id", "name", "company_id", "owner", "severity", "finding_status", "business_impact", "recommendation", "evidence_ref"}),
    "tsa_obligation": ({"id", "name", "company_id", "owner", "tsa_id", "provider_company_id", "recipient_company_id", "asset_ids", "service_scope", "service_levels", "charging_basis", "responsibilities", "exit_roadmap", "consent_status", "evidence_ref"},
                       {"id", "name", "company_id", "owner", "tsa_id", "provider_company_id", "recipient_company_id", "asset_ids", "service_scope", "service_levels", "charging_basis", "responsibilities", "exit_roadmap", "consent_status", "evidence_ref"}),
    "decision": ({"id", "name", "company_id", "owner", "decision_date", "decision_status", "rationale", "alternatives", "evidence_ref"},
                 {"id", "name", "company_id", "owner", "decision_date", "decision_status", "rationale", "alternatives", "evidence_ref"}),
}

ENUMS = {
    "company_role": {"buyer", "seller", "target", "newco", "merged", "operating", "group"},
    "asset_type": {"technology", "property", "equipment", "inventory", "ip", "data", "contract", "licence", "brand", "network", "other"},
    "criticality": {"low", "medium", "high", "critical"},
    "disposition": {"retain", "migrate", "consolidate", "replace", "separate", "retire", "shared", "unassessed"},
    "transferability": {"unknown", "confirmed", "restricted"},
    "workstream_id": set(CATALOG),
    "cost_state": {"current", "transition", "target"},
    "cost_category": {"technology", "people", "property", "operations", "supplier", "tsa", "other"},
    "frequency": {"daily", "weekly", "monthly", "quarterly", "annual", "one_off"},
    "basis": {"confirmed", "estimated"},
    "direction": {"increase", "decrease", "maintain"},
    "moscow": {"must", "should", "could", "wont_now"},
    "deal_type": {"acquisition", "carve_out", "merger", "modernisation"},
    "delivery_model": {"sub_contract", "direct_advisory"},
    "branding": {"direct", "white_label", "co_branded"},
    "severity": {"low", "medium", "high", "critical"},
    "finding_status": {"open", "mitigating", "closed"},
    "consent_status": {"draft", "negotiating", "confirmed"},
    "decision_status": {"proposed", "accepted", "rejected", "superseded"},
}
BOOLS = {"day_one_required", "reviewed", "inventory_complete", "workforce_complete", "costs_complete"}
LISTS = {"countries", "sites", "skills", "company_ids", "asset_ids", "workforce_ids", "business_service_ids", "cost_item_ids", "workstream_ids"}


def validate(kind, data):
    fields(data, *SCHEMAS[kind])
    for key, value in data.items():
        if key in BOOLS:
            if type(value) is not bool:
                raise APIError(422, f"{key} must be boolean")
        elif key in LISTS:
            if not isinstance(value, list) or not 1 <= len(value) <= 100 or any(not isinstance(x, str) for x in value):
                raise APIError(422, f"{key} needs 1–100 text entries")
            if len(set(value)) != len(value):
                raise APIError(422, f"{key} must not contain duplicates")
            for item in value:
                (identifier if key.endswith("_ids") else text)(item, key)
        elif key in ENUMS:
            if not isinstance(value, str) or value not in ENUMS[key]:
                raise APIError(422, f"Invalid {key}")
        elif key in {"quantity", "headcount", "horizon_days"}:
            integer(value, key, 100 if key == "horizon_days" else 0, 1095 if key == "horizon_days" else 100000000)
        elif key in {"amount", "fte", "transition_budget", "duration_months"}:
            n = number(value, key)
            if key != "fte" and n != n.quantize(Decimal("0.01")):
                raise APIError(422, f"{key} must have at most two decimal places")
        elif key in {"baseline", "target"} and kind == "objective":
            number(value, key, "-1000000000000")
        elif key == "fx_rate":
            number(value, key, "0.00000001", "1000000")
        elif key == "currency":
            currency(value)
        elif key.endswith("_date") or key == "fx_as_of":
            iso_date(value, key)
        elif key == "id" or key.endswith("_id") or key in {"source", "target", "cost_key"}:
            identifier(value, key)
        else:
            text(value, key, 4000)
    if kind == "asset_dependency":
        if not data["reviewed"] or data["source"] == data["target"]:
            raise APIError(422, "Dependencies require review and distinct assets")
        identifier(data["target"], "target")
    if kind == "workforce" and number(data["fte"], "fte") > data["headcount"]:
        raise APIError(422, "FTE exceeds recorded headcount")
    if kind == "planning_scope":
        if data["day_one_date"] < data["start_date"]:
            raise APIError(422, "Day 1 cannot precede planning start")
        if data["target_company_id"] not in data["company_ids"]:
            raise APIError(422, "The target company must be included in scope")
    if kind == "cost_item" and data["frequency"] == "one_off" and data["cost_state"] != "transition":
        raise APIError(422, "One-off costs belong to the transition state")
    if kind == "cost_item" and "duration_months" in data and (data["cost_state"] != "transition" or data["frequency"] == "one_off"):
        raise APIError(422, "Duration applies only to transition recurring costs")
    if kind == "delivery_mandate":
        if data["delivery_model"] == "sub_contract" and not data.get("prime_adviser"):
            raise APIError(422, "Sub-contract mandates require a lead adviser")
        if any(v not in set(CATALOG) | set(BUSINESS_STREAMS) for v in data["workstream_ids"]):
            raise APIError(422, "Unknown mandate workstream")
    return dict(data)


def validate_links(kind, data, objects, base):
    index = {(o["kind"], o["id"]): o["data"] for o in objects}
    links = [("company", data[k]) for k in ("company_id", "target_company_id", "provider_company_id", "recipient_company_id") if k in data]
    links += [("company", v) for v in data.get("company_ids", [])]
    links += [(k[:-3], data[k]) for k in ("asset_id", "workforce_id", "system_id", "tsa_id") if k in data]
    links += [(k[:-4], v) for k in ("asset_ids", "workforce_ids", "business_service_ids", "cost_item_ids") for v in data.get(k, [])]
    if kind == "asset_dependency":
        links += [("asset", data[k]) for k in ("source", "target")]
    for link in links:
        if link not in index:
            raise APIError(422, f"Referenced {link[0]} must exist in this project: {link[1]}")
        if kind == "planning_scope" and link[0] != "company" and index[link].get("company_id") not in data["company_ids"]:
            raise APIError(422, "Selected scope records must belong to a selected company")
    if kind == "cost_item":
        rate = number(data.get("fx_rate", "1"), "fx_rate", "0.00000001", "1000000")
        if data["currency"] == base and rate != 1:
            raise APIError(422, "Base currency must use fx_rate=1")
        if data["currency"] != base and not all(k in data for k in ("fx_rate", "fx_as_of", "fx_source")):
            raise APIError(422, "Foreign costs need an explicit rate, date and source")
        for o in objects:
            r = o["data"]
            if o["kind"] == kind and o["id"] != data["id"] and (r["company_id"], r["cost_state"], r["cost_key"]) == (data["company_id"], data["cost_state"], data["cost_key"]):
                raise APIError(409, "Duplicate cost key for this company and state; edit the existing cost")


def costs(rows, base, completeness):
    factors = {"daily": Decimal(365), "weekly": Decimal(52), "monthly": Decimal(12), "quarterly": Decimal(4), "annual": Decimal(1)}
    totals = {s: Decimal(0) for s in ("current", "transition", "target")}
    counts = {s: 0 for s in totals}
    one_off, recurring_transition = Decimal(0), Decimal(0)
    missing_durations = []
    converted = []
    for row in rows:
        value = number(row["amount"], "amount") * number(row.get("fx_rate", "1"), "fx_rate", "0.00000001")
        annual = value * factors[row["frequency"]] if row["frequency"] != "one_off" else None
        counts[row["cost_state"]] += 1
        if annual is None:
            one_off += value
        else:
            totals[row["cost_state"]] += annual
            if row["cost_state"] == "transition":
                if "duration_months" not in row:
                    missing_durations.append(row["id"])
                else:
                    recurring_transition += annual / 12 * number(row["duration_months"], "duration_months")
        converted.append({"id": row["id"], "company_id": row["company_id"], "state": row["cost_state"], "annual_run_rate": money(annual) if annual is not None else None, "one_off": money(value) if annual is None else None, "basis": row["basis"], "evidence_ref": row["evidence_ref"]})
    return {"currency": base, "coverage_attested": completeness,
            "annual_recurring": {s: money(totals[s]) if counts[s] else None for s in totals},
            "transition_one_off": money(one_off) if counts["transition"] else None,
            "transition_total": money(one_off + recurring_transition) if counts["transition"] and not missing_durations else None,
            "missing_duration_ids": missing_durations,
            "annual_run_rate_difference": money(totals["current"]-totals["target"]) if counts["current"] and counts["target"] else None,
            "items": converted,
            "basis": "Entered estimates only, separate from the transaction ledger. 365 days/52 weeks/12 months/4 quarters per annual run-rate; excludes timing, tax, intercompany eliminations and inflation. Current and target states are compared, never added. Difference is not a verified saving. Missing states are null, not zero. Transition recurring costs need a duration before a total programme budget can be calculated."}


BUSINESS_STREAMS = {
    "governance": ("Governance and decision rights", "Approve scope, deal perimeter, accountable owners and escalation routes", "Sponsor accepts the operating model and records outstanding exceptions"),
    "finance": ("Finance and close continuity", "Confirm banking, opening balances, billing, payroll and close freeze calendar", "CFO accepts reconciliations, finance access, funding and close continuity evidence"),
    "people": ("People and change", "Review team capacity, skills, consultation obligations, communications and training", "HR confirms authorised workforce arrangements and service coverage"),
    "operations": ("Customers and operations", "Map critical services, customer commitments, supply chain and continuity plans", "Business owners evidence critical service tests and customer support coverage"),
    "contracts": ("Contracts and suppliers", "Review novation, consent, licences, procurement, TSA terms and exit conditions", "Owners confirm required contractual rights and continuity arrangements"),
    "facilities": ("Facilities and physical assets", "Inventory premises, equipment, leases, access and transfer dependencies", "Owners evidence site access, asset custody and physical service continuity"),
    "product": ("Product and adoption", "Link research and objectives to PRDs, prioritisation, backlog, UAT and GTM", "Product owner confirms critical releases, adoption baseline and support readiness"),
}


def generate(objects, scope_id, base, as_of):
    index = {(o["kind"], o["id"]): o for o in objects}
    scope_obj = index.get(("planning_scope", scope_id))
    if not scope_obj:
        raise APIError(404, "Planning scope not found")
    scope = scope_obj["data"]
    company_ids = set(scope["company_ids"])
    scoped = [o for o in objects if ((o["kind"] == "company" and o["id"] in company_ids) or o["data"].get("company_id") in company_ids)
              and (o["kind"]+"_ids" not in scope or o["id"] in scope[o["kind"]+"_ids"])]
    records = lambda kind: [o["data"] for o in scoped if o["kind"] == kind]
    companies, assets, teams, objectives = (records(k) for k in ("company", "asset", "workforce", "objective"))
    asset_ids = {a["id"] for a in assets}
    deps = [o["data"] for o in objects if o["kind"] == "asset_dependency" and (o["data"]["source"] in asset_ids or o["data"]["target"] in asset_ids)]
    internal_deps = [d for d in deps if d["source"] in asset_ids and d["target"] in asset_ids]
    dependency = dependency_analysis(assets, internal_deps)
    start, day_one = (date.fromisoformat(scope[k]) for k in ("start_date", "day_one_date"))
    finish = day_one + timedelta(days=scope["horizon_days"]-1)
    gaps, actions = [], []

    def gap(code, detail, refs=None, blocking=True):
        gaps.append({"id": f"gap-{len(gaps)+1:03}", "code": code, "detail": detail, "blocking": blocking, "source_ids": refs or [], "owner": scope["owner"]})

    phases = [
        {"id": "prepare", "name": "Mobilise and prepare", "start": start.isoformat(), "end": max(start, day_one-timedelta(days=1)).isoformat()},
        {"id": "day_one", "name": "Day 1 continuity", "start": day_one.isoformat(), "end": day_one.isoformat()},
        {"id": "stabilise", "name": "Days 2–30", "start": (day_one+timedelta(days=1)).isoformat(), "end": (day_one+timedelta(days=29)).isoformat()},
        {"id": "transform", "name": "Days 31–60", "start": (day_one+timedelta(days=30)).isoformat(), "end": (day_one+timedelta(days=59)).isoformat()},
        {"id": "optimise", "name": "Days 61–100", "start": (day_one+timedelta(days=60)).isoformat(), "end": (day_one+timedelta(days=99)).isoformat()},
    ]
    if scope["horizon_days"] > 100:
        phases.append({"id": "sustain", "name": "Day 101 onwards", "start": (day_one+timedelta(days=100)).isoformat(), "end": finish.isoformat()})
    phase_map = {p["id"]: p for p in phases}

    def action(aid, title, stream, phase, owner, acceptance, refs=None, depends=None, due=None):
        actions.append({"id": aid, "title": title, "workstream": stream, "phase": phase,
                        "owner": owner, "owner_assignment": "proposed_from_input",
                        "target_date": due or phase_map[phase]["end"], "depends_on": depends or [],
                        "acceptance_criteria": acceptance, "source_ids": refs or [], "status": "proposed"})

    for flag, label in (("inventory_complete", "asset and service inventory"), ("workforce_complete", "workforce inventory"), ("costs_complete", "current, target and transition cost coverage")):
        if not scope[flag]:
            gap("coverage", f"Confirm {label} for every scoped company", [scope_id])
    for kind in ("asset", "workforce", "business_service", "cost_item"):
        for rid in scope.get(kind+"_ids", []):
            if index.get((kind, rid), {}).get("data", {}).get("company_id") not in company_ids:
                gap("perimeter_changed", f"Selected {kind} {rid} no longer belongs to a scoped company", [scope_id, rid])
    if not scope.get("requirements_ref"):
        gap("requirements", "Confirm sector, jurisdiction, transaction and company-specific requirements", [scope_id])
    if not objectives:
        gap("objectives", "Enter measurable objectives and target dates")
    if not assets and not records("business_service"):
        gap("inventory", "No assets or business services have been entered")
    if not teams:
        gap("workforce", "No workforce teams or operating coverage have been entered")
    if day_one < date.fromisoformat(as_of):
        gap("date", "Day 1 is in the past; revise scope or assess the already completed transition", [scope_id])
    if start == day_one:
        gap("date", "No preparation window exists before Day 1", [scope_id])
    elif (day_one-start).days < 14:
        gap("schedule", "Preparation window is under 14 calendar days; validate effort and feasibility", [scope_id], False)
    if dependency["blocked_by_cycles"]:
        gap("dependency_cycle", "Resolve asset dependency cycles and dependent blocked assets", dependency["blocked_by_cycles"])
    for dep in deps:
        if dep not in internal_deps:
            gap("external_dependency", "An asset depends across the chosen transaction perimeter; agree a TSA or widen scope", [dep["id"], dep["source"], dep["target"]])
    for kind in ("risk", "tsa"):
        for o in objects:
            r = o["data"]
            if o["kind"] == kind and ((kind == "risk" and r["severity"] in {"high", "critical"} and r["status"] != "closed") or (kind == "tsa" and r["status"] != "exited" and r["exit_date"] <= scope["day_one_date"])):
                gap("project_risk", f"Review project-wide {kind}: {r.get('title', r.get('name'))}", [o["id"]])

    gates = []
    definitions = {**{k: (v["name"], "; ".join(c[1] for c in v["checks"][:2]), "; ".join(c[1] for c in v["checks"][-2:])) for k, v in CATALOG.items()}, **BUSINESS_STREAMS}
    for stream, (name, prepare, acceptance) in definitions.items():
        existing = index.get(("workstream", stream), {}).get("data", {})
        owner = existing.get("owner", scope["owner"])
        action(f"prepare-{stream}", prepare, stream, "prepare", owner, f"Reviewed scope and evidence for {name}", [scope_id])
        action(f"day1-{stream}", f"Confirm Day 1 continuity: {name}", stream, "day_one", owner, acceptance, [scope_id], [f"prepare-{stream}"])
        action(f"stabilise-{stream}", f"Resolve exceptions and hand over {name.lower()}", stream, "stabilise", owner, "Named operational owner accepts support, monitoring and unresolved exceptions", [scope_id], [f"day1-{stream}"])
        gates.append({"id": stream, "name": name, "owner": owner, "status": "evidence_required", "acceptance_criteria": acceptance, "source_ids": [scope_id]})

    for asset in assets:
        aid = asset["id"]
        if asset["disposition"] == "unassessed":
            gap("disposition", f"Decide the target treatment for {asset['name']}", [aid])
        if not asset.get("target_company_id") and asset["disposition"] != "retire":
            gap("target_owner", f"Assign a target company for {asset['name']}", [aid])
        elif asset.get("target_company_id") and asset["target_company_id"] not in company_ids:
            gap("perimeter", f"Target owner of {asset['name']} is outside the plan perimeter", [aid])
        if asset["transferability"] != "confirmed" and (asset.get("target_company_id") != asset["company_id"] or asset["disposition"] in {"migrate", "separate", "consolidate", "shared"}):
            gap("transfer", f"Resolve {asset['transferability']} transfer rights for {asset['name']}", [aid])
        if not asset.get("evidence_ref"):
            gap("evidence", f"Verify inventory evidence for {asset['name']}", [aid])
        stream = asset.get("workstream_id", "facilities" if asset["asset_type"] in {"property", "equipment", "inventory"} else "contracts")
        prereqs = [f"asset-{d['target']}" for d in internal_deps if d["source"] == aid]
        action(f"asset-{aid}", f"{asset['disposition'].replace('_', ' ').capitalize()}: {asset['name']}", stream,
               "prepare" if asset["day_one_required"] else "transform", asset["owner"],
               "Validate business acceptance, transfer rights, test evidence and recovery or continuity arrangements",
               [aid], [f"prepare-{stream}"] + prereqs)
        if asset["day_one_required"]:
            next(a for a in actions if a["id"] == f"day1-{stream}")["depends_on"].append(f"asset-{aid}")
    for team in teams:
        if not team.get("evidence_ref"):
            gap("workforce_evidence", f"Verify workforce coverage for {team['name']}", [team["id"]])
        if not team.get("target_company_id") or team["target_company_id"] not in company_ids:
            gap("workforce_target", f"Confirm target organisation for {team['name']}", [team["id"]])
        action(f"team-{team['id']}", f"Confirm operating coverage: {team['name']}", "people", "prepare", team["owner"], team["transition_approach"], [team["id"]], ["prepare-people"])
        next(a for a in actions if a["id"] == "day1-people")["depends_on"].append(f"team-{team['id']}")
    for service in records("business_service"):
        action(f"service-{service['id']}", f"Test business continuity: {service['name']}", "operations", "prepare" if service["day_one_required"] else "transform", service["owner"], service["acceptance_criteria"], [service["id"]], ["prepare-operations"])
        if service["day_one_required"]:
            next(a for a in actions if a["id"] == "day1-operations")["depends_on"].append(f"service-{service['id']}")
    for objective in objectives:
        oid = objective["id"]
        if "baseline" not in objective:
            gap("baseline", f"Set a measured baseline for {objective['name']}", [oid])
        if not start.isoformat() <= objective["target_date"] <= finish.isoformat():
            gap("objective_date", f"Objective {objective['name']} falls outside the planning horizon", [oid])
        target_date = objective["target_date"]
        phase = next((p["id"] for p in phases if p["start"] <= target_date <= p["end"]), "optimise")
        if objective["moscow"] != "wont_now":
            action(f"objective-{oid}", f"Measure outcome: {objective['name']}", "governance", phase, objective["owner"],
                   f"Evidence {objective['metric']}: {objective['direction']} to {objective['target']} {objective['unit']}", [oid], ["prepare-governance"], target_date)
    action("optimise-benefits", "Review costs, benefits, adoption and remaining TSA exits", "finance", "optimise", scope["owner"], "Finance reviews transaction evidence, attribution and remaining commitments", [scope_id], ["stabilise-finance"])

    finance = costs(records("cost_item"), base, scope["costs_complete"])
    for state, value in finance["annual_recurring"].items():
        if value is None:
            gap("costs", f"Enter {state} costs, including explicitly confirmed zero costs where appropriate", [scope_id])
    if "transition_budget" not in scope:
        gap("budget", "Agree a transition budget in the project base currency", [scope_id])
    elif finance["transition_total"] is not None and number(finance["transition_total"], "transition_total") > number(scope["transition_budget"], "budget"):
        gap("budget", "Entered transition costs exceed the transition budget", [scope_id])
    if finance["missing_duration_ids"]:
        gap("transition_duration", "Enter the duration of transition recurring costs before relying on a programme cost total", finance["missing_duration_ids"])
    for mandate in records("delivery_mandate"):
        action(f"mandate-{mandate['id']}", f"Confirm delivery agreement: {mandate['name']}", "governance", "prepare", mandate["owner"], mandate["acceptance_criteria"], [mandate["id"]], ["prepare-governance"])
    for finding in records("tdd_finding"):
        if finding["finding_status"] != "closed":
            if finding["severity"] in {"high", "critical"}:
                gap("due_diligence", finding["business_impact"], [finding["id"]])
            action(f"finding-{finding['id']}", f"Resolve diligence finding: {finding['name']}", "governance", "prepare", finding["owner"], finding["recommendation"], [finding["id"]]+finding.get("cost_item_ids", []), ["prepare-governance"])
    for obligation in records("tsa_obligation"):
        tsa = index[("tsa", obligation["tsa_id"])]["data"]
        if obligation["consent_status"] != "confirmed":
            gap("tsa_consent", f"Confirm service and licence rights for {obligation['name']}", [obligation["id"]])
        exit_date = tsa["exit_date"]
        phase = next((p["id"] for p in phases if p["start"] <= exit_date <= p["end"]), "optimise")
        if not start.isoformat() <= exit_date <= finish.isoformat() and tsa["status"] != "exited":
            gap("tsa_horizon", f"TSA exit {obligation['name']} falls outside the planning horizon", [obligation["id"]])
        if tsa["status"] != "exited":
            action(f"tsa-{obligation['id']}", f"Exit transition service: {obligation['name']}", "contracts", phase, obligation["owner"], obligation["exit_roadmap"]+"; "+tsa["exit_conditions"], [obligation["id"], tsa["id"]], ["prepare-contracts"], exit_date)
    by_action = {a["id"]: a for a in actions}
    for a in actions:
        for dep in a["depends_on"]:
            if by_action[dep]["target_date"] > a["target_date"]:
                gap("schedule_dependency", f"{a['title']} is scheduled before prerequisite {by_action[dep]['title']}", a["source_ids"]+by_action[dep]["source_ids"])
    source_manifest = [{"kind": o["kind"], "id": o["id"], "revision": o["revision"], "sha256": hashlib.sha256(json.dumps(o["data"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()} for o in objects]
    company_views = [{**c, "assets": [a["id"] for a in assets if a["company_id"] == c["id"]],
                      "incoming_assets": [a["id"] for a in assets if a.get("target_company_id") == c["id"] and a["company_id"] != c["id"]],
                      "recorded_headcount": sum(t["headcount"] for t in teams if t["company_id"] == c["id"]),
                      "proposed_target_headcount": sum(t["headcount"] for t in teams if t.get("target_company_id") == c["id"]),
                      "recorded_fte": money(sum((number(t["fte"], "fte") for t in teams if t["company_id"] == c["id"]), Decimal(0))),
                      "proposed_target_fte": money(sum((number(t["fte"], "fte") for t in teams if t.get("target_company_id") == c["id"]), Decimal(0))),
                      "costs": costs([r for r in records("cost_item") if r["company_id"] == c["id"]], base, False)} for c in companies]
    return {"schema_version": 1, "generator": "company_planning_rules_v1", "scope": scope, "as_of": as_of,
            "company_comparison": company_views, "asset_dispositions": assets, "workforce": teams,
            "objectives": objectives, "phases": phases, "actions": actions, "gaps": gaps,
            "delivery_mandates": records("delivery_mandate"), "due_diligence": records("tdd_finding"),
            "tsa_obligations": records("tsa_obligation"), "decision_log": records("decision"),
            "blocking_gap_count": sum(g["blocking"] for g in gaps), "day_one_gates": gates,
            "financial": finance, "dependencies": dependency, "source_manifest": source_manifest,
            "technical_workstreams": workstream_report(objects),
            "technical_readiness": readiness(objects, as_of), "product_readiness": product_report(objects, as_of),
            "existing_commitments": [o for o in objects if o["kind"] in {"task", "deliverable", "migration_wave", "runbook", "spec", "story", "sprint", "release", "gtm", "opportunity", "benefit"}],
            "assumptions": ["Dates are calendar planning targets, not resource-levelled commitments; durations and capacity require specialist validation.",
                            "Business and technical gates require review; generating or reviewing a plan does not authorise cutover or certify compliance.",
                            "Generic workstream templates require company, sector, jurisdiction and deal-specific tailoring.",
                            "Existing technical, product, financial and risk registers apply to this project; use separate projects for unrelated transformations.",
                            "Workforce inputs are aggregate team data. Employment decisions and consultation remain with accountable people.",
                            "The plan is generated from entered records using rules; an AI model does not invent inventory, savings, owners or evidence."]}
