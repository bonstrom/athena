# CHK-13: UI Closes Before Writes Complete

**Status:** Completed  
**Priority:** Medium

## Evidence

Checklist UI handlers invoke store promises with `void`, then immediately clear input or close dialogs. Store failures produce notifications but do not restore the user's text or keep the editor open.

## Suspicious Scenario

A create, rename, edit, or delete write fails. The dialog closes and entered text is discarded, forcing the user to reconstruct the operation.

## Verify

- [x] Give form-backed mutations explicit success results.
- [x] Await create, add, edit, rename, and group-delete writes.
- [x] Preserve input and dialogs when persistence fails.
- [x] Disable submit and cancel controls during their pending operation.

## Verified Assessment

Form and dialog handlers clear local input or close immediately. Store methods catch failures and return `void` or `null`, so callers cannot consistently distinguish success from failure or preserve retry state.

## What Should Be Done

- Give mutation methods an explicit success result or let typed errors propagate after notification ownership is clarified.
- Await mutations in the view, disable the submitted control while pending, and close or clear input only on success.
- Preserve entered text after failure and prevent duplicate submissions.
- Add failure and pending-state tests for create, rename, edit, delete, and reorder actions.

## Completion

Checklist form mutations now expose explicit success results. The view awaits list creation, task addition, task editing, list renaming, and list deletion, and only clears input or closes UI after persistence succeeds. Each active form disables submission and cancellation while its write is pending, preventing duplicate requests and state loss.

Executable UI verification is deferred until the remediation pass is complete, as requested.
