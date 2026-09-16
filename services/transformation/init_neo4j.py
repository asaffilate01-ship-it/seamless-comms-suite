import transformation
from knowledge_core.neo4j_store import Neo4jStore

if __name__ == "__main__":
    store = Neo4jStore.from_env(require_schema=False)
    try:
        print(store.initialize_schema())
    finally:
        store.close()
