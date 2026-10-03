import unittest
from knowledge_core.service import KnowledgeService
from knowledge_core.types import Principal, APIError

class FakeStore:
    backend = "sqlite"

class FakeProvider:
    chat_model = "test-graph"
    def propose_graph(self, document, instruction=""):
        return {
            "entities": [
                {"key":"supplier-a","label":"Supplier A","type":"supplier","aliases":[],"quote":"Supplier A supplies Site B.","confidence":0.98},
                {"key":"site-b","label":"Site B","type":"site","aliases":[],"quote":"Supplier A supplies Site B.","confidence":0.97}
            ],
            "edges": [
                {"source":"supplier-a","relation":"supplies","target":"site-b","quote":"Supplier A supplies Site B.","confidence":0.96}
            ]
        }, {"input_tokens":20,"output_tokens":30}

class GraphProposalTests(unittest.TestCase):
    def setUp(self):
        self.principal = Principal("generic","tenant-a",("docs",),("ingest",),"test")
        self.service = KnowledgeService(FakeStore(), FakeProvider())

    def test_source_grounded_graph_proposal_requires_review(self):
        out = self.service.propose_graph(self.principal, {
            "collection":"docs","document_id":"doc-1","document_revision":1,
            "title":"Supplier note","text":"Supplier A supplies Site B.",
            "jurisdiction":"GB","language":"en"
        })
        self.assertEqual(out["status"], "review_required")
        self.assertFalse(out["automatic_promotion"])
        self.assertEqual(out["edges"][0]["relation"], "supplies")

    def test_rejects_quote_not_in_source(self):
        class BadProvider(FakeProvider):
            def propose_graph(self, document, instruction=""):
                data, usage = super().propose_graph(document, instruction)
                data["edges"][0]["quote"] = "Invented evidence"
                return data, usage
        service = KnowledgeService(FakeStore(), BadProvider())
        with self.assertRaises(APIError):
            service.propose_graph(self.principal, {
                "collection":"docs","document_id":"doc-1","document_revision":1,
                "title":"Supplier note","text":"Supplier A supplies Site B."
            })

if __name__ == "__main__":
    unittest.main()
