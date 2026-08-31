# GEN-02: Database Migrations and Integrity

**Status:** Completed  
**Priority:** Critical

## Evidence

`src/database/AthenaDb.ts` contains 16 schema versions. Checklist tables were introduced in versions 15 and 16. Migration errors are rethrown and table relationships rely on application-managed cleanup rather than foreign keys.

## Suspicion

Upgrades from older or partially corrupted databases may leave missing defaults, orphan records, or an unrecoverable startup state.

## Verify

- [ ] Upgrade representative databases from every shipped schema version.
- [ ] Inject a failure midway through each migration and reopen the database.
- [ ] Check topic, fork, checklist, learning, and message relationship invariants.
- [ ] Exercise retry, export, and reset behavior after `Dexie.open()` fails.

## Verified Assessment

No concrete migration defect was established. `DatabaseGate` already handles database-open failure with retry and reset paths, and topic deletion uses a transaction for checklist cleanup. Migration rollback and old-version compatibility still need executable coverage.

## What Should Be Done

- Do not change production migration code without a failing migration fixture.
- Add real Dexie upgrade tests from each shipped schema version, including injected transaction failure.
- Assert table indexes, defaults, and cross-table invariants after every upgrade.

## Final Validation

The AthenaDb tests, full 951-test suite, coverage run, and production build pass; AthenaDb reports 96.77% branch coverage. No migration defect was reproduced. The every-version upgrade matrix and injected rollback cases remain worthwhile integration coverage, not an open confirmed bug.
