# Retrieval Improvements Log

This file tracks retrieval-specific improvements made in the backend, why they were made, and how they affect grounded search behavior.

## 2026-05-21 - FAQ Stemming, Short-Query Rescue, And Clarification Guardrail Tuning

Status: completed

Area: FAQ retrieval reliability for short natural-language questions

Goal:

- make short FAQ questions like `What services do you offer?` retrieve grounded matches more reliably
- keep the standalone RAG API unchanged while improving backend retrieval tolerance
- avoid incorrectly classifying normal questions that merely contain phrases like `is this`

What changed:

- switched PostgreSQL full-text search from `simple` to `english` for the stored `search_vector` expression
- switched sparse-query generation from `websearch_to_tsquery('simple', ...)` to `websearch_to_tsquery('english', ...)`
- added schema-upgrade logic that rebuilds the generated `search_vector` column when an older database still uses `simple`
- lowered the lexical-rescue gate from `3` normalized terms to `2` so short FAQ questions can use the rescue path
- changed sparse-query text building so it preserves raw plural forms like `services` and lets PostgreSQL stemming handle normalization instead of singularizing first
- narrowed clarification-fragment matching so embedded phrases like `is this` inside normal questions do not short-circuit retrieval

Why this matters:

- the old `simple` text-search config treated `service` and `services` as different tokens
- short natural questions often only contain two strong terms, so the old lexical-rescue gate could skip the exact fallback that should have saved retrieval
- the old clarification rule could treat a normal question such as `What card is this benefits guide for?` as fragmentary before retrieval even began

Easy explanation:

- the backend now stems words more intelligently, gives short FAQ questions a second chance, and avoids bailing out on normal questions just because they contain `is this`.

## 2026-09-29 - GIN Expression Indexing for Lexical Fallback & Rescue

Status: completed

Area: Database indexing, full-text search acceleration, and lexical rescue latency

Goal:

- eliminate the 950–1,100 ms latency stall observed during full-text lexical rescue on multi-thousand-chunk corpora
- prevent CPU-intensive sequential scans computing `to_tsvector` on the fly for every table row
- ensure sub-300ms total retrieval latency across all query archetypes without dropping candidates or altering relevance

What changed:

- added PostgreSQL expression GIN index `ix_document_chunks_content_tsv` on `to_tsvector('english', content)`
- updated automatic database schema upgrade scripts in `backend/app/db/database.py` to create the index safely with `IF NOT EXISTS`
- updated the lexical rescue SQL query in `backend/app/retrieval/retriever.py` to match the exact GIN index expression (`to_tsvector('english', content) @@ websearch_to_tsquery('english', :text)`)
- applied candidate deduplication and query limit bounds to prevent over-fetching when dense vector retrieval has already captured strong candidates

Why this matters:

- previously, when dense vector search returned weak or sparse keyword matches, lexical rescue triggered an unindexed table scan, parsing thousands of document chunks dynamically and dominating request latency
- with the GIN expression index, PostgreSQL performs an instant inverted-index bitmap scan directly against indexed tokens
- lexical rescue execution dropped from ~1,050 ms down to 65–260 ms (**>80% faster**) with 100% preservation of retrieved context chunks and zero impact on grounding accuracy

Easy explanation:

- lexical rescue now uses a precomputed database index rather than re-reading every chunk from scratch, eliminating a full 1-second lag when keyword fallback triggers.

## 2026-09-29 - Cross-Encoder Neural Rerank Default & Guardrail Calibration to 0.40

Status: completed

Area: Reranking precision, keyword-frequency debiasing, and low-confidence guardrail calibration

Goal:

- eliminate factual recall failures caused by keyword-frequency heuristic ranking on dense queries (e.g. Sultan Suleiman 1566 territorial extent)
- calibrate the low-confidence cutoff threshold from `0.45` to `0.40` to capture valid semantic matches with specialized domain vocabulary (e.g. Devshirme and palace education tracks)
- establish `neural` (TinyBERT cross-encoder via FlashRank) as the default reranking strategy
- maintain `top_k = 3` to protect generation latency and prevent prompt attention dilution

What changed:

- updated `chat_rerank_strategy_default` to `"neural"` in `backend/app/core/config.py`, `backend/.env`, and `backend/.env.example`
- updated `chat_min_top_similarity_score` to `0.40` in `backend/app/core/config.py`, `backend/.env`, and `backend/.env.example`
- documented empirical case studies and architectural trade-offs in `docs/RAG_ARCHITECTURAL_DECISIONS.md`

Why this matters:

- in `hybrid` mode, heuristic lexical sorting scored chunks heavily based on repetition of query tokens, penalizing concise factual passages that only state the exact answer once, pushing them outside the FlashRank window
- in `neural` mode, the top 15 raw candidates from hybrid retrieval are fed directly to FlashRank cross-encoder without intermediate keyword sort, successfully elevating the true answer chunk to Rank #1 in ~8 ms on CPU
- lowering the guardrail from `0.45` to `0.40` admits valid chunks that were previously falsely rejected before reaching the LLM, while adversarial probing confirmed that hallucination protection is properly enforced by prompt grounding rather than bi-encoder score cutoffs

Easy explanation:

- the system now defaults to deep semantic cross-attention instead of just counting repeated keywords, and safely allows relevant answers through without false rejections.

