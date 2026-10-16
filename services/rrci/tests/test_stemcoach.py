"""STEMCoach must use shared Knowledge Core scopes, not bypass them."""
import tempfile
import unittest
from pathlib import Path

from knowledge_core.profiles import PROFILES
from knowledge_core.service import KnowledgeService
from knowledge_core.store import Store
from knowledge_core.types import APIError, Principal


class StemCoachKnowledgeTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.store = Store(Path(temp.name) / "stemcoach.db")
        self.lesson = "Trigonometry: Label a Right Triangle"
        self.reader = Principal("stemcoach", "stemcoach-public", ("stemcoach-lessons",), ("query",), "stemcoach-reader")
        self.ingestor = Principal("stemcoach", "stemcoach-public", ("stemcoach-lessons",), ("ingest",), "stemcoach-ingestor")
        self.service = KnowledgeService(self.store)
        doc = {
            "collection": "stemcoach-lessons",
            "id": "lesson-triangle-diagram-labelling",
            "title": self.lesson,
            "text": "Source classification: authored unreviewed STEMCoach learning draft.\n"
                    "Lesson: Trigonometry: Label a Right Triangle.\n"
                    "Learning objective: Identify the hypotenuse.\n"
                    "Teaching note: The hypotenuse is opposite the right angle of a right triangle.",
            "source_uri": "urn:stemcoach:tutorial:triangle-diagram-labelling",
            "language": "en",
            "valid_from": "2026-10-16",
            "expected_revision": 0,
        }
        self.service.ingest(self.ingestor, doc)
        self.service.add_edge(self.ingestor, {
            "collection": "stemcoach-lessons",
            "id": "lesson-link-triangle-diagram-labelling-1",
            "source": self.lesson,
            "relation": "teaches",
            "target": "Identify the hypotenuse",
            "document_id": "lesson-triangle-diagram-labelling",
            "document_revision": 1,
            "quote": "Learning objective: Identify the hypotenuse",
        })

    def test_education_profile_does_not_claim_verified_sources(self):
        self.assertIn("stemcoach", PROFILES)
        self.assertIn("not independently exam-board-verified", PROFILES["stemcoach"].instruction)

    def test_source_grounded_hybrid_retrieval_is_evidence_only_by_default(self):
        result = self.service.query(self.reader, {
            "collection": "stemcoach-lessons", "question": "triangle hypotenuse", "mode": "hybrid",
            "seeds": [self.lesson], "hops": 2, "top_k": 4,
            "as_of": "2026-10-16", "language": "en",
        })
        self.assertEqual("evidence_only", result["status"])
        self.assertTrue(result["evidence"])
        self.assertTrue(result["graph_paths"])
        self.assertEqual("lesson-triangle-diagram-labelling", result["evidence"][0]["document_id"])
        self.assertTrue(result["review_required"])
        self.assertFalse(result["trace"]["semantic_correctness_verified"])
        valid_refs = {row["citation_id"] for row in result["evidence"]}
        self.assertTrue(all(edge["citation_id"] in valid_refs
                            for path in result["graph_paths"] for edge in path["edges"]))

    def test_other_tenant_and_other_project_cannot_read_this_collection(self):
        for project, tenant in [("stemcoach", "other-school"), ("lawquo", "stemcoach-public")]:
            outsider = Principal(project, tenant, ("stemcoach-lessons",), ("query",), "different-reader")
            result = self.service.query(outsider, {
                "collection": "stemcoach-lessons", "question": "hypotenuse triangle",
                "as_of": "2026-10-16",
            })
            self.assertEqual([], result["evidence"])
            self.assertEqual([], result["graph_paths"])

    def test_read_only_credential_cannot_ingest_or_query_other_collection(self):
        with self.assertRaises(APIError) as ctx:
            self.service.ingest(self.reader, {
                "collection": "stemcoach-lessons", "id": "forbidden", "title": "X",
                "text": "This should not be ingested.", "source_uri": "urn:stemcoach:tutorial:forbidden",
            })
        self.assertEqual(403, ctx.exception.status)
        with self.assertRaises(APIError) as ctx:
            self.service.query(self.reader, {
                "collection": "institution-private", "question": "read private data",
            })
        self.assertEqual(403, ctx.exception.status)


if __name__ == "__main__":
    unittest.main()
