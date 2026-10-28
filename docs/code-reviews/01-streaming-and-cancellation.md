# Task 1: Streaming and Cancellation

Date: 2026-10-27

Status: Review complete. Five findings; no application fixes implemented.

## Scope

Reviewed `askLlmStream`, OpenAI/Anthropic stream handlers, the directly relevant orchestration exit path, and `sendMessageStream` / `stopSending` request lifecycle. Inspected nearby service/store tests and the prior [GEN-04 investigation](../bug-investigations/GEN-04-streaming-and-cancellation.md). Prior closure was not treated as proof of current correctness.

## Findings

### STR-01: An old request's cleanup can clear a replacement request's ownership

Priority: High.

Locations: [request cleanup](../../src/store/ChatStore.ts#L1456), [stopSending](../../src/store/ChatStore.ts#L1479), [concurrent-send guard](../../src/store/ChatStore.ts#L713), [streaming callbacks](../../src/store/ChatStore.ts#L1073).

Trigger and path:

1. Request A is awaiting an asynchronous operation, such as a tool or stream read.
2. `stopSending` aborts A and clears `sending` without waiting for A's `sendMessageStream` invocation to settle. The continuation branch does this without a database await; the ordinary branch does it after deletion.
3. Request B starts while A's asynchronous work is still unwinding and installs its own controller, message IDs, and streaming state.
4. A later enters its unconditional `finally`, which clears those shared fields without checking which request owns them.

Impact: B can still be running while the store reports `sending: false`, with no controller or request IDs for stopping it. Another send can pass the concurrency guard. Streaming callbacks also lack an ownership check, although their behavior across a full interleaving was not integration-tested here.

Evidence: Executed the current `stopSending` function for a continuation, installed replacement-request state, then executed the exact current finalizer statement. The replacement controller was removed from the store without its signal being aborted. This is a source-block reproduction of the ownership violation, not a complete concurrent `sendMessageStream` integration test.

Suggested fix: Introduce request ownership, using a generation ID or controller identity. Only the owning invocation may update shared streaming/lifecycle state or clear it during finalization. Check ownership after awaited work, including before final persistence; abort alone does not establish that work has settled.

Regression test: Hold A's orchestrator promise unresolved, stop A, start B and wait until it owns the store, then reject A with `AbortError`. Assert B retains its controller, IDs, `sending` flag, and streaming state. Assert a third send is rejected and stop still aborts B. Use deferred promises, not sleeps.

### STR-02: Setup failures leave the store stuck in the sending state

Priority: Medium.

Locations: [controller allocation](../../src/store/ChatStore.ts#L733), [retry lookup](../../src/store/ChatStore.ts#L745), [context construction and deletion check](../../src/store/ChatStore.ts#L787), [continuation lookup](../../src/store/ChatStore.ts#L864), [start of protected text-request block](../../src/store/ChatStore.ts#L1017).

Trigger and path: `sendMessageStream` sets `sending: true` and stores a controller before several awaited setup operations. A missing retry record throws `Original message not found for retry.` before entering any of the later request `try/finally` blocks. A context-load rejection, deleted topic detected after context loading, or missing continuation assistant can exit through the same unprotected setup region.

Impact: The returned promise rejects while `sending` remains true and the controller remains allocated. The send guard then refuses subsequent messages until another action explicitly resets the state. The normal request failure notification and cleanup are bypassed.

Evidence: Executed the full current `sendMessageStream` function with mocked dependencies and a retry lookup returning no record. It rejected with the expected missing-record error; `sending` was still true and `abortController` was non-null afterward.

Suggested fix: Put all work after lifecycle acquisition inside an encompassing `try/finally`, with ownership-aware cleanup as described in STR-01. Handle setup failures through the normal error path without attempting to update messages that were never created.

Regression tests: Reject context loading, return a missing retry record, remove the topic while context loading is pending, and return a missing continuation record. Each case must release the owning request's flags/controller and permit a subsequent valid send.

### STR-03: UTF-8 characters are corrupted when bytes span network reads

Priority: Medium.

Location: [chunk decoding](../../src/services/llmService.ts#L1476).

Trigger and path: The code reuses a `TextDecoder` but calls `decoder.decode(value)` without `{ stream: true }`. Each call treats its input as a complete byte sequence. A multibyte character split across two `reader.read()` values therefore produces replacement characters before the SSE line buffer reassembles the JSON.

Impact: Non-ASCII assistant output and reasoning can be silently corrupted in the UI and persisted message. The JSON can remain valid, so the existing parse-error handling does not detect this.

Evidence: Executed the current `askLlmStream` and actual OpenAI stream adapter with mocked transport and peripheral helpers. Sent an SSE content delta containing `caf\u00e9`, splitting the bytes between `0xC3` and `0xA9`. The returned content was `caf\uFFFD\uFFFD`, not `caf\u00e9`.

Suggested fix: Decode chunks incrementally with `{ stream: true }`, then flush the decoder at EOF through the same framing logic. Keep cancellation and terminal-event validation explicit.

Regression test: Encode a valid SSE response containing accented characters, CJK text, and an emoji. Split the encoded byte array at every offset, including within multibyte sequences. Assert callbacks and final content exactly match the original text.

### STR-04: Abrupt EOF is accepted as successful completion for non-Responses streams

Priority: Medium.

Locations: [reader EOF exit](../../src/services/llmService.ts#L1473), [Responses-only completion validation](../../src/services/llmService.ts#L1509), [orchestrator normal exit](../../src/services/llmService.ts#L1708), [successful message patch](../../src/store/ChatStore.ts#L1318).

Trigger and path: An OpenAI Chat Completions stream emits one content delta, then the transport ends normally without a finish reason or `[DONE]`. The read loop breaks on `readerDone`. The only post-loop incomplete-response rejection is conditional on the Responses API. Result construction and the orchestrator do not otherwise reject the unfinished plain-text answer.

Impact: A truncated answer can be finalized and persisted with `failed: false`, with no indication that generation did not complete. This concerns an EOF returned by the reader; a rejected read already propagates through the error path.

Evidence: Executed the current `askLlmStream` and actual OpenAI adapter with a mocked reader returning one `partial` delta and then EOF. The function resolved with `content: 'partial'` and no `finishReason`. Inspected the downstream result and persistence path to establish that they do not supply a completion check. The complete persistence path was not executed in this probe.

Suggested fix: Track provider-appropriate completion evidence in the adapter contract and distinguish intentional cancellation from premature EOF. Do not require OpenAI's `[DONE]` marker from Anthropic; preserve legitimate terminal reasons such as length limits according to an explicit policy.

Regression tests: Feed OpenAI and Anthropic streams that terminate after content but before their provider-specific completion signal. Assert premature EOF is not treated as ordinary success. Retain tests for valid completion, length-limited completion, cancellation, and Responses API truncation.

### STR-05: Stopping after a topic switch leaves deleted messages in the original topic's cache

Priority: Medium.

Locations: [topic navigation](../../src/store/ChatStore.ts#L484), [request ID registration](../../src/store/ChatStore.ts#L1060), [stop lookup and deletion](../../src/store/ChatStore.ts#L1479), [cache update](../../src/store/ChatStore.ts#L1504).

Trigger and path:

1. Request A is pending in topic A, whose user/assistant rows are cached.
2. Navigate to topic B. `fetchMessages` changes `currentTopicId` but does not change A's request IDs.
3. Stop the request. `stopSending` looks for A's user message in B's cache, so the recoverable draft is null.
4. It deletes A's pending IDs from the database, but filters only B's cached messages. A's cache still contains both deleted rows.
5. Returning to A can take `fetchMessages`' cache fast path, displaying those deleted rows without reloading the database.

Impact: Database and UI diverge; canceled messages can reappear when navigating back, and the original draft is not recovered. Deleting the pending IDs is the existing stop policy, not evidence that unrelated records in B were deleted.

Evidence: Executed the full current `stopSending` function with a map-backed database mock, A's request IDs and cached rows, and `currentTopicId: 'topic-B'`. Both database records were deleted, A's cache still contained two rows, and the returned draft was null.

Suggested fix: Store the request's topic ID alongside its message IDs and use that owner for draft lookup and cache cleanup. Define separately whether a draft recovered from another topic should be inserted into the currently visible composer.

Regression test: Start A, navigate to cached B, stop A, and return to A. Assert no deleted pending rows remain in A's cache or rendered history; B's records must remain unchanged. Assert the chosen cross-topic draft policy explicitly.

## Validation and Limits

- Application code and test files were not changed.
- Existing suite command attempted: `npm test -- --testPathPattern="(llmService|ChatStore)\.test\.ts$" --watchAll=false --runInBand`.
- Result: Blocked before Jest started because `react-scripts` is unavailable; project dependencies are not installed. No claim is made that the suites pass or fail.
- A first source-execution approach also required the unavailable `typescript` package. Successful probes instead used Node v26.12.1's built-in `node:module.stripTypeScriptTypes`, `node:vm`, and assertions, with source read directly from the current files. No packages were installed or probe files added.
- Stream probes executed the actual `askLlmStream` and OpenAI adapter, with mocked transport, model resolution, result construction, and token estimation. The lifecycle probes executed the actual send/stop functions with mocked dependencies; STR-01 additionally executed an isolated finalizer statement. These are focused reproductions, not browser, IndexedDB, or full-module integration tests.
- Five final probe observations succeeded: UTF-8 corruption, incomplete EOF resolving, setup state remaining allocated, replacement ownership being cleared by old cleanup, and topic-switch cache divergence.

## Existing Coverage and Follow-Up

- [Service tests](../../src/services/__tests__/llmService.test.ts#L1234) cover SSE JSON lines split between reads. That is different from splitting the bytes of a UTF-8 character.
- [Responses tests](../../src/services/__tests__/llmService.test.ts#L245) already reject truncated Responses API streams; STR-04 concerns the other streaming protocol path.
- [Store tests](../../src/store/__tests__/ChatStore.test.ts#L428) cover stopping in the same topic. They do not establish correct ownership after navigation.
- [Abort handling test](../../src/store/__tests__/ChatStore.test.ts#L2151) covers an orchestrator rejecting with `AbortError`, not an old request settling after a replacement request acquires ownership.
- Read-lock release and abort-listener removal are already in `finally`; their presence is not reported as a defect.
- Dropping the remaining SSE line buffer at EOF was observed during inspection, but no separate finding is claimed: a stream ending before an SSE event delimiter is not by itself proof that a valid completed event was lost.
- No separate HTTP error-body finding is claimed. The error branch attempts to read the response body before acquiring a streaming reader; a body already being consumed was not established.

Recommended next step: Add the deterministic regressions above when dependencies are available, then implement the smallest fixes in a separate change. Tasks 2-7 remain unreviewed.