# CHK-04: Partial Group Creation

**Status:** Completed  
**Priority:** High

## Evidence

The `add_checklist_group` tool inserts the group first and then bulk-adds optional initial items without a shared transaction. Zustand is updated only after both writes succeed.

## Suspicious Scenario

The group insert succeeds but item insertion fails. IndexedDB contains the group, the current UI does not, and the tool loop receives an exception rather than a precise partial-write result.

## Verify

- [x] Place group and initial-item insertion in one Dexie transaction.
- [x] Keep the Zustand update after the transaction commits.
- [x] Preserve rejection through the existing edit error path.

## Verified Assessment

The group and its initial items are written separately. If `bulkAdd` fails, the group remains in IndexedDB while Zustand is unchanged because its update occurs later.

## What Should Be Done

- Put group insertion and initial-item insertion in one Dexie transaction.
- Update Zustand only after the transaction commits.
- Let the rejection propagate through the existing edit error path; do not return a success tool result.
- Add a real-Dexie rollback test where item insertion fails and assert neither table contains new records.

## Completion

Completed as part of `CHK-18`. The `add_checklist_group` tool now inserts the group and all valid initial items in one Dexie transaction, with Zustand updated only after commit. An item insertion failure therefore rolls back the group and propagates through the edit error path.

Executable rollback verification is deferred until the remediation pass is complete, as requested.
