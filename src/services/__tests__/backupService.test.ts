import Dexie from 'dexie';
const mockExportDB = jest.fn<Promise<Blob>, [unknown, { prettyJson: boolean }]>();
const mockImportInto = jest.fn<Promise<void>, [unknown, File | Blob, { overwriteValues: boolean; clearTablesBeforeImport: boolean }]>();
const mockImportDB = jest.fn<Promise<unknown>, [File | Blob, { name: string }]>();
const mockPeakImportFile = jest.fn<
  Promise<{ data: { databaseVersion: number; databaseName: string } }>,
  [File | Blob]
>();
const mockAthenaDb: Record<string, unknown> = {};
const mockGet = jest.fn<Promise<unknown>, [string]>();
const mockSet = jest.fn<Promise<void>, [string, unknown]>();

const mockSetStatus: jest.MockedFunction<(status: string) => void> = jest.fn();
const mockSetLastBackupTime: jest.MockedFunction<(time: string) => void> = jest.fn();
const mockSetErrorMessage: jest.MockedFunction<(message: string | null) => void> = jest.fn();

const mockAddNotification = jest.fn<undefined, [string, string | undefined]>();

jest.mock('dexie-export-import', () => ({
  exportDB: (...args: [unknown, { prettyJson: boolean }]): Promise<Blob> => mockExportDB(...args),
  importInto: (...args: [unknown, File | Blob, { overwriteValues: boolean; clearTablesBeforeImport: boolean }]): Promise<void> => mockImportInto(...args),
  importDB: (...args: [File | Blob, { name: string }]): Promise<unknown> => mockImportDB(...args),
  peakImportFile: (...args: [File | Blob]): Promise<{ data: { databaseVersion: number; databaseName: string } }> =>
    mockPeakImportFile(...args),
}));

jest.mock('idb-keyval', () => ({
  get: (...args: [string]): Promise<unknown> => mockGet(...args),
  set: (...args: [string, unknown]): Promise<void> => mockSet(...args),
}));

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: mockAthenaDb,
}));

jest.mock('../../store/BackupStore', () => ({
  useBackupStore: {
    getState: (): {
      setStatus: (status: string) => void;
      setLastBackupTime: (time: string) => void;
      setErrorMessage: (message: string | null) => void;
      backupMode: string;
    } => ({
      setStatus: mockSetStatus,
      setLastBackupTime: mockSetLastBackupTime,
      setErrorMessage: mockSetErrorMessage,
      backupMode: 'external',
    }),
  },
}));

jest.mock('../../store/NotificationStore', () => ({
  useNotificationStore: {
    getState: (): {
      addNotification: (title: string, message?: string) => void;
    } => ({
      addNotification: mockAddNotification,
    }),
  },
}));

interface FileSystemWritableFileStreamLike {
  write: (data: BufferSource | Blob | string) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemFileHandleLike {
  queryPermission: (descriptor?: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission: (descriptor?: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  createWritable: () => Promise<FileSystemWritableFileStreamLike>;
}

interface BackupServiceLike {
  downloadBackup: () => Promise<void>;
  validateBackupFile: (file: File) => Promise<void>;
  restoreBackup: (file: File) => Promise<void>;
  createPreImportBackup: () => Promise<void>;
  mergeBackup: (file: File) => Promise<void>;
  selectAutoBackupFile: () => Promise<boolean>;
  getAutoBackupHandle: () => Promise<FileSystemFileHandleLike | null>;
  getInternalBackupFile: () => Promise<File | null>;
  saveToInternalBackup: (blob: Blob) => Promise<void>;
  performAutoBackup: (interactive?: boolean) => Promise<void>;
  getLastBackupTime: () => string | null;
  clearAutoBackupHandle: () => Promise<void>;
}

function loadBackupService(): BackupServiceLike {
  let service!: BackupServiceLike;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require('../../services/backupService') as { BackupService: BackupServiceLike };
    service = loaded.BackupService;
  });
  return service;
}

function createHandle(
  queryPermission: PermissionState,
  requestPermission: PermissionState,
  writable: FileSystemWritableFileStreamLike,
): FileSystemFileHandleLike {
  return {
    queryPermission: jest.fn((): Promise<PermissionState> => Promise.resolve(queryPermission)),
    requestPermission: jest.fn((): Promise<PermissionState> => Promise.resolve(requestPermission)),
    createWritable: jest.fn((): Promise<FileSystemWritableFileStreamLike> => Promise.resolve(writable)),
  };
}

function createMockFile(content: string): File {
  return {
    text: jest.fn((): Promise<string> => Promise.resolve(content)),
    name: 'backup.json',
    size: content.length,
    type: 'application/json',
  } as unknown as File;
}

function createDexieBackup(databaseVersion = 22): File {
  const content = JSON.stringify({
    formatName: 'dexie',
    formatVersion: 1,
    data: {
      databaseName: 'AthenaDatabase',
      databaseVersion,
      tables: [{ name: 'messages', schema: 'id', rowCount: 0 }],
      data: [{ tableName: 'messages', inbound: true, rows: [] }],
    },
  });
  const file = new File([content], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: (): Promise<string> => Promise.resolve(content) });
  return file;
}

beforeEach(() => {
  for (const key of Object.keys(mockAthenaDb)) Reflect.deleteProperty(mockAthenaDb, key);
  mockPeakImportFile.mockResolvedValue({ data: { databaseVersion: 22, databaseName: 'AthenaDatabase' } });
});

describe('BackupService.performAutoBackup', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();

    mockExportDB.mockResolvedValue(new Blob(['{"ok":true}'], { type: 'application/json' }));
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue();
    mockImportInto.mockResolvedValue();
  });

  it('sets no_handle when no saved file handle exists', async () => {
    const service = loadBackupService();

    await service.performAutoBackup();

    expect(mockSetStatus).toHaveBeenCalledWith('no_handle');
    expect(mockExportDB).not.toHaveBeenCalled();
  });

  it('sets permission_required when write permission is not granted', async () => {
    const writable: FileSystemWritableFileStreamLike = {
      write: jest.fn((): Promise<void> => Promise.resolve()),
      close: jest.fn((): Promise<void> => Promise.resolve()),
    };
    const handle = createHandle('prompt', 'denied', writable);
    mockGet.mockResolvedValue(handle);

    const service = loadBackupService();
    await service.performAutoBackup(false);

    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(mockSetStatus).toHaveBeenCalledWith('permission_required');
    expect(mockExportDB).not.toHaveBeenCalled();
  });

  it('requests permission interactively and writes backup on success', async () => {
    const writable: FileSystemWritableFileStreamLike = {
      write: jest.fn((): Promise<void> => Promise.resolve()),
      close: jest.fn((): Promise<void> => Promise.resolve()),
    };
    const handle = createHandle('prompt', 'granted', writable);
    mockGet.mockResolvedValue(handle);

    const service = loadBackupService();
    await service.performAutoBackup(true);

    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(mockSetStatus).toHaveBeenCalledWith('in-progress');
    expect(mockExportDB).toHaveBeenCalledTimes(1);
    expect(writable.write).toHaveBeenCalledTimes(1);
    expect(writable.close).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith('success');
    expect(mockSetErrorMessage).toHaveBeenCalledWith(null);
    expect(mockSetLastBackupTime).toHaveBeenCalledTimes(1);
    expect(service.getLastBackupTime()).not.toBeNull();
  });

  it('sets error state and rethrows when writing fails', async () => {
    const writable: FileSystemWritableFileStreamLike = {
      write: jest.fn((): Promise<void> => Promise.reject(new Error('disk full'))),
      close: jest.fn((): Promise<void> => Promise.resolve()),
    };
    const handle = createHandle('granted', 'granted', writable);
    mockGet.mockResolvedValue(handle);

    const service = loadBackupService();

    await expect(service.performAutoBackup()).rejects.toThrow('disk full');
    expect(mockSetStatus).toHaveBeenCalledWith('error');
    expect(mockSetErrorMessage).toHaveBeenCalledWith('disk full');
  });

  it('clearAutoBackupHandle clears stored handle and backup timestamp', async () => {
    localStorage.setItem('lastAutoBackupTime', '2026-01-01T00:00:00.000Z');
    const service = loadBackupService();

    await service.clearAutoBackupHandle();

    expect(mockSet).toHaveBeenCalledWith('autoBackupFileHandle', null);
    expect(service.getLastBackupTime()).toBeNull();
  });

  it('returns early when already granted permission (no interactive request needed)', async () => {
    const writable: FileSystemWritableFileStreamLike = {
      write: jest.fn((): Promise<void> => Promise.resolve()),
      close: jest.fn((): Promise<void> => Promise.resolve()),
    };
    const handle = createHandle('granted', 'denied', writable);
    mockGet.mockResolvedValue(handle);

    const service = loadBackupService();
    await service.performAutoBackup(false);

    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(mockSetStatus).toHaveBeenCalledWith('success');
    expect(mockExportDB).toHaveBeenCalledTimes(1);
  });

  it('prevents concurrent backup operations', async () => {
    const writable: FileSystemWritableFileStreamLike = {
      write: jest.fn(
        (): Promise<void> =>
          new Promise((resolve) => {
            setTimeout(resolve, 50);
          }),
      ),
      close: jest.fn((): Promise<void> => Promise.resolve()),
    };
    const handle = createHandle('granted', 'granted', writable);
    mockGet.mockResolvedValue(handle);

    const service = loadBackupService();
    const p1 = service.performAutoBackup();
    const p2 = service.performAutoBackup();

    await Promise.all([p1, p2]);

    expect(mockExportDB).toHaveBeenCalledTimes(1);
  });

  it('handles string error messages gracefully', async () => {
    const writable: FileSystemWritableFileStreamLike = {
      write: jest.fn((): Promise<void> => Promise.reject('network error')),
      close: jest.fn((): Promise<void> => Promise.resolve()),
    };
    const handle = createHandle('granted', 'granted', writable);
    mockGet.mockResolvedValue(handle);

    const service = loadBackupService();

    await expect(service.performAutoBackup()).rejects.toBe('network error');
    expect(mockSetErrorMessage).toHaveBeenCalledWith('network error');
  });

  it('returns early when backupMode is neither external nor internal', async () => {
    jest.resetModules();
    jest.doMock('../../store/BackupStore', () => ({
      useBackupStore: {
        getState: (): {
          setStatus: (status: string) => void;
          setLastBackupTime: (time: string) => void;
          setErrorMessage: (message: string | null) => void;
          backupMode: string;
        } => ({
          setStatus: mockSetStatus,
          setLastBackupTime: mockSetLastBackupTime,
          setErrorMessage: mockSetErrorMessage,
          backupMode: 'off',
        }),
      },
    }));

    const service = loadBackupService();
    await service.performAutoBackup();

    expect(mockExportDB).not.toHaveBeenCalled();
  });
});

describe('BackupService internal backup', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();

    mockExportDB.mockResolvedValue(new Blob(['{"ok":true}'], { type: 'application/json' }));
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue();
    mockImportInto.mockResolvedValue();
  });

  it('performAutoBackup saves to internal backup when backupMode is internal', async () => {
    jest.resetModules();
    jest.doMock('../../store/BackupStore', () => ({
      useBackupStore: {
        getState: (): {
          setStatus: (status: string) => void;
          setLastBackupTime: (time: string) => void;
          setErrorMessage: (message: string | null) => void;
          backupMode: string;
        } => ({
          setStatus: mockSetStatus,
          setLastBackupTime: mockSetLastBackupTime,
          setErrorMessage: mockSetErrorMessage,
          backupMode: 'internal',
        }),
      },
    }));

    const mockGetDirectory = jest.fn((): Promise<{
      getFileHandle: (name: string, opts?: { create: boolean }) => Promise<FileSystemFileHandleLike>;
    }> => {
      const writable: FileSystemWritableFileStreamLike = {
        write: jest.fn((): Promise<void> => Promise.resolve()),
        close: jest.fn((): Promise<void> => Promise.resolve()),
      };
      const handle = createHandle('granted', 'granted', writable);
      return Promise.resolve({
        getFileHandle: jest.fn((): Promise<FileSystemFileHandleLike> => Promise.resolve(handle)),
      });
    });

    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: mockGetDirectory },
      configurable: true,
      writable: true,
    });

    const service = loadBackupService();
    await service.performAutoBackup();

    expect(mockSetStatus).toHaveBeenCalledWith('in-progress');
    expect(mockExportDB).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith('success');
  });

  it('saveToInternalBackup writes blob to OPFS', async () => {
    const mockWrite = jest.fn((): Promise<void> => Promise.resolve());
    const mockClose = jest.fn((): Promise<void> => Promise.resolve());
    const mockGetFileHandle = jest.fn((): Promise<FileSystemFileHandleLike> => {
      const writable: FileSystemWritableFileStreamLike = {
        write: mockWrite,
        close: mockClose,
      };
      const handle = createHandle('granted', 'granted', writable);
      return Promise.resolve(handle);
    });

    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: jest.fn((): Promise<{ getFileHandle: typeof mockGetFileHandle }> => Promise.resolve({ getFileHandle: mockGetFileHandle })) },
      configurable: true,
      writable: true,
    });

    const service = loadBackupService();
    const blob = new Blob(['test data']);
    await service.saveToInternalBackup(blob);

    expect(mockGetFileHandle).toHaveBeenCalledWith('athena_auto_backup.json', { create: true });
    expect(mockWrite).toHaveBeenCalledWith(blob);
    expect(mockClose).toHaveBeenCalled();
  });

  it('saveToInternalBackup throws when OPFS is unavailable', async () => {
    // Remove storage property entirely so 'storage' in navigator returns false
    const origStorage = navigator.storage;
    delete (navigator as { storage?: unknown }).storage;

    const service = loadBackupService();

    await expect(service.saveToInternalBackup(new Blob(['test']))).rejects.toThrow('OPFS is not supported');

    // Restore
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (origStorage !== undefined) {
      Object.defineProperty(navigator, 'storage', { value: origStorage, configurable: true, writable: true });
    }
  });

  it('getInternalBackupFile returns null when OPFS is unavailable', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const service = loadBackupService();
    const result = await service.getInternalBackupFile();

    expect(result).toBeNull();
  });

  it('getInternalBackupFile returns null when getDirectory throws', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: jest.fn((): Promise<never> => Promise.reject(new Error('not found'))) },
      configurable: true,
      writable: true,
    });

    const service = loadBackupService();
    const result = await service.getInternalBackupFile();

    expect(result).toBeNull();
  });
});

describe('BackupService download/restore/merge', () => {
  let mockClick: jest.Mock;
  let mockCreateObjectURL: jest.Mock;
  let mockRevokeObjectURL: jest.Mock;
  let mockAppendChild: jest.Mock;
  let mockRemoveChild: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();

    mockExportDB.mockResolvedValue(new Blob(['{"ok":true}'], { type: 'application/json' }));
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue();
    mockImportInto.mockResolvedValue();

    mockClick = jest.fn();
    mockCreateObjectURL = jest.fn((): string => 'blob:test-url');
    mockRevokeObjectURL = jest.fn();
    mockAppendChild = jest.fn();
    mockRemoveChild = jest.fn();

    Object.defineProperty(URL, 'createObjectURL', { value: mockCreateObjectURL, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: mockRevokeObjectURL, writable: true });

    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick,
    };
    const mockCreateElement = jest.fn((tag: string): unknown => {
      if (tag === 'a') return mockAnchor;
      return {};
    });

    document.createElement = mockCreateElement as typeof document.createElement;
    document.body.appendChild = mockAppendChild;
    document.body.removeChild = mockRemoveChild;
  });

  it('downloadBackup exports database and triggers download', async () => {
    const service = loadBackupService();

    await service.downloadBackup();

    expect(mockExportDB).toHaveBeenCalledWith({}, { prettyJson: true });
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('downloadBackup throws on export failure', async () => {
    mockExportDB.mockRejectedValue(new Error('Export failed'));

    const service = loadBackupService();

    await expect(service.downloadBackup()).rejects.toThrow('Export failed');
  });

  it('validateBackupFile validates valid backup structure', async () => {
    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ data: { messages: [] } }));

    await expect(service.validateBackupFile(file)).resolves.toBeUndefined();
  });

  it('validateBackupFile rejects invalid backup (missing data key)', async () => {
    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ other: true }));

    await expect(service.validateBackupFile(file)).rejects.toThrow('Invalid backup file');
  });

  it('validateBackupFile rejects non-object JSON', async () => {
    const service = loadBackupService();
    const file = createMockFile('"just a string"');

    await expect(service.validateBackupFile(file)).rejects.toThrow('Invalid backup file');
  });

  it('restoreBackup validates and imports with clearTablesBeforeImport', async () => {
    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ data: { messages: [] } }));

    await service.restoreBackup(file);

    expect(mockExportDB).toHaveBeenCalledWith({}, { prettyJson: true }); // safety backup
    expect(mockImportInto).toHaveBeenCalledWith({}, file, { overwriteValues: true, clearTablesBeforeImport: true });
  });

  it('restoreBackup throws validation error on invalid file', async () => {
    const service = loadBackupService();
    const file = createMockFile('invalid');

    await expect(service.restoreBackup(file)).rejects.toThrow('Backup validation failed');
    expect(mockExportDB).not.toHaveBeenCalled(); // no safety backup created for invalid file
  });

  it('restoreBackup rethrows import errors', async () => {
    mockImportInto.mockRejectedValue(new Error('Import crashed'));
    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ data: { messages: [] } }));

    await expect(service.restoreBackup(file)).rejects.toThrow('Import crashed');
  });

  it('restoreBackup attempts safety backup rollback on import failure', async () => {
    mockExportDB.mockResolvedValue(new Blob(['{"data":{"messages":[]}}'], { type: 'application/json' }));
    mockImportInto.mockRejectedValueOnce(new Error('Import crashed'));
    mockImportInto.mockResolvedValueOnce(undefined);

    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ data: { messages: [] } }));

    await expect(service.restoreBackup(file)).rejects.toThrow('Import crashed');
    expect(mockImportInto).toHaveBeenCalledTimes(2); // first import + rollback
    expect(mockAddNotification).toHaveBeenCalledWith(
      'Import failed. Your previous data has been restored from a safety backup.',
    );
  });

  it('BAK-01 preserves a post-snapshot write when the real importer rejects before clearing', async () => {
    const service = loadBackupService();
    const { importInto } = jest.requireActual<typeof import('dexie-export-import')>('dexie-export-import');
    const database = new Dexie('AthenaDatabase');
    database.version(22).stores({ messages: 'id' });
    const file = createDexieBackup(21);
    const safetyBackup = new Blob(['snapshot']);
    const rows = new Map<string, string>([['original', 'before export']]);
    let snapshot = new Map<string, string>();
    let markExportStarted!: () => void;
    let releaseExport!: () => void;
    const exportStarted = new Promise<void>((resolve) => {
      markExportStarted = resolve;
    });
    const exportGate = new Promise<void>((resolve) => {
      releaseExport = resolve;
    });
    mockExportDB.mockImplementationOnce(async (): Promise<Blob> => {
      snapshot = new Map(rows);
      markExportStarted();
      await exportGate;
      return safetyBackup;
    });
    mockImportInto.mockImplementation(async (_database, input): Promise<void> => {
      if (input === file) {
        await importInto(database, input, { overwriteValues: true, clearTablesBeforeImport: true });
        return;
      }
      rows.clear();
      snapshot.forEach((value, key): void => {
        rows.set(key, value);
      });
    });

    const restore = service.restoreBackup(file);
  const outcome = expect(restore).rejects.toThrow('Database version differs');
    await exportStarted;
    rows.set('new-message', 'committed after export');
    releaseExport();
    await outcome;

    expect(rows.get('new-message')).toBe('committed after export');
  });

  it('BAK-02 keeps existing rows without replaying a snapshot when the atomic transaction cannot start', async () => {
    const service = loadBackupService();
    const rows = new Map<string, string>([['original', 'irreplaceable message']]);
    const clear = jest.fn((): Promise<void> => {
      rows.clear();
      return Promise.resolve();
    });
    const transaction = jest.fn((): never => {
      throw new Error('Storage unavailable');
    });
    mockAthenaDb.tables = [{ name: 'messages', clear, bulkAdd: jest.fn(), toArray: jest.fn() }];
    mockAthenaDb.verno = 22;
    mockAthenaDb.transaction = transaction;
    const staging = {
      tables: [{ name: 'messages', toArray: jest.fn((): Promise<unknown[]> => Promise.resolve([{ id: 'imported' }])) }],
      close: jest.fn(),
      delete: jest.fn((): Promise<void> => Promise.resolve()),
    };
    mockImportDB.mockResolvedValue(staging);
    mockExportDB.mockResolvedValue(createDexieBackup());

    await expect(service.restoreBackup(createDexieBackup())).rejects.toThrow('Storage unavailable');

    // Failure to start an atomic replacement leaves live data intact. Replaying
    // a snapshot would needlessly replace newer writes and must not be attempted.
    expect(mockImportDB).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    expect(mockImportInto).not.toHaveBeenCalled();
    expect(mockAddNotification).not.toHaveBeenCalled();
    expect(localStorage.getItem('athenaRecoveryRequired')).toBeNull();
    expect(rows.get('original')).toBe('irreplaceable message');
  });

  it('BAK-02 replaces live rows only after staged rows are fully loaded', async () => {
    const service = loadBackupService();
    const liveRows = new Map<string, string>([['original', 'replace me']]);
    let transactionActive = false;
    const table = {
      name: 'messages',
      clear: jest.fn((): Promise<void> => {
        liveRows.clear();
        return Promise.resolve();
      }),
      bulkAdd: jest.fn((rows: { id: string; value: string }[]): Promise<void> => {
        rows.forEach((row) => liveRows.set(row.id, row.value));
        return Promise.resolve();
      }),
    };
    const staging = {
      tables: [
        {
          name: 'messages',
          toArray: jest.fn((): Promise<{ id: string; value: string }[]> => {
            if (transactionActive) return Promise.reject(new Error('TransactionInactiveError'));
            return Promise.resolve([{ id: 'imported', value: 'restored row' }]);
          }),
        },
      ],
      close: jest.fn(),
      delete: jest.fn((): Promise<void> => Promise.resolve()),
    };
    mockAthenaDb.tables = [table];
    mockAthenaDb.verno = 22;
    mockAthenaDb.transaction = jest.fn(async (_mode: string, _tables: unknown, scope: () => Promise<void>) => {
      transactionActive = true;
      try {
        await scope();
      } finally {
        transactionActive = false;
      }
    });
    mockImportDB.mockResolvedValue(staging);
    mockExportDB.mockResolvedValue(createDexieBackup());

    await service.restoreBackup(createDexieBackup());

    expect(liveRows).toEqual(new Map([['imported', 'restored row']]));
    expect(table.clear).toHaveBeenCalledTimes(1);
    expect(staging.tables[0].toArray).toHaveBeenCalledTimes(1);
  });

  it('BAK-02 does not roll back live data after a pre-commit staging rejection', async () => {
    const service = loadBackupService();
    const liveRows = new Map<string, string>([['original', 'keep me']]);
    const transaction = jest.fn();
    mockAthenaDb.tables = [{ name: 'messages', clear: jest.fn(), bulkAdd: jest.fn() }];
    mockAthenaDb.verno = 22;
    mockAthenaDb.transaction = transaction;
    mockExportDB.mockResolvedValue(createDexieBackup());
    mockImportDB.mockRejectedValue(new Error('malformed staged backup'));

    await expect(service.restoreBackup(createDexieBackup())).rejects.toThrow('malformed staged backup');

    expect(mockImportDB).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
    expect(mockImportInto).not.toHaveBeenCalled();
    expect(liveRows.get('original')).toBe('keep me');
  });

  it('BAK-03 does not overwrite the last external recovery copy after restore and rollback fail', async () => {
    jest.doMock('../../store/BackupStore', () => ({
      useBackupStore: {
        getState: (): {
          backupMode: string;
          setStatus: typeof mockSetStatus;
          setLastBackupTime: typeof mockSetLastBackupTime;
          setErrorMessage: typeof mockSetErrorMessage;
        } => ({
          backupMode: 'external',
          setStatus: mockSetStatus,
          setLastBackupTime: mockSetLastBackupTime,
          setErrorMessage: mockSetErrorMessage,
        }),
      },
    }));
    const service = loadBackupService();
    const intactBackup = createDexieBackup();
    const clearedDatabaseBackup = new Blob(['cleared database']);
    let externalBackup: BufferSource | Blob | string = intactBackup;
    let databaseCleared = false;
    const writable: FileSystemWritableFileStreamLike = {
      write: jest.fn((data: BufferSource | Blob | string): Promise<void> => {
        externalBackup = data;
        return Promise.resolve();
      }),
      close: jest.fn((): Promise<void> => Promise.resolve()),
    };
    mockGet.mockResolvedValue(createHandle('granted', 'granted', writable));
    mockExportDB.mockImplementation((): Promise<Blob> =>
      Promise.resolve(databaseCleared ? clearedDatabaseBackup : intactBackup),
    );
    mockImportInto.mockImplementation((): Promise<void> => {
      databaseCleared = true;
      return Promise.reject(new Error('Storage unavailable'));
    });

    const restore = service.restoreBackup(createDexieBackup());
    const outcome = expect(restore).rejects.toThrow('Storage unavailable');
    const autoBackup = service.performAutoBackup();
    await outcome;
    await autoBackup;

    expect(externalBackup === intactBackup).toBe(true);
  });

  it('BAK-03 persists recovery protection across a module reload and another instance', async () => {
    const failedRestore = loadBackupService();
    mockExportDB.mockResolvedValue(createDexieBackup());
    mockImportInto.mockRejectedValue(new Error('Storage unavailable'));

    await expect(failedRestore.restoreBackup(createDexieBackup())).rejects.toThrow('Storage unavailable');
    expect(localStorage.getItem('athenaRecoveryRequired')).not.toBeNull();

    // Simulate a reload / independent tab: a fresh module instance must read the
    // persisted state and refuse to overwrite the last automatic backup.
    const reloaded = loadBackupService();
    const exportsBeforeReload = mockExportDB.mock.calls.length;
    await reloaded.performAutoBackup();

    expect(mockExportDB).toHaveBeenCalledTimes(exportsBeforeReload);
    expect(mockSetStatus).toHaveBeenCalledWith('error');
    expect(mockSetErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Automatic backups are paused'));
  });

  it('restoreBackup notifies when both import and safety backup rollback fail', async () => {
    mockExportDB.mockResolvedValue(new Blob(['{"data":{"messages":[]}}'], { type: 'application/json' }));
    mockImportInto.mockRejectedValue(new Error('Import crashed'));

    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ data: { messages: [] } }));

    await expect(service.restoreBackup(file)).rejects.toThrow('Import crashed');
    expect(mockImportInto).toHaveBeenCalledTimes(2); // first import + failed rollback
    expect(mockAddNotification).toHaveBeenCalledWith(
      'Import failed and safety backup restoration also failed. Some data may have been lost.',
    );
  });

  it('restoreBackup fails closed when safety backup cannot be created', async () => {
    mockExportDB.mockRejectedValue(new Error('Export failed'));

    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ data: { messages: [] } }));

    await expect(service.restoreBackup(file)).rejects.toThrow('Restore aborted because a safety backup could not be created');
    expect(mockImportInto).not.toHaveBeenCalled();
    expect(mockAddNotification).toHaveBeenCalledWith(
      'Restore aborted: a safety backup of your current data could not be created.',
    );
  });

  it('createPreImportBackup exports with timestamped filename', async () => {
    const service = loadBackupService();

    await service.createPreImportBackup();

    expect(mockExportDB).toHaveBeenCalledWith({}, { prettyJson: true });
    expect(mockClick).toHaveBeenCalled();
    expect(mockCreateObjectURL).toHaveBeenCalled();
  });

  it('mergeBackup validates and merges without clearing tables', async () => {
    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ data: { messages: [] } }));

    await service.mergeBackup(file);

    expect(mockImportInto).toHaveBeenCalledWith({}, file, { overwriteValues: true, clearTablesBeforeImport: false });
    expect(mockExportDB).toHaveBeenCalledTimes(1); // pre-import backup
  });

  it('mergeBackup throws validation error on invalid file', async () => {
    const service = loadBackupService();
    const file = createMockFile('bad json');

    await expect(service.mergeBackup(file)).rejects.toThrow('Backup validation failed');
  });

  it('BAK-control aborts merge if the safety export fails', async () => {
    mockExportDB.mockRejectedValue(new Error('Export unavailable'));
    const service = loadBackupService();

    await expect(service.mergeBackup(createDexieBackup())).rejects.toThrow('Export unavailable');

    expect(mockImportInto).not.toHaveBeenCalled();
  });

  it('BAK-control aborts merge if starting the safety download throws', async () => {
    mockClick.mockImplementationOnce((): never => {
      throw new Error('Download unavailable');
    });
    const service = loadBackupService();

    await expect(service.mergeBackup(createDexieBackup())).rejects.toThrow('Download unavailable');

    expect(mockImportInto).not.toHaveBeenCalled();
  });

  it('BAK-control resumes queued backup operations after a failed validation', async () => {
    const service = loadBackupService();
    const restore = service.restoreBackup(createMockFile('not JSON'));
    const outcome = expect(restore).rejects.toThrow('Backup validation failed');
    const download = service.downloadBackup();

    await outcome;
    await download;

    expect(mockImportInto).not.toHaveBeenCalled();
    expect(mockExportDB).toHaveBeenCalledTimes(1);
    expect(mockClick).toHaveBeenCalledTimes(1);
  });

  it('serializes manual backup operations so they never overlap', async () => {
    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ data: { messages: [] } }));

    let inFlight = 0;
    let maxInFlight = 0;
    mockExportDB.mockImplementation(async (): Promise<Blob> => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      inFlight--;
      return new Blob(['{"ok":true}'], { type: 'application/json' });
    });

    await Promise.all([service.downloadBackup(), service.mergeBackup(file)]);

    expect(maxInFlight).toBe(1);
  });
});

describe('BackupService selectAutoBackup / getAutoBackupHandle', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();

    mockExportDB.mockResolvedValue(new Blob(['{"ok":true}'], { type: 'application/json' }));
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue();
    mockImportInto.mockResolvedValue();
  });

  it('selectAutoBackupFile stores selected file handle', async () => {
    const mockHandle = {} as FileSystemFileHandleLike;
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: jest.fn((): Promise<FileSystemFileHandleLike> => Promise.resolve(mockHandle)),
      configurable: true,
      writable: true,
    });

    const service = loadBackupService();
    const result = await service.selectAutoBackupFile();

    expect(result).toBe(true);
    expect(mockSet).toHaveBeenCalledWith('autoBackupFileHandle', mockHandle);
  });

  it('selectAutoBackupFile returns false on AbortError', async () => {
    const abortError = new Error('User cancelled') as Error & { name: string };
    abortError.name = 'AbortError';
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: jest.fn((): Promise<never> => Promise.reject(abortError)),
      configurable: true,
      writable: true,
    });

    const service = loadBackupService();
    const result = await service.selectAutoBackupFile();

    expect(result).toBe(false);
  });

  it('selectAutoBackupFile throws on non-AbortError failure', async () => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: jest.fn((): Promise<never> => Promise.reject(new Error('Not supported'))),
      configurable: true,
      writable: true,
    });

    const service = loadBackupService();

    await expect(service.selectAutoBackupFile()).rejects.toThrow('Not supported');
  });

  it('selectAutoBackupFile throws when API is unavailable', async () => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const service = loadBackupService();

    await expect(service.selectAutoBackupFile()).rejects.toThrow('Auto-backup requires the File System Access API');
  });

  it('getAutoBackupHandle returns stored handle', async () => {
    const mockHandle = {} as FileSystemFileHandleLike;
    mockGet.mockResolvedValue(mockHandle);

    const service = loadBackupService();
    const result = await service.getAutoBackupHandle();

    expect(result).toBe(mockHandle);
    expect(mockGet).toHaveBeenCalledWith('autoBackupFileHandle');
  });

  it('getAutoBackupHandle returns null when no handle stored', async () => {
    mockGet.mockResolvedValue(null);

    const service = loadBackupService();
    const result = await service.getAutoBackupHandle();

    expect(result).toBeNull();
  });
});

describe('BackupService.getLastBackupTime', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();

    mockExportDB.mockResolvedValue(new Blob(['{"ok":true}'], { type: 'application/json' }));
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue();
    mockImportInto.mockResolvedValue();
  });

  it('returns stored backup timestamp', () => {
    localStorage.setItem('lastAutoBackupTime', '2026-05-19T12:00:00.000Z');

    const service = loadBackupService();
    expect(service.getLastBackupTime()).toBe('2026-05-19T12:00:00.000Z');
  });

  it('returns null when no timestamp stored', () => {
    const service = loadBackupService();
    expect(service.getLastBackupTime()).toBeNull();
  });
});

describe('BackupService validateBackupFile edge cases', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();

    mockExportDB.mockResolvedValue(new Blob(['{"ok":true}'], { type: 'application/json' }));
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue();
    mockImportInto.mockResolvedValue();
  });

  it('validateBackupFile rejects null JSON', async () => {
    const service = loadBackupService();
    const file = createMockFile('null');

    await expect(service.validateBackupFile(file)).rejects.toThrow('Invalid backup file');
  });

  it('validateBackupFile rejects when data property is not an object', async () => {
    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ data: 'not-an-object' }));

    await expect(service.validateBackupFile(file)).rejects.toThrow('Invalid backup file');
  });
});
