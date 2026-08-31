# CHK-01: Cross-Topic Load Race

**Status:** Completed  
**Priority:** Critical

## Evidence

`ChecklistView` calls `loadChecklist(topic.id)` on topic changes. `ChecklistStore.loadChecklist` performs several asynchronous queries and then unconditionally replaces the single global `groups`, `items`, and `history` arrays. It does not track which topic owns the request or result.

## Suspicious Scenario

A slow load for topic A finishes after a fast load for topic B and overwrites B's visible checklist with A's data.

## Verify

- [x] Defer A's database queries, navigate to B, then resolve B before A.
- [x] Assert the final store contains B only.
- [x] Repeat with A failing after B succeeds and inspect loading/error state.

## Verified Assessment

`loadChecklist` unconditionally commits asynchronous results into one global store. A slower request for topic A can overwrite a completed request for topic B.

## What Should Be Done

- Track the requested topic in state and assign a monotonically increasing load token or request ID.
- Commit success, failure, and `loading` changes only when the completing request is still current.
- Add a deferred-promise test where B resolves before A and assert B remains displayed.
- Also test stale failure completion so A cannot clear B's loading or data state.

## Completion

Implemented a monotonic checklist load request ID in `src/store/ChecklistStore.ts`. Only the newest request may commit data, report an error, or clear loading state.

Added focused tests in `src/store/__tests__/ChecklistStore.test.ts` for stale successful and stale failed loads.

Validation:

- `npm test -- --testPathPattern="ChecklistStore" --watchAll=false` - 14 tests passed.
- `npx eslint src/store/ChecklistStore.ts src/store/__tests__/ChecklistStore.test.ts` - passed.
