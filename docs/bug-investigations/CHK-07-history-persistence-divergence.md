# CHK-07: History Persistence Divergence

**Status:** Completed  
**Priority:** High

## Evidence

`addHistoryEntry` updates Zustand before writing IndexedDB. Adding and trimming records are separate database operations, errors are only warned, and sequence numbers are derived from current in-memory history.

## Suspicious Scenario

A failed add or trim leaves memory and IndexedDB with different entries. A reload can resurrect overflow entries or assign duplicate sequence numbers, changing future LLM context.

## Verify

- [x] Remove the pre-persistence Zustand mutation.
- [x] Make sequence calculation, add, and overflow deletion transactional.
- [x] Derive Zustand history from the committed transaction result.
- [x] Publish history only while its topic still owns the active view.

## Verified Assessment

History state is updated before persistence, and add plus trimming are not atomic. Failures are swallowed after a warning, so memory, IndexedDB, sequence assignment, and later LLM context can diverge.

## What Should Be Done

- Serialize history updates per topic.
- In one Dexie transaction, calculate a collision-free sequence, insert the entry, and remove overflow.
- Update Zustand from the committed result only; on failure leave prior state intact and notify the user when continuity is affected.
- Test failed add, failed trim, concurrent entries, reload order, and the 20-entry limit using real Dexie.

## Completion

History updates now read the persisted topic history and calculate the next sequence inside the same Dexie transaction that inserts the entry and deletes overflow. Zustand is updated only after commit, from the transaction's retained 20-entry result, and only if the topic still owns the active checklist view.

Transaction failures now propagate through the calling generation or edit error path while leaving prior Zustand history intact. Executable verification is deferred until the remediation pass is complete, as requested.
