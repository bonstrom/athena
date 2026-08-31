# GEN-15: Test Blind Spots

**Status:** Completed  
**Priority:** High

## Evidence

Large orchestration files have broad branching behavior. Existing tests favor happy paths and mocked storage/provider boundaries; coverage alone may not reveal missing concurrency and rollback scenarios.

## Suspicion

Failure handling, interleaving, stale async results, migrations, and browser integration can regress while unit suites remain green.

## Verify

- [ ] Run lint, full CRA coverage, and production build as a baseline.
- [ ] Inspect branch coverage for ChatStore, DebateStore, ChecklistStore, backup, analytics, ProviderStore, Settings, and MessageBubble.
- [ ] Add deferred-promise tests for concurrency and cancellation.
- [ ] Add real IndexedDB migration and transaction rollback tests.
- [ ] Add provider contract fixtures rather than only function mocks.

## Verified Assessment

The focused baseline passes 141 tests across ChecklistStore, ChecklistView, llmService, backupService, and DebateStore. Those tests do not cover the confirmed interleavings and rollback paths in this backlog; many storage tests use mocks rather than real Dexie transactions.

## What Should Be Done

- Add one failing regression test per confirmed investigation before implementation.
- Use deferred promises for races and a real isolated Dexie database for atomicity and migration tests.
- Prioritize branch behavior over an arbitrary global coverage percentage.

## Final Validation

The production build passes with ESLint disabled as requested. The complete CRA suite passes 951 tests across 71 suites, and the coverage run reports 82.12% statements and 75.48% branches overall. Focused race tests added during remediation pass, while real-browser provider fixtures, every-version migrations, and scale benchmarks remain explicit future coverage rather than hidden assumptions.
