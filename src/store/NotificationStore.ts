import { create } from "zustand";

interface Notification {
  id: string;
  title: string;
  message?: string;
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (title: string, message?: string) => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (title, message): void => {
    const id = crypto.randomUUID();
    set((state) => ({
      notifications: [...state.notifications, { id, title, message }],
    }));
  },
  removeNotification: (id): void => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));
