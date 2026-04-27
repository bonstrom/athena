import { create } from 'zustand';

export type BackupStatus = 'idle' | 'in-progress' | 'success' | 'permission_required' | 'no_handle' | 'error';
export type BackupMode = 'external' | 'internal' | 'none';

interface BackupState {
  status: BackupStatus;
  backupMode: BackupMode;
  lastBackupTime: string | null;
  errorMessage: string | null;
  setStatus: (status: BackupStatus) => void;
  setBackupMode: (mode: BackupMode) => void;
  setLastBackupTime: (time: string | null) => void;
  setErrorMessage: (message: string | null) => void;
}

export const useBackupStore = create<BackupState>((set) => ({
  status: 'idle',
  backupMode: (localStorage.getItem('autoBackupMode') ?? 'none') as BackupMode,
  lastBackupTime: localStorage.getItem('lastAutoBackupTime'),
  errorMessage: null,
  setStatus: (status): void => set({ status }),
  setBackupMode: (backupMode): void => {
    localStorage.setItem('autoBackupMode', backupMode);
    set({ backupMode });
  },
  setLastBackupTime: (lastBackupTime): void => set({ lastBackupTime }),
  setErrorMessage: (errorMessage): void => set({ errorMessage }),
}));
