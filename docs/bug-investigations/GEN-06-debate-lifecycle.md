# GEN-06: Debate Lifecycle

**Status:** Completed  
**Priority:** High

## Evidence

`src/store/DebateStore.ts` guards local sending state and reconstructs progress from persisted phase messages. Saved model IDs can become unavailable after provider changes.

## Suspicion

Concurrent tabs, repeated continuation, delayed persistence, or missing models may duplicate phases, skip phases, or silently run both sides with the same fallback model.

## Verify

- [x] Add a persisted per-topic debate operation lease.
- [x] Acquire it atomically before new-round or continuation reads/writes.
- [x] Release only from the matching owner token.
- [x] Expire abandoned leases and clean them on topic deletion.

## Verified Assessment

Same-store duplicate starts are guarded by `debateSending`, and persisted phases support resumption. The guard is process-local; two tabs can still read the same incomplete phase and generate duplicates because phase uniqueness is not enforced in storage.

## What Should Be Done

- Reproduce with two independently created store/tab contexts before choosing a lock design.
- If confirmed, persist a per-topic operation lease or idempotency record in Dexie; another Zustand boolean will not solve cross-tab concurrency.
- Add a two-context test asserting one message per topic, phase, side, and round.

## Completion

Schema v18 adds persisted operation leases. New debate rounds and continuation now atomically acquire a per-topic lease before reading, deleting, or creating phase records. A competing tab is rejected with a clear notification, and only the owner token can release the lease in `finally`. Abandoned leases expire after 30 minutes and topic deletion removes associated leases.

Executable two-context and interruption verification is deferred until the remediation pass is complete, as requested.
