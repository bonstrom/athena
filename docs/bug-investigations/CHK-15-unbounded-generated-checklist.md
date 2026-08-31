# CHK-15: Unbounded Generated Checklist

**Status:** Completed  
**Priority:** High

## Evidence

`parseChecklistGroups` validates shape but sets no limits on response bytes, group count, items per group, or title/content/detail lengths. `generateChecklist` materializes every parsed record and bulk-adds all of them in one transaction.

## Suspicious Scenario

A malformed or excessive model response creates thousands of large records, blocking the main thread, exhausting memory or IndexedDB quota, or making the checklist impractical to render.

## Verify

- [x] Limit generated response text to 1 MiB.
- [x] Limit generation to 50 groups and 200 total tasks.
- [x] Limit each group to 100 generated tasks.
- [x] Bound generated title, task, and detail field lengths.

## Verified Assessment

The absence of count, byte, and field-length limits is confirmed. Failure or browser termination at a particular size is not yet measured, so this is a resilience gap rather than a reproduced incident.

## What Should Be Done

- Define product-owned maximum response bytes, groups, items per group, and text lengths.
- Reject oversized content before allocating all database records and return a clear user error.
- Apply the same limits to manual, tool-generated, and imported checklist content where appropriate.
- Add boundary tests at each limit plus a large-response performance test.

## Completion

Generated checklist responses are now rejected before record materialization when they exceed 1 MiB, 50 groups, 200 total tasks, or 100 tasks in one group. Generated section titles, task content, and details are bounded at 200, 1,000, and 4,000 characters respectively. Oversized output produces a clear generation error and no checklist transaction begins.

Executable boundary and performance verification is deferred until the remediation pass is complete, as requested.
