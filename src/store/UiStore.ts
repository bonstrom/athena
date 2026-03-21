import { create } from "zustand";

interface UiState {
  drawerOpen: boolean;
  isMobile: boolean;
  showAllMessages: boolean;

  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setMobile: (value: boolean) => void;
  toggleShowAllMessages: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  drawerOpen: true,
  isMobile: false,
  showAllMessages: false,

  toggleDrawer: (): void => set((state) => ({ drawerOpen: !state.drawerOpen })),
  openDrawer: (): void => set({ drawerOpen: true }),
  closeDrawer: (): void => set({ drawerOpen: false }),
  setMobile: (value: boolean): void => set({ isMobile: value }),
  toggleShowAllMessages: (): void => set((state) => ({ showAllMessages: !state.showAllMessages })),
}));
