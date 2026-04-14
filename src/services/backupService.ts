import { exportDB, importInto } from 'dexie-export-import';
import { athenaDb } from '../database/AthenaDb';
import { get, set } from 'idb-keyval';
import { useBackupStore } from '../store/BackupStore';

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

// Prevents concurrent auto-backup calls from writing to the file simultaneously
let autoBackupInProgress = false;

export const BackupService = {
  /**
   * Exports the entire database to a JSON file and downloads it to the user's computer.
   */
  async downloadBackup(): Promise<void> {
    try {
      const blob = await exportDB(athenaDb, { prettyJson: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `athena_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to export database', error);
      }
      throw error;
    }
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
   */
  async restoreBackup(file: File): Promise<void> {
    // Validate the backup file before destroying existing data
    try {
      await BackupService.validateBackupFile(file);
    } catch (validationError) {
      const msg = validationError instanceof Error ? validationError.message : 'File could not be read as JSON.';
      throw new Error(`Backup validation failed: ${msg}`);
    }

    try {
      // Use importInto with clearTablesBeforeImport instead of delete+importDB.
      // This avoids permanently destroying the database if the import fails midway.
      await importInto(athenaDb, file, { overwriteValues: true, clearTablesBeforeImport: true });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to restore database', error);
      }
      throw error;
    }
  },

  /**
   * Exports the current database as a timestamped pre-import safety backup and downloads it.
   */
  async createPreImportBackup(): Promise<void> {
    const blob = await exportDB(athenaDb, { prettyJson: true });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `athena_pre_import_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Merges a JSON backup file into the existing database without deleting current data.
   * Downloads a pre-merge safety backup first, then imports with overwrite enabled.
   */
  async mergeBackup(file: File): Promise<void> {
    try {
      await BackupService.validateBackupFile(file);
    } catch (validationError) {
      const msg = validationError instanceof Error ? validationError.message : 'File could not be read as JSON.';
      throw new Error(`Backup validation failed: ${msg}`);
    }

    await BackupService.createPreImportBackup();

    try {
      await importInto(athenaDb, file, { overwriteValues: true, clearTablesBeforeImport: false });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to merge database', error);
      }
      throw error;
    }
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
   * Exports the database and writes it automatically to the previously selected file handle.
   * @param interactive If true, will attempt to request permission from the user (requires user gesture).
   */
  async performAutoBackup(interactive = false): Promise<void> {
    if (autoBackupInProgress) return;
    autoBackupInProgress = true;
    const store = useBackupStore.getState();
    try {
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
    } finally {
      autoBackupInProgress = false;
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
