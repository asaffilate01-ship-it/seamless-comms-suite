"""Isolated DOM-test service. Contract fixtures, no provider or connector network calls."""
from pathlib import Path
import signal
import sys
import tempfile
from wsgiref.simple_server import make_server

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "omniqora-update/services/transformation"))
from demo import seed
from transformation.engine import Engine
from transformation.ai_hub import AIHub
from transformation.server import create_app, QuietHandler
from knowledge_core.service import KnowledgeService
from knowledge_core.store import Store


class ContractModel:
    def __init__(self, config): pass
    def decide(self, system, context, tokens):
        observations = context["observations"]
        if not observations:
            result = {"type": "tool", "tool": "financial_report", "arguments": {}}
        elif len(observations) == 1:
            result = {"type": "tool", "tool": "propose_task", "arguments": {"title": "Review finance baseline", "owner": "Finance lead", "critical": False}}
        else:
            result = {"type": "final", "claims": [{"text": "The recorded actual cost is GBP 76,000.", "sources": ["obs-1"]}, {"text": "A baseline review task has been proposed for approval.", "sources": ["obs-2"]}], "uncertainties": ["The fixture does not verify real company finances."]}
        return result, {"input_tokens": 100, "output_tokens": 50}


class ContractConnector:
    def __init__(self, config): pass
    def read(self, operation, arguments):
        return {"connection_id": "repo-demo", "operation": "repository", "items": [{"full_name": "fictional/pilot", "language": "TypeScript"}], "source_url": "https://api.github.com/repos/fictional/pilot", "has_more": False, "complete_inventory": False}


signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
with tempfile.TemporaryDirectory(prefix="oq-ai-dom-") as directory:
    engine = Engine(Path(directory)/"project.db", KnowledgeService(Store(str(Path(directory)/"knowledge.db"))))
    owner, project = seed(engine)
    bindings = [{"tenant": owner.tenant, "project": project}]
    config = {"models": [{"id": "contract-model", "label": "Contract-test model", "provider": "openai", "model": "fixture-only", "credential_env": "OQ_SECRET_UNUSED", "bindings": bindings}],
              "connectors": [{"id": "repo-demo", "label": "Contract-test repository", "kind": "github", "owner": "fictional", "repository": "pilot", "operations": ["repository"], "bindings": bindings}]}
    engine.ai = AIHub(engine, config, ContractModel, ContractConnector)
    with make_server("127.0.0.1", 8093, create_app(engine, "fictional-local-verification-only-key-123456"), handler_class=QuietHandler) as server:
        print("backend on 8093", flush=True)
        server.serve_forever()
