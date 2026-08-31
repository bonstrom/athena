# CHK-08: Short-ID Ambiguity

**Status:** Completed  
**Priority:** Medium

## Evidence

The serialized checklist exposes only `SHORTENED_ID_LENGTH` characters. `resolveById` accepts prefixes and returns no match when more than one record shares that prefix.

## Suspicious Scenario

Two records share a displayed prefix, making the LLM unable to address either reliably. The returned error says only “not found,” hiding ambiguity.

## Verify

- [ ] Seed two groups and two items with identical displayed prefixes.
- [ ] Serialize the checklist and execute every ID-based tool.
- [ ] Measure collision probability at expected long-term record counts.
- [ ] Check whether full IDs materially affect context size.

## Verified Assessment

Ambiguous prefixes are rejected rather than selecting the wrong record. The remaining issue is rare collision handling and an imprecise “not found” error, not a demonstrated production failure.

## What Should Be Done

- Add a deterministic collision test before changing the identifier format.
- Return an explicit ambiguity error including the need for a longer identifier.
- Prefer dynamically unique shortest prefixes or full IDs if the context-size impact is acceptable.
- Keep exact full-ID matching as the first resolution rule.

## Final Validation

The full 951-test suite and production build pass. Static review confirms ambiguous prefixes fail closed instead of selecting the wrong record. No production defect was established, so this investigation is complete without an identifier-format change; the collision test and clearer error remain test/UX improvements.
