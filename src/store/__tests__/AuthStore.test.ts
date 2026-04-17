const mockClearPredefinedPrompts = jest.fn<Promise<void>, []>(() => Promise.resolve());

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    predefinedPrompts: {
      clear: (...args: []): Promise<void> => mockClearPredefinedPrompts(...args),
      toArray: (): Promise<unknown[]> => Promise.resolve([]),
    },
  },
}));

interface AuthStoreSlice {
  ragEnabled: boolean;
  maxContextTokens: number;
  messageRetrievalEnabled: boolean;
  setRagEnabled: (enabled: boolean) => void;
  clearAuth: () => void;
}

interface AuthStoreLike {
  getState: () => AuthStoreSlice;
}

function loadAuthStore(): AuthStoreLike {
  let loadedStore!: AuthStoreLike;

  jest.isolateModules(() => {
    jest.doMock(
      'react-router-dom',
      () => ({
        useNavigate: (): (() => void) => jest.fn(),
      }),
      { virtual: true },
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loadedStore = (require('../../store/AuthStore') as { useAuthStore: AuthStoreLike }).useAuthStore;
  });

  return loadedStore;
}

describe('AuthStore', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockClearPredefinedPrompts.mockImplementation((): Promise<void> => Promise.resolve());
    localStorage.clear();
  });

  it('defaults ragEnabled to false when no persisted value exists', () => {
    const store = loadAuthStore();

    expect(store.getState().ragEnabled).toBe(false);
  });

  it('uses persisted ragEnabled=true when explicitly stored', () => {
    localStorage.setItem('ragEnabled', 'true');

    const store = loadAuthStore();

    expect(store.getState().ragEnabled).toBe(true);
  });

  it('setRagEnabled persists to localStorage and updates state', () => {
    const store = loadAuthStore();

    store.getState().setRagEnabled(true);

    expect(store.getState().ragEnabled).toBe(true);
    expect(localStorage.getItem('ragEnabled')).toBe('true');
  });

  it('clearAuth resets RAG and context defaults and clears persisted keys', () => {
    localStorage.setItem('ragEnabled', 'true');
    localStorage.setItem('maxContextTokens', '32000');
    localStorage.setItem('messageRetrievalEnabled', 'false');

    const store = loadAuthStore();

    store.getState().clearAuth();

    const state = store.getState();
    expect(state.ragEnabled).toBe(false);
    expect(state.maxContextTokens).toBe(16000);
    expect(state.messageRetrievalEnabled).toBe(true);
    expect(localStorage.getItem('ragEnabled')).toBeNull();
    expect(localStorage.getItem('maxContextTokens')).toBeNull();
    expect(localStorage.getItem('messageRetrievalEnabled')).toBeNull();
    expect(mockClearPredefinedPrompts).toHaveBeenCalledTimes(1);
  });
});
