"""WSGI JSON API; development server binds to loopback by default."""
import atexit
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
from .providers import OllamaProvider
from .service import KnowledgeService
from .storage import create_store
from . import __version__
from .types import APIError, Principal, fields, identifier

LOG = logging.getLogger(__name__)


class Application:
    def __init__(self, service, credentials, compliance=None):
        self.compliance = compliance
        if not credentials:
            raise ValueError("Provision at least one scoped service credential")
        self.service = service
        self.credentials = []
        for row in credentials:
            required = {"key_id", "token_sha256", "project", "tenant", "collections", "capabilities"}
            fields(row, required, required)
            digest = row["token_sha256"]
            if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
                raise ValueError("Credentials must store SHA-256 hashes, not plaintext service tokens")
            if not isinstance(row["collections"], list) or not row["collections"] or not isinstance(row["capabilities"], list):
                raise ValueError("Specify exact collections and capabilities")
            if not set(row["capabilities"]) <= {"query", "ingest", "trace", "rrci"}:
                raise ValueError("Unknown capability")
            principal = Principal(identifier(row["project"], "project"), identifier(row["tenant"], "tenant"),
                                  tuple(identifier(c, "collection") for c in row["collections"]),
                                  tuple(row["capabilities"]), identifier(row["key_id"], "key_id"))
            if any(hmac.compare_digest(digest, existing) for existing, _ in self.credentials):
                raise ValueError("Duplicate service token")
            self.credentials.append((digest, principal))

    def authenticate(self, header):
        if not isinstance(header, str) or not header.startswith("Bearer ") or len(header) > 2000:
            raise APIError(401, "A scoped service token is required")
        token = header[7:]
        if len(token) < 32:
            raise APIError(401, "Invalid service token")
        digest = hashlib.sha256(token.encode()).hexdigest()
        for expected, principal in self.credentials:
            if hmac.compare_digest(expected, digest):
                return principal
        raise APIError(401, "Invalid service token")

    def __call__(self, environ, start_response):
        try:
            method, path = environ.get("REQUEST_METHOD"), environ.get("PATH_INFO")
            if method == "GET" and path == "/health":
                result, status = {"status": "ok", "version": __version__}, 200
            else:
                principal = self.authenticate(environ.get("HTTP_AUTHORIZATION", ""))
                if method != "POST":
                    raise APIError(405, "Use POST with a JSON body")
                if environ.get("CONTENT_TYPE", "").split(";")[0].strip() != "application/json":
                    raise APIError(415, "Use application/json")
                try:
                    length = int(environ.get("CONTENT_LENGTH") or 0)
                except ValueError:
                    raise APIError(400, "Invalid content length") from None
                if not 1 <= length <= 200000:
                    raise APIError(413, "Body must contain 1–200000 bytes")
                raw = environ["wsgi.input"].read(length)
                if len(raw) != length:
                    raise APIError(400, "Incomplete body")
                try:
                    data = json.loads(raw)
                except (ValueError, UnicodeDecodeError):
                    raise APIError(400, "Invalid JSON") from None
                routes = {"/v1/documents/upsert": self.service.ingest,
                          "/v1/documents/delete": self.service.delete,
                          "/v1/graph/edges/upsert": self.service.add_edge,
                          "/v1/query": self.service.query}
                if path == "/v1/rrci":
                    if self.compliance is None:
                        raise APIError(503, "Compliance module is not configured")
                    result = self.compliance.handle(principal, data)
                elif path == "/v1/traces/get":
                    fields(data, {"collection", "id"}, {"collection", "id"})
                    scope = principal.scope(data["collection"], "trace")
                    result = self.service.store.get_trace(scope, identifier(data["id"], "id"))
                elif path in routes:
                    result = routes[path](principal, data)
                else:
                    raise APIError(404, "Route not found")
                status = 200
        except APIError as error:
            status, result = error.status, {"error": str(error)}
        except Exception:
            # Avoid logging documents, model responses, questions or credential values.
            LOG.error("Request failed unexpectedly")
            status, result = 500, {"error": "Internal service error"}
        phrases = {200: "OK", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 413: "Content Too Large", 415: "Unsupported Media Type", 422: "Unprocessable Content", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable"}
        body = json.dumps(result, ensure_ascii=False, allow_nan=False).encode()
        start_response(f"{status} {phrases[status]}", [("Content-Type", "application/json; charset=utf-8"),
                       ("Content-Length", str(len(body))), ("Cache-Control", "no-store"),
                       ("X-Content-Type-Options", "nosniff")])
        return [body]


def create_app():
    path = os.environ.get("KNOWLEDGE_CREDENTIALS", "var/credentials.json")
    credentials = json.loads(Path(path).read_text())
    provider_mode = os.environ.get("KNOWLEDGE_PROVIDER", "evidence")
    if provider_mode == "evidence":
        provider = None
    elif provider_mode == "ollama":
        provider = OllamaProvider(os.environ.get("KNOWLEDGE_MODEL_URL", "http://127.0.0.1:11434"),
                                  os.environ.get("KNOWLEDGE_CHAT_MODEL", ""), os.environ.get("KNOWLEDGE_EMBED_MODEL", ""))
    else:
        raise ValueError("KNOWLEDGE_PROVIDER must be evidence or ollama")
    store = create_store()
    try:
        from .rrci import ComplianceService
        from .rrci.control import Control
        compliance = ComplianceService(store, Control(os.environ.get("RRCI_CONTROL_DB", "var/rrci-control.db")), provider)
        app = Application(KnowledgeService(store, provider), credentials, compliance)
    except Exception:
        if hasattr(store, "close"):
            store.close()
        raise
    if hasattr(store, "close"):
        atexit.register(store.close)
    return app
