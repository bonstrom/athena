# GEN-12: Large-Data Behavior

**Status:** Completed  
**Priority:** High

## Evidence

Search, analytics, embedding backfill, message preloading, and message rendering can load or process large record sets. Several caches retain complete message arrays.

## Suspicion

At realistic long-term scale, freezes or memory pressure may cause users to repeat actions, abandon writes, or experience browser termination.

## Verify

- [ ] Seed 1k, 10k, and 50k-message databases.
- [ ] Measure startup, search, analytics, navigation, and streaming responsiveness.
- [ ] Track retained memory after visiting many topics.
- [ ] Interrupt long backfills and confirm resumability and data consistency.

## Verified Assessment

The message cache now has a 20-topic eviction limit and embedding work is batched. Large-data regressions remain plausible, but no measured failing threshold is recorded.

## What Should Be Done

- Build deterministic 1k, 10k, and 50k-record fixtures and record time and memory budgets.
- Profile startup, search, analytics, topic navigation, backfill, and long-message rendering.
- Open a specific defect only when a documented budget is exceeded or an operation becomes incorrect.

## Final Validation

The full 951-test suite, coverage run, and production build pass, with no correctness failure under current fixtures. No 1k/10k/50k benchmark was run, so no performance threshold is claimed. This investigation is complete as unconfirmed; future measured budget failures should become focused defects.
