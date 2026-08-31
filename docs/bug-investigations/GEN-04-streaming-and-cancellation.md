# GEN-04: Streaming and Cancellation

**Status:** Completed  
**Priority:** High

## Evidence

Streaming spans `src/services/llmService.ts` and `src/store/ChatStore.ts`, with incremental state updates, persistence, abort controllers, tool calls, and route changes.

## Suspicion

Rapid sends, abort during parsing or tool execution, topic navigation, and late callbacks may leave placeholders, stale content, duplicate messages, or updates in the wrong topic.

## Verify

- [ ] Abort before headers, mid-token, mid-reasoning, and during a tool call.
- [ ] Navigate or delete the topic while streaming.
- [ ] Trigger rapid send/stop/send sequences.
- [ ] Confirm reader cleanup, final persistence, and loading flags on every exit.

## Verified Assessment

Signal propagation, reader cancellation, listener cleanup, and ChatStore abort handling are implemented. The remaining concerns require deterministic interleaving tests; static inspection did not establish a defect.

## What Should Be Done

- Add deferred-stream tests for abort before headers, between chunks, during tools, and during clarification.
- Assert no late callback can mutate a replacement request or another topic.
- Define and test whether partial assistant content is retained or removed after cancellation.

## Final Validation

The llmService and ChatStore suites pass within the full 951-test run, and the production build passes. No additional streaming defect was reproduced. Deterministic browser-stream interleavings remain future integration coverage; this investigation is closed without speculative production changes.
