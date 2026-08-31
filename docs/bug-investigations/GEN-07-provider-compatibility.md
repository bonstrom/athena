# GEN-07: Provider Compatibility

**Status:** Completed  
**Priority:** High

## Evidence

`src/services/llmService.ts` adapts OpenAI-style and Anthropic-style payloads, streaming events, reasoning, cache usage, tool calls, media responses, and provider-specific errors.

## Suspicion

Partial or newly shaped provider responses may parse without throwing but lose text, usage, reasoning, or tool arguments.

## Verify

- [ ] Replay recorded success and error fixtures for every provider.
- [ ] Test split JSON, malformed SSE, missing usage, empty content, and unknown events.
- [ ] Test capability flags against actual payload fields.
- [ ] Verify rate-limit and authentication errors reach the user accurately.

## Verified Assessment

Both adapters contain explicit response validation and streaming handlers. No provider-specific parsing defect was established from current code; existing mocks do not prove compatibility with real payload drift.

## What Should Be Done

- Add sanitized recorded fixtures for every supported provider and response mode.
- Cover missing usage, nullable content, split tool arguments, unknown events, and provider error bodies.
- Treat a fixture mismatch as the required failing test before changing adapter logic.

## Final Validation

Provider, model, and llmService tests pass in the full 951-test run, and the production build passes. No adapter defect was reproduced. Sanitized live-provider fixtures remain the required evidence before changing compatibility logic.
