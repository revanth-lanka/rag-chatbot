import unittest
from unittest.mock import AsyncMock, patch

from app.chat.guardrails import (
    QUERY_INTENT_CHITCHAT,
    route_query,
)
from app.chat.schemas import ChatRequest
from app.chat.service import ChatService
from app.core.config import settings
from app.ingestion.chunker import split_parsed_document_into_chunks
from app.ingestion.parsers import ParsedBlock, ParsedDocument
from app.retrieval.schemas import RetrievalRequest
from app.retrieval.service import RetrievalService


class Tier2RefinementTests(unittest.IsolatedAsyncioTestCase):
    def test_chitchat_routing_greetings(self):
        for greeting in ("Hello", "hi", "hey there", "good morning", "HOWDY"):
            route = route_query(greeting)
            self.assertEqual(route.intent, QUERY_INTENT_CHITCHAT, f"Failed for {greeting}")
            self.assertIsNotNone(route.clarification_message)
            self.assertIn("documents", route.clarification_message)

    def test_chitchat_routing_pleasantries(self):
        for query in ("thank you", "thanks a lot", "bye", "goodbye", "how are you"):
            route = route_query(query)
            self.assertEqual(route.intent, QUERY_INTENT_CHITCHAT, f"Failed for {query}")
            self.assertIsNotNone(route.clarification_message)

    def test_non_chitchat_queries_not_hijacked(self):
        for question in (
            "What is the monthly premium for 2026?",
            "Who is eligible for this plan?",
            "What should I do if my doctor leaves the network?",
            "What can you do?",
            "Can you help me?",
            "Help",
            "Who are you?",
            "What services do you provide?",
        ):
            route = route_query(question)
            self.assertNotEqual(route.intent, QUERY_INTENT_CHITCHAT, f"Should not be chitchat: {question}")

    async def test_chitchat_service_stream_fast_path(self):
        service = ChatService.__new__(ChatService)
        service.session = None

        events = [
            event
            async for event in service.stream(
                ChatRequest(question="Hello", include_debug=True)
            )
        ]
        full_stream = "".join(events)
        self.assertIn('"answer_path": "chitchat"', events[0])
        self.assertIn('"context_count": 0', events[0])
        self.assertIn("documents", full_stream)

    def test_adaptive_vector_gating_scoped_document(self):
        with patch.object(settings, "retrieval_mode", "adaptive"):
            payload_scoped = RetrievalRequest(query="test", top_k=3, document_id=12)
            self.assertEqual(RetrievalService._effective_retrieval_mode(payload_scoped), "exact")

    def test_adaptive_vector_gating_unfiltered_global(self):
        with patch.object(settings, "retrieval_mode", "adaptive"):
            payload_global = RetrievalRequest(query="test", top_k=3, document_id=None)
            self.assertEqual(RetrievalService._effective_retrieval_mode(payload_global), "ann_rerank")

        with patch.object(settings, "retrieval_mode", "exact"):
            payload_global = RetrievalRequest(query="test", top_k=3, document_id=None)
            self.assertEqual(RetrievalService._effective_retrieval_mode(payload_global), "exact")

    def test_structured_chunking_with_overlap(self):
        parsed_doc = ParsedDocument(
            source_format="pdf",
            parser_name="pdfplumber",
            normalized_text="",
            blocks=[
                ParsedBlock(kind="heading", text="Section 1", heading_path=["Section 1"]),
                ParsedBlock(kind="paragraph", text=" ".join(["First paragraph content that fits in chunk."] * 6), heading_path=["Section 1"]),
                ParsedBlock(kind="paragraph", text=" ".join(["Second paragraph that triggers a split because total exceeds limit."] * 6), heading_path=["Section 1"]),
                ParsedBlock(kind="paragraph", text=" ".join(["Third paragraph following after split."] * 6), heading_path=["Section 1"]),
            ],
            parse_metadata={},
        )
        # With overlap enabled:
        chunks = split_parsed_document_into_chunks(parsed_doc, chunk_size=200, chunk_overlap=150)
        self.assertGreaterEqual(len(chunks), 2)
        # Check backward compatibility when chunk_overlap is omitted:
        chunks_default = split_parsed_document_into_chunks(parsed_doc, chunk_size=200)
        self.assertGreaterEqual(len(chunks_default), 2)


if __name__ == "__main__":
    unittest.main()
