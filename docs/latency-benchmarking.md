# Chat Latency Benchmarking

This project now exposes stage-level latency for chat and retrieval so the team can measure where time is spent inside the RAG pipeline.

## What To Measure

For chat requests, use three separate numbers:

- `latency.retrieval.total_ms`
  - time spent inside the retrieval pipeline
- `latency.llm_generation_ms`
  - time spent waiting for the chat provider
- `latency.total_ms`
  - full backend chat time for `POST /chat/ask`

For retrieval requests, use:

- `latency.document_lookup_ms`
  - optional document existence check when `document_id` is provided
- `latency.query_embedding_ms`
  - time to embed the user question
- `latency.vector_search_ms`
  - time for the database similarity search
- `latency.total_ms`
  - total backend retrieval time for `POST /retrieval/search`

## Recommendation

If your goal is to evaluate the RAG system itself, benchmark with `provider=mock` on the chat endpoint. That keeps the LLM stage cheap and consistent, so retrieval becomes the main signal.

If your goal is user-perceived chat speed, run the same benchmark with a real provider and compare:

- retrieval latency
- LLM latency
- end-to-end latency

That gives you a clean answer to: "Is the slowdown coming from my RAG pipeline or from the model provider?"

## Suggested Folder Structure

Use this layout for latency work:

```text
backend/
  app/
    ...
  benchmarks/
    cases/
      sample_chat_cases.json
    run_chat_latency.py
  tests/
    unit/
      test_chat_service_latency.py
      test_timing.py
docs/
  latency-benchmarking.md
```

## Benchmark Workflow

1. Start the backend and database.
2. Make sure representative documents are already ingested.
3. Create a small set of realistic benchmark questions.
4. Run warmup requests first so connection setup and cold caches do not dominate.
5. Run at least 10 to 30 measured iterations per case.
6. Track `avg`, `p50`, and `p95`, not just one request time.

## Benchmark Script

Run the included script from the `backend` directory:

```powershell
python benchmarks/run_chat_latency.py
```

Each run now saves two timestamped files under `backend/benchmarks/output` by default:

- raw JSON results
- Markdown report

Useful options:

```powershell
python benchmarks/run_chat_latency.py --runs 20 --warmup-runs 5
python benchmarks/run_chat_latency.py --provider mock
python benchmarks/run_chat_latency.py --provider openai
python benchmarks/run_chat_latency.py --provider groq --rerank-strategy hybrid
python benchmarks/run_chat_latency.py --output benchmarks/results/chat-latency.json
python benchmarks/run_chat_latency.py --api-prefix /api/v1
```

If you are comparing chat rerank modes, run the same case set separately with:

- `--rerank-strategy fast`
- `--rerank-strategy hybrid`
- `--rerank-strategy neural`

That makes it easier to compare latency and answer quality without changing retrieval or provider settings between runs.

## Interpreting Results

Use these rules when reading the numbers:

- High `query_embedding_ms`
  - embedding provider is the main bottleneck
- High `vector_search_ms`
  - database indexing, data volume, or `top_k` is the main bottleneck
- Low retrieval latency but high `llm_generation_ms`
  - the model provider dominates the wait time
- Large difference between external request time and `latency.total_ms`
  - network, proxy, or client overhead is significant

## Good Benchmark Cases

Create cases from real usage patterns:

- short factual questions
- longer natural-language questions
- broad search across all documents
- document-scoped search with `document_id`
- low and high `top_k` values

Avoid benchmarking only one question. Latency changes with query length, retrieval scope, and result count.

If you use document-scoped cases, make sure the `document_id` exists in your current database. A missing document will return HTTP 404 and stop the benchmark run.

## Re-Embedding After Provider Changes

If you change `EMBEDDING_PROVIDER`, existing stored chunk embeddings should be regenerated so document vectors and query vectors come from the same embedding space.

You do not need to re-upload documents. Re-embed them instead:

```powershell
python scripts/reembed_all_documents.py --force
```

You can also target specific documents:

```powershell
python scripts/reembed_all_documents.py --document-ids 1,2,3 --force
```

This script calls:

- `GET /documents`
- `POST /documents/{document_id}/embeddings?force=true`

and updates the stored chunk embeddings in PostgreSQL using the backend's current embedding provider.
