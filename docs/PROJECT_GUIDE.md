# Project Guide

Last updated: 2026-04-17

This guide describes the project structure and how the app works.

Related docs:

- `docs/ingestion-improvements-log.md`
- `docs/llm-improvements-log.md`
- `docs/latency-improvements-log.md`

## 1. Project Summary

This project is a FastAPI + React retrieval-augmented generation (RAG) chatbot.
It is designed as a low-latency RAG chatbot for answering questions from user-provided documents.

The current app can:

1. ingest text, PDF, and DOCX documents
2. parse them into plain text or structured blocks
3. chunk and embed them into PostgreSQL
4. retrieve grounded evidence with a hybrid chat retrieval path
5. answer through normal and streaming chat APIs

Current project priorities:

- grounded answers from retrieved evidence
- low-latency chat behavior
- generic, question-shape-based routing
- machine-readable PDF and DOCX ingestion without OCR

## 2. Current Architecture

### Backend

- FastAPI
- Pydantic v2 + pydantic-settings
- SQLAlchemy async + asyncpg
- provider abstraction for chat and embeddings

### Database

- PostgreSQL 16
- pgvector
- pg_trgm
- Postgres full-text search using generated `tsvector`

### Frontend

- React 18 + Vite
- framer-motion
- lucide-react

### Local Development / Runtime

- Docker + Docker Compose

## 3. Providers In Use

### Embedding providers

- `mock`
- `local`
- `openai`
- `gemini`

Notes:

- `local_hash` and `sentence_transformers` are accepted as aliases/normalization inputs in config validation, but the main documented runtime choices are still `mock`, `local`, `openai`, and `gemini`.
- local embedding runtime options are:
  - `sentence_transformers`
  - `onnx`

### Chat providers

- `mock`
- `openai`
- `gemini`
- `groq`
- `openrouter`

Current configured model IDs:

- local embedding model: `sentence-transformers/all-MiniLM-L6-v2`
- OpenAI embedding model: `text-embedding-3-small`
- OpenAI chat model: `gpt-4.1-mini`
- Gemini embedding model: `gemini-embedding-001`
- Gemini chat model: `gemini-2.5-flash`
- Groq chat model: `llama-3.1-8b-instant`
- OpenRouter chat model: `openrouter/free`

Provider behavior notes:

- `EMBEDDING_PROVIDER` controls embedding generation
- `CHAT_PROVIDER` controls the default chat provider
- the frontend can override the chat provider per request
- changing the chat provider does not require re-embedding
- changing embedding provider or vector dimension usually does require re-embedding
- hosted-provider behavior depends on valid credentials, quota, and model access in your own environment

## 4. Ingestion System

Ingestion is handled in:

- [parsers.py](../backend/app/ingestion/parsers.py)
- [chunker.py](../backend/app/ingestion/chunker.py)
- [service.py](../backend/app/ingestion/service.py)

### Public ingestion endpoints

- `POST /documents/ingest/text`
- `POST /documents/ingest/file`

### Supported file inputs

- UTF-8 text-like files such as `.txt`, `.md`, `.csv`, `.json`, `.py`, `.js`, `.ts`, `.html`, `.css`
- `.pdf`
- `.docx`

### Parser routing

Current parser routing is:

- text-like UTF-8 files -> plain text path
- `.pdf` -> `pdfplumber`
- `.docx` -> `python-docx`

### Important parsing behavior

#### PDF

- PDF support is for machine-readable PDFs only
- OCR is not implemented
- low-text or scanned-style PDFs are rejected with a clean parse error
- corrupted or unreadable PDFs also return a clean parse error

#### DOCX

- DOCX parsing is local and structure-aware
- corrupted or unreadable DOCX files return a clean parse error

### Parsed block model

Parsed PDF and DOCX content is converted into structured blocks before chunking. Current block kinds include:

- `heading`
- `paragraph`
- `list_item`
- `table_row`

This matters because parsed documents do not go straight into the old raw character slicer.

### Chunking behavior

Chunking is split into two paths:

- plain text input -> boundary-aware text chunking
- parsed PDF/DOCX input -> structured block-aware chunking

Current structured chunking behavior:

- keeps heading context attached to following content
- avoids splitting table rows across chunks
- allows safe splitting of oversized parsed blocks
- coalesces small adjacent parsed chunks when possible
- filters very low-information parsed chunks before storage

Current notable structured chunking constants:

- `PARSED_SOFT_OVERFLOW_CHARS = 120`
- `MIN_PREFERRED_PARSED_CHUNK_CHARS = 160`

### Duplicate detection

Current duplicate logic is intentionally different for text and file ingestion:

- text ingestion dedupes by SHA-256 of normalized text
- file ingestion dedupes by SHA-256 of raw uploaded file bytes

This keeps file-upload duplicate behavior predictable.

### Stored chunk metadata

Structured and plain-text chunks carry metadata such as:

- source metadata:
  - `source_type`
  - `source_format`
  - `parser_name`
  - `parser_mode`
- offset metadata:
  - `start_char`
  - `end_char`
- structure metadata:
  - `heading_path`
  - `section_anchor`
  - `line_kind`
  - `sentence_offsets`
  - `table_like_row`
  - `label_value_row`
  - `table_id`
  - `row_index`
  - `page_start`
  - `page_end`
  - `block_kinds`
- embedding metadata:
  - `embedding_provider`
  - `embedding_model`
  - `embedding_dimensions`

## 5. Database Shape

Database setup is prepared in [schema.py](../backend/app/db/schema.py).

### Main tables

#### `documents`

Important fields:

- `id`
- `filename`
- `content_hash`
- `created_at`
- `updated_at`

#### `chunks`

Important fields:

- `id`
- `document_id`
- `chunk_index`
- `chunk_text`
- `embedding`
- `search_vector`
- `metadata`
- `created_at`

### Notable schema features

- `pgvector` extension
- `pg_trgm` extension
- generated `search_vector` column:
  - `to_tsvector('simple', lower(coalesce(chunk_text, '')))`
- HNSW index on `embedding` where embedding is not null
- GIN index on `search_vector`
- trigram GIN index on `lower(chunk_text)`
- unique index on `(document_id, chunk_index)`

### Vector dimension handling

On startup, the app can detect vector-dimension mismatch and recover by:

- dropping the HNSW index
- clearing embeddings
- resizing the vector column
- requiring re-embedding

## 6. Retrieval Architecture

Retrieval lives in [service.py](../backend/app/retrieval/service.py).

There are two retrieval paths:

- public retrieval search
- chat retrieval

### Public retrieval endpoint

`POST /retrieval/search`

Supported retrieval modes:

- `exact`
- `ann_rerank`

Current default:

- `exact`

Meaning:

- `exact` uses direct vector search in Postgres
- `ann_rerank` fetches ANN candidates first and reranks them with exact vector distance

### Chat retrieval flow

Chat uses `search_for_chat()` and is more advanced than the public retrieval endpoint.

Current chat retrieval flow:

1. embed the question
2. run vector retrieval
3. run sparse full-text retrieval from `search_vector`
4. optionally run lexical/trigram rescue
5. fuse the candidate lists with reciprocal rank fusion (RRF)
6. return a fused candidate pool for chat orchestration

### Low-latency retrieval and answer-shaping choices

The current retrieval and chat path is tuned for low latency through:

- small prompt context limits
- route-aware support retrieval instead of globally widening context
- Postgres-native sparse retrieval instead of adding another search service
- lexical rescue only when useful
- compact evidence trimming for specialized routes
- no extra LLM call for routing

### Support retrieval and neighbor expansion

The chat orchestration layer can request extra support matches for routed question shapes.

Current support loaders exist for:

- comparison
- responsibility
- deadline
- inclusion / exclusion
- calculation method
- process explanation
- broad summary

Neighbor expansion also exists:

- same-document `chunk_index +/- 1`
- used only on selected routed paths

### Current reranking reality

The app now has both custom and model-based chat reranking, but only at the chat prompt-candidate stage.

Current reranking layers:

1. RRF fusion in retrieval
2. a lightweight generic custom reranker in [service.py](../backend/app/chat/service.py)
3. optional FlashRank late-stage reranking in [reranker.py](../backend/app/chat/reranker.py)

The current custom reranker uses general signals such as:

- lexical term overlap
- phrase overlap
- support-source metadata
- generic structural cues:
  - `table_like_row`
  - `label_value_row`
  - heading presence
- fused `RRF` score
- vector similarity score

Important note:

- FlashRank is optional and chat-only
- it is applied after candidate fusion/support merging and before prompt budgeting
- current strategies are:
  - `fast` backend strategy / `Custom` UI label
  - `hybrid`
  - `neural`
- the current server default strategy is `hybrid`

## 7. Chat Flow

Main orchestration is in [service.py](../backend/app/chat/service.py).

Current high-level chat flow:

1. normalize the question
2. route the question into a generic intent/subtype
3. if the query is too vague or fragmentary, clarify before retrieval
4. run hybrid chat retrieval
5. optionally load support matches and neighbors
6. fuse and rerank prompt candidates
7. budget prompt context
8. for specialized routes, build compact evidence matches
9. run evidence-signature checks
10. if evidence is weak:

- `broad_summary` -> clarify
- other specialized route -> safety-valve fallback to the normal fact path

11. apply low-confidence fallback logic
12. call the selected LLM provider when the answer path is `llm`
13. run final answer-policy cleanup

Streaming and non-streaming share the same preparation path first.

## 8. Guardrails And Routing

Routing and guardrails live in [guardrails.py](../backend/app/chat/guardrails.py).

### Query normalization

Current normalization includes:

- lowercase normalization for routing
- whitespace collapsing
- smart quote cleanup
- small generic typo replacements such as:
  - `cant -> can't`
  - `doesnt -> doesn't`
  - `dont -> don't`
  - `whats -> what's`
- `U.S.` normalization to `united states`

### Clarification guardrails

The app clarifies instead of retrieving when the query is too fragmentary or too vague.

Examples of clarify-first behavior:

- empty prompts
- deictic fragments such as `what is this`
- filler prompts such as `by the way`
- many single-word vague prompts
- very short broad-topic prompts

Current clarification response:

- `Could you say a bit more about what you want to know?`

### Current routed intents

Routing is question-shape-based and currently uses these generic intents:

- `clarify_fragment`
- `definition`
- `comparison`
- `responsibility`
- `deadline`
- `inclusion_exclusion`
- `calculation_method`
- `process_explanation`
- `broad_summary`
- `default_fact`

### Current routed subtypes

Current subtypes include:

- `deadline_fast`
- `deadline_standard`
- `responsibility`
- `process_explanation`
- `calculation`
- `list_includes`
- `list_excludes`
- `requirement`
- `overview`

### Current routing philosophy

The routing layer is designed to stay generic.

Examples:

- "difference between X and Y" -> `comparison`
- "who is responsible for ..." -> `responsibility`
- "how long" / "how fast" -> `deadline`
- "included / excluded / covered / required / free" -> `inclusion_exclusion`
- "how does X work" / "what happens if" -> `process_explanation`
- "tell me about ..." -> `broad_summary`

It is not a semantic classifier and it does not use an extra LLM call for routing.
It is a rule-based routing layer built from generic regex and pattern matching.

## 9. Specialized Answering Layer

Answer shaping and evidence logic live in [answering.py](../backend/app/chat/answering.py).

### Current state of the local composer

There is composer scaffolding in the codebase, but it is effectively disabled right now.

Specifically:

- `is_composer_allowed(...)` currently returns `False`
- `compose_answer(...)` currently returns `None`

That means the live system is not relying on deterministic local answer composition for normal answers.

### Compact evidence building

Specialized routes still use compact evidence selection.

That logic:

- trims matches to more relevant fragments
- preserves structured fact rows when needed
- adds `cue_hits` metadata for debugging and routing support

### Evidence-signature checks

Specialized routes still require evidence-shape checks before the system trusts the routed path.

Examples:

- deadline routes require a real time phrase
- responsibility routes require responsibility wording
- calculation routes require method/basis wording
- inclusion/exclusion routes require polarity or requirement wording
- broad-summary routes require stronger overview-style evidence

## 10. Answer Policy

Client-facing answer-policy cleanup is also handled in [answering.py](../backend/app/chat/answering.py).

The answer policy rejects or sanitizes answers that leak internal document structure.

Patterns rejected include things like:

- `Section 5.3`
- `Chapter 4`
- `page 10`
- `Source 1`
- `chunk 12`
- `provided excerpts`
- `provided context`
- `in this document`

If a generated answer violates policy:

- `broad_summary` can clarify instead
- otherwise the system falls back to:
  - `I don't have enough information to answer that right now.`

## 11. Prompting

Prompt building lives in [prompt_builder.py](../backend/app/chat/prompt_builder.py).

Current prompting structure:

- one system prompt from config
- one per-request user prompt containing:
  - document excerpts
  - the question
  - generic style rules
  - small route-specific prompt hints

Current route-specific prompt hints exist for:

- comparison
- responsibility
- deadline
- inclusion / exclusion
- calculation
- process
- overview

Prompting is supportive, not the primary correctness layer.

Today, correctness depends more on:

- retrieval quality
- support retrieval
- evidence checks
- reranking
- fallback behavior

## 12. API Surface

### Health and readiness

- `GET /health`
- `GET /ready`

### Provider status

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

## 13. Frontend Behavior

Main frontend files for chat are:

- [ChatPage.jsx](../frontend/src/pages/ChatPage.jsx)
- [ChatTranscript.jsx](../frontend/src/components/ChatTranscript.jsx)

Current frontend behavior includes:

- two main pages:
  - `/chat`
  - `/documents`
- chat provider picker
- rerank mode picker
- response mode switch
- document-scope selection
- streaming SSE support
- metadata chips for:
  - selected provider / answer origin
  - whether a provider was actually used
  - answer path
  - retrieval / rerank / preparation / streaming timing
- source chips showing:
  - filename
  - chunk index
  - score

Current answer-origin behavior:

- provider answer -> selected provider name
- clarification path -> `Clarification`
- no-provider fallback -> `No provider call`

Because composer is disabled, `Local composer` is not the normal live answer path.

## 14. Important Configuration

Config lives in [config.py](../backend/app/core/config.py).

### Current notable defaults

- `VECTOR_SIZE = 384`
- `RETRIEVAL_MODE = exact`
- `CHAT_MAX_OUTPUT_TOKENS = 300`
- `CHAT_TEMPERATURE = 0.0`
- `CHAT_RETRIEVAL_FETCH_K = 10`
- `CHAT_RERANK_STRATEGY_DEFAULT = hybrid`
- `CHAT_CONTEXT_MAX_CHARS = 2400`
- `CHAT_CONTEXT_MAX_CHUNKS = 3`
- `CHAT_CONTEXT_PER_CHUNK_MAX_CHARS = 900`
- `CHAT_RRF_K = 60`
- `CHAT_MIN_TOP_SIMILARITY_SCORE = 0.45`
- `CHAT_HIGH_CONFIDENCE_TOP_SIMILARITY_SCORE = 0.75`
- `CHAT_MIN_AVERAGE_SIMILARITY_SCORE = 0.4`
- `CHAT_AVERAGE_SIMILARITY_TOP_N = 3`
- `CHAT_QUERY_SPELLING_CUTOFF = 0.88`
- `CHAT_LEXICAL_RESCUE_ENABLED = true`
- `CHAT_LEXICAL_RESCUE_K = 5`

### Current provider defaults

- config defaults:
  - `EMBEDDING_PROVIDER = mock`
  - `CHAT_PROVIDER = mock`
- normal Docker/runtime profile in this repo:
  - `EMBEDDING_PROVIDER = local`
  - `CHAT_PROVIDER = groq`
  - `CHAT_RERANK_STRATEGY_DEFAULT = hybrid`

### Current local embedding defaults

- model: `sentence-transformers/all-MiniLM-L6-v2`
- runtime: `sentence_transformers`
- device: `cpu`
- supported runtimes:
  - `sentence_transformers`
  - `onnx`
- ONNX model directory setting:
  - `LOCAL_EMBEDDING_ONNX_MODEL_DIR`

### Current chat provider models

- OpenAI: `gpt-4.1-mini`
- Gemini: `gemini-2.5-flash`
- Groq: `llama-3.1-8b-instant`
- OpenRouter: `openrouter/free`

## 15. Setup And Run

### Docker

From repo root:

```powershell
docker compose --env-file backend/.env up --build
```

or:

```powershell
docker compose up --build
```

### Key URLs

- frontend chat: `http://localhost:3000/chat`
- frontend documents: `http://localhost:3000/documents`
- backend health: `http://localhost:8000/health`
- backend ready: `http://localhost:8000/ready`
- backend docs: `http://localhost:8000/api/v1/docs`

## 16. Testing

Unit tests live in `backend/tests/unit`.

Current test coverage includes:

- chat routing and guardrails
- retrieval logic
- sparse and lexical retrieval helpers
- parser and chunker behavior
- startup and readiness behavior
- schema preparation
- provider integration seams

Provider note:

- the repo includes implementations for OpenAI, Gemini, Groq, and OpenRouter
- live validation for hosted providers still depends on local API keys, quota, and model availability

Latest verified status in this workspace:

- focused suite: `66` tests, `OK`
- full unit suite: `115` tests, `OK`

Run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests/unit
```

## 17. Current Limitations

- OCR/scanned PDF ingestion is not supported
- ingestion is synchronous
- there is no background worker queue yet
- there is no migration framework yet; schema setup is startup-managed SQL
- there is no auth or multi-tenant access control
- there is no persistent multi-turn memory layer in the backend
- FlashRank is only a late-stage chat reranker, not a full retrieval replacement
- default rerank quality still depends on document shape and benchmarked question sets
- the system works best when:
  - parsing is clean
  - the right chunk enters the retrieval candidate pool
- if retrieval misses the correct chunk entirely, reranking cannot recover it

## 18. Suggested Reading Order

For understanding the current codebase, this is a good reading order:

1. [main.py](../backend/app/main.py)
2. [chat.py](../backend/app/api/routes/chat.py)
3. [parsers.py](../backend/app/ingestion/parsers.py)
4. [chunker.py](../backend/app/ingestion/chunker.py)
5. [service.py](../backend/app/ingestion/service.py)
6. [service.py](../backend/app/retrieval/service.py)
7. [guardrails.py](../backend/app/chat/guardrails.py)
8. [answering.py](../backend/app/chat/answering.py)
9. [prompt_builder.py](../backend/app/chat/prompt_builder.py)
10. [service.py](../backend/app/chat/service.py)
11. [service.py](../backend/app/documents/service.py)
12. [ChatPage.jsx](../frontend/src/pages/ChatPage.jsx)
13. [ChatTranscript.jsx](../frontend/src/components/ChatTranscript.jsx)

## 19. Practical Current State

The current app includes:

- parser-backed ingestion is live
- PDF and DOCX structured parsing is live
- hybrid chat retrieval is live
- question-shape routing is live
- answer leakage policy is live
- custom reranking is live
- optional FlashRank reranking is live
- deterministic local composer is scaffolded but disabled
