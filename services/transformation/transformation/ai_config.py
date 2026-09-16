"""Operator-owned allowlist. Tenant users can select only their bound connections."""
import hashlib
import json
import os
import re
from pathlib import Path
from knowledge_core.types import fields, identifier, integer, text
from .ai_providers import PROVIDERS, endpoint
from .ai_connectors import OPERATIONS


def validate_config(data):
    fields(data, {"models", "connectors", "tenant_daily_model_calls"}, {"models", "connectors"})
    integer(data.get("tenant_daily_model_calls", 200), "tenant_daily_model_calls", 1, 10000)
    for category in ("models", "connectors"):
        rows = data[category]
        if not isinstance(rows, list) or len(rows) > 200:
            raise ValueError("Operator registry must contain at most 200 entries per category")
        seen = set()
        for row in rows:
            base = {"id", "label", "bindings", "credential_env"}
            allowed = base | ({"provider", "model", "endpoint", "region", "aws_profile"} if category == "models" else {"kind", "operations", "owner", "repository", "endpoint", "fields"})
            required = {"id", "label", "bindings"} | ({"provider", "model"} if category == "models" else {"kind", "operations"})
            fields(row, allowed, required)
            identifier(row["id"], "connection id")
            text(row["label"], "label", 100)
            if row["id"] in seen: raise ValueError("Duplicate registry ID")
            seen.add(row["id"])
            if not isinstance(row["bindings"], list) or not 1 <= len(row["bindings"]) <= 200:
                raise ValueError("Explicit project bindings required; wildcard grants are unsupported")
            for b in row["bindings"]:
                fields(b, {"tenant", "project"}, {"tenant", "project"})
                identifier(b["tenant"], "tenant"); identifier(b["project"], "project")
            if row.get("credential_env") and not re.fullmatch(r"OQ_SECRET_[A-Z0-9_]+", row["credential_env"]):
                raise ValueError("Credential references must use the OQ_SECRET_ prefix")
            if category == "models":
                if row["provider"] not in PROVIDERS: raise ValueError("Unknown provider")
                text(row["model"], "model", 300)
                if row["provider"] in {"azure_openai", "ollama"}:
                    url = endpoint(row["endpoint"], local=row["provider"] == "ollama")
                    if row["provider"] == "azure_openai" and not re.fullmatch(r"https://[a-zA-Z0-9-]+\.(openai\.azure\.com|services\.ai\.azure\.com)", url):
                        raise ValueError("Azure endpoint must be the approved resource origin")
                if row["provider"] not in {"ollama", "bedrock"} and not row.get("credential_env"):
                    raise ValueError("Provider credential reference required")
                if row["provider"] == "bedrock":
                    if not re.fullmatch(r"[a-z]{2}(-[a-z]+)+-\d", row.get("region", "")): raise ValueError("Bedrock region required")
            else:
                if row["kind"] not in OPERATIONS: raise ValueError("Unknown connector kind")
                if not isinstance(row["operations"], list) or not row["operations"] or any(op not in OPERATIONS[row["kind"]] for op in row["operations"]):
                    raise ValueError("Unsupported connector operation")
                if row["kind"] == "github":
                    if any(not re.fullmatch(r"[A-Za-z0-9_.-]+", row.get(k, "")) for k in ("owner", "repository")):
                        raise ValueError("Fixed GitHub owner and repository required")
                if row["kind"] == "microsoft_graph" and not row.get("credential_env"):
                    raise ValueError("Graph requires an operator token reference")
                if row["kind"] == "json_feed":
                    endpoint(row["endpoint"])
                    if not isinstance(row.get("fields"), list) or not 1 <= len(row["fields"]) <= 30 or any(not isinstance(f, str) or not re.fullmatch(r"[A-Za-z0-9_]+", f) for f in row["fields"]):
                        raise ValueError("Explicit JSON feed field projection required")
    return data


def load_config():
    path = os.environ.get("OQ_AI_CONFIG")
    if not path: return {"models": [], "connectors": []}
    raw = Path(path).read_bytes()
    if len(raw) > 1000000: raise ValueError("Operator configuration exceeds size limit")
    return validate_config(json.loads(raw))


def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def bound(row, actor, project):
    return {"tenant": actor.tenant, "project": project} in row["bindings"]
