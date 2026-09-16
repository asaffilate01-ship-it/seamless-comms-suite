"""Opt-in tests execute the same API/storage contract against a real Neo4j database."""
import json
import os
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from test_core import CoreTests, APITests
from knowledge_core.demo import document, principal
from knowledge_core.neo4j_store import Neo4jStore
from knowledge_core.storage import create_store
from knowledge_core.types import APIError, Scope


class IsolatedNeo4jStore:
    """Give every test its own namespace; cleanup touches only scopes it created."""
    backend = "neo4j"

    def __init__(self, store):
        self.store = store
        self.prefix = "test-" + uuid.uuid4().hex + "-"
        self.scopes = set()

    def __getattr__(self, name):
        value = getattr(self.store, name)
        if not callable(value):
            return value
        def call(scope, *args, **kwargs):
            scoped = Scope(scope.project, self.prefix + scope.tenant, scope.collection)
            self.scopes.add(scoped.key)
            return value(scoped, *args, **kwargs)
        return call

    def cleanup(self):
        scopes = list(self.scopes)
        def delete(tx):
            tx.run("MATCH (n) WHERE (n:KnowledgeDocument OR n:KnowledgeChunk OR n:KnowledgeEntity OR n:KnowledgeTrace) AND n.scope IN $scopes DETACH DELETE n", scopes=scopes).consume()
            tx.run("MATCH (n:KnowledgeScope) WHERE n.key IN $scopes DELETE n", scopes=scopes).consume()
        try:
            self.store._execute(True, delete)
        finally:
            self.store.close()


class Neo4jFixture:
    @classmethod
    def setUpClass(cls):
        store = Neo4jStore.from_env(require_schema=False)
        try:
            store.initialize_schema()
        finally:
            store.close()

    def make_store(self, unused_path):
        store = IsolatedNeo4jStore(Neo4jStore.from_env())
        self.addCleanup(store.cleanup)
        return store


@unittest.skipUnless(os.environ.get("NEO4J_TEST_ENABLED") == "1", "Set NEO4J_TEST_ENABLED=1 with a test Neo4j connection")
class Neo4jCoreTests(Neo4jFixture, CoreTests):
    def test_native_graph_execution_is_recorded(self):
        result = self.query(mode="graph")
        self.assertEqual("neo4j_cypher", result["trace"]["retrieval"]["graph_execution"])
        self.assertEqual("neo4j", result["trace"]["retrieval"]["storage_backend"])

    def test_concurrent_source_updates_allow_one_revision(self):
        def update(content):
            try:
                result = self.service.ingest(self.p, document("supplier-record", content, expected_revision=1))
                return result["revision"]
            except APIError as error:
                return error.status
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(update, ["Northstar Foods supplies NEW-A.", "Northstar Foods supplies NEW-B."]))
        self.assertEqual([2, 409], sorted(results))

    def test_cypher_parameters_treat_injection_as_a_label(self):
        label = "X') MATCH (n) DETACH DELETE n //"
        doc = document("quoted-source", label + " supplies Safe Batch.")
        self.service.ingest(self.p, doc)
        self.service.add_edge(self.p, {"collection": "manuals", "id": "quoted-edge", "source": label,
            "relation": "supplies", "target": "Safe Batch", "document_id": "quoted-source",
            "document_revision": 1, "quote": doc["text"]})
        result = self.query("Show links", mode="graph", seeds=[label])
        self.assertTrue(result["graph_paths"])
        self.assertTrue(self.query("fridge fails")["evidence"])

    def test_replacing_edge_preserves_id_uniqueness(self):
        edge = {"collection": "manuals", "id": "supply", "source": "Northstar Foods", "relation": "supplies",
                "target": "Batch B17", "document_id": "supplier-record", "document_revision": 1,
                "quote": "Northstar Foods supplies Batch B17."}
        self.service.add_edge(self.p, edge)
        self.service.add_edge(self.p, edge)
        _, edges = self.store.snapshot(self.p.scope("manuals", "query"), "2026-09-15", "GB", "en")
        self.assertEqual(1, sum(e["id"] == "supply" for e in edges))


@unittest.skipUnless(os.environ.get("NEO4J_TEST_ENABLED") == "1", "Set NEO4J_TEST_ENABLED=1 with a test Neo4j connection")
class Neo4jAPITests(Neo4jFixture, APITests):
    pass


class BackendSelectionTests(unittest.TestCase):
    def test_unknown_storage_does_not_fall_back(self):
        with patch.dict(os.environ, {"KNOWLEDGE_STORAGE": "typo"}):
            with self.assertRaises(ValueError):
                create_store()

    def test_explicit_neo4j_selection_uses_adapter(self):
        marker = object()
        with patch.dict(os.environ, {"KNOWLEDGE_STORAGE": "neo4j"}), patch.object(Neo4jStore, "from_env", return_value=marker):
            self.assertIs(marker, create_store())


# Imported test classes are bases only; avoid running them twice during discovery.
del CoreTests, APITests
