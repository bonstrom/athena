# CHK-25: Invalid Generation Has No Repair Attempt

**Status:** Dismissed  
**Priority:** Medium

## Evidence

The structured parser says invalid generation should let the caller retry, but `generateChecklist` immediately reports failure when parsing returns null or no groups. There is no constrained repair request or retry for otherwise recoverable model output.

## Suspicious Scenario

A model returns prose around valid JSON, a truncated response, or a minor schema error. The operation fails despite enough information being present to repair once, producing inconsistent reliability across providers.

## Verify

- [ ] Test common malformed responses from every supported provider.
- [ ] Measure how often strict parsing rejects real outputs.
- [ ] Distinguish safe deterministic extraction from a second model repair call.
- [ ] Ensure any retry is bounded and accounted for in cost analytics.

## Verified Assessment

Strict parsing followed by a visible error is safe and internally consistent. Automatic extraction or a second paid repair call is a product enhancement, not a verified bug, and permissive substring extraction can accept unintended content.

## What Should Be Done

- Do not add automatic repair as a bug fix.
- If product telemetry shows material failure rates, design one bounded retry with a strict repair prompt and account for its cost.
- Never use a greedy JSON substring regex as the parser; require the repaired response to pass the same full strict schema and size limits.
