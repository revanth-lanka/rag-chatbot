# Ingestion Improvements Log

## 2026-04-12 - Native PDF/DOCX Parsing And Structured Re-Ingestion

Status: completed

Area: document ingestion quality

Goal:

- ingest machine-generated PDF and DOCX files directly instead of relying on copy-pasted `.txt`
- preserve more document structure for chunking and later retrieval improvements
- keep the rollout local, synchronous, and non-OCR

What changed:

- added `pdfplumber`-based PDF parsing with repeated header/footer cleanup and semantic table-row extraction
- added `python-docx`-based DOCX parsing that preserves paragraph, heading, list, and table order
- added structured chunking for parsed files so headings stay attached and table rows are not split
- kept file-upload dedupe based on raw uploaded bytes for predictable duplicate handling
- exposed `source_format` and `parser_name` in document responses

Why this matters:

- benefit rows and table-heavy healthcare documents can now be ingested in a cleaner form
- retrieval and answer quality improve because chunk text is less damaged than copy-pasted PDF text
- the existing Phase 1 answer-quality logic now receives better source chunks without needing more prompt work

Important limits:

- OCR is not supported
- uploads are still synchronous
- old documents must be manually deleted and re-uploaded from the original PDF or DOCX to benefit from the new parser path

## 2026-04-13 - Parsed Chunk Cleanup And Short Fragment Coalescing

Status: completed

Area: structured chunk quality after PDF parsing

Goal:

- reduce weak tiny chunks created from broken PDF table rows and short parsed fragments
- keep fixes general so they improve future parsed documents too, not just one insurance file

What changed:

- added smarter coalescing so very short same-section parsed fragments can merge into an adjacent chunk even when one side is table-like
- kept the merge narrow by requiring a short fragment and close structural alignment
- re-ingested the source PDF after the change so stored chunks were rebuilt with the improved chunker

Why this matters:

- fewer tiny broken chunks means retrieval is less likely to surface half-rows or dangling fragments
- answer routing and support retrieval work better when the stored evidence is more complete

Measured result on the re-ingested test PDF:

- chunks under `160` characters dropped from `11` to `9`
- chunks under `120` characters dropped from `5` to `3`
- chunks under `100` characters dropped from `3` to `1`

Easy explanation:

- instead of leaving a tiny broken row on its own, the parser now tries to keep that small piece attached to the nearby chunk it belongs with.
