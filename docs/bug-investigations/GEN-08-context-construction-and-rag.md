# GEN-08: Context Construction and RAG

**Status:** Completed  
**Priority:** High

## Evidence

Context assembly combines system instructions, forks, summaries, attachments, token trimming, RAG results, scratchpad state, and optional role-alternation enforcement.

## Suspicion

The inspector and runtime payload may differ, or trimming may remove semantically required messages while retaining less useful content. Retrieval may omit relevant records with missing embeddings.

## Verify

- [ ] Compare inspector output byte-for-byte with the outgoing payload.
- [ ] Test exact context limits and oversized system instructions.
- [ ] Verify fork isolation and parent-message ordering.
- [ ] Test missing, empty, wrong-length, and non-finite embedding vectors.
- [ ] Check summaries and attachments in token accounting.

## Verified Assessment

Fork filtering, embedding exclusion, RAG limits, and runtime context assembly are present. No concrete mismatch between inspector and request payload was proven.

## What Should Be Done

- Add a test that captures the final provider payload and compares it with inspector output for the same state.
- Cover exact context limits, summaries, attachments, forks, role alternation, and invalid vectors.
- Do not alter trimming policy until a failing boundary case identifies the incorrect retained or removed message.

## Final Validation

TopicStore, ChatStore, embedding, and llmService tests pass in the full 951-test run; the production build also passes. No context mismatch was reproduced. Byte-for-byte inspector/provider comparison and malformed-vector fixtures remain targeted test improvements.
