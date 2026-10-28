import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import * as backupIo from 'dexie-export-import';

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}
import { athenaDb } from '../../database/AthenaDb';
import { createMessage } from '../../testUtils';
import { BackupService } from '../backupService';

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result));
    reader.onerror = (): void => reject(reader.error);
    reader.readAsText(blob);
  });
}

function backupFile(blob: Blob): File {
  const file = new File([blob], 'restore-backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: (): Promise<string> => readBlobText(blob) });
  return file;
}

describe('BackupService staged restore integration', () => {
  afterAll(async () => {
    athenaDb.close();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(athenaDb.name);
      request.onsuccess = (): void => resolve();
      request.onerror = (): void => resolve();
      request.onblocked = (): void => resolve();
    });
  });

  it('atomically replaces live rows with fully staged backup rows', async () => {
    await athenaDb.messages.clear();
    await athenaDb.messages.add(createMessage({ id: 'old', topicId: 'topic-1', content: 'Old row' }));

    await athenaDb.messages.clear();
    await athenaDb.messages.add(createMessage({ id: 'imported', topicId: 'topic-1', content: 'Imported row' }));
    const newBackup = await backupIo.exportDB(athenaDb, { prettyJson: true });

    await athenaDb.messages.clear();
    await athenaDb.messages.add(createMessage({ id: 'live', topicId: 'topic-1', content: 'Live row' }));

    await BackupService.restoreBackup(backupFile(newBackup));

    const rows = await athenaDb.messages.toArray();
    expect(rows.map(({ id }) => id)).toEqual(['imported']);
  });

  it('BAK-04 preserves post-snapshot writes when the atomic replacement aborts after clearing', async () => {
    // Staging accepts this backup's out-of-line keys, but the live messages
    // table requires an inline id. Import therefore fails inside the live
    // transaction, after all clears, using real IndexedDB rollback behavior.
    const source = new Dexie(`${athenaDb.name}-invalid-restore`);
    source.version(athenaDb.verno).stores({ messages: '++' });
    await source.table('messages').add({ content: 'Missing inline id' });
    const newBackup = await backupIo.exportDB(source);
    await source.delete();
    await athenaDb.messages.clear();
    await athenaDb.messages.add(createMessage({ id: 'original', topicId: 'topic-1' }));

    const realExport = backupIo.exportDB;
    const exportSpy = jest.spyOn(backupIo, 'exportDB').mockImplementationOnce(async (db, options): Promise<Blob> => {
      const snapshot = await realExport(db, options);
      await athenaDb.messages.add(createMessage({ id: 'post-snapshot', topicId: 'topic-1' }));
      return snapshot;
    });
    const importSpy = jest.spyOn(backupIo, 'importDB');
    try {
      await expect(BackupService.restoreBackup(backupFile(newBackup))).rejects.toThrow('DataError');

      expect(importSpy).toHaveBeenCalledTimes(1);
      expect(exportSpy).toHaveBeenCalledTimes(1);
      expect((await athenaDb.messages.toArray()).map(({ id }) => id).sort()).toEqual(['original', 'post-snapshot']);
    } finally {
      importSpy.mockRestore();
      exportSpy.mockRestore();
    }
  });
});
