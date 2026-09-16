from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone, date, timedelta
from pathlib import Path
import hashlib
import json
import sqlite3
import uuid

from knowledge_core.types import APIError, Principal, fields, identifier, text, iso_date, integer
from .finance import validate_entry, report as financial_report, scenario, number, currency, money, base_amount
from .technical import readiness, dependency_analysis
from .product import SCHEMAS as PRODUCT_SCHEMAS, validate as validate_product, product_report, release_readiness
from .workstreams import CATALOG, SCHEMAS as WORKSTREAM_SCHEMAS, validate as validate_workstream, report as workstream_report
from .planning import SCHEMAS as PLANNING_SCHEMAS, validate as validate_planning, validate_links as planning_links, generate as generate_plan

from .business import SCHEMAS as BUSINESS_SCHEMAS, validate as validate_business, validate_links as business_links, report as business_report

SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS projects(tenant TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,currency TEXT NOT NULL,
 mode TEXT NOT NULL DEFAULT 'approval',paused INTEGER NOT NULL DEFAULT 0,data_version INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant,id));
CREATE TABLE IF NOT EXISTS members(tenant TEXT NOT NULL,project TEXT NOT NULL,user TEXT NOT NULL,role TEXT NOT NULL,
 PRIMARY KEY(tenant,project,user),FOREIGN KEY(tenant,project) REFERENCES projects(tenant,id));
CREATE TABLE IF NOT EXISTS objects(tenant TEXT NOT NULL,project TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,
 revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant,project,kind,id),
 FOREIGN KEY(tenant,project) REFERENCES projects(tenant,id));
CREATE TABLE IF NOT EXISTS actions(tenant TEXT NOT NULL,project TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,
 payload TEXT NOT NULL,proposer TEXT NOT NULL,reviewer TEXT,status TEXT NOT NULL,version INTEGER NOT NULL,
 result TEXT,PRIMARY KEY(tenant,project,id),FOREIGN KEY(tenant,project) REFERENCES projects(tenant,id));
CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT NOT NULL,project TEXT NOT NULL,
 created TEXT NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,payload TEXT NOT NULL,previous TEXT NOT NULL,digest TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS nonces(id TEXT PRIMARY KEY,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS plans(tenant TEXT NOT NULL,project TEXT NOT NULL,id TEXT NOT NULL,scope_id TEXT NOT NULL,
 version INTEGER NOT NULL,created TEXT NOT NULL,creator TEXT NOT NULL,status TEXT NOT NULL,reviewer TEXT,
 review_ref TEXT,payload TEXT NOT NULL,PRIMARY KEY(tenant,project,id),
 FOREIGN KEY(tenant,project) REFERENCES projects(tenant,id));
"""

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

@dataclass(frozen=True)
class Actor:
    tenant: str
    user: str
    tenant_role: str

class Engine:
    def __init__(self, db_path, knowledge=None, ai_config=None):
        self.path = str(db_path)
        if not self.path.startswith(("postgresql://", "postgres://")): Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.knowledge = knowledge
        self.postgres = self.path.startswith(("postgresql://", "postgres://"))
        if not self.postgres:  # PostgreSQL schema changes are operator-controlled
            with self.connection() as db:
                db.executescript(SCHEMA)
        from .ai_hub import AIHub
        self.ai = AIHub(self, ai_config)

    @contextmanager
    def connection(self, actor=None):
        if self.postgres:
            from .postgres import connect
            with connect(self.path, actor) as db: yield db
            return
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def _audit(self, db, actor, project, event, payload):
        row = db.execute("SELECT digest FROM audit WHERE tenant=? AND project=? ORDER BY seq DESC LIMIT 1", (actor.tenant, project)).fetchone()
        previous = row[0] if row else "0" * 64
        created = datetime.now(timezone.utc).isoformat()
        body = canonical(payload)
        digest = hashlib.sha256(canonical([actor.tenant, project, created, actor.user, event, body, previous]).encode()).hexdigest()
        db.execute("INSERT INTO audit(tenant,project,created,actor,event,payload,previous,digest) VALUES(?,?,?,?,?,?,?,?)",
                   (actor.tenant, project, created, actor.user, event, body, previous, digest))

    def _access(self, db, actor, project, roles=None):
        identifier(actor.tenant, "tenant")
        identifier(actor.user, "user")
        if actor.tenant_role not in {"owner", "admin", "manager", "member", "agent", "viewer"}:
            raise APIError(403, "Tenant membership is required")
        row = db.execute("SELECT p.*,m.role AS project_role FROM projects p JOIN members m ON p.tenant=m.tenant AND p.id=m.project WHERE p.tenant=? AND p.id=? AND m.user=?",
                         (actor.tenant, project, actor.user)).fetchone()
        if not row:
            raise APIError(404, "Project not found or access denied")
        if roles and row["project_role"] not in roles:
            raise APIError(403, "Project role does not allow this operation")
        return dict(row)

    def create_project(self, actor, data):
        fields(data, {"name", "currency"}, {"name", "currency"})
        if actor.tenant_role not in {"owner", "admin"}:
            raise APIError(403, "A tenant owner or administrator must create projects")
        identifier(actor.tenant, "tenant")
        identifier(actor.user, "user")
        name, ccy = text(data["name"], "name"), currency(data["currency"])
        project = str(uuid.uuid4())
        with self.connection() as db:
            db.execute("INSERT INTO projects(tenant,id,name,currency) VALUES(?,?,?,?)", (actor.tenant, project, name, ccy))
            db.execute("INSERT INTO members VALUES(?,?,?,?)", (actor.tenant, project, actor.user, "owner"))
            self._audit(db, actor, project, "project.created", {"name": name, "currency": ccy})
        return {"id": project, "name": name, "currency": ccy}

    def list_projects(self, actor):
        with self.connection() as db:
            return [dict(r) for r in db.execute("SELECT p.id,p.name,p.currency,p.mode,p.paused,m.role FROM projects p JOIN members m ON m.tenant=p.tenant AND m.project=p.id WHERE p.tenant=? AND m.user=? ORDER BY p.name", (actor.tenant, actor.user))]

    def add_member(self, actor, project, data):
        fields(data, {"user_id", "role"}, {"user_id", "role"})
        if data["role"] not in {"analyst", "finance", "reviewer", "viewer"}:
            raise APIError(422, "Choose analyst, finance, reviewer or viewer")
        user = identifier(data["user_id"], "user_id")
        if user == actor.user:
            raise APIError(422, "Cannot change your own membership through this operation")
        # The trusted host MUST verify target tenant membership before signing this command.
        with self.connection() as db:
            self._access(db, actor, project, {"owner"})
            old = db.execute("SELECT role FROM members WHERE tenant=? AND project=? AND user=?", (actor.tenant, project, user)).fetchone()
            if old and old[0] == "owner":
                raise APIError(403, "Owner reassignment requires a separate administrative workflow")
            db.execute("INSERT INTO members VALUES(?,?,?,?) ON CONFLICT(tenant,project,user) DO UPDATE SET role=excluded.role", (actor.tenant, project, user, data["role"]))
            self._bump(db, actor, project)
            self._audit(db, actor, project, "membership.changed", data)
        return {"updated": True}

    def remove_member(self, actor, project, data):
        user = identifier(data.get("user_id"), "user_id")
        with self.connection() as db:
            self._access(db, actor, project, {"owner"})
            if user == actor.user:
                raise APIError(422, "Cannot remove the project owner")
            db.execute("DELETE FROM members WHERE tenant=? AND project=? AND user=? AND role!='owner'", (actor.tenant, project, user))
            self._bump(db, actor, project)
            self._audit(db, actor, project, "membership.removed", {"user_id": user})
        return {"removed": True}

    def _bump(self, db, actor, project):
        db.execute("UPDATE projects SET data_version=data_version+1 WHERE tenant=? AND id=?", (actor.tenant, project))

    @staticmethod
    def _objects(db, actor, project):
        role = db.execute("SELECT role FROM members WHERE tenant=? AND project=? AND user=?", (actor.tenant, project, actor.user)).fetchone()
        can_read_private = role is not None and role[0] in {"owner", "finance"}
        return [{"kind": r["kind"], "id": r["id"], "revision": r["revision"], "data": json.loads(r["payload"])}
                for r in db.execute("SELECT * FROM objects WHERE tenant=? AND project=? ORDER BY kind,id", (actor.tenant, project)) if r["kind"] != "person_private" or can_read_private]

    @staticmethod
    def validate_object(kind, data):
        if kind in BUSINESS_SCHEMAS:
            return validate_business(kind, data)
        if kind in PLANNING_SCHEMAS:
            return validate_planning(kind, data)
        if kind in WORKSTREAM_SCHEMAS:
            return validate_workstream(kind, data)
        if kind in PRODUCT_SCHEMAS:
            return validate_product(kind, data)
        schemas = {
            "system": ({"id", "name", "owner", "criticality", "status", "evidence_ref", "reviewed"}, {"id", "name", "owner", "criticality", "status", "reviewed"}),
            "dependency": ({"id", "source", "target", "evidence_ref", "reviewed"}, {"id", "source", "target", "evidence_ref", "reviewed"}),
            "task": ({"id", "title", "owner", "due_date", "status", "critical", "evidence_ref", "system_id"}, {"id", "title", "owner", "status", "critical"}),
            "risk": ({"id", "title", "owner", "severity", "status", "mitigation", "evidence_ref"}, {"id", "title", "owner", "severity", "status"}),
            "control": ({"id", "title", "owner", "status", "evidence_ref"}, {"id", "title", "owner", "status"}),
            "tsa": ({"id", "name", "supplier", "owner", "exit_date", "monthly_cost", "currency", "status", "evidence_ref", "exit_conditions"}, {"id", "name", "supplier", "owner", "exit_date", "monthly_cost", "currency", "status", "exit_conditions"}),
            "runbook": ({"id", "title", "owner", "steps", "rollback", "status", "evidence_ref"}, {"id", "title", "owner", "steps", "rollback", "status"}),
            "engagement": ({"id", "name", "client", "adviser", "delivery_lead", "branding", "display_brand", "deal_type", "start_date", "target_date", "scope", "commercial_ref"}, {"id", "name", "client", "adviser", "delivery_lead", "branding", "deal_type", "scope"}),
            "deliverable": ({"id", "title", "owner", "due_date", "status", "evidence_ref", "acceptance_criteria"}, {"id", "title", "owner", "status", "acceptance_criteria"}),
            "integration": ({"id", "name", "owner", "system_id", "status", "permissions", "evidence_ref"}, {"id", "name", "owner", "status", "permissions"}),
        }
        if kind not in schemas:
            raise APIError(422, "Unsupported object kind")
        fields(data, *schemas[kind])
        identifier(data["id"], "id")
        for k in ("name", "title", "owner", "supplier", "mitigation", "rollback", "evidence_ref", "exit_conditions", "client", "adviser", "delivery_lead", "display_brand", "scope", "commercial_ref", "acceptance_criteria", "permissions"):
            if k in data:
                text(data[k], k, 4000)
        for k in ("source", "target", "system_id"):
            if k in data:
                identifier(data[k], k)
        for k in ("reviewed", "critical"):
            if k in data and type(data[k]) is not bool:
                raise APIError(422, f"{k} must be boolean")
        if kind == "dependency" and (not data["reviewed"] or data["source"] == data["target"]):
            raise APIError(422, "Dependencies require human review and distinct endpoints")
        statuses = {"system": {"active", "planned", "retiring", "retired"}, "task": {"todo", "doing", "blocked", "done"},
                    "risk": {"open", "mitigating", "closed"}, "control": {"pending", "failed", "passed"},
                    "tsa": {"active", "exit_pending", "exited"}, "runbook": {"draft", "tested", "approved"},
                    "deliverable": {"planned", "draft", "review", "accepted"}, "integration": {"planned", "configuring", "validated", "disabled"}}
        if kind in statuses and data["status"] not in statuses[kind]:
            raise APIError(422, "Invalid status")
        if "severity" in data and data["severity"] not in {"low", "medium", "high", "critical"}:
            raise APIError(422, "Invalid severity")
        if "criticality" in data and data["criticality"] not in {"low", "medium", "high", "critical"}:
            raise APIError(422, "Invalid criticality")
        for k in ("due_date", "exit_date", "start_date", "target_date"):
            if k in data:
                iso_date(data[k], k)
        if kind == "tsa":
            number(data["monthly_cost"], "monthly_cost")
            currency(data["currency"])
            if data["status"] == "exited" and not data.get("evidence_ref"):
                raise APIError(422, "TSA exit requires acceptance evidence")
        if kind == "runbook":
            if not isinstance(data["steps"], list) or not 1 <= len(data["steps"]) <= 100:
                raise APIError(422, "Runbook needs 1–100 steps")
            for s in data["steps"]:
                text(s, "step", 2000)
            if data["status"] in {"tested", "approved"} and not data.get("evidence_ref"):
                raise APIError(422, "Tested/approved runbooks require evidence")
        if kind == "engagement":
            if data["branding"] not in {"direct", "white_label", "co_branded"} or data["deal_type"] not in {"acquisition", "carve_out", "merger", "modernisation"}:
                raise APIError(422, "Invalid engagement model")
            if data.get("start_date") and data.get("target_date") and data["target_date"] < data["start_date"]:
                raise APIError(422, "target_date precedes start_date")
        if kind in {"deliverable", "integration"} and data["status"] in {"accepted", "validated"} and not data.get("evidence_ref"):
            raise APIError(422, "Acceptance or validation requires evidence")
        return data

    def upsert(self, actor, project, data):
        fields(data, {"kind", "record", "expected_revision"}, {"kind", "record", "expected_revision"})
        kind = data["kind"]
        record = self.validate_object(kind, data["record"])
        version = integer(data["expected_revision"], "expected_revision", 0, 1000000)
        with self.connection() as db:
            p = self._access(db, actor, project, {"owner", "finance", "reviewer"} if kind in {"reconciliation", "cost_item", "business_financials", "receivable", "person_private"} else {"owner", "analyst", "reviewer"})
            if kind in {"person_private", "business_financials", "receivable"}:
                self._access(db, actor, project, {"owner", "finance"})
            if kind in BUSINESS_SCHEMAS:
                business_links(kind, record, self._objects(db, actor, project), p["currency"])
                if kind == "discovery_answer" and record["evidence_status"] == "verified" and p["project_role"] not in {"owner", "reviewer"}:
                    raise APIError(403, "A reviewer must verify discovery evidence")
            if kind in PLANNING_SCHEMAS:
                planning_links(kind, record, self._objects(db, actor, project), p["currency"])
            if kind == "decision" and record["decision_status"] == "accepted" and p["project_role"] not in {"owner", "reviewer"}:
                raise APIError(403, "Only an owner or reviewer can record an accepted decision")
            if kind == "checkpoint" and record["status"] in {"passed", "not_applicable"} and p["project_role"] not in {"owner", "reviewer"}:
                raise APIError(403, "Only an owner or reviewer may accept a checkpoint")
            if kind == "migration_wave":
                for sid in record["system_ids"]:
                    if not db.execute("SELECT 1 FROM objects WHERE tenant=? AND project=? AND kind='system' AND id=?", (actor.tenant, project, sid)).fetchone():
                        raise APIError(422, "Wave systems must belong to this project")
            if kind in {"runbook", "deliverable", "spec"} and record["status"] in {"approved", "accepted"} and p["project_role"] not in {"owner", "reviewer"}:
                raise APIError(403, "Only an owner or reviewer may record acceptance")
            links = {"story": ("opportunity", "opportunity_id"), "uat": ("story", "story_id")}
            if kind in links:
                parent_kind, key = links[kind]
                if not db.execute("SELECT 1 FROM objects WHERE tenant=? AND project=? AND kind=? AND id=?", (actor.tenant, project, parent_kind, record[key])).fetchone():
                    raise APIError(422, "Referenced product record must exist in this project")
            if kind == "spec":
                for rid in record["research_ids"]:
                    if not db.execute("SELECT 1 FROM objects WHERE tenant=? AND project=? AND kind='research' AND id=?", (actor.tenant, project, rid)).fetchone():
                        raise APIError(422, "Referenced research must exist in this project")
            if kind == "release" and record["status"] == "released":
                if p["project_role"] not in {"owner", "reviewer"}:
                    raise APIError(403, "Only an owner or reviewer may record a release")
                if release_readiness(record, self._objects(db, actor, project))["status"] == "blocked":
                    raise APIError(409, "Resolve release gates before recording the release")
            if kind == "dependency":
                for endpoint in (record["source"], record["target"]):
                    if not db.execute("SELECT 1 FROM objects WHERE tenant=? AND project=? AND kind='system' AND id=?", (actor.tenant, project, endpoint)).fetchone():
                        raise APIError(422, "Dependency endpoint is not a project system")
            existing = db.execute("SELECT revision FROM objects WHERE tenant=? AND project=? AND kind=? AND id=?", (actor.tenant, project, kind, record["id"])).fetchone()
            if (existing[0] if existing else 0) != version:
                raise APIError(409, "Record revision changed; reload before saving")
            db.execute("INSERT INTO objects VALUES(?,?,?,?,?,?) ON CONFLICT(tenant,project,kind,id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload", (actor.tenant, project, kind, record["id"], version+1, canonical(record)))
            self._bump(db, actor, project)
            self._audit(db, actor, project, "record.saved", {"kind": kind, "id": record["id"], "revision": version+1, "digest": hashlib.sha256(canonical(record).encode()).hexdigest()})
        return {"id": record["id"], "revision": version+1}

    def import_finance(self, actor, project, data):
        fields(data, {"entries"}, {"entries"})
        if not isinstance(data["entries"], list) or not 1 <= len(data["entries"]) <= 1000:
            raise APIError(422, "Import between 1 and 1000 entries")
        with self.connection() as db:
            p = self._access(db, actor, project, {"owner", "finance"})
            entries = [validate_entry(e, p["currency"]) for e in data["entries"]]
            seen = set()
            for e in entries:
                if e["id"] in seen:
                    raise APIError(422, "Duplicate entry ID in batch")
                seen.add(e["id"])
                old = db.execute("SELECT payload FROM objects WHERE tenant=? AND project=? AND kind='ledger' AND id=?", (actor.tenant, project, e["id"])).fetchone()
                if old and old[0] != canonical(e):
                    raise APIError(409, "Financial entry IDs are immutable; use a new entry and reconcile separately")
                db.execute("INSERT OR IGNORE INTO objects VALUES(?,?,?,?,?,?)", (actor.tenant, project, "ledger", e["id"], 1, canonical(e)))
            self._bump(db, actor, project)
            self._audit(db, actor, project, "finance.imported", {"entry_ids": sorted(seen)})
        return {"accepted": len(entries), "idempotent_by": "entry id; conflicting reuse rejected"}

    def evidence(self, actor, project, operation, data):
        if not self.knowledge:
            raise APIError(503, "Knowledge runtime is not configured")
        if "collection" in data:
            raise APIError(422, "Collection is derived from authorised project access")
        mutation = operation != "query"
        with self.connection() as db:
            self._access(db, actor, project, {"owner", "analyst", "reviewer"} if mutation else None)
            if mutation:
                # Invalidate approvals BEFORE changing the separate evidence store. A failed
                # ingest may conservatively invalidate approvals, never leave stale approval valid.
                self._bump(db, actor, project)
            self._audit(db, actor, project, "knowledge." + operation + ".requested", {"id": data.get("id")})
        principal = Principal("transformation", actor.tenant, (project,), ("query", "ingest") if mutation else ("query",), actor.user)
        result = getattr(self.knowledge, operation)(principal, {**data, "collection": project})
        with self.connection() as db:
            self._access(db, actor, project)
            self._audit(db, actor, project, "knowledge." + operation + ".completed", {"id": data.get("id"), "run_id": result.get("run_id")})
        return result

    def snapshot(self, actor, project, as_of=None):
        day = iso_date(as_of or date.today().isoformat(), "as_of")
        with self.connection() as db:
            p = self._access(db, actor, project)
            objects = self._objects(db, actor, project)
            actions = [dict(r) for r in db.execute("SELECT * FROM actions WHERE tenant=? AND project=? ORDER BY rowid DESC", (actor.tenant, project))]
            for a in actions:
                a["payload"] = json.loads(a["payload"])
                a["result"] = json.loads(a["result"]) if a["result"] else None
                a["stale"] = a["version"] != p["data_version"] and a["status"] in {"pending", "approved"}
            members = [dict(r) for r in db.execute("SELECT user,role FROM members WHERE tenant=? AND project=?", (actor.tenant, project))]
            plans = self._plans(db, actor, project, p["data_version"])
        provider = self.knowledge.provider if self.knowledge else None
        return {"project": p, "objects": objects, "actions": actions, "members": members, "plans": plans,
                "runtime": {"knowledge_storage": getattr(self.knowledge.store, "backend", "sqlite") if self.knowledge else None,
                            "generation_enabled": provider is not None,
                            "embeddings_enabled": bool(provider and provider.embedding_id != "none")},
                "business": business_report(objects, p["currency"], day),
                "technical": readiness(objects, day),
                "product": product_report(objects, day),
                "workstreams": workstream_report(objects),
                "financial": financial_report([o["data"] for o in objects if o["kind"] == "ledger"], p["currency"])}

    def policy(self, actor, project, data):
        fields(data, {"mode", "paused"}, {"mode", "paused"})
        if data["mode"] not in {"observe", "approval", "auto_low_risk"} or type(data["paused"]) is not bool:
            raise APIError(422, "Invalid policy")
        with self.connection() as db:
            self._access(db, actor, project, {"owner"})
            db.execute("UPDATE projects SET mode=?,paused=?,data_version=data_version+1 WHERE tenant=? AND id=?", (data["mode"], int(data["paused"]), actor.tenant, project))
            self._audit(db, actor, project, "policy.changed", data)
        return data

    def propose(self, actor, project, data, expected_version=None, expected_run=None):
        fields(data, {"kind", "payload"}, {"kind", "payload"})
        if data["kind"] not in {"create_task", "readiness_report", "cutover_plan"}:
            raise APIError(422, "Only registered internal tools may be proposed")
        payload = data["payload"]
        if data["kind"] == "create_task":
            self.validate_object("task", payload)
            if payload["status"] != "todo" or payload.get("evidence_ref"):
                raise APIError(422, "Agent-created tasks must start as todo without completion evidence")
        else:
            fields(payload, {"as_of"}, {"as_of"})
            iso_date(payload["as_of"], "as_of")
        with self.connection() as db:
            p = self._access(db, actor, project, {"owner", "analyst", "reviewer"})
            if expected_version is not None and p["data_version"] != expected_version:
                raise APIError(409, "Project changed before task proposal; start a new agent run")
            if expected_run:
                run = db.execute("SELECT status,lease,creator FROM ai_runs WHERE tenant=? AND project=? AND id=?", (actor.tenant, project, expected_run[0])).fetchone()
                if not run or run["status"] != "running" or run["lease"] != expected_run[1] or run["creator"] != actor.user:
                    raise APIError(409, "Agent step was cancelled or superseded")
            if p["paused"]:
                raise APIError(409, "Agents are paused")
            if data["kind"] == "create_task" and db.execute("SELECT 1 FROM objects WHERE tenant=? AND project=? AND kind='task' AND id=?", (actor.tenant, project, payload["id"])).fetchone():
                raise APIError(409, "Task already exists")
            key = canonical(payload)
            old = db.execute("SELECT id FROM actions WHERE tenant=? AND project=? AND kind=? AND payload=? AND version=? AND status IN ('pending','approved')", (actor.tenant, project, data["kind"], key, p["data_version"])).fetchone()
            if old:
                return {"id": old[0], "reused": True}
            aid = str(uuid.uuid4())
            db.execute("INSERT INTO actions(tenant,project,id,kind,payload,proposer,status,version) VALUES(?,?,?,?,?,?,?,?)", (actor.tenant, project, aid, data["kind"], key, actor.user, "pending", p["data_version"]))
            self._audit(db, actor, project, "action.proposed", {"id": aid, "kind": data["kind"], "data_version": p["data_version"]})
        return {"id": aid, "status": "pending"}

    def review(self, actor, project, data):
        fields(data, {"id", "decision"}, {"id", "decision"})
        if data["decision"] not in {"approved", "rejected"}:
            raise APIError(422, "Invalid decision")
        with self.connection() as db:
            p = self._access(db, actor, project, {"owner", "reviewer"})
            a = db.execute("SELECT * FROM actions WHERE tenant=? AND project=? AND id=?", (actor.tenant, project, data["id"])).fetchone()
            if not a:
                raise APIError(404, "Action not found")
            if a["status"] != "pending":
                raise APIError(409, "Action is not pending")
            if a["proposer"] == actor.user:
                raise APIError(403, "An independent reviewer must decide this action")
            if data["decision"] == "approved" and (a["version"] != p["data_version"] or p["paused"] or p["mode"] == "observe"):
                raise APIError(409, "Stale plan, paused project or observation-only policy")
            db.execute("UPDATE actions SET status=?,reviewer=? WHERE tenant=? AND project=? AND id=?", (data["decision"], actor.user, actor.tenant, project, a["id"]))
            self._audit(db, actor, project, "action." + data["decision"], {"id": a["id"]})
        return {"id": data["id"], "status": data["decision"]}

    def execute(self, actor, project, data):
        aid = identifier(data.get("id"), "id")
        with self.connection() as db:
            p = self._access(db, actor, project, {"owner", "analyst", "reviewer"})
            a = db.execute("SELECT * FROM actions WHERE tenant=? AND project=? AND id=?", (actor.tenant, project, aid)).fetchone()
            if not a:
                raise APIError(404, "Action not found")
            if a["status"] == "completed":
                return {"id": aid, "status": "completed", "result": json.loads(a["result"]), "replayed": True}
            if p["paused"] or p["mode"] == "observe":
                raise APIError(409, "Execution is paused or disabled")
            if a["version"] != p["data_version"]:
                raise APIError(409, "Project changed; make and review a fresh proposal")
            auto = p["mode"] == "auto_low_risk" and a["kind"] in {"create_task", "readiness_report"} and a["status"] == "pending"
            if a["status"] != "approved" and not auto:
                raise APIError(403, "Approval is required")
            if not auto:
                reviewer = db.execute("SELECT role FROM members WHERE tenant=? AND project=? AND user=?", (actor.tenant, project, a["reviewer"])).fetchone()
                if not reviewer or reviewer[0] not in {"owner", "reviewer"}:
                    raise APIError(403, "Reviewer no longer has approval authority")
            payload = json.loads(a["payload"])
            if a["kind"] == "create_task":
                if db.execute("SELECT 1 FROM objects WHERE tenant=? AND project=? AND kind='task' AND id=?", (actor.tenant, project, payload["id"])).fetchone():
                    raise APIError(409, "Task already exists")
                db.execute("INSERT INTO objects VALUES(?,?,?,?,?,?)", (actor.tenant, project, "task", payload["id"], 1, canonical(payload)))
                self._bump(db, actor, project)
                result = {"task_id": payload["id"]}
            else:
                objects = self._objects(db, actor, project)
                result = readiness(objects, payload["as_of"])
                if a["kind"] == "cutover_plan":
                    runbooks = [o for o in objects if o["kind"] == "runbook" and o["data"]["status"] == "approved"]
                    result = {"readiness": result, "runbooks": runbooks, "status": "plan_for_human_review",
                              "production_execution": False, "reason": "This tool prepares a cutover plan; it cannot execute infrastructure changes."}
            db.execute("UPDATE actions SET status='completed',result=? WHERE tenant=? AND project=? AND id=?", (canonical(result), actor.tenant, project, aid))
            self._audit(db, actor, project, "action.completed", {"id": aid, "kind": a["kind"], "automatic": auto})
        return {"id": aid, "status": "completed", "result": result, "replayed": False}

    def agent_cycle(self, actor, project, data):
        day = iso_date(data.get("as_of", date.today().isoformat()), "as_of")
        snap = self.snapshot(actor, project, day)
        existing = {o["id"] for o in snap["objects"] if o["kind"] == "task"}
        findings = [c for c in snap["technical"]["checks"] if not c["passed"]][:8]
        runs = []
        # Each step re-reads access/policy/version. The loop is bounded and has no external tools.
        for f in findings:
            task_id = "remediate-" + f["id"]
            if task_id in existing:
                continue
            proposal = self.propose(actor, project, {"kind": "create_task", "payload": {
                "id": task_id, "title": f["detail"], "owner": actor.user, "status": "todo", "critical": True}})
            if snap["project"]["mode"] == "auto_low_risk":
                proposal = self.execute(actor, project, {"id": proposal["id"]})
            runs.append(proposal)
        return {"planner": "bounded_readiness_rules_v1", "findings": findings, "actions": runs,
                "max_steps": 8, "external_effects": False}

    def audit(self, actor, project):
        with self.connection() as db:
            self._access(db, actor, project)
            rows = [dict(r) for r in db.execute("SELECT * FROM audit WHERE tenant=? AND project=? ORDER BY seq", (actor.tenant, project))]
        previous, valid = "0"*64, True
        for r in rows:
            digest = hashlib.sha256(canonical([r["tenant"], r["project"], r["created"], r["actor"], r["event"], r["payload"], r["previous"]]).encode()).hexdigest()
            valid = valid and r["previous"] == previous and digest == r["digest"]
            previous = r["digest"]
            r["payload"] = json.loads(r["payload"])
        return {"chain_valid": valid, "events": rows, "limitation": "Local hash chain; privileged database owners can rewrite it. Export to independently retained append-only storage for stronger assurance."}

    def compare_savings(self, actor, project, data):
        snap = self.snapshot(actor, project)
        entries = {o["id"]: o["data"] for o in snap["objects"] if o["kind"] == "ledger"}
        before, after = entries.get(data.get("baseline_id")), entries.get(data.get("actual_id"))
        if not before or not after or before["kind"] != "baseline" or after["kind"] != "actual":
            raise APIError(422, "Select one baseline and one actual entry")
        if before["category"] not in {"opex", "tsa"} or before["category"] != after["category"] or before["period"] != after["period"]:
            raise APIError(422, "Savings require comparable operating costs in the same period")
        return {"currency": snap["project"]["currency"], "difference": money(base_amount(before)-base_amount(after)),
                "baseline_source": before["source_ref"], "actual_source": after["source_ref"],
                "status": "comparison_requires_finance_review", "causal_attribution_verified": False}

    def dispatch(self, actor, command, project, data):
        from .postgres import actor_context
        token = actor_context.set(actor)
        try: return self._dispatch(actor, command, project, data)
        finally: actor_context.reset(token)

    def _dispatch(self, actor, command, project, data):
        if not isinstance(data, dict):
            raise APIError(422, "data must be an object")
        if command == "projects.list":
            return self.list_projects(actor)
        if command == "projects.create":
            return self.create_project(actor, data)
        project = identifier(project, "project_id")
        commands = {"records.save": self.upsert, "finance.import": self.import_finance,
                    "ai.status": self.ai.status, "ai.policy.save": self.ai.save_policy,
                    "ai.runs.start": self.ai.start, "ai.runs.step": self.ai.step, "ai.runs.get": self.ai.get,
                    "ai.runs.list": self.ai.list_runs, "ai.runs.cancel": self.ai.cancel,
                    "connectors.read": self.ai.connector_read, "connectors.ingest": self.ai.connector_ingest,
                    "members.add": self.add_member, "members.remove": self.remove_member,
                    "policy.update": self.policy, "actions.propose": self.propose,
                    "actions.review": self.review, "actions.execute": self.execute,
                    "agents.run": self.agent_cycle, "finance.savings": self.compare_savings,
                    "diagnostic.create": self.diagnostic, "workstreams.initialise": self.initialise_workstreams,
                    "benefits.propose": self.propose_benefit, "benefits.verify": self.verify_benefit,
                    "planning.generate": self.plan_generate, "planning.get": self.plan_get, "planning.review": self.plan_review}
        if command in commands:
            return commands[command](actor, project, data)
        if command in {"snapshot", "export"}:
            result = self.snapshot(actor, project, data.get("as_of"))
            if command == "export":
                result["audit"] = self.audit(actor, project)
                result["plans"] = [self.plan_get(actor, project, {"id": p["id"]}) for p in result["plans"]]
                result["ai_runs_recent"] = [self.ai.get(actor, project, {"id": r["id"]}) for r in self.ai.list_runs(actor, project, {})]
                result["ai_runs_export_limit"] = 50
                result["export_scope"] = "Project records, finance, actions and audit. Source evidence remains in the shared knowledge store and requires its separate backup/export."
            return result
        if command == "audit":
            return self.audit(actor, project)
        if command == "finance.scenario":
            with self.connection() as db:
                self._access(db, actor, project)
            return scenario(data)
        if command == "product.report":
            return self.snapshot(actor, project, data.get("as_of"))["product"]
        if command == "business.report":
            fields(data, {"as_of", "company_id"}, set())
            with self.connection() as db:
                p = self._access(db, actor, project)
                result = business_report(self._objects(db, actor, project), p["currency"], data.get("as_of", date.today().isoformat()), data.get("company_id"))
                result["data_version"] = p["data_version"]
            return result
        if command == "workstreams.report":
            return self.snapshot(actor, project)["workstreams"]
        if command == "product.brief":
            brief_type = data.get("type", "prd")
            prompts = {"prd": "Draft a PRD covering problem, users, jobs to be done, goals, non-goals, requirements, acceptance criteria and measurable outcomes.",
                       "market": "Draft a competitive brief from the supplied evidence, with dates, differentiators, gaps and uncertainty.",
                       "sprint": "Draft a sprint refinement brief identifying dependencies, unclear acceptance criteria and suggested slicing.",
                       "gtm": "Draft a go-to-market brief covering audience, positioning, channels, launch readiness and success measures."}
            if brief_type not in prompts:
                raise APIError(422, "Choose prd, market, sprint or gtm")
            topic = text(data.get("topic"), "topic", 1000)
            return self.evidence(actor, project, "query", {"question": prompts[brief_type] + " Topic: " + topic, "mode": "hybrid"})
        if command == "technical.impact":
            s = self.snapshot(actor, project)
            return dependency_analysis([o["data"] for o in s["objects"] if o["kind"] == "system"], [o["data"] for o in s["objects"] if o["kind"] == "dependency"], data.get("system_id"))
        operations = {"knowledge.ingest": "ingest", "knowledge.edge": "add_edge", "knowledge.delete": "delete", "knowledge.ask": "query"}
        if command in operations:
            return self.evidence(actor, project, operations[command], data)
        raise APIError(404, "Unknown command")

    @staticmethod
    def _plans(db, actor, project, version):
        return [{**dict(r), "stale": r["version"] != version} for r in db.execute(
            "SELECT id,scope_id,version,created,creator,status,reviewer,review_ref FROM plans WHERE tenant=? AND project=? ORDER BY rowid DESC",
            (actor.tenant, project))]

    def plan_generate(self, actor, project, data):
        fields(data, {"scope_id", "as_of"}, {"scope_id", "as_of"})
        scope_id = identifier(data["scope_id"], "scope_id")
        as_of = iso_date(data["as_of"], "as_of")
        with self.connection() as db:
            p = self._access(db, actor, project, {"owner", "analyst", "reviewer"})
            payload = generate_plan(self._objects(db, actor, project), scope_id, p["currency"], as_of)
            body = canonical(payload)
            existing = db.execute("SELECT * FROM plans WHERE tenant=? AND project=? AND scope_id=? AND version=? AND payload=? AND status!='rejected' ORDER BY rowid DESC LIMIT 1", (actor.tenant, project, scope_id, p["data_version"], body)).fetchone()
            if existing:
                return {**dict(existing), "payload": payload, "stale": False, "reused": True}
            pid = str(uuid.uuid4())
            created = datetime.now(timezone.utc).isoformat()
            db.execute("INSERT INTO plans(tenant,project,id,scope_id,version,created,creator,status,payload) VALUES(?,?,?,?,?,?,?,?,?)", (actor.tenant, project, pid, scope_id, p["data_version"], created, actor.user, "draft", body))
            self._audit(db, actor, project, "plan.generated", {"id": pid, "scope_id": scope_id, "input_version": p["data_version"], "sha256": hashlib.sha256(body.encode()).hexdigest()})
        return {"id": pid, "scope_id": scope_id, "version": p["data_version"], "created": created, "creator": actor.user, "status": "draft", "reviewer": None, "review_ref": None, "payload": payload, "stale": False}

    def plan_get(self, actor, project, data):
        fields(data, {"id"}, {"id"})
        with self.connection() as db:
            p = self._access(db, actor, project)
            row = db.execute("SELECT * FROM plans WHERE tenant=? AND project=? AND id=?", (actor.tenant, project, identifier(data["id"], "id"))).fetchone()
            if not row:
                raise APIError(404, "Plan not found")
            return {**dict(row), "payload": json.loads(row["payload"]), "stale": row["version"] != p["data_version"]}

    def plan_review(self, actor, project, data):
        fields(data, {"id", "decision", "evidence_ref"}, {"id", "decision", "evidence_ref"})
        if data["decision"] not in {"reviewed", "rejected"}:
            raise APIError(422, "Choose reviewed or rejected")
        evidence = text(data["evidence_ref"], "evidence_ref", 2000)
        with self.connection() as db:
            p = self._access(db, actor, project, {"owner", "reviewer"})
            row = db.execute("SELECT * FROM plans WHERE tenant=? AND project=? AND id=?", (actor.tenant, project, identifier(data["id"], "id"))).fetchone()
            if not row:
                raise APIError(404, "Plan not found")
            if row["creator"] == actor.user:
                raise APIError(403, "An independent reviewer must review the plan")
            if row["status"] != "draft":
                raise APIError(409, "Plan has already been reviewed")
            if data["decision"] == "reviewed" and (row["version"] != p["data_version"] or json.loads(row["payload"])["blocking_gap_count"]):
                raise APIError(409, "Resolve blocking input gaps and regenerate stale plans before review")
            db.execute("UPDATE plans SET status=?,reviewer=?,review_ref=? WHERE tenant=? AND project=? AND id=?", (data["decision"], actor.user, evidence, actor.tenant, project, row["id"]))
            self._audit(db, actor, project, "plan."+data["decision"], {"id": row["id"], "evidence_ref": evidence})
        return self.plan_get(actor, project, {"id": data["id"]})

    def diagnostic(self, actor, project, data):
        fields(data, {"start_date"}, {"start_date"})
        start = date.fromisoformat(iso_date(data["start_date"], "start_date"))
        template = [
            (0, "Confirm scope, advisers, decision rights and delivery responsibilities"),
            (1, "Collect system inventories, architecture diagrams and access boundaries"),
            (2, "Review contracts, TSA obligations, licence terms and renewal dates"),
            (3, "Interview system owners and verify critical dependencies"),
            (4, "Assess identity, security controls and business continuity"),
            (6, "Reconcile technology spending, baseline costs and remaining forecasts"),
            (8, "Stress-test migration order, rollback plans and Day-1 assumptions"),
            (10, "Review risks, cost scenarios and proposed TSA exit conditions"),
            (12, "Prepare evidence-backed findings and the delivery roadmap"),
            (13, "Hold sponsor review and record acceptance or outstanding actions"),
        ]
        with self.connection() as db:
            self._access(db, actor, project, {"owner", "analyst", "reviewer"})
            if db.execute("SELECT 1 FROM objects WHERE tenant=? AND project=? AND kind='task' AND id LIKE 'diagnostic-%'", (actor.tenant, project)).fetchone():
                raise APIError(409, "Diagnostic tasks already exist")
            ids = []
            for i, (offset, title) in enumerate(template):
                task = {"id": f"diagnostic-{i+1:02}", "title": title, "owner": actor.user,
                        "due_date": (start+timedelta(days=offset)).isoformat(), "status": "todo", "critical": True}
                db.execute("INSERT INTO objects VALUES(?,?,?,?,?,?)", (actor.tenant, project, "task", task["id"], 1, canonical(task)))
                ids.append(task["id"])
            self._bump(db, actor, project)
            self._audit(db, actor, project, "diagnostic.created", {"start_date": data["start_date"], "task_ids": ids})
        return {"task_ids": ids, "calendar_days": 14, "commercial_fee": None,
                "note": "Editable two-week diagnostic template; effort, staffing and fees must be agreed separately."}

    def initialise_workstreams(self, actor, project, data):
        with self.connection() as db:
            self._access(db, actor, project, {"owner", "analyst", "reviewer"})
            count = 0
            for id,definition in CATALOG.items():
                stream={"id":id,"name":definition["name"],"owner":actor.user,"scope":"Confirm engagement-specific scope and acceptance criteria","platforms":definition["platforms"]}
                records=[("workstream",stream)]
                for index,(phase,title) in enumerate(definition["checks"],1):
                    records.append(("checkpoint",{"id":f"{id}-{index:02}","workstream_id":id,"title":title,"phase":phase,"owner":actor.user,"status":"pending","blocking":True}))
                for kind,record in records:
                    cur=db.execute("INSERT OR IGNORE INTO objects VALUES(?,?,?,?,?,?)",(actor.tenant,project,kind,record["id"],1,canonical(record)))
                    count+=cur.rowcount
            if count:
                self._bump(db,actor,project)
                self._audit(db,actor,project,"workstreams.initialised",{"created_records":count})
        return {"created_records":count,"domains":list(CATALOG),"template_is_not_a_compliance_standard":True}

    def propose_benefit(self, actor, project, data):
        fields(data,{"id","baseline_id","actual_id","title","attribution_note"},{"id","baseline_id","actual_id","title","attribution_note"})
        comparison=self.compare_savings(actor,project,data)
        bid=identifier(data["id"],"id")
        record={**comparison,"id":bid,"baseline_id":data["baseline_id"],"actual_id":data["actual_id"],
                "title":text(data["title"],"title"),"attribution_note":text(data["attribution_note"],"attribution_note",4000),
                "proposer":actor.user,"status":"pending_finance_review","reviewer":None}
        with self.connection() as db:
            self._access(db,actor,project,{"owner","finance"})
            if db.execute("SELECT 1 FROM objects WHERE tenant=? AND project=? AND kind='benefit' AND id=?",(actor.tenant,project,bid)).fetchone():
                raise APIError(409,"Benefit ID already exists")
            db.execute("INSERT INTO objects VALUES(?,?,?,?,?,?)",(actor.tenant,project,"benefit",bid,1,canonical(record)))
            self._bump(db,actor,project)
            self._audit(db,actor,project,"benefit.proposed",{"id":bid,"baseline_id":data["baseline_id"],"actual_id":data["actual_id"]})
        return record

    def verify_benefit(self, actor, project, data):
        fields(data,{"id","evidence_ref"},{"id","evidence_ref"})
        with self.connection() as db:
            self._access(db,actor,project,{"owner","finance"})
            row=db.execute("SELECT payload FROM objects WHERE tenant=? AND project=? AND kind='benefit' AND id=?",(actor.tenant,project,data["id"])).fetchone()
            if not row:raise APIError(404,"Benefit not found")
            record=json.loads(row[0])
            if record["proposer"]==actor.user:raise APIError(403,"A different finance reviewer must verify the benefit")
            if record["status"]!="pending_finance_review":raise APIError(409,"Benefit is no longer pending")
            for o in self._objects(db,actor,project):
                b=o["data"]
                if o["kind"]=="benefit" and b["status"]=="finance_reviewed" and (b["actual_id"]==record["actual_id"] or b["baseline_id"]==record["baseline_id"]):
                    raise APIError(409,"This baseline or actual entry has already been attributed to a reviewed benefit")
            record.update(status="finance_reviewed",reviewer=actor.user,review_evidence_ref=text(data["evidence_ref"],"evidence_ref",1000))
            db.execute("UPDATE objects SET payload=?,revision=revision+1 WHERE tenant=? AND project=? AND kind='benefit' AND id=?",(canonical(record),actor.tenant,project,data["id"]))
            self._bump(db,actor,project)
            self._audit(db,actor,project,"benefit.finance_reviewed",{"id":data["id"],"evidence_ref":data["evidence_ref"]})
        return record
