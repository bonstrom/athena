import { useEffect, useRef } from "react";
import { BackupService } from "../services/backupService";
import { useNotificationStore } from "../store/NotificationStore";

export const useAutoBackup = (intervalMinutes = 2): void => {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    // Helper function to try running the backup
    const runBackup = async (): Promise<void> => {
      try {
        await BackupService.performAutoBackup();
      } catch (error: unknown) {
        const err = error as Error;
        // Only notify user of actual failures, silence common permission issues if they are expected
        if (err.name !== "NotAllowedError" && err.name !== "AbortError") {
          if (process.env.NODE_ENV === "development") {
            console.error("AutoBackup failed:", err);
          }
          addNotification("Auto-backup failed", err.message || "Unknown error");
        } else {
          if (process.env.NODE_ENV === "development") {
            console.debug("AutoBackup skipped due to permissions.");
          }
        }
      }
    };

    // Run once on mount if we wait
    mountTimeoutRef.current = setTimeout(() => {
      void runBackup();
    }, 5000);

    // Set up repeating interval
    timerRef.current = setInterval(
      () => {
        void runBackup();
      },
      intervalMinutes * 60 * 1000,
    );

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mountTimeoutRef.current) clearTimeout(mountTimeoutRef.current);
    };
  }, [intervalMinutes, addNotification]);
};
