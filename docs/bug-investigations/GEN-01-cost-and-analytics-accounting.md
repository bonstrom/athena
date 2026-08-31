# GEN-01: Cost and Analytics Accounting

**Status:** Completed  
**Priority:** High

## Evidence

`src/services/llmService.ts` now accumulates cached and cache-creation tokens across tool-loop iterations. `src/services/analyticsRollupService.ts` also stores its marker transactionally. Both areas have changed recently and combine totals from several ownership boundaries.

## Suspicion

Single calls, streamed calls, tool loops, summaries, checklist generation, and debate calls may not all attribute usage to the same persisted records. Displayed totals could differ from database and analytics totals.

## Verify

- [x] Preserve existing cache accumulation across normal tool iterations.
- [x] Accumulate cache usage from forced finalization.
- [x] Feed complete loop totals into persisted message cost calculation.
- [x] Leave already-fixed transactional analytics rollup behavior unchanged.

## Verified Assessment

The original multi-iteration cache accumulation and transactional rollup-marker concerns are fixed. A narrower defect remains: the forced final call in `orchestrateLlmLoop` adds prompt, completion, and search totals but omits its cached and cache-creation token totals.

## What Should Be Done

- Accumulate both cache fields from the forced final result using the same fallback rules as normal iterations.
- Add a test with different cache values per iteration and a cache-bearing forced final response.
- Assert persisted message totals and analytics totals equal the complete loop result.

## Completion

Completed with `GEN-05`. Forced tool-loop finalization now adds cached and cache-creation tokens using the same detail-field and provider-fallback rules as normal iterations. `ChatStore` already builds pricing details from these aggregate totals and persists them on the finalized message, so the verified accounting gap is closed.

Executable cross-layer accounting verification is deferred until the remediation pass is complete, as requested.
