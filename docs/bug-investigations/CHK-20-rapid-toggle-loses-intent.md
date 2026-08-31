# CHK-20: Rapid Toggles Can Lose Intent

**Status:** Completed  
**Priority:** Medium

## Evidence

The checkbox handler sends `{ checked: !item.checked }` from the rendered item snapshot. `updateItem` waits for IndexedDB before updating Zustand, and the checkbox is not disabled while that write is pending.

## Suspicious Scenario

Two rapid clicks before the first write updates state both submit the same target value. A double toggle that should return to the original state instead applies one effective toggle.

## Verify

- [x] Toggle from current Zustand state rather than rendered props.
- [x] Apply each checkbox intent optimistically and immediately.
- [x] Serialize all manual and tool updates per item.
- [x] Roll back a failed toggle only when no newer intent superseded it.

## Verified Assessment

Until the first write resolves and Zustand rerenders, repeated clicks use the same stale `item.checked` value. Multiple user toggles can collapse into one effective target state, and competing writes have no ordering/version guard.

## What Should Be Done

- Track a per-item pending state and either disable repeated toggles or apply an immediate optimistic functional update with rollback.
- Serialize persistence for the same item so older completions cannot overwrite newer intent.
- Add deferred double-click and reversed-completion tests from both checked and unchecked starting states.
- Include an AI update racing the same checkbox.

## Completion

Checkboxes now call a store-level `toggleItem` operation that derives the next value from current Zustand state and publishes it immediately. Item persistence is serialized through a shared per-item queue used by checkbox, form, and LLM tool updates, so older writes cannot complete after newer intent. Failure rollback is conditional and therefore cannot overwrite a later optimistic toggle.

Executable double-toggle and mixed AI/UI verification is deferred until the remediation pass is complete, as requested.
