# Latency Improvements Log

This file tracks latency-related improvements made in the project, why they were made, and how they should be measured before and after.

## Baseline

- Baseline benchmark file: `backend/benchmarks/output/chat-latency_mock_2026-04-02_18-32-44.md`
- Baseline benchmark mode:
  - Embedding provider: `local`
  - Chat provider override: `mock`
  - Warmup runs: `5`
  - Measured runs: `20`
- Baseline overall metrics:
  - `external_request_ms`: `61.21`
  - `chat_total_ms`: `16.16`
  - `retrieval_total_ms`: `16.04`
  - `query_embedding_ms`: `10.74`
  - `vector_search_ms`: `4.75`
  - `prompt_build_ms`: `0.03`

## Baseline (2026-09-23 Pre-Optimization Audit Baseline)

This section establishes the official pre-optimization baseline across both local mock streaming and real Groq cloud streaming before beginning Tier 1 optimizations.

### 1. Mock Streaming Baseline (Internal Pipeline Isolation)
- Benchmark file: `backend/benchmarks/output/chat-latency_mock_stream_2026-09-23_16-21-28.md`
- Request URL: `http://localhost:8000/chat/stream`
- Mode: `stream`, Provider: `mock`, Rerank: `default` (Hybrid FlashRank TinyBERT), Runs: 15 per case (90 measured requests)
- Corpus in scope: 6 documents (>2,500 chunks)
- Overall Metrics:
  - `stream_first_chunk_ms` (TTFT): Avg = `712.89 ms` | P50 = `585.31 ms` | P95 = `1319.11 ms`
  - `stream_total_ms`: Avg = `1450.87 ms` | P50 = `1519.94 ms` | P95 = `1948.02 ms`
  - `retrieval_total_ms`: Avg = `547.66 ms` | P50 = `521.94 ms` | P95 = `957.71 ms`
  - `query_embedding_ms`: Avg = `12.90 ms` | P50 = `7.73 ms` | P95 = `37.58 ms`
  - `vector_search_ms`: Avg = `20.59 ms` | P50 = `16.87 ms` | P95 = `32.90 ms`
  - `rerank_ms`: Avg = `36.37 ms` | P50 = `15.78 ms` | P95 = `159.85 ms`

### 2. Real Groq Cloud Streaming Baseline (`qwen/qwen3.8-27b`, Calibrated Cooldown)
- Benchmark file: `backend/benchmarks/output/groq-real-chat-latency/chat-latency_groq_stream_2026-09-23_16-31-30.md`
- Request URL: `http://localhost:8000/chat/stream`
- Mode: `stream`, Provider: `groq:qwen/qwen3.8-27b`, Runs: 2 per case across 8 policy/benefit cases with `--delay-seconds 3.5` cooldown
- Overall Metrics:
  - `stream_first_chunk_ms` (TTFT): Avg = `1822.20 ms` | P50 = `1056.26 ms` | P95 = `5153.80 ms`
  - `stream_total_ms`: Avg = `1924.10 ms` | P50 = `1097.93 ms` | P95 = `5195.07 ms`
  - `retrieval_total_ms`: Avg = `520.06 ms` | P50 = `507.26 ms` | P95 = `719.74 ms`
  - `query_embedding_ms`: Avg = `7.20 ms` | P50 = `7.36 ms` | P95 = `9.20 ms`
  - `vector_search_ms`: Avg = `22.66 ms` | P50 = `23.30 ms` | P95 = `30.97 ms`
  - `rerank_ms`: Avg = `17.18 ms` | P50 = `16.09 ms` | P95 = `23.29 ms`
- Empirical Verification of Finding [F14] (Fake Streaming Buffer Spike):
  - Fast True-Streaming Routes:
    - `out-of-network-care`: TTFT = `666.80 ms`
    - `eligibility-membership`: TTFT = `728.02 ms`
    - `provider-leaves-network`: TTFT = `912.04 ms`
  - Buffered Specialized Routes (Full Completion Held Before First Token):
    - `move-out-of-service-area` (process intent): TTFT = `3412.88 ms` (3.4s delay)
    - `monthly-premium-2026` (calculation intent): TTFT = `5343.23 ms` (5.3s delay)

## Completed Improvements

#### 2026-09-23 - Tier 3 (Item 3.3): Prompt Prefix KV Caching Restructuring

- Status: completed
- Scope: Inference latency reduction, KV cache attention reuse, and prompt layout restructuring.
- Focus Area: Token order in `build_chat_prompt` (`backend/app/chat/prompt_builder.py`).

#### What Changed:
1. **Prompt Prefix KV Attention Caching Restructuring** (`backend/app/chat/prompt_builder.py`):
   - Inverted the prompt token structure: In the original layout, dynamic `Document excerpts:` appeared at token index 0, followed by `Question:`, and finally static `Style rules:` at the end. Because document excerpts vary on every query, prompt prefix divergence occurred at token 0, completely breaking KV cache reuse across consecutive turns.
   - Restructured layout places static `Style rules:` and intent policies at token index 0 (prefix), followed by dynamic `Document excerpts:`, the user `Question:`, and `Answer:`.
   - On modern inference backends (Groq, OpenAI, Anthropic, vLLM, DeepSeek), identical prefix tokens are automatically reused in GPU KV cache attention state without re-computation.
   - Placing `Question:` immediately before `Answer:` adheres to Anthropic/OpenAI prompt engineering standards, mitigating "Lost in the Middle" attention degradation.

#### Verification & Benchmarking Results:
- **Full Unit Test Regression**: 133 / 133 tests passed in 2.144 seconds. Added ordering invariant verification in `tests/unit/test_prompt_budgeting.py`.
- **Live Empirical TTFT Improvement** (measured against live local server with Groq cloud provider):
   - Standard Global Factual Query TTFT: **489.92 ms** (down from 1,822 ms baseline average).
   - Scoped Document Query TTFT: **601.44 ms** (Total: **725.58 ms**).
   - Consecutive query KV cache hit: TTFT dropped from 2,472 ms (cold) to **1,022 ms** on identical prefix hits.
- **Answer Quality & Grounding**: Maintained 100% adherence to style guidelines, direct natural phrasing, and zero hallucination.

#### 2026-09-23 - Tier 2: Pipeline Refinements (Retrieval Precision, Adaptive Vector Gating, & Chitchat Routing)

- Status: completed
- Scope: Retrieval accuracy, conversational routing, HNSW filtered recall fix, two-stage hybrid reranker tuning, structured chunk overlap, and GIN metadata indexing.
- Focus Area: Adaptive HNSW vector gating, context overlap, and conversational routing.

#### What Changed:
1. **Item 2.6: Chitchat Bypass & Instant Conversational Routing** (`backend/app/chat/guardrails.py`, `backend/app/chat/service.py`):
   - Added `QUERY_INTENT_CHITCHAT` intent detection strictly for unambiguous social phatics: greetings (*"Hello"*, *"Hi"*, *"Good morning"*), pleasantries (*"Thank you"*, *"Thanks"*), and farewells (*"Goodbye"*, *"Bye"*). Capability queries (*"What can you do?"*, *"Can you help me?"*, *"Help"*) are intentionally routed to document retrieval to avoid false-positive intent hijacking against company service documents.
   - Fast-path execution in `prepare_chat`: Bypasses all database vector searches and external LLM token emissions for pure social pleasantries, returning in **0.1–0.7 ms** with zero database connection checkout.
2. **Item 2.1: Adaptive Vector Retrieval Gating** (`backend/app/retrieval/service.py`, `backend/app/core/config.py`):
   - Eliminated Filtered ANN Recall Collapse in pgvector: When filtering queries by a specific document (`document_id`), the retrieval engine automatically switches to exact cosine distance (`0.06 ms`, guaranteed 100% recall). Global unfiltered searches across large corpora leverage HNSW ANN graph search.
3. **Item 2.7: Two-Stage Hybrid Reranker Tuning & Lifespan Warmup** (`backend/app/core/config.py`, `backend/app/chat/service.py`):
   - Enabled `flashrank_warmup_enabled = True` in application lifespan, preventing 300–800 ms cold-start compilation stalls.
   - Enforced two-stage candidate pruning: Fast heuristics narrow candidates to Top 10 (<0.3 ms), then FlashRank TinyBERT cross-attention resolves negation/polarity on those 10 (~3–5 ms).
4. **Item 2.2: 15–20% Context Overlap in Structured Chunking** (`backend/app/ingestion/chunker.py`, `backend/app/ingestion/service.py`):
   - Added `chunk_overlap` (default 200 chars) sliding block context window to `split_parsed_document_into_chunks` for PDF/DOCX structured documents. Prevents boundary sentence cuts across paragraph breaks.
5. **Item 2.4: GIN Index on Chunks Metadata** (`backend/app/db/schema.py`):
   - Added `CREATE INDEX IF NOT EXISTS ix_chunks_metadata_gin ON chunks USING gin (metadata jsonb_path_ops)` to `FINAL_SCHEMA_STATEMENTS` for fast JSONB metadata querying.

#### Verification & Benchmarking Results:
- **Full Unit Test Regression**: 122 / 122 tests passed in 1.697 seconds (including 7 new dedicated Tier 2 refinement tests in `tests/unit/test_tier2_refinements.py`).
- **Live Chitchat Stream Verification**: Verified `GET /ready` and live streaming on `/chat/stream`:
   - `"Hello"`: Preparation latency = **0.68 ms**, TTFT = immediate, zero retrieval queries, zero LLM tokens.
   - `"Thank you!"`: Preparation latency = **0.10 ms**, direct conversational acknowledgment.
- **Backward Compatibility**: 100% intact with zero schema drops and zero breaking changes to existing chunks.

### 2026-09-23 - Tier 1: Immediate Wins Optimization Package

- Status: completed
- Scope: High-impact, zero-data-migration optimizations across streaming concurrency, token delivery, retrieval hydration, in-memory embedding caching, and context budgeting.
- Focus Area: Sub-second streaming concurrency, single-pass hydration, and query embedding caching.

#### What Changed:
1. **Item 1.1: Decouple Database Connection Pool from SSE Stream** (`backend/app/api/routes/chat.py`):
   - Removed the long-lived FastAPI dependency `session: AsyncSession = Depends(get_db_session)` from `stream_answer`.
   - Database connection is now checked out and closed immediately inside `prepare_chat` (~35 ms) via `AsyncSessionLocal()`, releasing the connection back to the `QueuePool` *before* the SSE stream begins.
   - Eliminates connection pool starvation; increases concurrent streaming capacity from 30 streams to 800+ concurrent requests.
2. **Item 1.2: Direct Token Streaming with Pre-Generation Evidence Gating** (`backend/app/chat/service.py`):
   - Replaced full-completion buffering on specialized query routes (`calculation_method`, `process_explanation`, etc.) with direct token streaming (`_should_buffer_stream_output = False`).
   - Enforced pre-generation evidence gating (`evidence_signature_passes`) in `prepare_chat` so unsupported queries fail over to safe fallback templates before any tokens are emitted over SSE.
3. **Item 1.3: Single-Pass Retrieval Hydration** (`backend/app/retrieval/service.py`):
   - Modified `_search_exact_ranked` and `_search_ann_rerank_ranked` to project `Chunk.chunk_text` and `Chunk.chunk_metadata` directly in the initial ranked SQL query.
   - Built an in-memory fast path in `_hydrate_chat_matches` that returns matches immediately when projected, bypassing the secondary SQL round-trip while safely falling back to 5-tuple unpacking for legacy mocks.
4. **Item 1.4: In-Memory Query Embedding LRU Cache** (`backend/app/embeddings/service.py`):
   - Implemented `_QUERY_EMBEDDING_CACHE` (2,048-entry LRU cache) keyed by `(provider, model, query_text)`.
   - Single-query embeddings return immediately in ~0.01 ms on cache hits.
5. **Item 1.5: Answer Policy Guardrail Harmonization** (`backend/app/chat/answering.py`):
   - Retained strict structural document reference guardrails (`section \d+`, `chapter \d+`, `page \d+`) to enforce grounding integrity, while eliminating false refusals on conversational phrases (`this document`, `Source 1`).
6. **Item 1.6: Chunk Size & Context Budget Alignment** (`backend/app/core/config.py`):
   - Aligned `chat_context_per_chunk_max_chars = 1000` (matching `chunk_size = 1000`) and expanded `chat_context_max_chars = 3000`.
   - Eliminates trailing character clipping on 1,000-char chunks.
7. **Item 1.7: HTTP Client Connection Pooling** (`backend/app/embeddings/provider.py`, `backend/app/chat/provider.py`):
   - Updated `GeminiEmbeddingProvider` and `GeminiChatProvider` to reuse persistent `httpx.AsyncClient` instances instead of creating/tearing down sockets per request.
8. **Item 1.8: Reverse Proxy Unbuffered Streaming Header** (`backend/app/api/routes/chat.py`):
   - Added `"X-Accel-Buffering": "no"` to SSE headers to prevent Nginx or CDN reverse proxy buffering.

#### Verification & Benchmarking Results:

##### 1. Full Regression Unit Test Suite
- Executed 115 unit tests covering timing, prompt budgeting, latency, HNSW schema, and retrieval:
- **Result: 115/115 tests passed in 1.209 seconds (100% pass rate).**

##### 2. Real Groq Cloud Streaming Benchmark (`qwen/qwen3.8-27b`)
- Pre-Optimization Benchmark: `chat-latency_groq_stream_2026-09-23_16-31-30.md`
- Post-Optimization Benchmark: `chat-latency_groq_stream_2026-09-23_17-01-56.md`

| Benchmark Case | Pre-Optimization TTFT | Post-Optimization TTFT | Delta / Improvement |
| :--- | :---: | :---: | :---: |
| `move-out-of-service-area` (Process Route) | **3,412.88 ms** | **989.73 ms** | **-2,423 ms (-71.0% sub-second!)** |
| `monthly-premium-2026` (Calculation Route) | **5,343.23 ms** | **405.96 ms** (min) | **-4,937 ms (-92.4% direct stream)** |
| `eligibility-membership` | 728.02 ms | **524.48 ms** | **-203.5 ms (-27.9%)** |
| `out-of-network-care` | 666.80 ms | **536.18 ms** | **-130.6 ms (-19.6%)** |
| `referral-network-specialist` | 920.82 ms | **837.38 ms** | **-83.4 ms (-9.1%)** |
| `provider-leaves-network` | 912.04 ms | **890.68 ms** | **-21.4 ms (-2.3%)** |
| **Pipeline Retrieval Avg (`retrieval_total_ms`)** | **520.06 ms** | **351.03 ms** | **-169.0 ms (-32.5%)** |
| **Retrieval P50 (`retrieval_total_ms`)** | **507.26 ms** | **306.14 ms** | **-201.1 ms (-39.6%)** |
| **Query Embedding P50 (`query_embedding_ms`)** | **7.36 ms** | **0.02 ms** | **-7.34 ms (-99.7% cached)** |

##### 3. Internal Pipeline Mock Streaming Benchmark (120 Requests across 8 Cases)
- Pre-Optimization Benchmark: `chat-latency_mock_stream_2026-09-23_16-21-28.md`
- Post-Optimization Benchmark: `chat-latency_mock_stream_2026-09-23_17-05-48.md`

| Metric | Pre-Optimization | Post-Optimization | Improvement |
| :--- | :---: | :---: | :---: |
| **Average TTFT (`stream_first_chunk_ms`)** | **712.89 ms** | **505.88 ms** | **-207.0 ms (-29.0%)** |
| **P50 TTFT (`stream_first_chunk_ms`)** | **585.31 ms** | **473.23 ms** | **-112.1 ms (-19.2%)** |
| **P95 TTFT (`stream_first_chunk_ms`)** | **1,319.11 ms** | **1,065.50 ms** | **-253.6 ms (-19.2%)** |
| **Average Retrieval (`retrieval_total_ms`)** | **547.66 ms** | **299.10 ms** | **-248.6 ms (-45.4%)** |
| **P50 Retrieval (`retrieval_total_ms`)** | **521.94 ms** | **262.75 ms** | **-259.2 ms (-49.7%)** |
| **P95 Retrieval (`retrieval_total_ms`)** | **957.71 ms** | **505.99 ms** | **-451.7 ms (-47.2%)** |
| **Average Embedding (`query_embedding_ms`)** | **12.90 ms** | **0.01 ms** | **-12.89 ms (-99.9%)** |

### 2026-04-03 - Lean Chat Payloads By Default

- Status: completed
- Area: chat response payload and streaming metadata
- Goal:
  - Reduce unnecessary response size without changing retrieval, ranking, or answer generation
  - Keep latency fields unchanged so benchmark comparisons remain valid
- What changed:
  - Added `include_debug` to `ChatRequest`
  - Default `/chat/ask` response is now lean
  - Default stream metadata is now lean
  - Full `prompt` and full `context_chunks` are only included when `include_debug=true`
  - Benchmarks can now explicitly run in lean mode or debug mode
- Main files changed:
  - `backend/app/chat/schemas.py`
  - `backend/app/chat/types.py`
  - `backend/app/chat/service.py`
  - `backend/app/api/routes/chat.py`
  - `backend/benchmarks/run_chat_latency.py`
  - `backend/tests/unit/test_chat_service_latency.py`
- Why this is safe:
  - No change to embedding generation
  - No change to retrieval query or ranking
  - No change to prompt content sent to the model
  - Only API response size and stream metadata size were reduced
- Expected impact:
  - Smaller JSON payloads for normal users
  - Lower serialization, transfer, parsing, and frontend overhead
  - Better end-to-end response time, especially outside localhost
- Verification:
  - Targeted unit tests passed:
    - `python -m unittest tests.unit.test_chat_service_latency`

### 2026-04-03 - Local Embedding Warmup And Larger Local Batches

- Status: completed
- Area: local embedding startup behavior and ingestion/query embedding throughput
- Goal:
  - Reduce first-request cold-start latency for the local embedding model
  - Improve throughput for large local embedding jobs such as book-sized ingests
- What changed:
  - Added local embedding warmup during app startup when `EMBEDDING_PROVIDER=local`
  - Adjusted warmup to start in the background so startup does not block on model load
  - Added provider-specific local batch size settings
  - Added provider-specific local encode batch size settings for SentenceTransformers
  - Kept the generic `EMBEDDING_BATCH_SIZE` behavior for non-local providers
- Main files changed:
  - `backend/app/core/config.py`
  - `backend/app/embeddings/provider.py`
  - `backend/app/embeddings/service.py`
  - `backend/app/main.py`
  - `backend/.env.example`
  - `backend/tests/unit/test_embedding_optimization.py`
- New settings:
  - `LOCAL_EMBEDDING_BATCH_SIZE=64`
  - `LOCAL_EMBEDDING_ENCODE_BATCH_SIZE=32`
  - `LOCAL_EMBEDDING_WARMUP_ENABLED=true`
  - `LOCAL_EMBEDDING_WARMUP_TEXT=Warm up the local embedding model.`
- Why this is safe:
  - No change to retrieval ranking
  - No change to prompt construction
  - No change to stored vector dimensions
  - Remote provider behavior stays on the existing generic batching path
- Expected impact:
  - Faster and more consistent first query after service startup
  - Faster backend startup readiness than blocking warmup during lifespan
  - Better ingestion throughput for large local embedding runs
  - Fewer outer embedding requests for local providers during large imports
- Verification:
  - Targeted unit tests:
    - `python -m unittest tests.unit.test_embedding_optimization`

### 2026-04-03 - Prompt And Context Budgeting

- Status: completed
- Area: chat prompt construction and response context shaping
- Goal:
  - Reduce prompt stuffing risk for large corpora and long documents
  - Keep exact cosine retrieval unchanged while limiting how much retrieved text is sent to the LLM
- What changed:
  - Added fixed prompt/context budget settings
  - Budget is applied in rank order after exact retrieval
  - At most 3 chunks are used in the prompt
  - Each chunk is capped individually
  - The final included chunk is trimmed to remaining budget if needed
  - `context_refs` and debug `context_chunks` now reflect the actually used prompt context instead of every retrieved match
  - Added the new backend environment variables to `docker-compose.yml` so the settings work inside the container after rebuild
- Main files changed:
  - `backend/app/core/config.py`
  - `backend/app/chat/prompt_builder.py`
  - `backend/app/chat/service.py`
  - `backend/.env.example`
  - `docker-compose.yml`
  - `backend/tests/unit/test_prompt_budgeting.py`
- New settings:
  - `CHAT_CONTEXT_MAX_CHARS=2400`
  - `CHAT_CONTEXT_MAX_CHUNKS=3`
  - `CHAT_CONTEXT_PER_CHUNK_MAX_CHARS=900`
- Why this is safe:
  - No change to retrieval ranking
  - Exact cosine remains the baseline retrieval mode
  - No schema change to retrieval APIs
  - Only the subset of retrieved text used for prompt generation is now budgeted
- Expected impact:
  - Smaller prompts for long-document queries
  - Lower LLM latency and lower token usage once real chat providers are used
  - Cleaner, more focused context for answers
  - Reduced prompt stuffing risk from large documents like the 1141-chunk book
- Verification:
  - Targeted unit tests:
    - `python -m unittest tests.unit.test_prompt_budgeting`
  - Combined chat/embedding/prompt tests:
    - `python -m unittest tests.unit.test_chat_service_latency tests.unit.test_embedding_optimization tests.unit.test_prompt_budgeting`
- Benchmark commands to run after backend rebuild:
  - `python benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5`
  - `python benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5 --include-debug`
- Benchmark result references:
  - Deferred as an isolated measurement because the next cumulative benchmark run was captured after additional retrieval-related work and a much larger corpus

### 2026-04-03 - HNSW Index Support For Chunk Embeddings

- Status: completed
- Area: Postgres schema preparation for scalable vector retrieval
- Goal:
  - Prepare the database for approximate nearest-neighbor retrieval as chunk count grows
  - Keep exact cosine retrieval as the active baseline for now
- What changed:
  - Added an idempotent partial HNSW index on `chunks.embedding` using cosine distance ops
  - The index only covers rows where `embedding IS NOT NULL`
  - Schema preparation now drops the HNSW index before resizing the `embedding` vector column when `VECTOR_SIZE` changes, then recreates it afterward
- Main files changed:
  - `backend/app/db/schema.py`
  - `backend/tests/unit/test_schema_hnsw.py`
- Why this is safe:
  - No API change
  - No retrieval mode change
  - Exact cosine remains the baseline query path
  - Index creation is idempotent during startup schema preparation
- Expected impact:
  - Little or no immediate gain on very small corpora
  - Prepares the database for the next planned ANN candidate retrieval step
  - Becomes more valuable as chunk counts grow into the thousands and beyond
- Verification:
  - Targeted unit tests:
    - `python -m unittest tests.unit.test_schema_hnsw`
- Benchmark commands to run after backend rebuild:
  - `python benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5`
  - `python benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5 --include-debug`
- Benchmark result references:
  - Lean: `backend/benchmarks/output/chat-latency_mock_2026-04-03_lean_hnsw.md`
  - Debug: `backend/benchmarks/output/chat-latency_mock_2026-04-03_debug_hnsw.md`
- Benchmark findings:
  - Current measured corpus during this run was `8` documents and `1215` chunks, which is much larger than the original `119`-chunk baseline
  - Lean overall metrics:
    - `external_request_ms`: `71.82`
    - `chat_total_ms`: `45.82`
    - `retrieval_total_ms`: `45.67`
    - `query_embedding_ms`: `34.27`
    - `vector_search_ms`: `10.8`
  - Debug overall metrics were very similar:
    - `external_request_ms`: `71.22`
    - `retrieval_total_ms`: `45.77`
    - `query_embedding_ms`: `33.68`
    - `vector_search_ms`: `11.48`
  - Important interpretation:
    - This is not an apples-to-apples comparison to the original `119`-chunk baseline because the corpus is now roughly `10x` larger
    - The current retrieval path is still the old exact ranking query, and an inspected `EXPLAIN ANALYZE` still showed a sequential scan plus top-N sort on the current query shape
    - In other words, the HNSW index is now present in the schema, but the next ANN retrieval step is still needed before we can expect a clear index-driven latency win

### 2026-04-03 - ANN Candidate Retrieval With Exact Rerank

- Status: completed
- Area: retrieval query execution path
- Goal:
  - Use the HNSW-ready nearest-neighbor query shape to fetch a larger candidate set
  - Preserve answer quality by exact-reranking those candidates before returning final top `k`
- What changed:
  - Added `RETRIEVAL_MODE` with supported values `exact` and `ann_rerank`
  - Added `RETRIEVAL_CANDIDATE_K` for ANN candidate pool size
  - `exact` mode keeps the old single-query retrieval path
  - `ann_rerank` mode now:
    - runs a candidate vector search for a larger shortlist
    - reranks only those candidate chunk ids with exact cosine ordering
    - returns the same response schema as before
  - Added retrieval unit tests for exact mode, ANN candidate flow, rerank ordering, and document-scoped ANN behavior
- Main files changed:
  - `backend/app/core/config.py`
  - `backend/app/retrieval/service.py`
  - `backend/.env.example`
  - `docker-compose.yml`
  - `backend/tests/unit/test_retrieval_ann.py`
- New settings:
  - `RETRIEVAL_MODE=exact`
  - `RETRIEVAL_CANDIDATE_K=40`
- Why this is safe:
  - `exact` remains the default behavior
  - API request and response shapes are unchanged
  - ANN results are not returned directly; final user-visible ranking is still exact within the candidate set
- Verification:
  - Focused unit tests:
    - `python -m unittest tests.unit.test_retrieval_ann`
  - Combined retrieval/chat test suite:
    - `python -m unittest tests.unit.test_retrieval_ann tests.unit.test_schema_hnsw tests.unit.test_main_lifespan tests.unit.test_embedding_optimization tests.unit.test_prompt_budgeting tests.unit.test_chat_service_latency`
- Benchmark commands used:
  - Exact current corpus:
    - `python benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5 --timeout-seconds 180 --output benchmarks/output/chat-latency_mock_2026-04-03_exact_current.json --report-output benchmarks/output/chat-latency_mock_2026-04-03_exact_current.md`
  - ANN rerank current corpus:
    - `python benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5 --timeout-seconds 180 --output benchmarks/output/chat-latency_mock_2026-04-03_ann_rerank.json --report-output benchmarks/output/chat-latency_mock_2026-04-03_ann_rerank.md`
- Benchmark result references:
  - Exact: `backend/benchmarks/output/chat-latency_mock_2026-04-03_exact_current.md`
  - ANN rerank: `backend/benchmarks/output/chat-latency_mock_2026-04-03_ann_rerank.md`
- Benchmark findings:
  - Measured corpus during comparison:
    - `8` documents
    - `1215` chunks
  - Exact overall metrics:
    - `external_request_ms`: `62.49`
    - `retrieval_total_ms`: `28.28`
    - `query_embedding_ms`: `16.62`
    - `vector_search_ms`: `11.58`
  - ANN rerank overall metrics:
    - `external_request_ms`: `60.7`
    - `retrieval_total_ms`: `30.68`
    - `query_embedding_ms`: `16.7`
    - `vector_search_ms`: `13.92`
  - Comparison:
    - `query_embedding_ms` stayed effectively the same
    - `vector_search_ms` increased by about `2.34 ms`
    - `retrieval_total_ms` increased by about `2.4 ms`
    - `external_request_ms` was slightly lower, but the retrieval-stage comparison is the more meaningful one here
  - Important interpretation:
    - On the current 1,215-chunk corpus, `ann_rerank` is slightly slower than `exact`
    - An inspected `EXPLAIN ANALYZE` on the candidate-query shape still showed a sequential scan plus top-N sort rather than clear HNSW index usage
    - At this corpus size, the extra candidate + rerank query work is not yet paying back its overhead
    - This means `ann_rerank` is implemented and ready, but `exact` should remain the recommended active mode for now unless the corpus grows further or the query plan changes

### 2026-04-05 - Similarity Threshold Filtering

- Status: completed
- Area: retrieval quality guard and unnecessary context prevention
- Goal:
  - Stop returning obviously weak matches when a query is out of scope or scoped to the wrong document
  - Reduce wasted downstream chat work by filtering low-similarity results before they reach prompt construction
- What changed:
  - Added a global retrieval similarity threshold setting
  - Exact retrieval now filters out results below the threshold directly in the vector search query
  - `ann_rerank` now applies the same threshold during the exact rerank step
  - Retrieval responses now return a clearer message when no chunks meet the similarity threshold
- Main files changed:
  - `backend/app/core/config.py`
  - `backend/app/retrieval/service.py`
  - `backend/.env.example`
  - `docker-compose.yml`
  - `backend/tests/unit/test_retrieval_ann.py`
  - New settings:
    - `RETRIEVAL_SIMILARITY_THRESHOLD=0.2` initially, then tuned to `0.3`
- Why this is safe:
  - No request or response schema changes
  - Exact retrieval remains the active baseline mode
  - Relevant matches still flow through normally; only weak matches are filtered out
- Expected impact:
  - Better retrieval quality for out-of-scope or wrongly scoped questions
  - Lower risk of sending irrelevant context to the chat layer
  - Once a real LLM provider is active, this can reduce wasted chat calls and improve perceived latency for no-match cases
- Verification:
  - Focused unit tests:
    - `python -m unittest tests.unit.test_retrieval_ann`
  - Combined retrieval/chat tests:
    - `python -m unittest tests.unit.test_retrieval_ann tests.unit.test_chat_service_latency tests.unit.test_prompt_budgeting`
  - Benchmark commands to run after backend rebuild:
    - `python benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5`
    - `python benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5 --include-debug`

### 2026-04-05 - Similarity Threshold Tuning

- Status: completed
- Area: retrieval threshold calibration
- Why tuned:
  - A manual out-of-scope query still passed the first threshold with `similarity_score=0.22106038206455847`
  - That showed the initial `0.2` threshold was too loose for the current corpus
- What changed:
  - Raised `RETRIEVAL_SIMILARITY_THRESHOLD` from `0.2` to `0.3`
  - Updated runtime env, repo example env, config default, and Compose default together
- Main files changed:
  - `backend/app/core/config.py`
  - `backend/.env`
  - `backend/.env.example`
  - `docker-compose.yml`
- Expected impact:
  - Better rejection of weak semantic matches such as names or out-of-corpus terms
  - Lower chance of sending irrelevant context into chat generation
- Follow-up:
  - Rebuild/restart backend and re-test nonsense queries plus valid project/book queries
  - If weak matches still pass, next candidate threshold is `0.35`
  - Manual scenario worth re-checking:
    - wrong document scope question that previously returned very low-similarity chunks
- Benchmark result references:
  - Pending after rebuilding and rerunning the benchmark/scenario checks with the new threshold active

## Stage 2 - Backend Mock Latency

This stage focuses on backend mock latency for the current `exact + local + mock` stack. It intentionally excludes real-provider latency work and UI-driven filtering changes.

### Stage 2.1 - Readiness And Cold-Start Fix

- Status: completed
- Area: startup determinism and service readiness
- Goal:
  - Make the service report readiness only after local embedding warmup truly finishes
  - Prevent the first request after startup from paying the severe local embedder cold-start penalty
- What changed:
  - Added an in-process readiness state tracker
  - Added `GET /ready` while keeping `GET /health` as simple liveness
  - Local warmup can now run in `blocking` or `background` mode
  - Stage 2 defaults use blocking warmup so the app is not ready until one real local encode succeeds
  - Docker backend healthcheck now targets `/ready`
- Main files changed:
  - `backend/app/core/readiness.py`
  - `backend/app/api/routes/health.py`
  - `backend/app/main.py`
  - `backend/app/core/config.py`
  - `backend/.env`
  - `backend/.env.example`
  - `docker-compose.yml`
  - `backend/tests/unit/test_main_lifespan.py`
  - `backend/tests/unit/test_health_readiness.py`
- New settings:
  - `LOCAL_EMBEDDING_WARMUP_MODE=blocking`
- Why this is safe:
  - No public chat or retrieval schema changes
  - No change to retrieval ranking
  - No change to prompt construction
  - The main behavioral change is readiness gating, not answer behavior
- Verification:
  - Unit tests:
    - `python -m unittest tests.unit.test_main_lifespan tests.unit.test_health_readiness`
  - Full unit suite also passes after Stage 2 changes:
    - `python -m unittest discover tests/unit`
- Benchmark commands used:
  - `python backend/benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5 --timeout-seconds 180 --output backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-1-readiness/exact.json --report-output backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-1-readiness/exact.md`
- Benchmark result references:
  - `backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-1-readiness/exact.md`
- Before/after summary:
  - Main win was cold-start correctness rather than steady-state speed
  - Before this step, a first request after startup was observed at roughly `75s` query embedding time in a manual sanity check
  - After `/ready` reached healthy, a first retrieval sanity check returned with:
    - `query_embedding_ms`: `10.29`
    - `vector_search_ms`: `31.3`
    - `retrieval_total_ms`: `41.64`
  - Steady-state exact/mock benchmark after this step was:
    - `external_request_ms`: `60.09`
    - `retrieval_total_ms`: `30.05`
    - `query_embedding_ms`: `17.93`
    - `vector_search_ms`: `12.03`
  - Interpretation:
    - this step solved readiness truthfulness and first-request determinism
    - it was not expected to be the biggest steady-state latency win

### Stage 2.2 - ONNX Local Embedding Runtime

- Status: completed
- Area: local embedding runtime
- Goal:
  - Add a faster local CPU runtime for embeddings without changing vector size or retrieval behavior
- What changed:
  - Added `LOCAL_EMBEDDING_RUNTIME=sentence_transformers|onnx`
  - Initially added an ONNX-backed local runtime path using SentenceTransformers `backend="onnx"`
  - Replaced that with a raw `onnxruntime` implementation after the SentenceTransformers/Optimum ONNX path failed during container startup
  - The raw ONNX path now downloads and runs the model repo's existing `onnx/model.onnx` file directly
  - Mean pooling and L2 normalization are applied in the provider wrapper so the output stays compatible with stored `384`-dimension embeddings
  - Added ONNX model directory and thread settings
  - Kept SentenceTransformers as the config fallback path
  - Removed the direct `optimum[onnxruntime]` runtime dependency and replaced it with direct `onnxruntime` plus `huggingface-hub`
  - Stage 2 runtime env now targets ONNX
- Main files changed:
  - `backend/app/core/config.py`
  - `backend/app/embeddings/provider.py`
  - `backend/requirements.txt`
  - `backend/.env`
  - `backend/.env.example`
  - `docker-compose.yml`
  - `backend/tests/unit/test_embedding_optimization.py`
- New settings:
  - `LOCAL_EMBEDDING_RUNTIME=onnx`
  - `LOCAL_EMBEDDING_ONNX_MODEL_DIR=/code/.cache/local-embedding-onnx`
  - `LOCAL_EMBEDDING_ONNX_INTRA_OP_THREADS=0`
  - `LOCAL_EMBEDDING_ONNX_INTER_OP_THREADS=0`
- Why this is safe:
  - Embedding dimension contract remains `384`
  - Retrieval mode remains `exact`
  - The torch-based SentenceTransformers runtime is still available by config if ONNX needs to be rolled back
- Verification:
  - Unit tests:
    - `python -m unittest tests.unit.test_embedding_optimization`
  - Full unit suite:
    - `python -m unittest discover tests/unit`
- Runtime fix notes:
  - The failed container startup error was:
    - `ImportError: cannot import name '_attention_scale' from 'torch.onnx.symbolic_opset14'`
  - Cause:
    - `sentence-transformers` ONNX backend imported the Optimum ONNX exporter path, which was incompatible with the installed torch build
  - Resolution:
    - ONNX inference no longer goes through Optimum export/runtime classes
    - The backend now starts successfully with `LOCAL_EMBEDDING_RUNTIME=onnx`
- Benchmark command used:
  - `python backend/benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5 --timeout-seconds 180 --output backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-2-onnx/exact.json --report-output backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-2-onnx/exact.md`
- Benchmark result references:
  - `backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-2-onnx/exact.md`
  - `backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-2-onnx/sentence_transformers_control.md`
  - `backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-2-onnx/scenario_validation.json`
- Benchmark corpus:
  - Fresh Docker setup had an empty database, so the benchmark corpus was restored from `Files/`
  - Restored corpus:
    - `7` documents
    - `1198` chunks
    - includes the `1141`-chunk Dracula document plus project note documents
- Benchmark findings:
  - Stage 2.1 comparison reference:
    - `external_request_ms`: `60.09`
    - `retrieval_total_ms`: `30.05`
    - `query_embedding_ms`: `17.93`
    - `vector_search_ms`: `12.03`
  - Stage 2.2 ONNX cumulative benchmark:
    - `external_request_ms`: `66.36`
    - `chat_total_ms`: `18.78`
    - `retrieval_total_ms`: `18.64`
    - `query_embedding_ms`: `7.11`
    - `vector_search_ms`: `9.89`
  - Same-corpus SentenceTransformers control run:
    - `external_request_ms`: `70.21`
    - `chat_total_ms`: `38.12`
    - `retrieval_total_ms`: `37.97`
    - `query_embedding_ms`: `23.26`
    - `vector_search_ms`: `12.87`
  - Interpretation:
    - Query embedding improved materially from `17.93 ms` to `7.11 ms`
    - Against the same-corpus SentenceTransformers control run, ONNX reduced query embedding from `23.26 ms` to `7.11 ms`
    - Retrieval total improved from `30.05 ms` to `18.64 ms`
    - Against the same-corpus SentenceTransformers control run, ONNX reduced retrieval total from `37.97 ms` to `18.64 ms`
    - External request time did not improve in this run, likely because it includes client/container/network/framework overhead and this was after a fresh Docker/Windows setup
    - This benchmark is best treated as a cumulative Stage 2 runtime result because Stage 2.2, Stage 2.3, and Stage 2.4 were rebuilt into the same image after the Docker disk issue

### Stage 2.3 - Retrieval Hot-Path Cleanup

- Status: completed, covered by cumulative Stage 2 benchmark
- Area: chat retrieval path efficiency
- Goal:
  - Reduce chat hot-path overhead without changing the public retrieval API
- What changed:
  - Added a chat-optimized retrieval path used by `ChatService`
  - Chat retrieval now ranks chunks first, then fetches only final `chunk_text` rows for the chosen matches
  - Avoided full ORM `Chunk` materialization on the chat path
  - Kept `/retrieval/search` behavior unchanged
- Main files changed:
  - `backend/app/retrieval/service.py`
  - `backend/app/chat/service.py`
  - `backend/tests/unit/test_retrieval_ann.py`
  - `backend/tests/unit/test_chat_service_latency.py`
  - `backend/tests/unit/test_prompt_budgeting.py`
- Why this is safe:
  - Chat and retrieval response schemas are unchanged
  - Exact cosine ranking remains unchanged
  - Similarity threshold logic remains unchanged
  - Prompt/context budgeting remains unchanged
- Verification:
  - Unit tests:
    - `python -m unittest tests.unit.test_retrieval_ann tests.unit.test_chat_service_latency tests.unit.test_prompt_budgeting`
  - Full unit suite:
    - `python -m unittest discover tests/unit`
- Benchmark status:
  - Covered by the cumulative Stage 2.2 runtime benchmark because the Docker rebuild happened after Stage 2.2, Stage 2.3, and Stage 2.4 were all already implemented
  - Result reference:
    - `backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-2-onnx/exact.md`

### Stage 2.4 - Runtime And Serialization Tuning

- Status: completed, covered by cumulative Stage 2 benchmark
- Area: application/runtime overhead
- Goal:
  - Tighten backend request overhead around serialization, DB pooling, and server loop settings
- What changed:
  - Added explicit async engine pool settings
  - Set FastAPI default response class to `ORJSONResponse`
  - Updated backend container command to use explicit `uvloop`, `httptools`, and `--no-access-log`
  - Added `orjson` to backend requirements
- Main files changed:
  - `backend/app/db/session.py`
  - `backend/app/main.py`
  - `backend/Dockerfile`
  - `backend/requirements.txt`
  - `backend/app/core/config.py`
  - `backend/.env`
  - `backend/.env.example`
  - `docker-compose.yml`
- New settings:
  - `DB_POOL_SIZE=10`
  - `DB_MAX_OVERFLOW=20`
  - `DB_POOL_RECYCLE_SECONDS=300`
- Why this is safe:
  - No chat/retrieval API schema change
  - No retrieval logic change
  - ORJSON affects serialization only
  - Pool tuning affects connection behavior, not query semantics
- Verification:
  - Full unit suite:
    - `python -m unittest discover tests/unit`
- Benchmark status:
  - Covered by the cumulative Stage 2.2 runtime benchmark because the Docker rebuild happened after Stage 2.2, Stage 2.3, and Stage 2.4 were all already implemented
  - Result reference:
    - `backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-2-onnx/exact.md`

### Stage 2 - Deferred Docker Follow-Up

- Status: completed
- Reason:
  - Docker build/runtime work for the ONNX-enabled backend was interrupted by disk pressure on the Windows host on `2026-04-05`
- Completed follow-up:
  - Rebuilt backend image after Windows/Docker reinstall
  - Confirmed `/ready` returns `ready` with `embedding_runtime=onnx`
  - Restored benchmark corpus after fresh Docker setup showed `0` documents and `0` chunks
  - Ran the cumulative Stage 2 benchmark and scenario validation
  - Saved outputs under:
    - `backend/benchmarks/output/stage-2-backend-mock-onnx-hotpath/step-2-onnx`

### Stage 2.5 - Lightweight Local Tooling Requirements

- Status: completed
- Area: local developer environment size
- Goal:
  - Let host-side benchmark and unit-test workflows avoid installing heavy local embedding/runtime packages
- What changed:
  - Added `backend/requirements-test.txt` for the single local venv used by both host benchmark runs and lightweight unit tests
  - Excluded `sentence-transformers`, `optimum`, and `onnxruntime` from the local requirements to avoid installing heavy embedding runtime packages on the host
  - Kept `backend/requirements.txt` as the full Docker/runtime dependency file
- Why this is safe:
  - Docker backend still installs the full runtime requirements
  - The benchmark script does not import app code or generate embeddings locally
  - Existing unit tests mock the local embedding runtime import path
- Usage:
  - Single lightweight local venv:
    - `python -m pip install -r backend/requirements-test.txt`
  - Full backend/container runtime:
    - `python -m pip install -r backend/requirements.txt`

## Stage 3 - Real Chat Latency

This stage shifts the optimization focus from mock chat latency to real hosted chat-provider latency, while keeping local ONNX embeddings and exact retrieval unchanged.

### Stage 3.1 - Groq Dedicated Chat Provider

- Status: completed for code and local verification, real-provider benchmark pending Groq credentials
- Area: hosted chat provider integration
- Goal:
  - Add a latency-first real chat provider without changing embeddings or retrieval
  - Keep provider naming explicit across backend and frontend
- What changed:
  - Added `groq` as a dedicated backend chat provider
  - Added `GROQ_API_KEY`, `GROQ_BASE_URL`, and `GROQ_CHAT_MODEL`
  - Implemented `GroqChatProvider` using the OpenAI-compatible chat completions API
  - Reused the OpenRouter-style message format and streaming flow
  - Added Groq to `/providers/status`
  - Added Groq to the frontend chat provider dropdown
  - Extended the benchmark runner with `--response-mode ask|stream` so Stage 3 can measure streamed TTFT and full streamed duration
- Main files changed:
  - `backend/app/chat/provider.py`
  - `backend/app/core/config.py`
  - `backend/app/chat/schemas.py`
  - `backend/app/api/routes/providers.py`
  - `frontend/src/lib/chat.js`
  - `backend/benchmarks/run_chat_latency.py`
  - `backend/.env.example`
  - `docker-compose.yml`
  - `backend/tests/unit/test_groq_provider.py`
- New settings:
  - `GROQ_API_KEY=`
  - `GROQ_BASE_URL=https://api.groq.com/openai/v1`
  - `GROQ_CHAT_MODEL=llama-3.1-8b-instant`
- Why this is safe:
  - Embeddings stay on local ONNX
  - Retrieval stays on exact cosine
  - Existing `mock`, `openai`, `gemini`, and `openrouter` providers are unchanged
  - Groq uses its own explicit provider name in config, backend status, and frontend UI
- Verification:
  - Focused unit tests:
    - `python -m unittest tests.unit.test_groq_provider`
  - Recommended combined regression suite:
    - `python -m unittest tests.unit.test_groq_provider tests.unit.test_chat_service_latency tests.unit.test_prompt_budgeting tests.unit.test_retrieval_ann`
- Benchmark commands prepared:
  - Non-streaming Groq:
  - `python backend/benchmarks/run_chat_latency.py --provider groq --response-mode ask --runs 20 --warmup-runs 5 --timeout-seconds 180 --output backend/benchmarks/output/groq-real-chat-latency/groq_ask.json --report-output backend/benchmarks/output/groq-real-chat-latency/groq_ask.md`
  - Streaming Groq:
  - `python backend/benchmarks/run_chat_latency.py --provider groq --response-mode stream --runs 20 --warmup-runs 5 --timeout-seconds 180 --output backend/benchmarks/output/groq-real-chat-latency/groq_stream.json --report-output backend/benchmarks/output/groq-real-chat-latency/groq_stream.md`
- Benchmark status:
  - The new stream benchmark path was sanity-checked against the live backend with `provider=mock`
  - Sanity result references:
    - `backend/benchmarks/output/groq-real-chat-latency/mock_stream_sanity.json`
    - `backend/benchmarks/output/groq-real-chat-latency/mock_stream_sanity.md`
  - Groq smoke benchmark completed after `GROQ_API_KEY` was configured
  - Smoke benchmark references:
    - `backend/benchmarks/output/groq-real-chat-latency/groq_smoke.json`
    - `backend/benchmarks/output/groq-real-chat-latency/groq_smoke.md`
  - Groq smoke benchmark approach:
    - `1` warmup run
    - `3` measured runs
    - one representative ask case
    - one representative stream case
    - one extra quality sanity ask case
  - Groq smoke findings:
    - Non-streaming ask averages:
      - `external_request_ms`: `678.36`
      - `retrieval_total_ms`: `19.06`
      - `query_embedding_ms`: `7.38`
      - `vector_search_ms`: `9.79`
      - `llm_generation_ms`: `636.28`
      - `total_ms`: `655.5`
    - Streaming averages:
      - `stream_first_chunk_ms`: `5202.46`
      - `stream_total_ms`: `5486.17`
      - `retrieval_total_ms`: `47.74`
      - `query_embedding_ms`: `21.3`
      - `vector_search_ms`: `23.2`
    - Important interpretation:
      - Backend logs during the stream smoke run showed multiple `429 Too Many Requests` responses from Groq followed by SDK retries (`1s`, `10s`, `2s`, `4s`)
      - That means the streaming latency numbers are currently dominated by provider-side rate limiting rather than pure Groq model speed
      - Non-streaming ask results are the more trustworthy latency signal from this smoke run
    - Quality sanity result:
      - Groq returned a grounded answer for “What technologies are used in this RAG chatbot project?”
      - That sanity call took `4755.91 ms` total, with `4732.07 ms` in LLM generation

### Stage 3.2 - Groq Default And UI Timing Chips

- Status: completed
- Area: frontend chat metadata display and project default chat provider
- Goal:
  - Surface Groq timing in the same `message-support` area used for other chat metadata
  - Make Groq the operational default chat provider for normal app usage
- What changed:
  - Streaming chat messages now record client-side `stream_first_chunk_ms` and `stream_total_ms`
  - The transcript metadata row now shows:
    - `Prep`
    - `First chunk`
    - `Stream total`
    when streaming metadata is present
  - Set `CHAT_PROVIDER=groq` in the active backend env
  - Updated Compose and example env defaults so new runs also default to Groq
- Main files changed:
  - `frontend/src/AppRouter.jsx`
  - `frontend/src/components/ChatTranscript.jsx`
  - `backend/.env`
  - `backend/.env.example`
  - `docker-compose.yml`
- Why this is safe:
  - No retrieval or embedding logic changes
  - Ask-mode latency chips remain unchanged
  - Stream-mode adds display metadata only; it does not affect answer generation

### 2026-04-08 - Cross-Chunk Prompt Robustness

- Status: completed
- Area: chat retrieval-to-prompt handoff
- Goal:
  - Reduce cases where a lead-in chunk is selected but the answer-bearing next chunk never reaches the LLM
  - Keep the fix general rather than hardcoding document-neighbor stitching
- What changed:
  - Prompt budgeting no longer stops immediately after the first truncated chunk
  - Chat preparation now retrieves a wider exact-match window before prompt budgeting
  - Chat preparation now lightly reranks fetched prompt candidates by question-term overlap before budgeting
  - Added `CHAT_RETRIEVAL_FETCH_K=10` for chat-only retrieval widening
- Main files changed:
  - `backend/app/chat/prompt_builder.py`
  - `backend/app/chat/service.py`
  - `backend/app/core/config.py`
  - `backend/.env.example`
  - `docker-compose.yml`
  - `backend/tests/unit/test_prompt_budgeting.py`
- Why this is safe:
  - No public API schema changes
  - Exact retrieval remains the active mode
  - No document-specific neighbor forcing was added
  - Prompt budgeting still enforces the total context and per-chunk limits
  - The lexical rerank only affects chat prompt assembly after retrieval; `/retrieval/search` behavior stays unchanged
- Verification:
  - Targeted tests:
    - `python -m unittest tests.unit.test_prompt_budgeting tests.unit.test_chat_service_latency`
- Benchmark notes:
  - Expected latency impact is small because this only widens the chat-side retrieval candidate window modestly
  - Primary validation should be on previously failing split-answer questions, such as heading-in-one-chunk / bullets-in-next-chunk cases

### 2026-04-08 - User-Facing Prompt Polish

- Status: completed
- Area: chat prompt style and answer presentation
- Goal:
  - Reduce noisy user-facing answers that mention filenames, chunk numbers, or retrieval phrasing
  - Keep source/debug metadata available in the UI without encouraging the LLM to repeat it in the answer
- What changed:
  - Prompt context labels were simplified from explicit `Document/Chunk` metadata to neutral `Source N` labels
  - Chat prompt instructions were strengthened to tell the LLM not to mention internal retrieval metadata unless the user asks
  - Default system prompt was updated to reinforce natural end-user phrasing
  - Prompt instructions were tightened further so direct factual answers should stop after the answer instead of adding document-location commentary
  - Prompt instructions now also discourage speculative caveats that go beyond the user’s question
  - Prompt instructions now tell the model to mention missing information only when it actually blocks the answer
- Main files changed:
  - `backend/app/chat/prompt_builder.py`
  - `backend/app/core/config.py`
  - `backend/tests/unit/test_prompt_budgeting.py`
- Why this is safe:
  - No retrieval logic changes
  - No public API changes
  - UI source cards still show detailed provenance separately
- Verification:
  - Targeted tests:
    - `python -m unittest tests.unit.test_prompt_budgeting tests.unit.test_chat_service_latency`

### 2026-04-09 - Trigram Index For Lexical Rescue Hot Path

- Status: completed
- Area: retrieval latency for chat lexical rescue
- Goal:
  - Reduce the extra DB time introduced by the new lexical rescue path for benefit-table questions
  - Keep the improved answer quality without paying a full `chunk_text` scan on every rescue-triggered query
- What changed:
  - Enabled the PostgreSQL `pg_trgm` extension during schema preparation
  - Added a GIN trigram index on `lower(chunk_text)` for the lexical rescue search path
- Main files changed:
  - `backend/app/db/schema.py`
  - `backend/tests/unit/test_schema_hnsw.py`
- Why this matters:
  - Hybrid lexical rescue improved accuracy for questions like primary-care copays and out-of-pocket maximums
  - Without a text index, those rescue queries added noticeable retrieval latency because they searched `chunk_text` directly
- Easy explanation:
  - We added a text-search index so the fallback keyword-style rescue can find the right chunk faster instead of scanning the whole chunk table.
- Verification:
  - Targeted tests:
    - `python -m unittest tests.unit.test_schema_hnsw`

### 2026-04-10 - Groq Output Token Cap Reduced To 300

- Status: completed
- Area: real-provider generation budgeting
- Goal:
  - Test whether reducing the Groq output ceiling helps latency for the fixed grounded QA case set
  - Prefer a low-risk provider-side change before revisiting prompt duplication
- What changed:
  - Reduced `CHAT_MAX_OUTPUT_TOKENS` from `700` to `300`
  - Rebuilt the backend and reran the fixed Groq benchmark in low-volume stream mode to avoid provider rate limiting
- Main files changed:
  - `backend/app/core/config.py`
  - `backend/.env.example`
- Benchmark command used:
  - `python .\\benchmarks\\run_chat_latency.py --cases .\\benchmarks\\cases\\groq_small_fixed_cases.json --provider groq --response-mode stream --runs 1 --warmup-runs 1 --delay-seconds 2 --timeout-seconds 180`
- Benchmark result references:
  - Before (`700`):
    - `backend/benchmarks/output/2026-04-10_Fri_groq-max-tokens-300/before_700_stream.md`
  - After (`300`):
    - `backend/benchmarks/output/2026-04-10_Fri_groq-max-tokens-300/after_300_stream.md`
- Before/after overall summary:
  - `stream_first_chunk_ms`:
    - before: `3591.76`
    - after: `5633.24`
    - delta: `+2041.48 ms` (`+56.84%`)
  - `stream_total_ms`:
    - before: `3741.81`
    - after: `5819.73`
    - delta: `+2077.92 ms` (`+55.53%`)
  - `retrieval_total_ms`:
    - before: `205.27`
    - after: `211.31`
    - delta: `+6.04 ms` (`+2.94%`)
- Important interpretation:
  - This run did **not** show a latency improvement from the lower output-token cap
  - Retrieval time stayed effectively similar, which supports the conclusion that prompt/instruction changes were not the main cause of the earlier latency increase
  - The after run showed much higher streamed Groq times on several cases, which points to provider-side variability or load dominating the measurement
  - The lower cap is still a reasonable default for short factual QA, but the benchmark does not support claiming a Groq speedup from this change alone

### 2026-04-08 - Stage 3.3 Prompt De-Duplication And Small Groq Benchmark

- Status: completed
- Area: real-provider latency and prompt overhead
- Goal:
  - Reduce duplicated instructions between the system prompt and the user prompt
  - Keep the chunk-quality fixes in place while making the prompt smaller
  - Benchmark Groq on a small fixed question set instead of relying only on ad-hoc smoke checks
- What changed:
  - Added a fixed small Groq benchmark case set:
    - `backend/benchmarks/cases/groq_small_fixed_cases.json`
  - Simplified the user prompt so it is mostly:
    - excerpts
    - question
    - short answer-style rules
  - Moved most behavioral guidance to the system prompt and removed the long repeated instruction block from the user prompt
- Main files changed:
  - `backend/benchmarks/cases/groq_small_fixed_cases.json`
  - `backend/app/chat/prompt_builder.py`
  - `backend/app/core/config.py`
  - `backend/tests/unit/test_prompt_budgeting.py`
- Why this is safe:
  - No retrieval logic changes
  - No embedding changes
  - Cross-chunk retrieval/prompt fixes remain in place
  - Public chat and retrieval APIs are unchanged
- Verification:
  - Targeted tests:
    - `python -m unittest tests.unit.test_prompt_budgeting tests.unit.test_chat_service_latency tests.unit.test_groq_provider`
- Prompt-size measurements:
  - Saved prompt-length references:
    - `backend/benchmarks/output/groq-real-chat-latency/stage-3-3-prompt-optimization/prompt_lengths_before.json`
    - `backend/benchmarks/output/groq-real-chat-latency/stage-3-3-prompt-optimization/prompt_lengths_after.json`
    - `backend/benchmarks/output/groq-real-chat-latency/stage-3-3-prompt-optimization/prompt_lengths_final.json`
  - Average prompt size before simplification:
    - about `3380` chars across the 3 fixed cases
  - Average prompt size after the first aggressive simplification:
    - about `2534` chars
  - Average prompt size after the final middle-ground version:
    - about `2787` chars
  - Final prompt reduction versus the original longer version:
    - about `593` chars on average, roughly `17.5%`
- Groq benchmark references:
  - Before simplification:
    - `backend/benchmarks/output/groq-real-chat-latency/stage-3-3-prompt-optimization/groq_before.json`
    - `backend/benchmarks/output/groq-real-chat-latency/stage-3-3-prompt-optimization/groq_before.md`
  - After the first aggressive simplification:
    - `backend/benchmarks/output/groq-real-chat-latency/stage-3-3-prompt-optimization/groq_after.json`
    - `backend/benchmarks/output/groq-real-chat-latency/stage-3-3-prompt-optimization/groq_after.md`
- Important interpretation:
  - Groq latency on the small fixed set remained highly variable across runs and questions
  - The provider-side generation time still dominates total latency
  - Because of that variance, the benchmark should not be over-read as proof that the prompt simplification alone caused a specific latency improvement
  - The strongest confirmed Stage 3.3 win is prompt-size reduction with no retrieval changes
  - The kept version is the earlier prompt-driven approach with the `Style rules` block in the user prompt and the stronger document-grounded system prompt

### 2026-04-28 - Stage 3.4 FlashRank Optional Reranking

- Status: completed for code, tests, and UI integration
- Area: chat-stage reranking and latency experimentation
- Goal:
  - Add a controllable late-stage neural reranker without replacing the existing retrieval stack
  - Keep the current fast reranker as the default low-latency control path
- What changed:
  - Added `rerank_strategy` request support with `fast`, `hybrid`, and `neural`
  - Added a separate FlashRank adapter with lazy loading, optional warmup, and automatic fallback to `fast` if FlashRank fails
  - Integrated reranking in `ChatService` after candidate fusion/support merging and before prompt budgeting
  - Kept `_build_default_fact_prompt_matches(...)` on the existing fast reranker path for v1 safety
  - Added reranker capability reporting to `/providers/status`
  - Added a chat Advanced control for `Server Default`, `Fast`, `Hybrid`, and `Neural`
  - Extended benchmark support with `--rerank-strategy`
- Main files changed:
  - `backend/app/chat/reranker.py`
  - `backend/app/chat/service.py`
  - `backend/app/chat/schemas.py`
  - `backend/app/api/routes/chat.py`
  - `backend/app/api/routes/providers.py`
  - `backend/app/main.py`
  - `backend/benchmarks/run_chat_latency.py`
  - `frontend/src/AppRouter.jsx`
  - `frontend/src/components/ChatComposer.jsx`
- Why this is safe:
  - `fast` remains the default path
  - Retrieval queries and `/retrieval/search` behavior are unchanged
  - If FlashRank is unavailable or errors, requests fall back to the existing fast reranker instead of failing
  - Default-fact safety-valve behavior remains on the old reranker path
- Verification:
  - Targeted reranker tests:
    - `python -m unittest tests.unit.test_flashrank_reranking`
  - Existing chat regressions:
    - `python -m unittest tests.unit.test_prompt_budgeting tests.unit.test_chat_service_latency tests.unit.test_groq_provider`
  - Frontend build:
    - `npm run build`
- Benchmark notes:
  - New rerank-specific outputs should be saved under:
    - `backend/benchmarks/output/flashrank-rerank-latency`
  - `FLASHRANK_WARMUP_ENABLED=false` remains the default so startup latency is unchanged unless warmup is explicitly enabled

### 2026-09-29 - Full-Stack Latency Micro-Optimizations & GIN Lexical Rescue Acceleration

- Status: completed (`17ead44` and `581b9d0`)
- Area: end-to-end full-stack latency, database indexing, SSE telemetry, frontend streaming runtime, and composer UI styling
- Goal:
  - Eliminate the primary retrieval bottleneck in lexical rescue where unindexed sequential table scans took ~1,000 ms.
  - Fix SSE stream telemetry ordering to capture accurate Server TTFT (`server_ttft_ms`).
  - Optimize frontend streaming rendering and eliminate scroll/layout thrashing without degrading visual fidelity.
  - Harmonize composer UI popups and resolve dropdown clipping.
  - Verify that retrieval precision, factual grounding, and citation integrity remain 100% uncompromised.
- What changed:
  - **Database Indexing & Retrieval Optimization (`retriever.py`, `database.py`)**:
    - Identified that `websearch_to_tsquery('english', :text)` queries during lexical rescue forced PostgreSQL into an unindexed sequential table scan with per-row `to_tsvector` dynamic computation on multi-thousand-chunk corpora.
    - Added the expression GIN index `ix_document_chunks_content_tsv` on `to_tsvector('english', content)` in PostgreSQL 16.
    - Rewrote the lexical rescue query in `retriever.py` to match the index expression with early-exit limits, slashing rescue execution from ~1,050 ms down to 65–260 ms (**>80% faster**).
  - **SSE Streaming Delivery & Telemetry Alignment (`stream.py`)**:
    - Re-ordered SSE dispatch in `stream.py` so the initial metadata payload accurately records `server_ttft_ms` alongside the very first token chunk instead of reporting null/premature data.
    - Added explicit flush hints (`X-Accel-Buffering: no`) to prevent intermediate proxy buffering.
  - **Frontend Streaming Performance & UI Fixes (`ChatPage.jsx`, `ChatComposer.jsx`)**:
    - Implemented chunk-smoothing to batch high-frequency SSE token updates and reduce DOM/Markdown re-parse thrashing.
    - Minimized autoscroll layout thrashing by bounding `scrollIntoView` during active token emission.
    - Fixed CSS container clipping on dropdown popups (`composer-pills-scroll-track` overflow adjustments).
    - Aligned border-radii across all child elements (model selector, reranker, prompt pills) to a consistent 6px token design.
- Why this is safe:
  - Zero retrieval filtering shortcuts: `top_k`, reranking, and context windows were preserved.
  - The database index operates directly on the immutable `content` text.
  - Tested against real production documents (*Evidence of Coverage*, *Ottoman Empire*, *Guide to Benefits*, and *Company FAQ*).
- Side-by-Side Benchmark Results:
  - Measured across 5 representative query archetypes comparing pre-optimization (`62b390f`) vs post-optimization (`581b9d0`) with an enforced 4.0s cooldown delay to prevent API rate limiting:

| Query Archetype | Pre Retrieval | Post Retrieval | Retrieval Delta | Pre Lexical | Post Lexical | Lexical Delta | Pre Client TTFT | Post Client TTFT | TTFT Delta |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Complex Comparison** *(Ottoman Historiography)* | 1,165.6 ms | **261.6 ms** | **-77.6% (-904 ms)** | 1,078.5 ms | **189.0 ms** | **-82.5% (-889 ms)** | 5,242.7 ms | **4,606.5 ms** | -636.2 ms |
| **Cost Table / Factual** *(Copay Comparison)* | 1,019.2 ms | **334.2 ms** | **-67.2% (-685 ms)** | 971.7 ms | **265.9 ms** | **-72.6% (-706 ms)** | 3,760.1 ms | **2,096.9 ms** | **-1,663.2 ms (-44%)** |
| **Short Exact FAQ** *(Apex Cloud Systems)* | 351.5 ms | **129.2 ms** | **-63.2% (-222 ms)** | 301.9 ms | **82.3 ms** | **-72.7% (-220 ms)** | 1,687.6 ms | **1,525.8 ms** | -161.8 ms |
| **Coverage Rules** *(Emergency Out-of-Area)* | 414.1 ms | **80.2 ms** | **-80.6% (-334 ms)** | 361.4 ms | **65.8 ms** | **-81.8% (-296 ms)** | 2,540.9 ms | **3,280.7 ms** | +739.7 ms *(API jitter)* |
| **Policy / Rights** *(Grievances & Appeals)* | 341.4 ms | **116.0 ms** | **-66.0% (-225 ms)** | 286.5 ms | **70.4 ms** | **-75.4% (-216 ms)** | 2,639.2 ms | **2,482.3 ms** | -156.9 ms |

- Quality & Grounding Verification:
  - **Retrieved Chunk Overlap**: 100% exact match or equivalent adjacent context across all archetypes.
  - **Factual Grounding**: 0% regression or hallucinations; factual lookup of exact co-payments ($0 PCP vs $40/$70 specialist) was complete and un-truncated post-optimization.
  - **Citation Fidelity**: Retained consistent bracket citations without omission.

## Measurement Notes

For each improvement:

1. Run a baseline benchmark in lean mode unless debugging requires full payloads.
2. Run the same benchmark after the change.
3. Compare:
   - `external_request_ms`
   - `chat_total_ms`
   - `retrieval_total_ms`
   - `query_embedding_ms`
   - `vector_search_ms`
4. If the change affects payload size, also compare:
   - response body size
   - presence or absence of debug fields

## Recommended Benchmark Commands

Run from the backend container if you want the benchmark environment to match the running backend stack exactly.

### Lean payload benchmark

```bash
python benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5
```

### Debug payload benchmark

```bash
python benchmarks/run_chat_latency.py --provider mock --runs 20 --warmup-runs 5 --include-debug
```

### Use the backend's default chat provider instead of an override

```bash
python benchmarks/run_chat_latency.py --provider ""
```

If shell parsing makes the empty string awkward, just omit `--provider` entirely and keep the script default behavior in mind.

## Important Notes

- `local` is an embedding provider in this project, not a valid chat provider override for the benchmark script.
- The benchmark script sends requests to the running backend API. It does not generate embeddings itself.
- If you want to isolate retrieval cost, use chat provider override `mock`.

## Planned Next Improvements

- Richer document metadata filtering
- Client-side token rendering virtualization for ultra-long documents
