import { useEffect, useRef } from "react";
import { BackupService } from "../services/backupService";

export const useAutoBackup = (intervalMinutes = 2): void => {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Helper function to try running the backup
    const runBackup = async (): Promise<void> => {
      try {
        await BackupService.performAutoBackup();
      } catch (error) {
        // Will fail cleanly if permission is not set, we just ignore silent failures here
        console.debug("AutoBackup skipped or failed.");
      }
    };

    // Run once on mount if we wait
    setTimeout(() => {
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
    };
  }, [intervalMinutes]);
};
