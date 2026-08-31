# CHK-10: Missing Rows Reported as Updated

**Status:** Completed  
**Priority:** High

## Evidence

Dexie `update` returns the number of updated rows. Checklist rename and update paths await the call but do not inspect that count before updating Zustand or returning a successful tool result.

## Suspicious Scenario

Another tab deletes a record after local ID resolution. The update affects zero database rows, local state is changed, and the LLM receives “Updated” or “Renamed.” Reload then reverses the apparent success.

## Verify

- [x] Check affected-row counts before every checklist state update.
- [x] Return structured stale-record errors from rename and update tools.
- [x] Throw zero-row manual and reorder writes into existing error handling.

## Verified Assessment

Rename and update paths ignore Dexie's affected-row count. A concurrent deletion can therefore produce a zero-row write followed by a local state change or successful tool result.

## What Should Be Done

- Check every checklist `update` result before changing Zustand or returning success.
- Treat zero affected rows as stale data: reload the current checklist and return a structured tool error or user notification.
- Add zero-row tests for manual group rename, manual item update, and both corresponding LLM tools.
- Ensure dialogs remain recoverable when the record disappeared.

## Completion

Every checklist Dexie `update()` result is now checked before Zustand changes or success responses. Rename and item-update tools return a structured missing-record error when no row was affected. Manual mutations and reorder transactions throw before publishing state, allowing existing notification handling and transaction rollback to preserve database/state consistency.

Executable verification is deferred until the remediation pass is complete, as requested.
