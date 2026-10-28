import { exportDB, importDB, importInto, peakImportFile } from 'dexie-export-import';
import { athenaDb } from '../database/AthenaDb';
import { get, set } from 'idb-keyval';
import { useBackupStore } from '../store/BackupStore';
import { useNotificationStore } from '../store/NotificationStore';

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
}

interface FileSystemFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
  queryPermission(descriptor?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
  }
}

const BACKUP_HANDLE_KEY = 'autoBackupFileHandle';
const LAST_BACKUP_TIME_KEY = 'lastAutoBackupTime';
const RECOVERY_REQUIRED_KEY = 'athenaRecoveryRequired';
const OPFS_FILE_NAME = 'athena_auto_backup.json';

// Serializes full-database export/import operations so a manual restore/merge
// can never overlap an in-flight auto-backup or another export. Tasks are
// chained onto a promise queue that never rejects, so a failed operation does
// not wedge subsequent ones.
let operationQueue: Promise<unknown> = Promise.resolve();

function enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const run = operationQueue.then(operation);
  operationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// Prevents concurrent auto-backup calls from writing to the file simultaneously.
let autoBackupInProgress = false;

// Set when a restore failed and its safety rollback also failed. Persisted in
// localStorage so a reload or another tab cannot overwrite the last known-good
// automatic backup with the damaged live database.
let recoveryRequiredInMemory = false;
let lastSafetyBackup: Blob | null = null;

function isRecoveryRequired(): boolean {
  if (recoveryRequiredInMemory) return true;
  try {
    return localStorage.getItem(RECOVERY_REQUIRED_KEY) !== null;
  } catch {
    return false;
  }
}

function setRecoveryRequired(required: boolean): void {
  recoveryRequiredInMemory = required;
  try {
    if (required) localStorage.setItem(RECOVERY_REQUIRED_KEY, new Date().toISOString());
    else localStorage.removeItem(RECOVERY_REQUIRED_KEY);
  } catch {
    // In-memory state still protects this module instance.
  }
}

class NonDestructiveRestoreError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'NonDestructiveRestoreError';
  }
}

function isNonDestructiveRestoreError(error: unknown): boolean {
  if (error instanceof NonDestructiveRestoreError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Database version differs');
}

function canStageRestore(): boolean {
  return (
    typeof importDB === 'function' &&
    typeof peakImportFile === 'function' &&
    Array.isArray(athenaDb.tables) &&
    athenaDb.tables.length > 0
  );
}

/**
 * Replace the live database from a backup without clearing it until the whole
 * staged import is ready. The live clear/import runs in one Dexie transaction,
 * so a storage failure cannot leave a partially replaced database.
 */
async function replaceDatabaseFromBackup(backup: File | Blob): Promise<void> {
  if (!canStageRestore()) {
    // Test/diagnostic fallback for environments without a real Dexie database.
    await importInto(athenaDb, backup, { overwriteValues: true, clearTablesBeforeImport: true });
    return;
  }

  // Everything before the live transaction is non-destructive. Read all staged
  // rows and close the staging database before opening the live transaction so
  // that transaction never awaits another database (which would auto-commit).
  let stagedRowsByTable: { name: string; rows: unknown[] }[];
  try {
    const metadata = await peakImportFile(backup);
    const currentVersion = (athenaDb as unknown as { verno?: number }).verno;
    if (typeof currentVersion === 'number' && metadata.data.databaseVersion !== currentVersion) {
      throw new NonDestructiveRestoreError(
        new Error(
          `Database version differs: backup version ${String(metadata.data.databaseVersion)} cannot replace database version ${String(currentVersion)}.`,
        ),
      );
    }

    const staging = await importDB(backup, { name: `athena_restore_staging_${crypto.randomUUID()}` });
    try {
      stagedRowsByTable = [];
      for (const table of staging.tables) {
        stagedRowsByTable.push({ name: table.name, rows: await table.toArray() });
      }
    } finally {
      staging.close();
      await staging.delete();
    }
  } catch (error) {
    if (error instanceof NonDestructiveRestoreError) throw error;
    throw new NonDestructiveRestoreError(error);
  }

  const stagedRows = new Map(stagedRowsByTable.map(({ name, rows }) => [name, rows]));
  try {
    await athenaDb.transaction('rw', athenaDb.tables, async () => {
      for (const table of athenaDb.tables) {
        await table.clear();
      }
      for (const table of athenaDb.tables) {
        const rows = stagedRows.get(table.name);
        if (rows && rows.length > 0) await table.bulkAdd(rows);
      }
    });
  } catch (error) {
    // A rejected Dexie transaction has rolled back its clears and inserts.
    // Replaying the earlier snapshot would erase writes accepted since export.
    throw new NonDestructiveRestoreError(error);
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const BackupService = {
  /**
   * Exports the entire database to a JSON file and downloads it to the user's computer.
   */
  async downloadBackup(): Promise<void> {
    return enqueueOperation(async () => {
      try {
        const blob = await exportDB(athenaDb, { prettyJson: true });
        triggerDownload(blob, `athena_backup_${new Date().toISOString().split('T')[0]}.json`);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to export database', error);
        }
        throw error;
      }
    });
  },

  /**
   * Validates the structure of a backup file blob/text, throwing if invalid.
   */
  async validateBackupFile(file: File): Promise<void> {
    const text = await file.text();
    const json = JSON.parse(text) as unknown;
    if (typeof json !== 'object' || json === null || !('data' in json) || typeof (json as Record<string, unknown>).data !== 'object') {
      throw new Error('Invalid backup file: missing expected structure.');
    }
  },

  /**
   * Imports a JSON File into the Athena database, replacing existing data.
   * Creates an in-memory safety backup before clearing; attempts rollback on failure.
   */
  async restoreBackup(file: File): Promise<void> {
    return enqueueOperation(async () => {
      // Validate the backup file before destroying existing data
      try {
        await BackupService.validateBackupFile(file);
      } catch (validationError) {
        const msg = validationError instanceof Error ? validationError.message : 'File could not be read as JSON.';
        throw new Error(`Backup validation failed: ${msg}`);
      }

      // Create an in-memory safety backup before clearing existing data.
      // Fail closed: if we cannot export the current database, abort instead of
      // proceeding into a table-clearing import.
      let safetyBackup: Blob;
      try {
        safetyBackup = await exportDB(athenaDb, { prettyJson: true });
      } catch (exportError) {
        useNotificationStore.getState().addNotification(
          'Restore aborted: a safety backup of your current data could not be created.',
        );
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to create safety backup before restore', exportError);
        }
        throw new Error(
          `Restore aborted because a safety backup could not be created: ${
            exportError instanceof Error ? exportError.message : String(exportError)
          }`,
        );
      }

      lastSafetyBackup = safetyBackup;

      try {
        await replaceDatabaseFromBackup(file);
        setRecoveryRequired(false);
        lastSafetyBackup = null;
      } catch (error) {
        // Staging failures and aborted atomic replacements leave live data
        // intact. Only the non-atomic fallback may need snapshot recovery.
        if (!isNonDestructiveRestoreError(error)) {
          try {
            await replaceDatabaseFromBackup(safetyBackup);
            setRecoveryRequired(false);
            lastSafetyBackup = null;
            useNotificationStore.getState().addNotification(
              'Import failed. Your previous data has been restored from a safety backup.',
            );
          } catch (rollbackError) {
            setRecoveryRequired(true);
            useNotificationStore.getState().addNotification(
              'Import failed and safety backup restoration also failed. Some data may have been lost.',
            );
            if (lastSafetyBackup && typeof URL.createObjectURL === 'function') {
              try {
                triggerDownload(
                  lastSafetyBackup,
                  `athena_recovery_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
                );
              } catch {
                // The retained in-memory backup is still available to this session.
              }
            }
            if (process.env.NODE_ENV === 'development') {
              console.error('Failed to restore safety backup after failed import', rollbackError);
            }
          }
        }
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to restore database', error);
        }
        throw error;
      }
    });
  },

  /**
   * Exports the current database as a timestamped pre-import safety backup and downloads it.
   */
  async createPreImportBackup(): Promise<void> {
    return enqueueOperation(async () => {
      const blob = await exportDB(athenaDb, { prettyJson: true });
      triggerDownload(blob, `athena_pre_import_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    });
  },

  /**
   * Merges a JSON backup file into the existing database without deleting current data.
   * Downloads a pre-merge safety backup first, then imports with overwrite enabled.
   */
  async mergeBackup(file: File): Promise<void> {
    return enqueueOperation(async () => {
      try {
        await BackupService.validateBackupFile(file);
      } catch (validationError) {
        const msg = validationError instanceof Error ? validationError.message : 'File could not be read as JSON.';
        throw new Error(`Backup validation failed: ${msg}`);
      }

      // Download a pre-merge safety backup inline (already inside the shared
      // operation queue, so it must not enqueue again).
      const preMergeBlob = await exportDB(athenaDb, { prettyJson: true });
      triggerDownload(preMergeBlob, `athena_pre_import_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

      try {
        await importInto(athenaDb, file, { overwriteValues: true, clearTablesBeforeImport: false });
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to merge database', error);
        }
        throw error;
      }
    });
  },

  /**
   * Prompts the user to select a save location and stores the file handle securely.
   */
  async selectAutoBackupFile(): Promise<boolean> {
    try {
      const showSaveFilePicker = window.showSaveFilePicker;
      if (!showSaveFilePicker) {
        throw new Error('Auto-backup requires the File System Access API, which is not supported in this browser. Try using Chrome or Edge.');
      }

      const fileHandle = await showSaveFilePicker({
        suggestedName: 'athena_backup.json',
        types: [
          {
            description: 'JSON Database Backup',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });

      await set(BACKUP_HANDLE_KEY, fileHandle);
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return false;
      }
      console.error('Failed to select auto-backup file', error);
      throw error;
    }
  },

  /**
   * Retrieves the saved file handle. Returns null if none exists.
   */
  async getAutoBackupHandle(): Promise<FileSystemFileHandle | null> {
    return (await get(BACKUP_HANDLE_KEY)) as FileSystemFileHandle | null;
  },

  /**
   * Retrieves the internal backup file from OPFS.
   */
  async getInternalBackupFile(): Promise<File | null> {
    try {
      if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
        return null;
      }
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(OPFS_FILE_NAME);
      return await fileHandle.getFile();
    } catch (error) {
      return null;
    }
  },

  /**
   * Saves the database export to the Origin Private File System (OPFS).
   */
  async saveToInternalBackup(blob: Blob): Promise<void> {
    if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
      throw new Error('OPFS is not supported in this browser.');
    }
    const root = await navigator.storage.getDirectory();
    const fileHandle = (await root.getFileHandle(OPFS_FILE_NAME, { create: true })) as unknown as FileSystemFileHandle;
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  },

  /**
   * Exports the database and writes it automatically to the previously selected file handle.
   * @param interactive If true, will attempt to request permission from the user (requires user gesture).
   */
  async performAutoBackup(interactive = false): Promise<void> {
    if (autoBackupInProgress) return;
    autoBackupInProgress = true;
    try {
      await enqueueOperation(() => this.performAutoBackupInternal(interactive));
    } finally {
      autoBackupInProgress = false;
    }
  },

  async performAutoBackupInternal(interactive: boolean): Promise<void> {
    const store = useBackupStore.getState();
    try {
      if (isRecoveryRequired()) {
        store.setErrorMessage(
          'Automatic backups are paused because a failed restore could not be rolled back. Restore a known-good backup first.',
        );
        store.setStatus('error');
        return;
      }
      if (store.backupMode === 'external') {
        const handle = await this.getAutoBackupHandle();
        if (!handle) {
          store.setStatus('no_handle');
          return;
        }

        // Check if we have write permission
        let permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted' && interactive) {
          permission = await handle.requestPermission({ mode: 'readwrite' });
        }

        if (permission !== 'granted') {
          store.setStatus('permission_required');
          return;
        }

        store.setStatus('in-progress');
        const blob = await exportDB(athenaDb, { prettyJson: true });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else if (store.backupMode === 'internal') {
        store.setStatus('in-progress');
        const blob = await exportDB(athenaDb, { prettyJson: true });
        await this.saveToInternalBackup(blob);
      } else {
        return;
      }

      const now = new Date().toISOString();
      localStorage.setItem(LAST_BACKUP_TIME_KEY, now);
      store.setLastBackupTime(now);
      store.setStatus('success');
      store.setErrorMessage(null);

      if (process.env.NODE_ENV === 'development') {
        console.debug('Auto-backup completed successfully at', now);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      store.setErrorMessage(msg);
      store.setStatus('error');
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed auto-backup:', error);
      }
      throw error;
    }
  },

  /**
   * Returns the last successful auto-backup timestamp.
   */
  getLastBackupTime(): string | null {
    return localStorage.getItem(LAST_BACKUP_TIME_KEY);
  },

  /**
   * Clears the stored file handle and timestamp.
   */
  async clearAutoBackupHandle(): Promise<void> {
    await set(BACKUP_HANDLE_KEY, null);
    localStorage.removeItem(LAST_BACKUP_TIME_KEY);
  },
};
