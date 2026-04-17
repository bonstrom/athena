interface UiStoreState {
  drawerOpen: boolean;
  isMobile: boolean;
  showAllMessages: boolean;
  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setMobile: (value: boolean) => void;
  toggleShowAllMessages: () => void;
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
});
