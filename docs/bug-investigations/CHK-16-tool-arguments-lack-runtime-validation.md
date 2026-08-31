# CHK-16: Tool Arguments Lack Runtime Validation

**Status:** Completed  
**Priority:** High

## Evidence

`executeChecklistTool` parses JSON with a generic cast rather than runtime type guards. Later code calls methods such as `.trim()`, iterates `items`, and reads ID arrays based on the asserted shape. Provider tool schemas do not guarantee that every model response obeys the schema.

## Suspicious Scenario

A model supplies `title: 42`, `items: "task"`, or an object where an ID array is expected. Runtime code throws or behaves strangely, terminating an edit after earlier tools have already persisted changes.

## Verify

- [x] Parse tool JSON as `unknown` and require an object record.
- [x] Validate required strings, optional strings, booleans, and arrays.
- [x] Validate nested initial-item objects before iteration.
- [x] Return a stable recoverable error before database work.

## Verified Assessment

The generic `JSON.parse(...) as T` provides no runtime protection. Valid JSON with wrong field types can throw at `.trim()` or enter collection logic with invalid values, aborting an edit after prior mutations.

## What Should Be Done

- Add explicit runtime parsers or type guards for every checklist tool argument object; use an existing validation library only if already justified by the repository.
- Validate object shape, required strings, arrays, booleans, lengths, and unknown/duplicate IDs before database work.
- Return a stable structured error string to the model for validation failures; reserve thrown errors for storage/system failures.
- Add a table-driven malformed-argument test suite for every tool and both provider formats.

## Completion

Checklist tool arguments are now parsed as `unknown` and narrowed with explicit runtime guards. Every tool validates its required strings, optional strings, booleans, ID arrays, and nested initial-item objects before target resolution or database work. Malformed JSON and schema violations return `Error: invalid arguments.` to the model instead of throwing through the edit session.

Executable malformed-argument verification is deferred until the remediation pass is complete, as requested.
