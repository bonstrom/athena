export {};
interface NotificationItem {
  id: string;
  title: string;
  message?: string;
}

interface NotificationStoreState {
  notifications: NotificationItem[];
  addNotification: (title: string, message?: string) => void;
  removeNotification: (id: string) => void;
}

interface NotificationStoreLike {
  getState: () => NotificationStoreState;
  setState: (partial: Partial<NotificationStoreState>) => void;
}

function loadNotificationStore(): NotificationStoreLike {
  let loadedStore!: NotificationStoreLike;

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loadedStore = (require('../NotificationStore') as { useNotificationStore: NotificationStoreLike }).useNotificationStore;
  });

  return loadedStore;
}

describe('NotificationStore', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('adds notifications with generated ids', () => {
    const mockRandomUUID = jest.fn<`${string}-${string}`, []>().mockReturnValueOnce('id-1').mockReturnValueOnce('id-2');

    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: mockRandomUUID,
      },
      configurable: true,
    });

    const store = loadNotificationStore();

    store.getState().addNotification('Title 1', 'Message 1');
    store.getState().addNotification('Title 2');

    expect(store.getState().notifications).toEqual([
      { id: 'id-1', title: 'Title 1', message: 'Message 1' },
      { id: 'id-2', title: 'Title 2', message: undefined },
    ]);
  });

  it('removes only the targeted notification id', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: jest.fn<`${string}-${string}`, []>().mockReturnValueOnce('keep-id').mockReturnValueOnce('remove-id'),
      },
      configurable: true,
    });

    const store = loadNotificationStore();

    store.getState().addNotification('Keep');
    store.getState().addNotification('Remove');
    store.getState().removeNotification('remove-id');

    expect(store.getState().notifications).toEqual([{ id: 'keep-id', title: 'Keep', message: undefined }]);
  });
});
