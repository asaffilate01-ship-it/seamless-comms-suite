"""Small, fixed read operations. No caller/model supplied URLs or credentials."""
from urllib.parse import quote
from knowledge_core.types import APIError, fields, text
from .ai_providers import request_json, secret, endpoint

OPERATIONS = {
    "microsoft_graph": {"applications", "organisation", "licences"},
    "github": {"repository", "issues"},
    "json_feed": {"read"},
}


class ConnectorAdapter:
    def __init__(self, config, transport=request_json):
        self.config, self.transport = config, transport

    def read(self, operation, arguments):
        fields(arguments, set(), set())
        c, kind = self.config, self.config["kind"]
        if operation not in c["operations"] or operation not in OPERATIONS[kind]:
            raise APIError(403, "Connector operation is not authorised")
        headers = {"Authorization": "Bearer "+secret(c["credential_env"])} if c.get("credential_env") else {}
        limit = 25
        if kind == "microsoft_graph":
            paths = {"applications": "applications?$select=id,appId,displayName&$top=25", "organisation": "organization?$select=id,displayName", "licences": "subscribedSkus?$select=id,skuPartNumber,consumedUnits,prepaidUnits"}
            url = "https://graph.microsoft.com/v1.0/"+paths[operation]
            data = self.transport(url, headers=headers, method="GET", timeout=8)
            rows = data.get("value")
            if not isinstance(rows, list): raise APIError(502, "Invalid Microsoft Graph response")
            allowed = {"id", "appId", "displayName", "skuPartNumber", "consumedUnits", "prepaidUnits"}
            if any(not isinstance(r, dict) for r in rows): raise APIError(502, "Invalid Graph item")
            output = [{k: v for k, v in r.items() if k in allowed} for r in rows[:limit]]
            more = bool(data.get("@odata.nextLink")) or len(rows) > limit
        elif kind == "github":
            base = "https://api.github.com/repos/"+quote(c["owner"], safe="")+"/"+quote(c["repository"], safe="")
            url = base if operation == "repository" else base+"/issues?state=open&per_page=25"
            headers.update({"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
            data = self.transport(url, headers=headers, method="GET", timeout=8)
            if operation == "repository":
                if not isinstance(data, dict): raise APIError(502, "Invalid GitHub response")
                keys = {"id", "full_name", "description", "private", "language", "default_branch", "archived", "open_issues_count", "updated_at", "html_url"}
                output, more = [{k: v for k, v in data.items() if k in keys}], False
            else:
                if not isinstance(data, list) or any(not isinstance(r, dict) for r in data): raise APIError(502, "Invalid GitHub issues")
                keys = {"id", "number", "title", "state", "updated_at", "html_url"}
                output = [{k: v for k, v in r.items() if k in keys} for r in data[:limit] if "pull_request" not in r]
                more = len(data) >= limit
        else:
            # An exact operator-approved read endpoint. Parameters and endpoint cannot be changed by an agent.
            url = endpoint(c["endpoint"])
            data = self.transport(url, headers=headers, method="GET", timeout=8)
            rows = data.get("items") if isinstance(data, dict) else data
            if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
                raise APIError(502, "JSON feed must return an items array of objects")
            output = [{k: r[k] for k in c["fields"] if k in r} for r in rows[:limit]]
            more = len(rows) > limit or bool(isinstance(data, dict) and data.get("has_more"))
        return {"connection_id": c["id"], "operation": operation, "source_url": url, "items": output,
                "has_more": more, "page_limit": limit, "complete_inventory": False,
                "note": "Bounded read snapshot; review scope and pagination before relying on inventory completeness."}
