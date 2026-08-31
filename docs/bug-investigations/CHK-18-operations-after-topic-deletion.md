# CHK-18: Operations Can Recreate Deleted-Topic Data

**Status:** Completed  
**Priority:** Critical

## Evidence

Topic deletion transactionally removes checklist records, but ChecklistStore operations do not verify that the parent topic still exists. Pending generation and tool calls can write groups or items after deletion completes.

## Suspicious Scenario

A topic is deleted while generation or editing is pending. A late operation inserts a group referencing the deleted topic, or an item referencing a group that deletion already removed.

## Verify

- [x] Delete a topic while generation is waiting on the model.
- [x] Audit every checklist insert path used by tools and manual CRUD.
- [x] Enforce topic and group ownership in the same transactions as inserts.
- [x] Confirm the focused store suite and production compiler accept the invariant.

## Verified Assessment

Checklist writes do not require the parent topic to exist. A pending generation or edit can commit after topic deletion and recreate orphan groups or items.

## What Should Be Done

- Include the topics table in each structural write transaction and verify the topic exists inside that same transaction to avoid a check/write race.
- For item writes, also verify the parent group exists and belongs to that topic.
- Abort pending checklist work when its topic is deleted and ignore late state completions.
- Add real-Dexie interleaving tests and assert no group lacks a topic and no item lacks a group.

## Completion

Added transactional parent checks to every checklist insert path. Group creation, item creation, generated checklist batches, tool-created records, and instruction history now verify their topic exists inside the same Dexie transaction as the write. Item inserts also verify their persisted group exists and belongs to the expected topic.

Pending generation treats a missing topic as cancellation, preventing database, state, history, and naming side effects after deletion.

Validation completed before the deferred-verification instruction:

- `npm test -- --testPathPattern="ChecklistStore" --watchAll=false` - 18 tests passed.
- `$env:DISABLE_ESLINT_PLUGIN='true'; npm run build` - compiled successfully.
- ESLint was skipped as requested.
