# LLM Improvements Log

This file tracks LLM-facing improvements made in the project, why they were made, and how they changed answer quality, groundedness, and user-facing chat behavior.

## Scope

This log is for improvements related to:

- chat providers and model routing
- prompt construction and prompt size
- answer style and end-user phrasing
- groundedness and guardrails
- query handling before retrieval when it directly improves answer quality

For retrieval and backend latency work, see `docs/latency-improvements-log.md`.

## Completed Improvements

### 2026-04-05 - Stage 3.1 Groq Dedicated Chat Provider

- Status: completed
- Area: hosted chat provider integration
- Goal:
  - Add a fast real LLM provider for business-facing chat
  - Keep provider handling explicit across backend and frontend
- What changed:
  - Added `groq` as a dedicated chat provider
  - Added provider-specific config for API key, base URL, and model name
  - Implemented non-streaming and streaming generation through the Groq OpenAI-compatible API
  - Added Groq to provider status reporting and the frontend provider picker
- Main files changed:
  - `backend/app/chat/provider.py`
  - `backend/app/core/config.py`
  - `backend/app/api/routes/providers.py`
  - `frontend/src/lib/chat.js`
  - `backend/tests/unit/test_groq_provider.py`
- Why this matters:
  - The app can use a real hosted LLM instead of only mock responses
  - Provider selection is clearer and easier to benchmark
- Verification:
  - `python -m unittest tests.unit.test_groq_provider`

### 2026-04-05 - Stage 3.2 Groq Default And UI Timing Chips

- Status: completed
- Area: live chat experience and timing visibility
- Goal:
  - Make Groq the normal chat provider for the deployed app
  - Show user-facing stream timing in the chat UI
- What changed:
  - Streaming chat messages now record first-chunk and total stream timings in the frontend
  - The transcript metadata row now shows `Prep`, `First chunk`, and `Stream total`
  - Active runtime defaults were updated to use Groq as the chat provider
- Main files changed:
  - `frontend/src/AppRouter.jsx`
  - `frontend/src/components/ChatTranscript.jsx`
  - `backend/.env`
  - `backend/.env.example`
  - `docker-compose.yml`
- Why this matters:
  - End users can see how the model is responding in real time
  - The team can validate real-provider chat behavior more easily during demos and testing

### 2026-04-08 - Cross-Chunk Prompt Robustness

- Status: completed
- Area: retrieval-to-prompt handoff
- Goal:
  - Reduce cases where the first retrieved chunk is only a heading or lead-in, while the real answer is in the next chunk
- What changed:
  - Chat preparation now fetches a wider prompt-candidate window before budgeting
  - Prompt candidates are lightly reranked by question-term overlap before final budget trimming
  - Prompt budgeting no longer stops too early after the first truncated chunk
- Main files changed:
  - `backend/app/chat/service.py`
  - `backend/app/chat/prompt_builder.py`
  - `backend/app/core/config.py`
  - `backend/tests/unit/test_prompt_budgeting.py`
- Why this matters:
  - The LLM sees better supporting context
  - Split-answer failures become less likely without hardcoding document-neighbor logic
- Easy explanation:
  - Before this change, the model could receive the introduction but miss the actual answer.
  - After this change, it gets a better chance of seeing the answer-bearing chunk too.

### 2026-04-08 - User-Facing Prompt Polish

- Status: completed
- Area: answer style and user experience
- Goal:
  - Make answers sound natural for end users instead of sounding like internal RAG/debug output
- What changed:
  - Prompt context labels were simplified to neutral `Source N` labels
  - Prompt instructions now tell the model not to mention filenames, chunk numbers, or retrieval mechanics
  - The system prompt was tightened so direct factual answers should answer and stop
  - Prompt instructions now discourage speculative caveats and unnecessary side notes
- Main files changed:
  - `backend/app/chat/prompt_builder.py`
  - `backend/app/core/config.py`
  - `backend/tests/unit/test_prompt_budgeting.py`
- Why this matters:
  - Answers are cleaner and more business-friendly
  - Provenance stays available in the UI without leaking backend language into the answer
- Easy explanation:
  - We taught the model to sound more like a product assistant and less like a debug console.

### 2026-04-08 - Stage 3.3 Prompt De-Duplication And Small Groq Benchmark

- Status: completed
- Area: prompt size and provider-facing efficiency
- Goal:
  - Reduce repeated instructions inside prompts
  - Keep groundedness rules while making the prompt smaller
- What changed:
  - Moved most behavior guidance to the system prompt
  - Simplified the user prompt so it mainly contains excerpts, the question, and short style rules
  - Added a small fixed Groq case set for more repeatable quality and latency checks
- Main files changed:
  - `backend/app/chat/prompt_builder.py`
  - `backend/app/core/config.py`
  - `backend/benchmarks/cases/groq_small_fixed_cases.json`
  - `backend/tests/unit/test_prompt_budgeting.py`
- Why this matters:
  - Smaller prompts reduce wasted tokens
  - The model gets clearer instructions with less repetition
- Measured outcome:
  - Average prompt size was reduced by about `593` characters, roughly `17.5%`, in the recorded Stage 3.3 prompt-size comparison

### 2026-04-09 - Zero-Context No-Answer Guardrail

- Status: completed
- Area: groundedness enforcement
- Goal:
  - Stop the model from answering from general knowledge when retrieval finds no usable context
- What changed:
  - Chat preparation now short-circuits to a safe fallback answer when no prompt context remains
  - Non-streaming chat returns the fallback without calling the provider
  - Streaming chat sends metadata, one fallback chunk, and a done event without calling the provider
  - The fallback message was set to `I don't have enough information to answer that right now.`
- Main files changed:
  - `backend/app/chat/service.py`
  - `backend/app/core/config.py`
  - `backend/app/chat/types.py`
  - `backend/tests/unit/test_chat_service_latency.py`
- Why this matters:
  - This is the first hard guardrail against hallucinated answers on out-of-scope questions
  - It fixes the earlier failure mode where `0 sources` could still produce a confident world-knowledge answer
- Easy explanation:
  - If the bot has nothing solid to work with, it now says so instead of guessing.

### 2026-04-09 - Low-Confidence Retrieval Guardrail

- Status: completed
- Area: answer safety for weak matches
- Goal:
  - Stop the model from answering confidently when retrieval finds only weak or broad matches
- What changed:
  - Added chat-specific confidence checks on the prompt-relevant matches
  - The chat layer now uses this rule:
    - if top match score is below `0.45`, fall back
    - if top match score is at least `0.75`, allow the answer directly
    - otherwise, check the average score of the top `3` prompt-limited chunks and fall back if that average is below `0.40`
  - These checks happen after retrieval, reranking, and prompt budgeting, but before provider generation
- Main files changed:
  - `backend/app/chat/guardrails.py`
  - `backend/app/chat/service.py`
  - `backend/app/core/config.py`
  - `backend/tests/unit/test_chat_service_latency.py`
- Why this matters:
  - A generic retrieval threshold alone was not enough for business-safe answers
  - Terms such as `health` and `benefits` appeared in the corpus but still produced misleading matches in user testing
- Easy explanation:
  - The bot now trusts one clearly strong first chunk, but for medium-confidence cases it also checks whether the small set of prompt chunks looks solid overall.

### 2026-04-09 - Clarification Guardrail For Vague Queries

- Status: completed
- Area: ambiguous user questions
- Goal:
  - Ask a short follow-up instead of forcing an answer when the question is too vague or malformed
- What changed:
  - Added clarification handling for ambiguous single-topic queries such as `what are benefits?`
  - Added clarification handling for abstract `who is ...` questions such as `who is health?`
  - Clarification happens before retrieval, so the system avoids wasted search and LLM calls
- Main files changed:
  - `backend/app/chat/guardrails.py`
  - `backend/app/chat/service.py`
  - `backend/app/core/config.py`
  - `backend/tests/unit/test_chat_service_latency.py`
- Why this matters:
  - The assistant behaves more like a real product assistant and less like a keyword matcher
  - It prevents awkward grounded-but-wrong answers to unclear user intent
- Easy explanation:
  - If the question is too fuzzy, the bot now asks the user to be a little more specific.

### 2026-04-10 - Short Vague Query Clarification Expansion

- Status: completed
- Area: end-user handling for broad 1-2 word prompts
- Goal:
  - Stop the chatbot from guessing when users type very short broad topic prompts such as `doctor`, `hospital`, or `health`
  - Keep short but specific fact phrases like `primary care copay` and `out-of-pocket maximum` working normally
- What changed:
  - Expanded the clarification guardrail to catch vague 1-2 word healthcare topic queries before retrieval
  - Single-word queries now clarify by default instead of relying on a domain word list
  - Incomplete question fragments and filler-only phrases now also clarify before retrieval instead of falling through to the no-context fallback
  - Low-information multiword prompts made mostly of filler or pronoun-like terms now also clarify before retrieval
  - Switched clarification replies to the generic product message instead of term-specific prompts
  - Added a specific-intent escape hatch so short fact, cost, definition, and comparison phrases still go through retrieval
  - Punctuation variants like `hospital?` are treated the same as `hospital`
- Main files changed:
  - `backend/app/chat/guardrails.py`
  - `backend/app/chat/service.py`
  - `backend/tests/unit/test_chat_service_latency.py`
- Why this matters:
  - Broad noun-only prompts were producing awkward grounded-but-misaligned answers in the end-user experience
  - A short clarification is more natural than forcing a guess from weak matches
- Easy explanation:
  - If the user only types one word, types an incomplete fragment like `what is`, or sends a low-information phrase like `what is this ... what is that`, the chatbot now asks them to say a bit more instead of trying to answer from whatever keyword match it finds.

### 2026-04-09 - Query Typo Normalization Before Retrieval

- Status: completed
- Area: user input quality before retrieval
- Goal:
  - Improve retrieval for common misspellings without adding heavy spell-correction infrastructure
- What changed:
  - Added lightweight query normalization before retrieval
  - Added controlled replacements for common healthcare/domain typos such as `hosppital -> hospital`
  - Added domain-aware fuzzy correction against a curated vocabulary using Python `difflib`
  - Normalization only runs on the user query, not on stored documents
- Main files changed:
  - `backend/app/chat/guardrails.py`
  - `backend/app/chat/service.py`
  - `backend/tests/unit/test_chat_service_latency.py`
- Why this matters:
  - End users often misspell domain terms
  - Fixing obvious typos before retrieval improves grounded answers and reduces avoidable failures
- Easy explanation:
  - If the user types a close misspelling, the chatbot now fixes the question first and then searches.

### 2026-04-09 - Hybrid Lexical Rescue For Benefit-Table Queries

- Status: completed
- Area: retrieval-to-prompt quality for factual plan questions
- Goal:
  - Rescue exact benefit rows when vector retrieval alone ranks broad nearby text above the real answer
  - Improve questions about copays, premiums, out-of-pocket limits, and similar fact-table entries without re-ingesting the corpus yet
- What changed:
  - Added a chat-only lexical rescue path on top of normal vector retrieval
  - For likely benefit/fact queries, chat retrieval now runs a supplemental text match over chunk text using normalized query terms, phrase patterns, and cost signals
  - Vector matches and lexical rescue matches are merged before chat prompt reranking and budgeting
  - Short two-term fact queries now prefer stronger summary chunks over weaker phrase-order matches during prompt reranking
  - Added focused tests covering the primary-care copay rescue path
- Main files changed:
  - `backend/app/retrieval/service.py`
  - `backend/app/chat/service.py`
  - `backend/tests/unit/test_retrieval_ann.py`
  - `backend/tests/unit/test_chat_service_latency.py`
  - `backend/.env.example`

### 2026-04-13 - Reimbursement Deadline Routing And Cleaner Filing Answers

- Status: completed
- Area: routed answer quality for reimbursement and filing-deadline questions
- Goal:
  - stop reimbursement filing-deadline questions from being mistaken for generic plan-response deadline questions
  - keep reimbursement answers direct instead of pulling in extra submission-detail sentences
- What changed:
  - added a dedicated `reimbursement_deadline` subtype so questions like `How long does a member have to request reimbursement ...` no longer route to the generic deadline path
  - tightened evidence checks so reimbursement filing deadlines require both reimbursement cues and a filing-time phrase such as `within 12 months`
  - improved reimbursement support retrieval scoring so filing-deadline chunks rank above unrelated plan-answer deadline chunks
  - updated the reimbursement composer to prefer the strongest bill-and-documentation instruction for paid-bill questions
  - trimmed reimbursement-deadline composer output to the actual deadline sentence when a chunk also contains extra documentation details
- Main files changed:
  - `backend/app/chat/guardrails.py`
  - `backend/app/chat/answering.py`
  - `backend/app/retrieval/service.py`
  - `backend/tests/unit/test_chat_service_latency.py`
  - `backend/tests/unit/test_retrieval_ann.py`
- Why this matters:
  - end users now get the real filing deadline instead of a wrong `within 72 hours` style answer
  - reimbursement answers stay cleaner and more customer-facing
- Easy explanation:
  - the chatbot now knows the difference between `how long does the plan have to answer` and `how long do I have to file for reimbursement`, and it answers those as different tasks.
- Why this matters:
  - Some plan answers were already in the stored chunks, but the exact row never reached the prompt because broad semantic matches crowded it out
  - This gives short factual benefit rows another path into the prompt without weakening the existing vector retrieval flow
- Easy explanation:
  - If the normal semantic search misses an exact benefit row like `Primary care office visits $0 / $25`, the chatbot now also does a lightweight keyword-style rescue and can pull that row back into the answer context.
- Follow-up note:
  - This is the short-term fix for the current ingested text.
  - Table-aware re-ingestion is still the better long-term fix for benefit charts and broken table text.

### 2026-04-11 - Routed Answer-Shape Layer And Future-Doc Structure Metadata

- Status: completed
- Area: routed answer quality, client-facing safety, and future document structure
- Goal:
  - Improve routed question types such as deadlines, responsibility, inclusion/exclusion, reimbursement, process, and overview questions in a general way
  - Reduce cases where the model saw the right text but still answered the wrong shape of question
  - Add lightweight structure metadata for newly ingested documents without requiring a schema rewrite
- What changed:
  - Query routing now carries `intent`, `subtype`, `polarity`, and required-evidence hints instead of only a top-level intent
  - Added online-first support retrieval for inclusion/exclusion and process-explanation question types
  - Added a compact evidence-pack step that trims routed evidence down to the most relevant local sentences and nearby list rows
  - Added deterministic composers for narrow routed questions such as deadlines, responsibility answers, exclusion lists, reimbursement steps, appeal depth, and overview summaries
  - Added a final answer-policy validator that blocks client-facing leaks such as `Section 5.3`, `Chapter 4`, `Source 1`, and `in this document`
  - Specialized streamed answers now use the same final answer-policy gate as non-streaming answers
  - Newly ingested chunks now store lightweight structure hints in metadata such as `heading_path`, `section_anchor`, `line_kind`, `sentence_offsets`, `table_like_row`, and `label_value_row`
- Main files changed:
  - `backend/app/chat/guardrails.py`
  - `backend/app/chat/answering.py`
  - `backend/app/chat/service.py`
  - `backend/app/retrieval/service.py`
  - `backend/app/ingestion/service.py`
  - `backend/tests/unit/test_chat_service_latency.py`
  - `backend/tests/unit/test_prompt_budgeting.py`
  - `backend/tests/unit/test_ingestion_structure_metadata.py`
- Why this matters:
  - Routed questions now have a better chance of answering the user’s actual intent instead of only summarizing whichever chunk ranked first
  - Client-facing answers are safer because the backend can now replace document-structure leakage before it reaches the user
  - Future documents carry more useful structure for later retrieval improvements without forcing immediate re-ingestion of the current corpus
### 2026-04-09 - Table-Answer Sentence Polish

- Status: completed
- Area: end-user phrasing for benefit and cost answers
- Goal:
  - Make short table-derived answers sound like natural customer-facing sentences instead of raw fragments
  - Improve streaming and non-streaming chat behavior without disturbing longer grounded answers that already read well
- What changed:
  - Updated the system prompt to tell the model to rewrite short table/chart answers as complete natural sentences
  - Added matching prompt style rules for direct fact answers so cost and benefit rows should not start with bare dollar amounts or labels like `From network providers:`
  - Added a completeness rule so paired values like in-network and out-of-network amounts should both be included when they are part of the same answer
  - Kept the change narrow so it mainly affects short factual benefit answers
- Main files changed:
  - `backend/app/core/config.py`
  - `backend/app/chat/prompt_builder.py`
  - `backend/.env.example`

### 2026-04-10 - Definition-Aware Prompt Reranking

- Status: completed
- Area: retrieval-to-prompt quality for definition-style questions
- Goal:
  - Improve answers to definition questions such as `What is considered a medical emergency under this plan?`
  - Prefer chunks that actually define a term instead of chunks that only mention the term later in follow-up coverage rules
- What changed:
  - Added a definition-aware rerank signal in chat preparation
  - Definition-style questions now prefer chunks containing patterns like `X is when`, `X means`, or `X refers to`
  - When several chunks match those patterns, the reranker now prefers the chunk where the definition appears earlier, so cleaner definition chunks beat mixed chunks with unrelated lead-in text
  - Added targeted regression tests covering the medical-emergency definition path
- Main files changed:
  - `backend/app/chat/service.py`
  - `backend/tests/unit/test_chat_service_latency.py`
- Why this matters:
  - Some definition questions were grounding to the wrong nearby rule even though the real definition was already present in the retrieved set
  - This keeps the change general: it improves definition-style questions without hardcoding a single document answer
- Easy explanation:
  - If the user asks what something is, the chatbot now tries harder to use the chunk that actually defines it.

### 2026-04-10 - Comparison-Question Support Retrieval

- Status: completed
- Area: retrieval-to-prompt quality for compare-style questions
- Goal:
  - Improve questions like `What is the difference between an appeal and a complaint?`
  - Avoid false fallbacks or broad process answers when the document contains separate definition-style chunks for each compared term
- What changed:
  - Comparison scaffolding words such as `difference` and `between` are now ignored as retrieval terms
  - Chat preparation now detects compare-style questions and loads comparison support matches separately
  - The comparison support path fetches definition-style chunks for each compared term and places them ahead of the broader prompt candidates
  - When those direct support chunks already cover the compared terms, prompt building now uses those support chunks alone instead of adding a broader chunk that can pull the answer off-topic
  - Compare-style prompts now add direct answer instructions such as explaining each compared term plainly and avoiding extra setup definitions
  - Default chat temperature was lowered to `0.0` to reduce answer drift across repeated identical grounded questions
  - Added focused regression tests for appeal-vs-complaint style questions
- Main files changed:
  - `backend/app/retrieval/service.py`
  - `backend/app/chat/service.py`
  - `backend/tests/unit/test_retrieval_ann.py`
  - `backend/tests/unit/test_chat_service_latency.py`
- Why this matters:
  - Compare-style questions often need two separate grounded definitions, not one broad procedural chunk
  - This fix is isolated to comparison questions, so it improves that class of question without disturbing unrelated factual answers
- Easy explanation:
  - If the user asks for the difference between two things, the chatbot now tries to pull one supporting chunk for each thing instead of relying on one fuzzy mixed match.
  - If those direct support chunks are already enough, the chatbot keeps the prompt focused on them so the answer stays more direct.
  - It also gives the model a more direct instruction to answer as `X is ...` and `Y is ...`, and with lower temperature the same question should behave more consistently.
  - `backend/tests/unit/test_prompt_budgeting.py`
- Why this matters:
  - End users expect the chatbot to sound like a product assistant, not like a copied row from a benefits chart
  - Questions such as copays and out-of-pocket limits now read more naturally while still staying grounded
- Easy explanation:
  - The chatbot still answers directly, but now it says the answer as a normal sentence instead of dropping a table row into the chat.

### 2026-04-10 - Lower Groq Output Token Cap For Short QA

- Status: completed
- Area: Groq response budgeting
- Goal:
  - Reduce unnecessary output budget for short factual RAG answers
  - Keep answer quality acceptable for normal plan/member questions
- What changed:
  - Reduced `CHAT_MAX_OUTPUT_TOKENS` from `700` to `300`
  - Updated the tracked example env to match the new default
- Main files changed:
  - `backend/app/core/config.py`
  - `backend/.env.example`
- Why this matters:
  - Most grounded plan QA answers in this project are short and do not need a `700` token ceiling
  - A lower ceiling is a safer first step than aggressively trimming prompt instructions
- Verification:
  - Low-volume Groq stream benchmark on the fixed case set:
    - `backend/benchmarks/output/2026-04-10_Fri_groq-max-tokens-300/before_700_stream.md`
    - `backend/benchmarks/output/2026-04-10_Fri_groq-max-tokens-300/after_300_stream.md`
  - Spot-check question:
    - `What should a member do if their doctor or specialist leaves the network?`
- Important interpretation:
  - The lower cap did not produce a clear latency win in the low-volume Groq stream benchmark because provider-side variance dominated the run
  - Quality remained acceptable on the checked broader answer, so the new cap is still a reasonable default for short factual QA

### 2026-04-10 - Responsibility-Question Support Retrieval

- Status: completed
- Area: retrieval-to-prompt quality for responsibility and ownership questions
- Goal:
  - Improve questions such as `Who is responsible for getting prior authorization?`
  - Prefer direct ownership statements over nearby related policy text
- What changed:
  - Added a responsibility-style question detector for prompts such as `who is responsible for`, `who needs to`, and `who must`
  - Responsibility questions now load focused support matches separately, similar to the earlier comparison-question support path
  - The new support scorer prefers chunks with direct ownership patterns such as `is the responsibility of`, `responsible for`, `must receive approval`, or `gets prior authorization`
  - Responsibility prompts now add a direct-answer reminder telling the model to name the responsible actor first and keep background details secondary
  - Added focused regression tests so this question type improves without breaking the already-working definition, comparison, and benefit-table paths
- Main files changed:
  - `backend/app/retrieval/service.py`
  - `backend/app/chat/service.py`
  - `backend/app/chat/prompt_builder.py`
  - `backend/tests/unit/test_chat_service_latency.py`
- Why this matters:
  - Some grounded answers were pulling in adjacent policy text and producing a partially correct but less direct answer
  - This keeps the fix general: it improves responsibility-style questions as a class instead of hardcoding one document answer
- Easy explanation:
  - If the user asks who has to do something, the chatbot now tries harder to pull the chunk that directly says whose job it is.

## Current LLM Guardrail Behavior

The current chat flow now behaves like this:

1. Normalize obvious query typos when safe.
2. If the question is vague, return a clarification question.
3. Run vector retrieval for the normalized query.
4. For likely benefit-table questions, run a lightweight lexical rescue and merge rescued rows into the chat candidate set.
5. Rerank and budget the prompt context.
6. If no grounded context remains, return the fallback answer.
7. If retrieved matches are too weak overall, return the fallback answer.
8. Only call the LLM when grounded context is strong enough to support an answer.

## Recommended Verification Commands

Run from `backend/` with the local venv activated if you want a quick focused regression check:

```powershell
.\.venv\Scripts\python.exe -m unittest tests.unit.test_chat_service_latency tests.unit.test_groq_provider tests.unit.test_prompt_budgeting
```

For a full unit check:

```powershell
.\.venv\Scripts\python.exe -m unittest discover tests\unit
```

## Notes

- This file focuses on answer quality, groundedness, and model-facing behavior.
- For latency-specific benchmark history and ONNX/runtime work, see `docs/latency-improvements-log.md`.

### 2026-04-11 - Intent-Routed Support Retrieval and Debug Trace

- Status: completed
- Area: client-facing answer quality for complex question types
- Goal:
  - Improve deadline, responsibility, calculation, reimbursement, and broad-summary questions without breaking already-good grounded answers
  - Add internal tracing so misrouted answers are easier to debug
- What changed:
  - Added a deterministic query router in `guardrails.py` with explicit intents for clarification fragments, broad summaries, comparison, responsibility, deadline, calculation method, and appeal/reimbursement process questions
  - Added a safety-valve flow so specialized intents fall back to the normal fact path if support retrieval is empty, while weak broad-summary questions clarify instead of guessing
  - Added scoped support retrieval methods for deadline, calculation, appeal/reimbursement, and summary questions, plus same-document `chunk_index ±1` neighbor expansion with safe lower-bound clamping
  - Replaced hard support-chunk prepending with fused ranking using Reciprocal Rank Fusion plus the existing heuristic reranker
  - Added a strong-summary threshold so broad prompts like `Tell me about benefits` only answer when overview evidence is strong enough
  - Added optional debug trace output with detected intent, retrieval strategy, fallback path, and final chunk source metadata
- Main files changed:
  - `backend/app/chat/guardrails.py`
  - `backend/app/retrieval/service.py`
  - `backend/app/chat/service.py`
  - `backend/app/chat/prompt_builder.py`
  - `backend/app/chat/schemas.py`
  - `backend/app/chat/types.py`
  - `backend/app/core/config.py`
  - `backend/.env.example`
  - `backend/tests/unit/test_chat_service_latency.py`
  - `backend/tests/unit/test_retrieval_ann.py`
  - `backend/tests/unit/test_prompt_budgeting.py`
- Why this matters:
  - The chatbot now has a safer path for classes of questions that were previously pulling nearby-but-wrong chunks, especially deadline and responsibility questions
  - Broad, vague overview prompts are less likely to produce narrow subsection answers
  - Debug mode now explains which route and candidate sources were used, which makes production QA much easier
- Verification:
  - Focused local unit suites:
    - `tests.unit.test_chat_service_latency`
    - `tests.unit.test_retrieval_ann`
    - `tests.unit.test_prompt_budgeting`
    - `tests.unit.test_groq_provider`
  - Result:
    - `Ran 57 tests`, `OK`

### 2026-04-13 - Accuracy-First Hybrid Retrieval and Composer Narrowing

- Status: completed
- Area: client-facing chat accuracy with controlled latency
- Goal:
  - Stop unsafe instant local answers on routed question families that were still choosing the wrong fragment
  - Improve weak keyword-sensitive retrieval without adding a new search service or widening prompt context
- What changed:
  - Narrowed local answer composition to a strict allow-list so only the proven `reimbursement_deadline` subtype can return a backend-composed answer before the LLM
  - Added more precise routed subtypes for prior-authorization requirement questions, coverage-decision scope questions, covered-drug disagreement questions, Part D count-toward questions, and coinsurance-basis questions
  - Tightened evidence signatures so fast deadlines need a fast cue, appeal-depth needs real multi-level evidence, coinsurance-basis needs a true method phrase, and count-toward questions need the right direction
  - Added Postgres full-text sparse retrieval using a stored `search_vector` column plus a GIN index, then fused vector, sparse, and lexical candidates with Reciprocal Rank Fusion for chat retrieval
  - Extended debug trace with sparse-retrieval and composer-policy fields so QA can see whether a routed miss came from routing, sparse retrieval, composer blocking, or the LLM path
  - Added smaller subtype-specific prompt hints so routed LLM answers say the asked thing first without adding more broad prompt duplication
- Main files changed:
  - `backend/app/chat/guardrails.py`
  - `backend/app/chat/answering.py`
  - `backend/app/chat/prompt_builder.py`
  - `backend/app/chat/service.py`
  - `backend/app/chat/schemas.py`
  - `backend/app/retrieval/service.py`
  - `backend/app/db/models/chunk.py`
  - `backend/app/db/schema.py`
  - `backend/tests/unit/test_chat_service_latency.py`
  - `backend/tests/unit/test_retrieval_ann.py`
  - `backend/tests/unit/test_schema_hnsw.py`
- Why this matters:
  - Wrong instant local answers are now much less likely on deadline, responsibility, coverage-scope, appeal-depth, and coinsurance questions because those routes go through the LLM unless they are the one trusted reimbursement-deadline case
  - Sparse full-text retrieval gives the chatbot a stronger keyword-sensitive path for questions where the right answer exists in the document but vector retrieval alone pulls nearby text
  - Debug mode now tells us whether sparse retrieval ran, whether it helped, and whether the composer was blocked by policy, which makes future QA faster and more reliable
- Verification:
  - Focused backend unit suites:
    - `tests.unit.test_chat_service_latency`
    - `tests.unit.test_retrieval_ann`
    - `tests.unit.test_schema_hnsw`
  - Full backend unit suite:
    - `python -m unittest discover -s tests/unit`
  - Result:
    - `Ran 108 tests`, `OK`

### 2026-04-14 - Routed Support Retrieval Follow-Up Refinement

- Status: completed
- Area: follow-up accuracy refinement for routed chat questions
- Goal:
  - Improve the remaining routed misses found during live verification without widening prompt context or re-enabling unsafe local composers
- What changed:
  - Added stronger support retrieval patterns and scoring for drug-appeal depth questions so the system prefers chunks that clearly say there are five levels of appeal
  - Added a positive-direction support path for Part D `count toward` questions so inclusion questions stop drifting toward nearby exclusion text
  - Added a more direct disagreement/appeal-right support path for covered-drug decision questions
  - Improved support-text trimming so long glossary lines start near the matched evidence phrase instead of wasting prompt budget on unrelated prefix text
  - Added a coinsurance-specific support trimming path so provider-basis phrases like `contractually negotiated rates` and `Medicare Allowable Cost` stay visible to the LLM
- Main files changed:
  - `backend/app/retrieval/service.py`
  - `backend/app/chat/answering.py`
  - `backend/tests/unit/test_retrieval_ann.py`
- Why this matters:
  - The routed families that were still selecting the wrong fragment now surface the direct answer evidence much more consistently
  - This keeps the fix general: we improved how the retrieval layer recognizes these question shapes rather than hardcoding one document's answers
- Verification:
  - Full backend unit suite:
    - `python -m unittest discover -s tests/unit`
  - Result:
    - `Ran 112 tests`, `OK`
  - Targeted live questions re-verified:
    - `How are coinsurance amounts calculated for different providers?`
    - `How far can a drug appeal go?`
    - `What out-of-pocket costs count toward Part D drug spending?`
    - `What if the member disagrees with a plan decision about a covered drug?`
