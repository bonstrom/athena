# Task 5: Backup Restore and Merge Safety

Date: 2026-10-28

Status: Review complete. Three findings; three enabled, intentionally failing regression tests. No application fixes implemented.

## Scope And Evidence

Reviewed validation, safety export, restore and merge imports, rollback, the shared operation queue, auto-backup writes, and the import dialog's completion/error behavior. Read the existing backup-service and import-dialog tests and the installed `dexie-export-import` implementation (4.1.4).

The importer's actual ordering matters: it validates database name/version, then awaits each table's `clear()` when `clearTablesBeforeImport` is enabled, and only afterward opens the read/write transaction for imported rows. The clear operations are **not** inside that transaction. Merge disables clearing and therefore does not have this particular destructive pre-transaction phase.

Tests BAK-01 and BAK-02 invoke the real installed importer. BAK-01 uses its real version-mismatch rejection and an in-memory rollback model. BAK-02 uses real Dexie table objects with mocked clearing and transaction failure. BAK-03 models persistence and the external writable file. These are service/control-flow regressions, not real IndexedDB or live File System Access integration tests. They demonstrate the specified interleavings and outcomes, not browser failure frequency.

## Findings

### BAK-02: Replacement clears committed data before its import transaction exists

Priority: High.

Locations: [replacement import](../../src/services/backupService.ts#L125), [rollback repeats replacement](../../src/services/backupService.ts#L129), [rollback failure handling](../../src/services/backupService.ts#L133).

Trigger:

1. Restore exports the current database successfully into an in-memory safety blob.
2. The importer clears existing tables in separate operations, before starting its import transaction.
3. Opening or executing the subsequent import transaction fails. Aborting that transaction cannot undo the earlier clears.
4. Rollback uses the same clear-before-transaction operation. If storage remains unavailable, its import transaction fails too.

Impact: A failed restore can turn an intact database into an empty or partially cleared database even when no imported row ever commits. A failure during the clear loop can leave a subset of tables cleared. Ordinary application writes are not coordinated with this multi-operation replacement and can also observe or modify intermediate states. Restore's only safety blob remains local to the rejected operation; unlike merge, restore never offers it as a download or retains it for retry. Recovery therefore depends on an already-existing backup once the method exits.

Evidence: BAK-02 supplies a format-valid, matching-version backup to the real importer. Mocked table clearing removes an existing message; both attempted import transactions then throw `Storage unavailable`. The test verifies two clear calls, two transaction attempts, and the rollback-failed notification before failing because the original message is missing. This establishes ordering and loss under the injected failure, without asserting a real IndexedDB storage fault was reproduced.

Suggested fix: Make replacement atomic across clearing and imported writes, using a supported enclosing transaction or a staging-and-commit strategy. Preserve a retrievable safety artifact before any destructive operation and retain it if recovery fails. Coordinate ordinary writers with replacement, not just other backup methods.

Regression test: [BAK-02](../../src/services/__tests__/backupService.test.ts#L580). Preserve original rows when import cannot commit; also cover failure partway through clearing and successful recovery from a retained safety artifact.

### BAK-01: Unconditional snapshot rollback erases newer writes after a harmless rejection

Priority: High.

Locations: [safety snapshot](../../src/services/backupService.ts#L109), [unconditional rollback after any import rejection](../../src/services/backupService.ts#L125), [backup-only queue](../../src/services/backupService.ts#L38).

Trigger:

1. Export captures database state S.
2. An ordinary application write commits message M after that snapshot. The service queue covers backup operations, not ordinary store/database writes.
3. Import rejects before clearing anything, for example because the backup's database version differs from the current database version.
4. The catch path nevertheless clears and replaces the database with S, discarding M.

Impact: A rejected import that never modified the database can delete newly committed user data. The success notification says previous data was restored, without disclosing that post-snapshot writes were discarded. Database-version mismatch is particularly relevant to backups made before a schema upgrade: the current importer rejects them rather than running Athena's normal upgrade migrations.

Evidence: BAK-01 defers safety-export completion, models a post-snapshot write, and passes a version-21 backup to the real importer configured with a version-22 Dexie database. The importer produces the expected version-mismatch error before its clear loop. The service then invokes the modeled destructive rollback and the new message disappears. The test does not reproduce real export/write transaction scheduling; it demonstrates the unprotected snapshot-to-import boundary with explicit gates.

Suggested fix: Reject incompatible input before entering a destructive replacement path, and do not restore an old snapshot after a rejection known to have left the database unchanged. An atomic replacement should make snapshot rollback unnecessary for ordinary transaction failures. Coordinate writer admission across the remaining operation boundary so accepted writes cannot be silently discarded.

Regression test: [BAK-01](../../src/services/__tests__/backupService.test.ts#L537). A message committed after snapshot capture must survive a version-mismatch rejection. Extend to concurrent updates and deletes so rollback cannot resurrect deleted records or revert newer values.

### BAK-03: Auto-backup overwrites the last recovery copy after failed recovery

Priority: High.

Locations: [queue resumes after rejection](../../src/services/backupService.ts#L38), [rollback failure only notifies](../../src/services/backupService.ts#L133), [queued auto-backup](../../src/services/backupService.ts#L260), [external file replacement](../../src/services/backupService.ts#L292), [internal file replacement](../../src/services/backupService.ts#L249), [periodic auto-backup](../../src/hooks/useAutoBackup.ts#L25).

Trigger:

1. An existing auto-backup file contains an intact recovery copy.
2. Restore clears live tables, import fails, and rollback also fails, leaving the database empty or incomplete.
3. A queued or later periodic auto-backup runs. The queue intentionally resumes after errors, and no recovery-required state prevents this export.
4. Export now succeeds, and auto-backup replaces the existing recovery file with the damaged database state and publishes `success`.

Impact: A restore failure can destroy both the live data and the user's last automatic recovery copy. The rollback warning is accurate about possible data loss, but it does not inhibit the subsequent overwrite. A successful export only proves that the remaining database is readable; it does not establish that recovery succeeded. Internal backup follows the same unguarded overwrite policy, although the regression exercises the external path only.

Evidence: BAK-03 starts restore and immediately queues external auto-backup. Import and rollback are modeled as failing after clearing. Export subsequently succeeds with a distinct cleared-database blob. The external writable receives that blob, replacing the intact copy; the identity-preservation assertion fails. This is a deterministic mocked file-write schedule, not a disk-failure integration test.

Suggested fix: Enter an explicit recovery-required state after rollback failure. Preserve or rotate the last known-good automatic backup and prevent overwriting it until recovery is acknowledged or a new baseline is deliberately accepted. Expose the retained safety snapshot for recovery. Keep the queue usable for recovery/export operations rather than globally wedging it.

Regression test: [BAK-03](../../src/services/__tests__/backupService.test.ts#L609). Queue auto-backup behind failed restore/recovery and assert the intact external copy remains available. Repeat for OPFS and subsequent timer-triggered backups.

## Other Reviewed Boundaries

- Invalid JSON or a missing/non-object `data` field aborts before export/import. Validation is shallow: `data: null`, arrays, and objects without Dexie metadata pass the application's check. The real importer rejects malformed metadata later. No separate corruption finding is attributed solely to this weak check; its interaction with unconditional rollback is covered by BAK-01.
- Safety export failure aborts restore before import and emits an accurate abort notification. Merge also aborts if its pre-import export fails.
- If starting the pre-merge download throws, merge does not import. A successful anchor click cannot prove the browser actually retained a downloadable recovery file; download completion was not verified.
- Merge intentionally overwrites same-key records and retains other records. Its row import runs in the library's transaction without the clear loop, so this review does not claim that a normal rejected merge leaves partially committed imported rows. Successful merge can overwrite a concurrent same-key application edit under the explicit overwrite policy; no conflict-resolution guarantee is present in the UI.
- The queue serializes service export/import operations and recovers after ordinary validation failures. It does not lock ordinary application writes or coordinate other tabs. Those limits matter to BAK-01 and BAK-02; real multi-tab scheduling was not tested.
- Successful merge/restore invokes the dialog's completion callback; Settings reloads the page. Errors stay in the dialog and do not reload. After failed rollback, in-memory stores can therefore still describe pre-import data while IndexedDB is damaged. This is a consequence of BAK-02, not a separately tested UI finding.
- Rollback success and failure have distinct notifications. The thrown error remains the initial import error, not the rollback error. No inaccurate successful-merge notification was found.

## Regression Tests And Verification

Added six cases to the existing [backup-service suite](../../src/services/__tests__/backupService.test.ts): three desired-behavior regressions (`BAK-01` through `BAK-03`) and three passing controls for merge export failure, merge download failure, and queue recovery after invalid input.

Run the new cases:

```bash
npm test -- --watchAll=false --runInBand --testPathPattern="backupService.test" --testNamePattern="BAK-"
```

Result: **3 failed, 3 passed, 39 skipped**. Every failure is the intended data-preservation assertion, not a fixture or transport exception.

Full reviewed test slice:

```bash
npm test -- --watchAll=false --runInBand --testPathPattern="backupService.test|ImportDialog.test"
npx eslint src/services/__tests__/backupService.test.ts
```

Result: **44 passed, 3 failed** across two suites. Only the three new regressions fail. ESLint passes with no output; editor diagnostics report no errors in the modified test file. No application source or interface changed. A production build and the unrelated full test suite were not run.

An initial combined run crashed in Jest's formatter while comparing unequal jsdom file/blob objects. The final regression uses a primitive identity comparison; subsequent runs complete normally with the behavioral failures above.