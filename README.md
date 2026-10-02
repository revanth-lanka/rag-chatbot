# RAG Chatbot

![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.116%2B-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=0A0A0A)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![FlashRank](https://img.shields.io/badge/FlashRank-0.2-111827?logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green?logo=open-source-initiative&logoColor=white)

A full-stack Retrieval-Augmented Generation (RAG) chatbot built with FastAPI, React, PostgreSQL, and pgvector.

This project is designed as a low-latency, document-grounded chatbot for answering questions from user-provided files. It supports ingestion, chunking, embeddings, hybrid retrieval, grounded chat, streaming responses, provider switching, and optional neural reranking.

## Highlights

- **FastAPI Backend**: Async SQLAlchemy with connection pool lifecycle decoupling and structured startup
- **Modern React 18 Frontend**: Collapsible conversation sidebar, in-place session title editing, and floating glassmorphic composer
- **Real-Time Full-Stack Observability**: In-card telemetry badges for **Performance Timings** (Server TTFT, Client TTFT, Retrieval, Rerank, Gen) and granular **14-Stage Latency Waterfall** (S1–S14) on every response
- **Global Drag-and-Drop Ingestion**: Full-screen drag overlay across all views for rapid multi-file uploads (PDF, DOCX, TXT)
- **Slide-Over Document Inspector**: Deep chunk inspection drawer, extraction metadata, and one-click re-indexing
- **Interactive Citations & Timeline Scrub Deck**: Clickable citation cards with full-text chunk preview modal and conversation minimap
- **PostgreSQL 16 with pgvector & GIN Indexing**:
  - `pgvector` HNSW similarity indexing with adaptive gating for 100% recall on filtered queries
  - `pg_trgm` fuzzy matching
  - Generated and GIN-indexed `tsvector` full-text search with English stemming
- **Structured Document Parsing**: `pdfplumber` and `python-docx` preserving headings, paragraphs, and tables with 15–20% sliding-window context overlap
- **Hybrid Retrieval & Reranking**:
  - Dense vector search + sparse full-text search + GIN-accelerated lexical rescue fused via Reciprocal Rank Fusion (RRF)
  - Three reranking tiers: `Custom` (Fast Heuristic), `Hybrid`, and `Neural` (FlashRank TinyBERT with startup warmup)
- **Sub-Second Streaming Delivery**:
  - Prompt Prefix KV Attention Caching slashing TTFT across consecutive turns
  - Sub-millisecond conversational routing for pure greetings (<1 ms)
  - Direct unbuffered Server-Sent Events (SSE) with pre-generation evidence gating
- **Flexible Provider Abstraction**: Live hot-swapping between `gemini`, `groq`, `openai`, `openrouter`, and `mock` providers

## Tech Stack

### Backend

- FastAPI
- Pydantic v2
- SQLAlchemy async
- asyncpg

### Frontend

- React 18
- Vite
- framer-motion
- lucide-react

### Database

- PostgreSQL 16
- pgvector
- pg_trgm

## AI Support

### Embedding providers

- `mock`
- `local`
- `openai`
- `gemini`

### Local embedding runtimes

- `sentence_transformers`
- `onnx`

### Chat providers

- `mock`
- `openai`
- `gemini`
- `groq`
- `openrouter`

### Rerank strategies

- `fast`
- `hybrid`
- `neural`

## Current Default Runtime Profile

In the normal Docker setup used in this repo, the project is currently configured around:

- local embeddings
- ONNX runtime for local embeddings
- Groq as the default chat provider
- `neural` as the default rerank strategy (`ms-marco-TinyBERT-L-2-v2` via in-process FlashRank)

This delivers the highest factual precision by eliminating keyword-frequency bias with only ~8–12 ms CPU runtime, while still allowing live comparison against `Custom` (Fast Heuristic), `Hybrid`, and `Neural` rerank modes from the UI.

## What The App Does

### 1. Ingestion

The app can ingest:

- text sent directly to the API
- uploaded UTF-8 text-like files
- uploaded machine-readable PDF files
- uploaded DOCX files

PDF and DOCX go through a parser layer before chunking, so the app can preserve more structure such as:

- headings
- paragraphs
- list items
- table rows

### 2. Embeddings

Each chunk is embedded using the configured embedding provider and stored in PostgreSQL.

### 3. Retrieval

For chat, the app uses a hybrid retrieval path that combines:

- vector retrieval
- PostgreSQL full-text retrieval
- lexical/trigram rescue when useful

The retrieved candidates are fused and reranked before prompt construction. FlashRank can optionally be applied as a late-stage reranker through the `hybrid` and `neural` modes.

### 4. Chat

The app builds a grounded prompt from the top retrieved evidence and sends it to the selected chat provider.

It supports:

- non-streaming answers
- streaming answers via SSE
- optional document scoping
- debug metadata for development and evaluation

### 5. Low-latency design choices

The application is engineered end-to-end for sub-second responsiveness, combining foundational architectural patterns with advanced pipeline optimizations:

#### Retrieval & Database Optimization
- **Hybrid In-Database Retrieval**: Vector similarity (pgvector HNSW), sparse full-text (`tsvector`), and trigram (`pg_trgm`) matching execute directly inside PostgreSQL, eliminating external vector database network hops.
- **Adaptive Vector Retrieval Gating**: Dynamically switches between HNSW index traversal for broad corpus searches and exact cosine scanning for document-scoped searches, guaranteeing 100% recall and preventing Filtered ANN Recall Collapse.
- **In-Memory Query Embedding Cache**: A 2,048-entry LRU vector cache returns embeddings in 0.01 ms for repeated or multi-turn queries.
- **Route-Aware Targeted Retrieval**: Dynamically fetches targeted support matches for specific question types (e.g., comparisons, deadlines, calculations) rather than wastefully widening the retrieval window for every query.
- **Sliding-Window Context Overlap**: 15–20% context overlap (`chunk_overlap = 200`) in PDF/DOCX chunking to preserve inter-paragraph thought continuity without doubling storage.

#### Pipeline Routing & Concurrency
- **Zero-LLM Intent Routing**: Fast, deterministic heuristic and regex question-shape routing categorizes questions instantly without burning costly LLM roundtrips on classification.
- **Sub-Millisecond Conversational Routing**: Unambiguous social pleasantries and greetings (*"Hello"*, *"Thank you"*, *"Goodbye"*) resolve in <1 ms with zero database connection checkout and zero LLM calls.
- **Connection Pool Decoupling**: Database sessions are checked out and returned to the connection pool during the initial retrieval phase (~35 ms), completely freeing PostgreSQL connections to the pool before LLM token streaming begins.

#### Inference & Prompt Engineering
- **Prompt Prefix KV Attention Caching**: Inverted prompt layout places static formatting rules and intent policies at token index 0, allowing modern inference engines (Groq, OpenAI, vLLM) to reuse GPU KV cache states across consecutive requests and slashing Time-to-First-Token (TTFT) by up to 1.4s.
- **Direct Unbuffered Token Streaming**: Direct token delivery over Server-Sent Events (SSE) with pre-generation evidence gating, eliminating buffered output latency spikes.
- **Strict Context & Output Budgeting**: Strict prompt caps (`chat_context_max_chunks` and `chat_context_max_chars`) prevent context stuffing, while compact max-token limits ensure fast, focused answers.
- **Fast Two-Stage Reranking**: Efficient heuristic candidate pruning narrows results to Top 10 (<0.3 ms) before applying FlashRank TinyBERT cross-attention reranking with application startup warmup.

#### Full-Stack Latency Observability
- **14-Stage Latency Waterfall**: Granular instrumentation tracing the full request lifecycle from client pre-request dispatch (`S1 Pre-Req`), network upload (`S2 Net Up`), backend acceptance (`S3 Accept`), query embedding (`S5 Embed`), pgvector similarity search (`S6 Search`), cross-encoder reranking (`S7 Rerank`), prompt assembly (`S8 Prompt`), LLM handshake & first chunk (`S9 LLM TTFT`), network download (`S12 Net Down`), frontend SSE parsing (`S13 Parse`), through DOM first token render (`S14 Paint`).
- **Server TTFT vs. Client-Perceived TTFT Isolation**: Differentiates between backend first-chunk generation and client-perceived first-token paint, isolating network propagation delays from frontend layout rendering.
- **In-Card Telemetry Badges**: Real-time summary chips attached to assistant messages showing Total Duration, Server TTFT, Client TTFT, Retrieval, Rerank, and Generation times.

## Current Chat Pipeline

At a high level, chat works like this:

1. normalize the question
2. route it into a generic question shape
3. clarify if the query is too vague
4. run hybrid retrieval
5. optionally load route-specific support matches
6. optionally load neighbor chunks
7. fuse and rerank candidates
8. optionally apply FlashRank on the final prompt candidate pool depending on rerank strategy
9. budget the prompt context
10. build a compact evidence set for specialized routes
11. apply evidence and fallback checks
12. send the final prompt to the selected provider
13. return the grounded answer plus lightweight timing/source metadata

## Repository Structure

```text
backend/
  app/
    api/
    chat/
    core/
    db/
    documents/
    embeddings/
    ingestion/
    retrieval/
frontend/
  src/
docs/
```

Important docs:

- [Project Guide](docs/PROJECT_GUIDE.md)
- [RAG Architectural Decisions & Case Studies](docs/RAG_ARCHITECTURAL_DECISIONS.md)
- [Ingestion Improvements Log](docs/ingestion-improvements-log.md)
- [Retrieval Improvements Log](docs/retrieval-improvements-log.md)
- [LLM Improvements Log](docs/llm-improvements-log.md)
- [Latency Improvements Log](docs/latency-improvements-log.md)

## Main Features

### Modern Chat & Full-Stack Telemetry UI
- **Collapsible Chat Sidebar**: Multi-conversation history with session switching, in-place title editing, and deletion.
- **In-Card Performance Timings**: Real-time telemetry badges showing Total, Server TTFT, Client TTFT, Retrieval, Rerank, and Generation metrics.
- **14-Stage Latency Waterfall**: In-depth stage-by-stage latency inspection (from `S1 Pre-Req` through `S6 Search`, `S9 LLM TTFT`, down to `S14 Paint`).
- **Interactive Citations**: Clickable source badges showing document filename, chunk index, and relevance score, expanding into full-text preview cards.
- **Conversation Timeline Minimap**: Interactive scrub deck for jumping directly across turns in long chats.
- **Floating Composer & Dynamic Prompts**: Glassmorphic composer with live provider switching, rerank strategy toggles, and contextual sample prompt pills.

### Document Management & Ingestion
- **Global Drag-and-Drop Ingestion**: Full-screen drag overlay across all views for rapid PDF, DOCX, and TXT uploads.
- **Slide-Over Document Inspector**: Deep chunk inspection drawer, extraction metadata, and re-indexing controls.
- **Structured Parsing**: Structure-preserving parsing for tables, lists, and headings with 15–20% sliding-window context overlap.
- **Document Scope Filtering**: Chat against the entire library or isolate context to a specific selected document.

### Advanced RAG & Retrieval Engine
- **Hybrid Retrieval**: Fuses dense pgvector search, sparse full-text search, and GIN-accelerated lexical rescue via Reciprocal Rank Fusion (RRF).
- **Adaptive Vector Gating**: Automatically chooses HNSW indexing for broad searches and exact scanning for document-filtered queries.
- **FlashRank Neural Reranking**: Optional cross-attention reranking (`Custom`, `Hybrid`, `Neural`) with background startup warmup.
- **Prompt Prefix KV Caching**: Static prefix formatting at token index 0 for instant GPU attention cache hits.
- **Direct Unbuffered Streaming**: Low-latency token delivery over Server-Sent Events (SSE) with proxy flush hints (`X-Accel-Buffering: no`).
- **Sub-Millisecond Conversational Routing**: Zero-DB, zero-LLM routing for social greetings and pleasantries (<1 ms).
- **Duplicate Detection & Re-Embedding**: Hash-based duplicate protection and on-demand re-embedding endpoints.

## API Overview

### Health

- `GET /health`
- `GET /ready`

### Provider Status

- `GET /providers/status`

### Documents

- `GET /documents`
- `GET /documents/{document_id}`
- `DELETE /documents/{document_id}`
- `POST /documents/ingest/text`
- `POST /documents/ingest/file`
- `POST /documents/{document_id}/embeddings?force=true|false`

### Retrieval

- `POST /retrieval/search`

### Chat

- `POST /chat/ask`
- `POST /chat/stream`

### OpenAPI

- `GET /api/v1/docs`
- `GET /api/v1/redoc`
- `GET /api/v1/openapi.json`

## Quick Start

### 1. Create your local env file

From the repository root:

```bash
# Linux / macOS
cp backend/.env.example backend/.env

# Windows (PowerShell)
Copy-Item backend\.env.example backend\.env
```

Then edit `backend/.env` and add any provider keys you want to use.

Important:

- do not commit `backend/.env`
- for local embeddings, no hosted embedding key is required
- for real chat with Groq, set `GROQ_API_KEY`

### 2. Start with Docker Compose

From the repository root:

```bash
docker compose --env-file backend/.env up --build
```

### 3. Open the App

- Frontend chat: `http://localhost:3000/chat`
- Frontend documents: `http://localhost:3000/documents`
- Backend docs: `http://localhost:8000/api/v1/docs`

### 4. Basic Flow

1. open `/documents`
2. upload a text, PDF, or DOCX document (sample files provided in [sample_documents/](sample_documents/))
3. optionally select a document scope
4. open `/chat`
5. ask a grounded question
6. optionally compare `Custom`, `Hybrid`, and `Neural` rerank modes from Advanced options

## Environment Notes

See [backend/.env.example](backend/.env.example) for the current configuration template.

The most important environment variables are:

- Core app settings:
  - `APP_ENV`: runtime environment such as `development`
  - `API_V1_PREFIX`: API prefix for docs and routes
- Database:
  - `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`: PostgreSQL connection settings
- Embeddings:
  - `EMBEDDING_PROVIDER`: `local`, `mock`, `openai`, or `gemini`
  - `LOCAL_EMBEDDING_RUNTIME`: `onnx` or `sentence_transformers`
  - `LOCAL_EMBEDDING_MODEL`: local embedding model id
  - `LOCAL_EMBEDDING_ONNX_MODEL_DIR`: cache path for ONNX artifacts
- Chat:
  - `CHAT_PROVIDER`: default chat provider
  - `CHAT_MAX_OUTPUT_TOKENS`: output cap for generated answers
  - `CHAT_TEMPERATURE`: chat generation temperature
- Retrieval:
  - `RETRIEVAL_MODE`: `exact` or `ann_rerank`
  - `CHAT_RETRIEVAL_FETCH_K`: wider chat candidate pool before prompt budgeting
  - `CHAT_CONTEXT_MAX_CHUNKS`, `CHAT_CONTEXT_MAX_CHARS`, `CHAT_CONTEXT_PER_CHUNK_MAX_CHARS`: prompt-context limits
  - `CHAT_RRF_K`: reciprocal rank fusion constant
- Reranking:
  - `CHAT_RERANK_STRATEGY_DEFAULT`: server default rerank strategy
  - `FLASHRANK_ENABLED`: enables FlashRank-backed reranking modes
  - `FLASHRANK_MODEL`: FlashRank model id
  - `FLASHRANK_NEURAL_TOP_N`: candidate count used in `neural` mode
  - `FLASHRANK_HYBRID_TOP_N`: candidate count used in `hybrid` mode
- Provider API keys:
  - `OPENAI_API_KEY`
  - `GEMINI_API_KEY`
  - `GROQ_API_KEY`
  - `OPENROUTER_API_KEY`

Recommended minimal setup for this repo:

- `EMBEDDING_PROVIDER=local`
- `LOCAL_EMBEDDING_RUNTIME=onnx`
- `CHAT_PROVIDER=groq`
- `GROQ_API_KEY=...`
- `CHAT_RERANK_STRATEGY_DEFAULT=neural`
- `CHAT_MIN_TOP_SIMILARITY_SCORE=0.40`

## Testing

Unit tests live in `backend/tests/unit`.

The repository includes unit coverage for:

- routing and guardrails
- retrieval behavior
- sparse and lexical helpers
- parser and chunker logic
- startup and readiness behavior
- schema preparation
- provider integration seams
- FlashRank reranking behavior

Run from `backend/`:

```bash
# Linux / macOS
python -m unittest discover -s tests/unit

# Windows
.\.venv\Scripts\python.exe -m unittest discover -s tests/unit
```

Provider note:

- provider implementations exist for OpenAI, Gemini, Groq, and OpenRouter
- live behavior for hosted providers still depends on your own API keys, quota, and model access
- local embeddings can be run fully offline once the model/runtime artifacts are available

## Enterprise Architecture & Scaling Roadmap

The application is intentionally engineered with a lean, single-instance architecture to minimize operational complexity and cloud infrastructure overhead while delivering sub-second latency. For high-concurrency enterprise deployments, the system is designed to scale horizontally across the following dimensions:

### 1. Asynchronous Ingestion & Distributed Worker Pools (Celery / ARQ / Redis)
- **Current Architecture**: Document parsing, text chunking, and embedding generation execute asynchronously within the FastAPI event loop—ideal for immediate ingestion of standard documents with zero external message broker overhead.
- **Enterprise Scaling Path**: Offload heavy document extraction and batch vectorization to background worker pools (Celery, ARQ, or Redis Streams) with Redis-backed task status polling, Webhook notifications, and auto-scaling GPU workers for high-volume batch ingestion.

### 2. Semantic Query Caching (Distributed Redis Vector Cache)
- **Current Architecture**: An in-memory LRU embedding cache (`_QUERY_EMBEDDING_CACHE`) and Prompt Prefix KV Caching provide immediate sub-millisecond retrieval and rapid generation without external state.
- **Enterprise Scaling Path**: Deploy a distributed semantic cache using Redis Vector Search or pgvector approximate cosine matching at high similarity thresholds ($\ge 0.96$). Semantically identical queries bypass inference entirely with automatic TTL cache invalidation on document modifications.

### 3. Database Read Replicas & Connection Pooling (PgBouncer)
- **Current Architecture**: Asynchronous SQLAlchemy connection pooling (`AsyncSessionLocal`) with automatic pre-streaming connection checkout and release.
- **Enterprise Scaling Path**: Separate read-heavy vector similarity queries from write transactions using PostgreSQL read replicas fronted by PgBouncer in transaction-pooling mode to support thousands of concurrent chat sessions.

### 4. Multi-Tenancy & Role-Based Access Control (RBAC)
- **Current Architecture**: Document-level scoping and global corpus retrieval with clean repository abstractions.
- **Enterprise Scaling Path**: Enforce PostgreSQL Row-Level Security (RLS) on `documents` and `chunks` partitioned by `tenant_id` and `user_role`, backed by JWT/OAuth2 authentication middleware for enterprise data isolation.

### 5. Multimodal & OCR Document Pipelines
- **Current Architecture**: High-precision structured parsing for machine-readable PDF, DOCX, and raw text using `pdfplumber` and `python-docx` with sliding-window block context overlap.
- **Enterprise Scaling Path**: Integrate OCR extraction services (Tesseract, AWS Textract, or Docling) as an optional preprocessing stage for scanned image PDFs and non-text formats.

## Why This Project Is Useful

This repo is a practical learning and portfolio project for:

- RAG fundamentals
- full-stack AI app architecture
- document ingestion pipelines
- vector search with PostgreSQL
- prompt orchestration and grounded chat
- provider abstraction across different model vendors

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
