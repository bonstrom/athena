# Task 2: Tool-Call Protocol Correctness

Date: 2026-10-27

Status: Review complete. Three findings; no application fixes implemented.

## Scope

Reviewed `orchestrateLlmLoop`, `buildLlmResult`, request construction, provider tool-call/result adapters, and directly relevant chat/checklist dispatchers and service tests. The prior [GEN-05 investigation](../bug-investigations/GEN-05-tool-loop-completion.md) was treated as context, not proof of correctness.

Task 1's request-state and stream-decoding findings are not repeated. Context trimming is included only where it violates the tool-call/result protocol; general context selection remains Task 3.

## Findings

### TOOL-01: Cancellation does not stop the remaining tools in a response

Priority: High for side-effecting tools.

Locations: [tool execution loop](../../src/services/llmService.ts#L1645), [execution-error catch](../../src/services/llmService.ts#L1660), [chat tool dispatcher](../../src/store/ChatStore.ts#L1138).

Trigger and path:

1. A response contains two tool calls. The first is awaiting an operation when the user stops the request.
2. The operation rejects with `AbortError`. The orchestrator catches it as an ordinary tool failure and turns it into a result string.
3. There is no signal check before the next tool call, so the second callback executes even though the request has been canceled.
4. Only the next model request encounters the aborted fetch signal. By then the remaining tool may already have performed a mutation.

The same batch-continuation problem exists when a dispatcher catches the aborted operation itself and returns an error string. Chat's web-search/fetch dispatchers do that, and the pixel-tool branch can invoke a later tool without a signal check in this dispatcher.

Impact: Stop does not reliably prevent not-yet-started tools from running. A response combining retrieval and a mutation can therefore make changes after cancellation. This is separate from an already-started operation being impossible to roll back.

Evidence: Executed the current orchestrator, OpenAI adapter, result builder, and request builder with mocked transport. The first tool callback aborted the supplied controller and threw `AbortError`. A second callback still ran once. The subsequent fetch then rejected because its signal was aborted. The probe counted callback execution rather than changing a real pixel document or checklist.

Suggested fix: Check cancellation before dispatching each tool and immediately after awaited work. Preserve abort semantics instead of converting cancellation into a recoverable model-facing tool error. Pass cancellation through mutation handlers where possible; distinguish stopping future work from undoing committed work.

Regression test: Return two calls, hold the first callback on a deferred promise, abort the controller, and reject that callback with `AbortError`. Assert the second callback never runs and no further model request is initiated. Repeat with the first callback returning an error string after cancellation, and with an already-aborted signal.

### TOOL-02: Scratchpad calls can be skipped while all receive success results

Priority: Medium.

Locations: [first scratchpad-call extraction](../../src/services/llmService.ts#L1316), [single pre-loop update](../../src/services/llmService.ts#L1620), [default success result and scratchpad bypass](../../src/services/llmService.ts#L1646).

Trigger and path: `buildLlmResult` uses `.find()` to extract only the first `update_scratchpad` call into `aiNote`. The orchestrator applies that one value before dispatching the tool batch. Inside the per-call loop, every scratchpad call bypasses `onExecuteTool` and retains the default result `Updated.`.

Two concrete failures follow:

- For two valid calls appending A and B, only A reaches `onScratchpadUpdate`, but both call IDs receive `Updated.` results. B is silently lost.
- For a malformed first call such as `{not-json`, parsing logs a warning and no scratchpad callback runs, but the call still receives `Updated.`. An empty or otherwise invalid update can also miss execution without producing a corresponding failure result.

Impact: The model is told that memory was saved when it was not. It cannot reliably repair the missing update, and later conversation turns can depend on nonexistent scratchpad state. Applying the extracted update before the batch also does not preserve the position of that call among other tool calls.

Evidence: Executed the current result builder and full orchestrator with actual OpenAI request/response conversion. For two distinct append calls, the callback ran once with A and both tool-result entries said `Updated.`. In a separate malformed-JSON case, the callback ran zero times and the tool result still said `Updated.`.

Suggested fix: Execute native scratchpad calls individually in the same dispatch sequence as other tools. Validate each call's JSON, content, and action, then return success only after that call's update completes. Keep HTML-comment fallback handling separate so it does not duplicate native updates. Missing handlers and failed validation must produce honest error results rather than default success.

Regression tests: Return two different scratchpad calls and assert both execute in order with results paired to their IDs. Mix retrieval and scratchpad calls to verify ordering. Cover malformed JSON, empty content, invalid actions, a missing scratchpad handler, and persistence failure. Preserve a separate test for the legacy comment fallback.

### TOOL-03: Budget trimming can send Anthropic orphan tool results

Priority: Medium.

Locations: [Anthropic assistant/result messages](../../src/services/llmService.ts#L705), [removable-unit detection](../../src/services/llmService.ts#L904), [request budget trimming](../../src/services/llmService.ts#L948), [Anthropic wire conversion](../../src/services/llmService.ts#L296).

Trigger and path:

1. An Anthropic response returns two `tool_use` blocks.
2. The adapter appends one assistant message whose `content` contains those blocks, followed by two user messages containing `tool_result` blocks.
3. On the next request, the token budget requires trimming older history while retaining at least two non-system messages.
4. `findOldestRemovableUnit` recognizes a tool group only through an assistant message's OpenAI-style `tool_calls` field and following `role: 'tool'` messages. Anthropic's messages have neither shape.
5. The trimmer can remove the initial user prompt and the assistant's `tool_use` message while keeping the two user `tool_result` messages.

Impact: The serialized request contains results whose `tool_use_id` values have no corresponding assistant calls. That violates Anthropic's call/result pairing contract and can cause the next tool-loop request to be rejected rather than letting the model synthesize an answer.

Evidence: Executed the current Anthropic adapter, message converter, request builder, removable-unit function, and orchestrator. With one initial user message, two returned tool calls, and a two-unit effective budget, the second captured request contained exactly two user `tool_result` messages and no assistant `tool_use` message. Token estimation was mocked to count non-system messages so the trimming boundary was deterministic. No live Anthropic request was sent; the probe established the invalid outgoing structure, not an observed remote HTTP response.

Suggested fix: Either keep one canonical internal tool-call/result representation until final provider serialization or make removable-unit detection recognize Anthropic content-block groups. Trim the entire call/result group atomically, even when preserving a minimum message count would otherwise split it. Verify the resulting wire history, not just its message count.

Regression test: Return multiple Anthropic tools, force trimming before the follow-up request, and inspect its serialized body. Every retained result must have its matching call retained in the required order, or the complete old group must be removed. Include single-call and mixed text/tool blocks; retain equivalent OpenAI and Responses protocol tests.

## Verified Controls and Unresolved Coverage

- The iteration-cap finalization path passed a focused control probe: ten tool rounds followed by an eleventh tools-disabled request. The final body omitted both `tools` and `tool_choice`, even when the initial options requested a required tool call.
- Final synthesis replaced accumulated partial text. Prompt, completion, cache-read, and cache-creation token totals included all eleven responses in that control probe. The initially suspected tool-choice/finalization issue is not reported as a defect.
- Blank tool-call IDs are assigned fallback IDs before assistant/result context messages are built. Missing IDs alone are not reported as a new defect; duplicate or sparse streamed call IDs still warrant dedicated coverage rather than an unsupported bug claim.
- The duplicate-call cache is per iteration, and checklist edits explicitly disable it. No checklist mutation-loss finding is claimed from the default cache behavior.
- Ordinary execution errors are fed back as tool-result text. TOOL-01 concerns cancellation being treated the same way, not the general decision to let a model recover from tool failures.
- Current chat registration exposes the client-side `web_search` and `fetch_url` tools, not Moonshot's `$web_search` builtin. No active builtin registration or end-to-end echo test was found in the inspected source. Thus builtin continuation support is not established by this review. If that path is enabled, it must return the builtin call's argument string as its tool-result content; a generic result such as `Tool not implemented.` is not an equivalent acknowledgement.
- No live provider requests were made. Full OpenAI, Anthropic, and Moonshot server acceptance is not claimed.

## Validation and Limits

- Application code, tests, and package dependencies were not changed.
- Five source-extracted probes passed: multi-scratchpad loss, malformed scratchpad false success, cancellation continuing to a later tool, Anthropic orphan results after trimming, and iteration-cap finalization as a passing control.
- Probes used Node v26's `node:module.stripTypeScriptTypes` and `node:vm` against the current source, not a rewritten tool-loop implementation. Actual functions included `buildLlmResult`, `askLlm`, `orchestrateLlmLoop`, `buildPayload`, `findOldestRemovableUnit`, the two provider adapters, and Anthropic conversion helpers. Transport, provider resolution, stores, token estimation, and peripheral configuration helpers were mocked. No probe file was added.
- Existing suite command attempted: `npm test -- --testPathPattern="llmService\.test\.ts$" --watchAll=false --runInBand`.
- Result: Blocked before Jest started because `react-scripts` is unavailable. No claim is made that the existing suite passes or fails.
- [Single-scratchpad coverage](../../src/services/__tests__/llmService.test.ts#L603) checks one valid update. [Malformed-scratchpad coverage](../../src/services/__tests__/llmService.test.ts#L903) checks that the callback is skipped and the loop continues, but not that the tool result accurately reports failure.
- [Tool-error coverage](../../src/services/__tests__/llmService.test.ts#L857) checks recovery after an ordinary rejection, not cancellation between calls.
- [Anthropic streaming coverage](../../src/services/__tests__/llmService.test.ts#L1770) checks tool-call assembly after a thinking block, not the follow-up request's history under trimming.

Recommended next step: Add deterministic regressions for these three findings when dependencies are available, then fix them separately from this review. Tasks 3-7 remain unreviewed.