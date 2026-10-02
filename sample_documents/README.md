# Sample Documents

This directory contains curated demonstration documents provided to test and evaluate the RAG Chatbot's ingestion pipeline, table extraction, and grounded retrieval capabilities across various document formats and query domains.

## Available Sample Documents

| Document | Format | Description & Test Domain | Recommended Test Queries |
| :--- | :--- | :--- | :--- |
| **`Evidence of Coverage 2026.pdf`** | PDF | Comprehensive healthcare insurance policy with complex benefit tiers, copay tables, and deductible rules. | - *"What is the monthly premium for this plan in 2026?"*<br>- *"Who is eligible for membership in this plan?"*<br>- *"What is the copay for emergency room visits?"* |
| **`Guide To Benefits.pdf`** | PDF | Structured employee health and coverage guideline document covering medical procedures and claim deadlines. | - *"What happens if a member moves out of the service area?"*<br>- *"How far can a prescription drug appeal go?"*<br>- *"What is the difference between an appeal and a complaint?"* |
| **`Ottoman_Empire.pdf`** | PDF | Detailed historical narrative document covering origins, sultans, military history, and geopolitical transformation. | - *"When was the Ottoman Empire founded and who was its first ruler?"*<br>- *"What was the significance of the Fall of Constantinople in 1453?"*<br>- *"How did the Ottoman Empire dissolve after World War I?"* |
| **`company_faq.txt`** | TXT | Corporate knowledge base covering business hours, customer support SLAs, refund policies, and data security standards. | - *"What is the response time for severity 1 support incidents?"*<br>- *"What encryption standards are used for customer data at rest?"*<br>- *"What is the company refund policy for milestone deliverables?"* |

## How to Test

1. **Via Frontend UI**:
   - Navigate to `http://localhost:3000/documents`.
   - Click **Upload Document** and select any file from this folder.
   - Once ingested and embedded, switch to `http://localhost:3000/chat`.
   - Ask any of the recommended questions above with either global corpus scope or scoped specifically to that document.

2. **Via API**:
   ```powershell
   # Ingest a sample PDF
   curl -X POST "http://localhost:8000/documents/ingest/file" `
     -F "file=@sample_documents/company_faq.txt"
   ```
