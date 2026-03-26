import { exportDB, importDB } from "dexie-export-import";
import { athenaDb } from "../database/AthenaDb";
import { get, set } from "idb-keyval";

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
}

interface FileSystemFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
  queryPermission(descriptor?: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: any) => Promise<FileSystemFileHandle>;
  }
}

const BACKUP_HANDLE_KEY = "autoBackupFileHandle";
const LAST_BACKUP_TIME_KEY = "lastAutoBackupTime";

export const BackupService = {
  /**
   * Exports the entire database to a JSON file and downloads it to the user's computer.
   */
  async downloadBackup(): Promise<void> {
    try {
      const blob = await exportDB(athenaDb, { prettyJson: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `athena_backup_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to export database", error);
      }
      throw error;
    }
  },

  /**
   * Imports a JSON File into the Athena database, replacing existing data.
   */
  async restoreBackup(file: File): Promise<void> {
    try {
      await athenaDb.delete();
      await athenaDb.open();
      await importDB(file);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to restore database", error);
      }
      throw error;
    }
  },

  /**
   * Prompts the user to select a save location and stores the file handle securely.
   */
  async selectAutoBackupFile(): Promise<boolean> {
    try {
      if (!("showSaveFilePicker" in window)) {
        throw new Error("File System Access API not supported in this browser.");
      }

      const fileHandle = await window.showSaveFilePicker!({
        suggestedName: "athena_backup.json",
        types: [
          {
            description: "JSON Database Backup",
            accept: { "application/json": [".json"] },
          },
        ],
      });

      if (fileHandle) {
        await set(BACKUP_HANDLE_KEY, fileHandle);
        return true;
      }
      return false;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return false;
      }
      console.error("Failed to select auto-backup file", error);
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
   */
  async performAutoBackup(): Promise<void> {
    try {
      const handle = await this.getAutoBackupHandle();
      if (!handle) {
        return; // No auto-backup location set
      }

      // Check if we have write permission, request if we don't
      if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
        const permission = await handle.requestPermission({ mode: "readwrite" });
        if (permission !== "granted") {
          throw new Error("Write permission denied for auto-backup file.");
        }
      }

      const blob = await exportDB(athenaDb, { prettyJson: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      localStorage.setItem(LAST_BACKUP_TIME_KEY, new Date().toISOString());
      console.debug("Auto-backup completed successfully at", new Date().toISOString());
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Failed silent auto-backup:", error);
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
