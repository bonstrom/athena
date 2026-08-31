# GEN-05: Tool-Loop Completion

**Status:** Completed  
**Priority:** High

## Evidence

`orchestrateLlmLoop` in `src/services/llmService.ts` stops at `MAX_TOOL_LOOP_ITERATIONS`. Its forced final call is conditional when the final iteration still contains tool calls.

## Suspicion

A final response containing both text and tool calls may reach the limit with work left unexecuted while presenting its text as a complete answer.

## Verify

- [x] Track cap exhaustion with pending calls independently of response text.
- [x] Force a tools-disabled synthesis call after the final tool iteration.
- [x] Preserve the existing tool execution and Moonshot `$web_search` echo behavior.
- [x] Accumulate cache-read and cache-creation usage from finalization.

## Verified Assessment

When the final permitted iteration returns both text and tool calls, the loop exits with pending tools and skips the forced final call because content is non-empty. The forced final call also omits cache-token accumulation.

## What Should Be Done

- Track whether the last iteration ended with unresolved tool calls independently of text content.
- Perform one tools-disabled finalization call whenever the iteration limit is reached with pending tools.
- Include all usage fields from that call in totals.
- Add tests for text-plus-tools at the limit, empty text at the limit, and no pending tools.

## Completion

`orchestrateLlmLoop` now records when the iteration cap is reached with pending tool calls and performs one tools-disabled finalization call regardless of whether the capped response also contained text. The synthesized response replaces partial accumulated text as the final answer.

Prompt, completion, cache-read, cache-creation, and search usage from the finalization call are all included in the returned totals. Executable verification is deferred until the remediation pass is complete, as requested.
