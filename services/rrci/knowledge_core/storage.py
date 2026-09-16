"""Select one authoritative storage backend; no automatic data migration."""
import os
from .store import Store


def create_store():
    backend = os.environ.get("KNOWLEDGE_STORAGE", "sqlite")
    if backend == "sqlite":
        return Store(os.environ.get("KNOWLEDGE_DB", "var/knowledge.db"))
    if backend == "neo4j":
        from .neo4j_store import Neo4jStore
        return Neo4jStore.from_env()
    raise ValueError("KNOWLEDGE_STORAGE must be sqlite or neo4j")
