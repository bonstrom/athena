import { useEffect, useRef } from 'react';
import { BackupService } from '../services/backupService';

export const useAutoBackup = (intervalMinutes = 30): void => {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Helper function to try running the backup
    const runBackup = async (): Promise<void> => {
      try {
        await BackupService.performAutoBackup(false);
      } catch (error: unknown) {
        // Errors are now handled within BackupService and published to BackupStore
        if (process.env.NODE_ENV === 'development') {
          console.error('AutoBackup failed in hook:', error);
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
  }, [intervalMinutes]);
};
