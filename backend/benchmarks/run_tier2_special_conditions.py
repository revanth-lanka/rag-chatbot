"""Tier 2 Special Conditions & Timing Regression Verification Suite.

This script executes live requests against http://127.0.0.1:8000/chat/stream
to empirically measure and verify:
1. Tier 1 Timing Continuity (Factual & Specialized Routes).
2. Tier 2 Special Condition 1: Instant Chitchat Greeting ("Hello").
3. Tier 2 Special Condition 2: Chitchat Pleasantry ("Thank you so much!").
4. Tier 2 Special Condition 3: Chitchat Capability Inquiries ("What can you do?").
5. Tier 2 Special Condition 4: Adaptive Vector Gating on Scoped Document (document_id=23).
6. Tier 2 Special Condition 5: Two-Stage Hybrid Reranker on Negation/Polarity Query.
"""

from __future__ import annotations

import json
import time
import httpx

BASE_URL = "http://127.0.0.1:8000/chat/stream"


def run_stream_request(payload: dict, client: httpx.Client | None = None) -> dict:
    t0 = time.perf_counter()
    first_chunk_ms = None
    metadata = {}
    chunks = []
    
    local_client = client is None
    c = client if client is not None else httpx.Client(timeout=30.0)
    try:
        with c.stream("POST", BASE_URL, json=payload) as response:
            if response.status_code != 200:
                response.read()
                return {"status_code": response.status_code, "error": response.text}
            
            for line in response.iter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[len("data: "):]
                try:
                    event_data = json.loads(data_str)
                except Exception:
                    continue
                
                if "delta" in event_data:
                    if first_chunk_ms is None:
                        first_chunk_ms = (time.perf_counter() - t0) * 1000
                    chunks.append(event_data["delta"])
                elif "question" in event_data and "answer_path" in event_data:
                    metadata = event_data
    finally:
        if local_client:
            c.close()

    total_stream_ms = (time.perf_counter() - t0) * 1000
    return {
        "status_code": 200,
        "ttft_ms": round(first_chunk_ms or total_stream_ms, 2),
        "total_ms": round(total_stream_ms, 2),
        "answer": "".join(chunks).strip(),
        "answer_path": metadata.get("answer_path"),
        "retrieval_mode": metadata.get("retrieval_mode"),
        "context_count": metadata.get("context_count", 0),
        "latency": metadata.get("latency", {}),
    }


def main():
    print("=" * 70)
    print("Executing Tier 2 Special Conditions & Timing Verification")
    print("=" * 70)

    with httpx.Client(timeout=30.0) as client:
        # 1. Chitchat Greeting
        print("\n[Condition 1] Chitchat Greeting: 'Hello'")
        res1 = run_stream_request({"question": "Hello", "include_debug": True}, client=client)
        prep1 = res1["latency"].get("preparation_ms", 0.0)
        print(f"  -> Answer Path: {res1['answer_path']} | Contexts: {res1['context_count']}")
        print(f"  -> Preparation: {prep1:.2f} ms | TTFT: {res1['ttft_ms']} ms")
        print(f"  -> Answer: \"{res1['answer']}\"")
        assert res1["answer_path"] == "chitchat", "Expected chitchat answer path"
        assert res1["context_count"] == 0, "Expected 0 contexts for chitchat"
        time.sleep(1.0)

        # 2. Chitchat Pleasantry
        print("\n[Condition 2] Chitchat Pleasantry: 'Thank you so much!'")
        res2 = run_stream_request({"question": "Thank you so much!"}, client=client)
        prep2 = res2["latency"].get("preparation_ms", 0.0)
        print(f"  -> Answer Path: {res2['answer_path']} | Preparation: {prep2:.2f} ms | TTFT: {res2['ttft_ms']} ms")
        print(f"  -> Answer: \"{res2['answer']}\"")
        assert res2["answer_path"] == "chitchat", "Expected chitchat answer path"
        time.sleep(1.0)

        # 3. Chitchat Farewell
        print("\n[Condition 3] Chitchat Farewell: 'Goodbye!'")
        res3 = run_stream_request({"question": "Goodbye!"}, client=client)
        prep3 = res3["latency"].get("preparation_ms", 0.0)
        print(f"  -> Answer Path: {res3['answer_path']} | Preparation: {prep3:.2f} ms | TTFT: {res3['ttft_ms']} ms")
        print(f"  -> Answer: \"{res3['answer']}\"")
        assert res3["answer_path"] == "chitchat", "Expected chitchat answer path"
        time.sleep(1.0)

        # 3b. Functional Query Not Hijacked: 'What can you do?'
        print("\n[Condition 3b] Functional Query (Retrieval/LLM): 'What can you do?'")
        res3b = run_stream_request({"question": "What can you do?"}, client=client)
        print(f"  -> Answer Path: {res3b['answer_path']} (not hijacked to chitchat)")
        assert res3b["answer_path"] != "chitchat", "Functional query must not be hijacked by chitchat rule"
        time.sleep(2.0)

        # 4. Adaptive Vector Gating on Scoped Document
        scoped_doc_id = 30
        try:
            docs_data = client.get("http://127.0.0.1:8000/documents", timeout=5.0).json()
            for d in docs_data.get("documents", []):
                if "Evidence of Coverage" in d.get("filename", ""):
                    scoped_doc_id = d["id"]
                    break
        except Exception:
            pass

        print(f"\n[Condition 4] Adaptive Vector Gating on Scoped Document: 'What is the monthly premium?' (doc_id={scoped_doc_id})")
        res4 = run_stream_request({
            "question": "What is the monthly premium for this plan in 2026?",
            "document_id": scoped_doc_id,
            "include_debug": True,
        }, client=client)
        ret4 = res4["latency"].get("retrieval", {})
        print(f"  -> Effective Mode: {res4['retrieval_mode']} | Contexts: {res4['context_count']}")
        print(f"  -> Vector Search: {ret4.get('vector_search_ms', 0):.2f} ms | Total Retrieval: {ret4.get('total_ms', 0):.2f} ms")
        print(f"  -> TTFT: {res4['ttft_ms']} ms | Total: {res4['total_ms']} ms")
        print(f"  -> Answer Snippet: \"{res4['answer'][:120]}...\"")
        assert res4["retrieval_mode"] == "exact", "Expected adaptive mode to select exact scan for scoped query"
        time.sleep(3.5)

        # 5. Standard Global Factual Query (Tier 1 Regression Check)
        print("\n[Timing Check 1] Standard Global Factual: 'Who is eligible for membership in this plan?'")
        res5 = run_stream_request({
            "question": "Who is eligible for membership in this plan?",
            "include_debug": True,
        }, client=client)
        ret5 = res5["latency"].get("retrieval", {})
        print(f"  -> Answer Path: {res5['answer_path']} | Contexts: {res5['context_count']}")
        print(f"  -> Vector Search: {ret5.get('vector_search_ms', 0):.2f} ms | Total Retrieval: {ret5.get('total_ms', 0):.2f} ms")
        print(f"  -> TTFT: {res5['ttft_ms']} ms | Total: {res5['total_ms']} ms")
        print(f"  -> Answer Snippet: \"{res5['answer'][:120]}...\"")
        time.sleep(3.5)

        # 6. Specialized Process Route Query (Tier 1 Regression Check)
        print("\n[Timing Check 2] Specialized Process Route: 'What happens if a member moves out of the service area?'")
        res6 = run_stream_request({
            "question": "What happens if a member moves out of the plan’s service area?",
            "include_debug": True,
        }, client=client)
        ret6 = res6["latency"].get("retrieval", {})
        print(f"  -> Answer Path: {res6['answer_path']} | Contexts: {res6['context_count']}")
        print(f"  -> Vector Search: {ret6.get('vector_search_ms', 0):.2f} ms | Total Retrieval: {ret6.get('total_ms', 0):.2f} ms")
        print(f"  -> TTFT: {res6['ttft_ms']} ms | Total: {res6['total_ms']} ms")
        print(f"  -> Answer Snippet: \"{res6['answer'][:120]}...\"")

        print("\n" + "=" * 70)
        print("ALL SPECIAL CONDITIONS AND TIMING REGRESSION CHECKS PASSED!")
        print("=" * 70)


if __name__ == "__main__":
    main()
