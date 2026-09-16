"""Loopback development server and WSGI production entry point."""
import json
import os
from pathlib import Path
from wsgiref.simple_server import make_server, WSGIRequestHandler
from .engine import Engine
from .auth import verify
from knowledge_core.service import KnowledgeService
from knowledge_core.storage import create_store
from knowledge_core.providers import OllamaProvider
from knowledge_core.types import APIError, fields
from .ai_config import load_config

def create_engine():
    database = os.environ.get("TRANSFORMATION_DATABASE_URL") or os.environ.get("TRANSFORMATION_DB", "var/transformation.db")
    if not database.startswith(("postgresql://", "postgres://")):
        if os.environ.get("BUSINESS360_ALLOW_SQLITE") != "1":
            raise RuntimeError("Configure TRANSFORMATION_DATABASE_URL with PostgreSQL RLS; SQLite requires explicit local-test opt-in")
        Path(database).parent.mkdir(parents=True, exist_ok=True)
    Path(os.environ.get("KNOWLEDGE_DB", "var/knowledge.db")).parent.mkdir(parents=True, exist_ok=True)
    provider = None
    name = os.environ.get("KNOWLEDGE_PROVIDER", "evidence")
    if name == "ollama":
        provider = OllamaProvider(os.environ.get("KNOWLEDGE_MODEL_URL", "http://127.0.0.1:11434"),
                                  os.environ.get("KNOWLEDGE_CHAT_MODEL", ""), os.environ.get("KNOWLEDGE_EMBED_MODEL", ""))
    elif name != "evidence":
        raise RuntimeError("Use KNOWLEDGE_PROVIDER=evidence or ollama")
    return Engine(database, KnowledgeService(create_store(), provider), ai_config=load_config())

def create_app(engine=None, secret=None):
    secret = secret or os.environ.get("TRANSFORMATION_SIGNING_KEY", "")
    if len(secret) < 32:
        raise RuntimeError("Configure a server-only TRANSFORMATION_SIGNING_KEY of at least 32 characters")
    engine = engine or create_engine()
    def app(env, start_response):
        status = 200
        try:
            if env.get("PATH_INFO") == "/health" and env.get("REQUEST_METHOD") == "GET":
                result = {"status": "ok", "service": "omniqora-transformation"}
            else:
                if env.get("PATH_INFO") != "/rpc" or env.get("REQUEST_METHOD") != "POST":
                    raise APIError(404, "Not found")
                if env.get("CONTENT_TYPE", "").split(";")[0] != "application/json":
                    raise APIError(415, "Content-Type must be application/json")
                length = env.get("CONTENT_LENGTH", "")
                if not length.isdigit() or not 1 <= int(length) <= 1048576:
                    raise APIError(413, "Request must be 1 byte to 1 MiB")
                raw = env["wsgi.input"].read(int(length))
                headers = {k: env.get("HTTP_" + k.upper().replace("-", "_"), "") for k in ("X-OQ-Timestamp", "X-OQ-Nonce", "X-OQ-Context", "X-OQ-Signature")}
                actor = verify(engine, raw, headers, secret)
                try:
                    body = json.loads(raw)
                except (ValueError, UnicodeDecodeError):
                    raise APIError(422, "Invalid JSON") from None
                fields(body, {"command", "project_id", "data"}, {"command", "data"})
                if not isinstance(body["command"], str):
                    raise APIError(422, "command must be a string")
                result = engine.dispatch(actor, body["command"], body.get("project_id"), body["data"])
        except APIError as e:
            status, result = e.status, {"error": str(e)}
        except Exception:
            # Do not return database/query/model content in a browser-facing exception.
            status, result = 500, {"error": "Transformation service error; consult operator diagnostics"}
        raw_result = json.dumps(result, ensure_ascii=False, allow_nan=False).encode()
        start_response(f"{status} " + ("OK" if status == 200 else "Error"),
                       [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(raw_result))),
                        ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff")])
        return [raw_result]
    return app

class QuietHandler(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8091"))
    with make_server("127.0.0.1", port, create_app(), handler_class=QuietHandler) as server:
        print(f"Transformation developer service listening on 127.0.0.1:{port}", flush=True)
        server.serve_forever()
