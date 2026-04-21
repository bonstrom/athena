export {};
const mockExportDB = jest.fn<Promise<Blob>, [unknown, { prettyJson: boolean }]>();
const mockImportInto = jest.fn<Promise<void>, [unknown, File, { overwriteValues: boolean; clearTablesBeforeImport: boolean }]>();
const mockGet = jest.fn<Promise<unknown>, [string]>();
const mockSet = jest.fn<Promise<void>, [string, unknown]>();

const mockSetStatus = jest.fn<void, [string]>();
const mockSetLastBackupTime = jest.fn<void, [string]>();
const mockSetErrorMessage = jest.fn<void, [string | null]>();

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
    getState: () => ({
      setStatus: (...args: [string]): void => mockSetStatus(...args),
      setLastBackupTime: (...args: [string]): void => mockSetLastBackupTime(...args),
      setErrorMessage: (...args: [string | null]): void => mockSetErrorMessage(...args),
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
});
