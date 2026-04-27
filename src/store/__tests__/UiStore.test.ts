export {};
interface UiStoreState {
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

interface UiStoreLike {
  getState: () => UiStoreState;
}

function loadUiStore(): UiStoreLike {
  let loadedStore!: UiStoreLike;

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loadedStore = (require('../UiStore') as { useUiStore: UiStoreLike }).useUiStore;
  });

  return loadedStore;
}

describe('UiStore', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('starts with expected defaults', () => {
    const store = loadUiStore();

    expect(store.getState().drawerOpen).toBe(true);
    expect(store.getState().isMobile).toBe(false);
    expect(store.getState().showAllMessages).toBe(false);
    expect(store.getState().selectedTopicIds.size).toBe(0);
  });

  it('toggles and sets drawer visibility', () => {
    const store = loadUiStore();

    store.getState().toggleDrawer();
    expect(store.getState().drawerOpen).toBe(false);

    store.getState().openDrawer();
    expect(store.getState().drawerOpen).toBe(true);

    store.getState().closeDrawer();
    expect(store.getState().drawerOpen).toBe(false);
  });

  it('sets mobile mode explicitly', () => {
    const store = loadUiStore();

    store.getState().setMobile(true);
    expect(store.getState().isMobile).toBe(true);

    store.getState().setMobile(false);
    expect(store.getState().isMobile).toBe(false);
  });

  it('toggles showAllMessages flag', () => {
    const store = loadUiStore();

    store.getState().toggleShowAllMessages();
    expect(store.getState().showAllMessages).toBe(true);

    store.getState().toggleShowAllMessages();
    expect(store.getState().showAllMessages).toBe(false);
  });

  describe('topic selection', () => {
    it('toggleTopicSelection adds and removes topic IDs', () => {
      const store = loadUiStore();

      store.getState().toggleTopicSelection('topic-1');
      expect(store.getState().selectedTopicIds.has('topic-1')).toBe(true);
      expect(store.getState().selectedTopicIds.size).toBe(1);

      store.getState().toggleTopicSelection('topic-2');
      expect(store.getState().selectedTopicIds.has('topic-1')).toBe(true);
      expect(store.getState().selectedTopicIds.has('topic-2')).toBe(true);
      expect(store.getState().selectedTopicIds.size).toBe(2);

      store.getState().toggleTopicSelection('topic-1');
      expect(store.getState().selectedTopicIds.has('topic-1')).toBe(false);
      expect(store.getState().selectedTopicIds.has('topic-2')).toBe(true);
      expect(store.getState().selectedTopicIds.size).toBe(1);
    });

    it('selectAllTopics replaces selection with given IDs', () => {
      const store = loadUiStore();

      store.getState().toggleTopicSelection('old-topic');
      store.getState().selectAllTopics(['a', 'b', 'c']);

      expect(store.getState().selectedTopicIds.has('old-topic')).toBe(false);
      expect(store.getState().selectedTopicIds.has('a')).toBe(true);
      expect(store.getState().selectedTopicIds.has('b')).toBe(true);
      expect(store.getState().selectedTopicIds.has('c')).toBe(true);
      expect(store.getState().selectedTopicIds.size).toBe(3);
    });

    it('clearTopicSelection empties the set', () => {
      const store = loadUiStore();

      store.getState().toggleTopicSelection('topic-1');
      store.getState().toggleTopicSelection('topic-2');
      expect(store.getState().selectedTopicIds.size).toBe(2);

      store.getState().clearTopicSelection();
      expect(store.getState().selectedTopicIds.size).toBe(0);
    });

    it('isMultiSelectMode returns true only when selection is non-empty', () => {
      const store = loadUiStore();

      expect(store.getState().isMultiSelectMode()).toBe(false);

      store.getState().toggleTopicSelection('topic-1');
      expect(store.getState().isMultiSelectMode()).toBe(true);

      store.getState().clearTopicSelection();
      expect(store.getState().isMultiSelectMode()).toBe(false);
    });
  });
});
