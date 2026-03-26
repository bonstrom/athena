import { create } from "zustand";

export type BackupStatus = "idle" | "in-progress" | "success" | "permission_required" | "no_handle" | "error";

interface BackupState {
  status: BackupStatus;
  lastBackupTime: string | null;
  errorMessage: string | null;
  setStatus: (status: BackupStatus) => void;
  setLastBackupTime: (time: string | null) => void;
  setErrorMessage: (message: string | null) => void;
}

export const useBackupStore = create<BackupState>((set) => ({
  status: "idle",
  lastBackupTime: localStorage.getItem("lastAutoBackupTime"),
  errorMessage: null,
  setStatus: (status): void => set({ status }),
  setLastBackupTime: (lastBackupTime): void => set({ lastBackupTime }),
  setErrorMessage: (errorMessage): void => set({ errorMessage }),
}));
