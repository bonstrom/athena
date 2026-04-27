import { create } from "zustand";

interface UiState {
  drawerOpen: boolean;
  isMobile: boolean;
  showAllMessages: boolean;
  selectedTopicIds: Set<string>;

  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setMobile: (value: boolean) => void;
  toggleShowAllMessages: () => void;
  toggleTopicSelection: (id: string) => void;
  selectAllTopics: (ids: string[]) => void;
  clearTopicSelection: () => void;
  isMultiSelectMode: () => boolean;
}

export const useUiStore = create<UiState>((set, get) => ({
  drawerOpen: true,
  isMobile: false,
  showAllMessages: false,
  selectedTopicIds: new Set<string>(),

  toggleDrawer: (): void => set((state) => ({ drawerOpen: !state.drawerOpen })),
  openDrawer: (): void => set({ drawerOpen: true }),
  closeDrawer: (): void => set({ drawerOpen: false }),
  setMobile: (value: boolean): void => set({ isMobile: value }),
  toggleShowAllMessages: (): void => set((state) => ({ showAllMessages: !state.showAllMessages })),

  toggleTopicSelection: (id: string): void =>
    set((state) => {
      const next = new Set(state.selectedTopicIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedTopicIds: next };
    }),

  selectAllTopics: (ids: string[]): void =>
    set(() => {
      const next = new Set<string>(ids);
      return { selectedTopicIds: next };
    }),

  clearTopicSelection: (): void => set({ selectedTopicIds: new Set<string>() }),

  isMultiSelectMode: (): boolean => get().selectedTopicIds.size > 0,
}));
