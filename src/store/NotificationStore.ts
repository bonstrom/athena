import { create } from 'zustand';

export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error';

interface Notification {
  id: string;
  title: string;
  message?: string;
  severity?: NotificationSeverity;
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (title: string, message?: string, severity?: NotificationSeverity) => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (title, message, severity): void => {
    const id = crypto.randomUUID();
    set((state) => ({
      notifications: [...state.notifications, { id, title, message, severity }],
    }));
  },
  removeNotification: (id): void => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));
