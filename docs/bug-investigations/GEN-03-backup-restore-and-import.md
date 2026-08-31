# GEN-03: Backup, Restore, and Import

**Status:** Completed  
**Priority:** Critical

## Evidence

`src/services/backupService.ts` now serializes operations and creates a safety export before destructive restore. It also attempts rollback when import fails.

## Suspicion

Malformed files, quota failures, failed rollback, version skew, and browser interruption may still produce partial or silently inconsistent restores.

## Verify

- [ ] Fail safety export and confirm restore never starts.
- [ ] Fail destructive import and then fail rollback separately.
- [ ] Import old, future, truncated, oversized, and type-invalid backups.
- [ ] Run manual backup, auto-backup, merge, and restore concurrently.
- [ ] Compare every table and record count before and after rollback.

## Verified Assessment

The previously suspected fail-open and concurrency bugs are fixed: destructive restore requires a successful safety export, rollback is attempted after import failure, and backup operations share one queue. No current defect was proven.

## What Should Be Done

- Keep production behavior unchanged unless an integration test fails.
- Add tests where both import and rollback fail, and require a clear unrecoverable-state notification.
- Exercise malformed, future-schema, oversized, and quota-exhausting files with a real Dexie database.

## Final Validation

Backup tests pass in the full 951-test run, with 85.36% branch coverage for `backupService.ts`; the production build also passes. No restore defect was reproduced. Real-browser quota, interruption, and double-failure fixtures remain integration-test follow-up.
