# CHK-22: Generated JSON Parser Contract Is Permissive

**Status:** Completed  
**Priority:** Medium

## Evidence

The parser documentation describes strict new-generation JSON, but `parseChecklistGroups` accepts aliases (`lists`, `tasks`, and `text`), ignores unknown keys, and accepts empty titles that generation later replaces with `Section N`.

## Suspicious Scenario

Malformed or legacy-shaped model output is silently normalized, masking provider regressions and producing generic sections rather than surfacing a generation failure.

## Verify

- [x] Confirm the parser is used only for fresh checklist generation.
- [x] Require canonical `groups`, `items`, `content`, and optional `details` fields.
- [x] Reject alias fields and raw string items.
- [x] Reject missing or blank titles and invalid detail types.

## Verified Assessment

The implementation contradicts its strict-generation comment by accepting aliases and empty titles. The behavior is deterministic, but whether permissive normalization is unwanted requires a product decision; no persisted-data caller uses this parser.

## What Should Be Done

- Decide whether the generation contract is canonical-only or deliberately tolerant.
- If strict, remove aliases, reject blank titles and unexpected required-field substitutions, and update tests.
- If tolerant, update the documentation and add explicit tests so aliases cannot change accidentally.
- Keep shape validation separate from size-limit validation in `CHK-15`.

## Completion

Fresh checklist generation now uses a canonical-only parser. Legacy aliases (`lists`, `tasks`, and `text`), raw string items, missing or blank titles, and non-string details are rejected instead of silently normalized. The parser remains responsible only for structure; CHK-15 continues to own collection and field-size limits.

Executable contract-matrix verification is deferred until the remediation pass is complete, as requested.
