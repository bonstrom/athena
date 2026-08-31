# CHK-06: Concurrent Sort-Order Collisions

**Status:** Completed  
**Priority:** High

## Evidence

New group and item `sortOrder` values use the current array length. UI handlers fire promises without awaiting them, and LLM tools can issue sequential or repeated additions against snapshots.

## Suspicious Scenario

Two additions calculate the same length before either updates state, persist duplicate `sortOrder` values, and later sort nondeterministically.

## Verify

- [x] Allocate group order inside its read-write transaction.
- [x] Allocate item order inside its parent-aware read-write transaction.
- [x] Derive the next position from persisted maximum order.
- [x] Apply the same allocation to manual and tool additions.

## Verified Assessment

Concurrent create calls calculate order from the same pre-write array length. Both can persist the same `sortOrder`, and no per-topic/group operation queue prevents this.

## What Should Be Done

- Serialize structural mutations per checklist topic or parent group.
- Derive the next order inside the serialized operation; use the maximum existing order rather than array length if gaps can exist.
- Normalize all sibling orders transactionally after conflicting structural operations.
- Add deferred tests for two creates and for create concurrent with reorder/delete.

## Completion

Manual and tool-created groups and items now calculate their next `sortOrder` from persisted siblings inside the same Dexie read-write transaction as insertion. Overlapping structural transactions are serialized by Dexie, and gaps no longer cause collisions because allocation uses the maximum persisted order plus one rather than array length.

Executable concurrency verification is deferred until the remediation pass is complete, as requested.
