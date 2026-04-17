import type { BackupStatus } from '../BackupStore';

interface BackupStoreState {
  status: BackupStatus;
  lastBackupTime: string | null;
  errorMessage: string | null;
  setStatus: (status: BackupStatus) => void;
  setLastBackupTime: (time: string | null) => void;
  setErrorMessage: (message: string | null) => void;
}

interface BackupStoreLike {
  getState: () => BackupStoreState;
  setState: (partial: Partial<BackupStoreState>) => void;
}

function loadBackupStore(): BackupStoreLike {
  let loadedStore!: BackupStoreLike;

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loadedStore = (require('../BackupStore') as { useBackupStore: BackupStoreLike }).useBackupStore;
  });

  return loadedStore;
}

describe('BackupStore', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  it('initializes lastBackupTime from localStorage', () => {
    localStorage.setItem('lastAutoBackupTime', '2026-04-17T12:00:00.000Z');

    const store = loadBackupStore();

    expect(store.getState().status).toBe('idle');
    expect(store.getState().lastBackupTime).toBe('2026-04-17T12:00:00.000Z');
    expect(store.getState().errorMessage).toBeNull();
  });

  it('updates status, time, and error through setters', () => {
    const store = loadBackupStore();

    store.getState().setStatus('in-progress');
    store.getState().setLastBackupTime('2026-04-17T12:05:00.000Z');
    store.getState().setErrorMessage('write failed');

    expect(store.getState().status).toBe('in-progress');
    expect(store.getState().lastBackupTime).toBe('2026-04-17T12:05:00.000Z');
    expect(store.getState().errorMessage).toBe('write failed');

    store.getState().setStatus('success');
    store.getState().setErrorMessage(null);

    expect(store.getState().status).toBe('success');
    expect(store.getState().errorMessage).toBeNull();
  });
});
