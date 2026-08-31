# CHK-24: Failed Load Can Show Stale Checklist Data

**Status:** Completed  
**Priority:** Critical

## Evidence

`loadChecklist` sets only `loading: true` at request start. On failure it sets `loading: false` without clearing or restoring topic-scoped data. The store contains one global set of groups, items, and history.

## Suspicious Scenario

After viewing topic A, loading topic B fails. Once the spinner disappears, ChecklistView renders A's groups under B's route, and subsequent manual actions can target A's record IDs.

## Verify

- [x] Clear A's records as soon as B claims load ownership.
- [x] Clear all topic-scoped arrays on a current-request failure.
- [x] Prevent mutation controls and empty-state generation after failure.
- [x] Preserve the CHK-01 request guard so stale failures cannot clear newer data.

## Verified Assessment

On load failure the store clears only `loading`. Previous groups, items, and history remain renderable under the new route, with mutation controls still active.

## What Should Be Done

- Store loaded data with its owning topic ID and render it only when ownership matches the route.
- On a current-request failure, clear or quarantine prior-topic data and expose an explicit retry/error state rather than the empty-state generator.
- Combine this with the request-token solution in `CHK-01` so stale failures cannot clear valid newer data.
- Add tests for failure at each query stage followed by attempted mutation.

## Completion

`loadChecklist` now clears the previous topic's groups, items, and history when a new load claims ownership. A current-request failure retains empty topic-scoped arrays and records an explicit `loadError`; stale failures remain ignored by the CHK-01 request token.

`ChecklistView` renders a retry-only error state while `loadError` is present, so stale mutation controls and the empty checklist generator are unavailable after a failed load.

Validation is deferred until the remediation pass is complete, as requested.
