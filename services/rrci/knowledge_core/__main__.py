import argparse
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from wsgiref.simple_server import make_server
from .app import create_app
from .demo import provision, seed, demo_report
from .service import KnowledgeService
from .store import Store


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description="Shared Knowledge Core local pilot")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init-demo")
    init.add_argument("--directory", default="var")
    serve = sub.add_parser("serve")
    serve.add_argument("--port", type=int, default=8080)
    demo = sub.add_parser("demo")
    demo.add_argument("--output", default="var/demo-results.json")
    sub.add_parser("init-neo4j", help="Create constraints in the configured Neo4j database")
    neo_demo = sub.add_parser("demo-neo4j", help="Seed fictional demo namespaces and query Neo4j")
    neo_demo.add_argument("--output", default="var/neo4j-demo-results.json")
    query = sub.add_parser("query")
    query.add_argument("question")
    query.add_argument("--mode", choices=["rag", "graph", "hybrid"], default="rag")
    query.add_argument("--token-file", default="var/haccora-demo-reader.token")
    query.add_argument("--collection", default="manuals")
    query.add_argument("--jurisdiction")
    query.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    if args.command == "init-neo4j":
        from .neo4j_store import Neo4jStore
        store = Neo4jStore.from_env(require_schema=False)
        try:
            print(json.dumps(store.initialize_schema()))
        finally:
            store.close()
    elif args.command == "demo-neo4j":
        from .neo4j_store import Neo4jStore
        store = Neo4jStore.from_env()
        try:
            service = KnowledgeService(store)
            seed(service)
            report = demo_report(service)
            report["storage_backend"] = "neo4j"
            path = Path(args.output)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(report, indent=2))
            print(f'{report["passed"]}/{report["total"]} Neo4j retrieval fixture checks passed; report: {path}')
            if report["passed"] != report["total"]:
                raise SystemExit(1)
        finally:
            store.close()
    elif args.command == "init-demo":
        credentials = provision(args.directory)
        service = KnowledgeService(Store(Path(args.directory) / "knowledge.db"))
        seed(service)
        print(f"Fictional sample data and scoped credentials created in {args.directory}.")
        print("Service tokens are in permission-restricted .token files. Do not commit or share them.")
        if args.directory != "var":
            print(f"Set KNOWLEDGE_CREDENTIALS to {credentials} and KNOWLEDGE_DB to the database in that directory.")
    elif args.command == "serve":
        os.umask(0o077)
        app = create_app()
        print(f"Local pilot: http://127.0.0.1:{args.port}; Ctrl+C to stop.", flush=True)
        with make_server("127.0.0.1", args.port, app) as server:
            server.serve_forever()
    elif args.command == "demo":
        report = demo_report()
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2))
        print(f'{report["passed"]}/{report["total"]} retrieval fixture checks passed; report: {path}')
        if report["passed"] != report["total"]:
            raise SystemExit(1)
    elif args.command == "query":
        payload = {"collection": args.collection, "question": args.question, "mode": args.mode}
        if args.jurisdiction:
            payload["jurisdiction"] = args.jurisdiction
        token = Path(args.token_file).read_text().strip()
        req = Request(f"http://127.0.0.1:{args.port}/v1/query", data=json.dumps(payload).encode(),
                      headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        with urlopen(req, timeout=60) as response:
            print(json.dumps(json.load(response), indent=2))


if __name__ == "__main__":
    main()
