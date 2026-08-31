# CHK-17: Checklist State Can Inject Instructions

**Status:** Completed  
**Priority:** High

## Evidence

`serializeChecklist` interpolates user- and model-controlled titles, task text, and details into a plain-text system message without escaping delimiters or explicitly marking the block as untrusted data. History content is also replayed into later edit requests.

## Suspicious Scenario

A checklist value containing newlines, fake IDs, or instruction-like text causes the model to ignore the current request, target the wrong record, or perform unintended destructive tools.

## Verify

- [x] Serialize checklist state as structured JSON fields.
- [x] Place an explicit untrusted-data instruction immediately before it.
- [x] Separate record IDs from user-controlled display values.
- [x] Enforce scoped targets and runtime arguments in application code.

## Verified Assessment

Untrusted checklist values are inserted verbatim into a system message, and their text can imitate record syntax or instructions. Whether a provider follows such content is model-dependent, but the trust-boundary weakness is real. Escaping quotes alone is not a complete prompt-injection defense.

## What Should Be Done

- Serialize checklist state as unambiguous structured JSON with separately named ID and data fields.
- State immediately before the data that all values are untrusted content and must never override tool rules.
- Validate every resulting tool target and permitted mutation in code; never depend on model obedience for authorization.
- Add adversarial tests with fake IDs, delimiters, newlines, and destructive instructions in every text field.

## Completion

Checklist edit context now serializes groups and items as JSON with separately named IDs and data fields. The immediately preceding system text identifies every title, content, and details value as untrusted data that cannot override tool rules. JSON encoding keeps embedded quotes, newlines, fake IDs, and record-like syntax inside their original string fields.

Authorization does not rely on model compliance: CHK-02 and CHK-16 enforce topic-scoped targets and runtime-validated arguments before writes. Executable adversarial verification is deferred until the remediation pass is complete, as requested.
