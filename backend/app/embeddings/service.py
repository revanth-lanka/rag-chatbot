import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Chunk, Document
from app.embeddings.provider import EmbeddingProviderError, get_embedding_provider
from app.embeddings.schemas import EmbeddingGenerationResponse

from collections import OrderedDict

logger = logging.getLogger(__name__)

_QUERY_EMBEDDING_CACHE: OrderedDict[tuple[str, str, str], list[float]] = OrderedDict()
_QUERY_EMBEDDING_CACHE_MAX_SIZE = 2048


class DocumentEmbeddingService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.provider = get_embedding_provider(
            provider_name=settings.embedding_provider,
            vector_size=settings.vector_size,
        )

    async def generate_embeddings(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        # Fast path: check in-memory LRU cache for single query embeddings
        if len(texts) == 1:
            cache_key = (self.provider.provider_name, self.provider.model_name, texts[0].strip())
            cached = _QUERY_EMBEDDING_CACHE.get(cache_key)
            if cached is not None:
                _QUERY_EMBEDDING_CACHE.move_to_end(cache_key)
                return [list(cached)]

        batches = self._build_embedding_batches(texts)
        all_embeddings: list[list[float]] = []

        for batch_index, batch in enumerate(batches, start=1):
            logger.info(
                "Generating embedding batch %s/%s with %s chunk(s) using %s.",
                batch_index,
                len(batches),
                len(batch),
                self.provider.display_name,
            )
            embeddings = await self.provider.embed_texts(batch)
            if len(embeddings) != len(batch):
                raise EmbeddingProviderError(
                    "The embedding provider returned a different number of vectors than requested.",
                )
            all_embeddings.extend(embeddings)

        if len(texts) == 1 and all_embeddings:
            cache_key = (self.provider.provider_name, self.provider.model_name, texts[0].strip())
            _QUERY_EMBEDDING_CACHE[cache_key] = all_embeddings[0]
            _QUERY_EMBEDDING_CACHE.move_to_end(cache_key)
            if len(_QUERY_EMBEDDING_CACHE) > _QUERY_EMBEDDING_CACHE_MAX_SIZE:
                _QUERY_EMBEDDING_CACHE.popitem(last=False)

        return all_embeddings

    def build_embedding_metadata(self) -> dict[str, object]:
        return {
            "embedding_provider": self.provider.provider_name,
            "embedding_model": self.provider.model_name,
            "embedding_dimensions": self.provider.dimensions,
        }

    async def embed_document_chunks(
        self,
        document_id: int,
        *,
        force: bool = False,
    ) -> EmbeddingGenerationResponse:
        document = await self._get_document(document_id)
        if document is None:
            raise LookupError("Document not found.")

        chunks = await self._get_document_chunks(document_id)
        if not chunks:
            raise ValueError("Document has no chunks to embed.")

        target_chunks = chunks if force else [chunk for chunk in chunks if chunk.embedding is None]
        skipped_chunks = 0 if force else len(chunks) - len(target_chunks)

        if not target_chunks:
            return EmbeddingGenerationResponse(
                document_id=document.id,
                filename=document.filename,
                total_chunks=len(chunks),
                embedded_chunks=0,
                skipped_chunks=skipped_chunks,
                message="All chunks already have embeddings.",
            )

        try:
            embeddings = await self.generate_embeddings([chunk.chunk_text for chunk in target_chunks])
            embedding_metadata = self.build_embedding_metadata()

            for chunk, embedding in zip(target_chunks, embeddings):
                chunk.embedding = embedding
                chunk.chunk_metadata = {
                    **chunk.chunk_metadata,
                    **embedding_metadata,
                }

            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        logger.info(
            "Stored embeddings for %s chunks of document %s using %s.",
            len(target_chunks),
            document.id,
            self.provider.display_name,
        )

        return EmbeddingGenerationResponse(
            document_id=document.id,
            filename=document.filename,
            total_chunks=len(chunks),
            embedded_chunks=len(target_chunks),
            skipped_chunks=skipped_chunks,
            message=(
                "Embeddings generated and stored successfully."
                if not force
                else "Embeddings regenerated and stored successfully."
            ),
        )

    async def _get_document(self, document_id: int) -> Document | None:
        statement = select(Document).where(Document.id == document_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def _get_document_chunks(self, document_id: int) -> list[Chunk]:
        statement = (
            select(Chunk)
            .where(Chunk.document_id == document_id)
            .order_by(Chunk.chunk_index)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    def _build_embedding_batches(self, texts: list[str]) -> list[list[str]]:
        batch_size = self.provider.preferred_request_batch_size or settings.embedding_batch_size
        return [texts[index:index + batch_size] for index in range(0, len(texts), batch_size)]
