export {};
const mockExportDB = jest.fn<Promise<Blob>, [unknown, { prettyJson: boolean }]>();
const mockImportInto = jest.fn<Promise<void>, [unknown, File, { overwriteValues: boolean; clearTablesBeforeImport: boolean }]>();
const mockGet = jest.fn<Promise<unknown>, [string]>();
const mockSet = jest.fn<Promise<void>, [string, unknown]>();

const mockSetStatus: jest.MockedFunction<(status: string) => void> = jest.fn();
const mockSetLastBackupTime: jest.MockedFunction<(time: string) => void> = jest.fn();
const mockSetErrorMessage: jest.MockedFunction<(message: string | null) => void> = jest.fn();

jest.mock('dexie-export-import', () => ({
  exportDB: (...args: [unknown, { prettyJson: boolean }]): Promise<Blob> => mockExportDB(...args),
  importInto: (...args: [unknown, File, { overwriteValues: boolean; clearTablesBeforeImport: boolean }]): Promise<void> => mockImportInto(...args),
}));

jest.mock('idb-keyval', () => ({
  get: (...args: [string]): Promise<unknown> => mockGet(...args),
  set: (...args: [string, unknown]): Promise<void> => mockSet(...args),
}));

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {},
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

    expect(mockImportInto).toHaveBeenCalledWith({}, file, { overwriteValues: true, clearTablesBeforeImport: true });
  });

  it('restoreBackup throws validation error on invalid file', async () => {
    const service = loadBackupService();
    const file = createMockFile('invalid');

    await expect(service.restoreBackup(file)).rejects.toThrow('Backup validation failed');
  });

  it('restoreBackup rethrows import errors', async () => {
    mockImportInto.mockRejectedValue(new Error('Import crashed'));
    const service = loadBackupService();
    const file = createMockFile(JSON.stringify({ data: { messages: [] } }));

    await expect(service.restoreBackup(file)).rejects.toThrow('Import crashed');
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
