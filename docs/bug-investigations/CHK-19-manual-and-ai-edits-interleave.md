# CHK-19: Manual and AI Edits Can Interleave

**Status:** Completed  
**Priority:** High

## Evidence

While `editing` disables only the checklist composer, manual add, update, delete, toggle, and reorder controls remain active. The LLM receives a serialized snapshot at edit start, while later tools resolve against changing global state.

## Suspicious Scenario

The user deletes or reorders a target while the model is deciding its tools. The tool then fails, updates an unintended current position, or overwrites a newer manual value.

## Verify

- [x] Choose a no-manual-mutations policy during AI edits.
- [x] Enforce the policy in every public manual store mutation.
- [x] Guard drag and form submission paths in the view.
- [x] Preserve stale-target errors for tool-side conflicts.

## Verified Assessment

Manual controls remain enabled during LLM editing, while the model reasons from an earlier serialized snapshot. Tools do read current arrays at execution time, which reduces some stale-target risk, but conflicting user and model mutations can still fail or overwrite intent.

## What Should Be Done

- Choose and document one concurrency policy: disable structural/manual controls during AI edits, or serialize all mutations with conflict detection.
- Keep harmless independent actions available only if tests prove deterministic merge behavior.
- Return stale-target errors to the model and require it to re-evaluate current state rather than silently retrying old IDs.
- Add tests for same-record and different-record manual actions between tool calls.

## Completion

Manual checklist mutations are now rejected at the store boundary while an AI edit is active. This covers group and item creation, updates, toggles, deletion, and reordering regardless of whether the call originated from a button, keyboard action, or drag handler. The view also guards drag and form submissions and disables relevant confirmation buttons while editing.

AI tools continue to resolve against current topic-scoped records and receive structured stale-target errors. Executable interleaving verification is deferred until the remediation pass is complete, as requested.
