import unittest
from unittest.mock import patch

from app.api.routes import providers as provider_routes
from app.chat.provider import GroqChatProvider, get_chat_provider
from app.chat.schemas import ChatRequest
from app.core.config import settings


class GroqProviderTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_chat_provider.cache_clear()

    def test_chat_request_accepts_groq_provider(self) -> None:
        payload = ChatRequest(question="How does Groq help latency?", provider="groq")
        self.assertEqual(payload.provider, "groq")

    def test_get_chat_provider_returns_groq_provider_when_configured(self) -> None:
        with (
            patch.object(settings, "groq_api_key", "test-key"),
            patch.object(settings, "groq_base_url", "https://api.groq.com/openai/v1"),
            patch.object(settings, "groq_chat_model", "llama-3.1-8b-instant"),
        ):
            provider = get_chat_provider("groq")

        self.assertIsInstance(provider, GroqChatProvider)
        self.assertEqual(provider.display_name, "groq:llama-3.1-8b-instant")

    def test_get_chat_provider_requires_key(self) -> None:
        with patch.object(settings, "groq_api_key", ""):
            with self.assertRaisesRegex(ValueError, "GROQ_API_KEY is required"):
                get_chat_provider("groq")

    def test_provider_status_helpers_reflect_groq_configuration(self) -> None:
        with patch.object(settings, "groq_api_key", ""):
            self.assertFalse(provider_routes._is_configured("groq"))
            self.assertEqual(
                provider_routes._missing_message("groq"),
                "GROQ_API_KEY is not set in the backend environment.",
            )

        with patch.object(settings, "groq_api_key", "test-key"):
            self.assertTrue(provider_routes._is_configured("groq"))
            self.assertIsNone(provider_routes._missing_message("groq"))

    def test_handle_openai_client_error_rate_limit(self) -> None:
        from app.chat.provider import _handle_openai_client_error, ProviderRequestError

        exc = Exception("Rate limit reached for model qwen/qwen3.8-27b on tokens per day (TPD): Limit 200000, Used 199462")
        err = _handle_openai_client_error("Groq", exc, is_stream=True)
        self.assertIsInstance(err, ProviderRequestError)
        self.assertEqual(err.status_code, 429)
        self.assertIn("rate limit reached (429)", str(err))

    def test_handle_openai_client_error_auth(self) -> None:
        from app.chat.provider import _handle_openai_client_error, ProviderRequestError

        exc = Exception("401 Unauthorized: Invalid API Key")
        err = _handle_openai_client_error("Groq", exc, is_stream=False)
        self.assertIsInstance(err, ProviderRequestError)
        self.assertEqual(err.status_code, 401)
        self.assertIn("authentication failed (401)", str(err))

    def test_handle_openai_client_error_generic(self) -> None:
        from app.chat.provider import _handle_openai_client_error, ProviderRequestError

        exc = Exception("Connection reset by peer")
        err = _handle_openai_client_error("Groq", exc, is_stream=True)
        self.assertIsInstance(err, ProviderRequestError)
        self.assertEqual(err.status_code, 502)
        self.assertIn("streaming request failed", str(err))


if __name__ == "__main__":
    unittest.main()
