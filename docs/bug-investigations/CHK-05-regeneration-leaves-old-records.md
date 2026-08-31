# CHK-05: Regeneration Leaves Old Records

**Status:** Completed  
**Priority:** High

## Evidence

`generateChecklist` bulk-adds generated groups and items, then replaces the in-memory arrays with only the new records. It does not delete pre-existing records for the topic.

## Suspicious Scenario

If generation runs on a non-empty checklist through a repeated event, direct store call, stale UI, or race, old records disappear until reload and then return alongside the generated records.

## Verify

- [x] Define generation as empty-only, matching the existing UI.
- [x] Reject persisted non-empty topics before requesting generation.
- [x] Recheck emptiness inside the replacement insertion transaction.
- [x] Treat a concurrent loss of emptiness as cancellation.

## Verified Assessment

Calling `generateChecklist` on non-empty data definitely inserts new records while replacing only the in-memory arrays. Normal UI exposes generation only for an empty checklist, so the inconsistent path requires a direct call, stale UI, or future reuse.

## What Should Be Done

- First define generation as empty-only, append, or replace.
- If empty-only, enforce that invariant inside `generateChecklist`, not only in the view.
- If replace, delete old groups and items in the same transaction that inserts replacements.
- Add a seeded non-empty test asserting state and IndexedDB follow the chosen contract after reload.

## Completion

Checklist generation is now explicitly empty-only. `generateChecklist` checks persisted groups before making the paid LLM request and rechecks inside the insertion transaction before writing generated records. Direct calls, stale UI, and concurrent structural writes can no longer hide old records in memory or create mixed generations in IndexedDB.

Executable seeded and concurrent verification is deferred until the remediation pass is complete, as requested.
