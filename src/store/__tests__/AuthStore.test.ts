export {};
const mockClearPredefinedPrompts = jest.fn<Promise<void>, []>(() => Promise.resolve());
const mockAddPredefinedPrompt = jest.fn<Promise<string>, [unknown]>(() => Promise.resolve('id-1'));
const mockPutPredefinedPrompt = jest.fn<Promise<string>, [unknown]>(() => Promise.resolve('id-1'));
const mockDeletePredefinedPrompt = jest.fn<Promise<void>, [string]>(() => Promise.resolve());

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    predefinedPrompts: {
      clear: (...args: []): Promise<void> => mockClearPredefinedPrompts(...args),
      add: (...args: [unknown]): Promise<string> => mockAddPredefinedPrompt(...args),
      put: (...args: [unknown]): Promise<string> => mockPutPredefinedPrompt(...args),
      delete: (...args: [string]): Promise<void> => mockDeletePredefinedPrompt(...args),
      toArray: (): Promise<unknown[]> => Promise.resolve([]),
    },
  },
}));

interface AuthStoreSlice {
  backupInterval: number;
  themeMode: 'light' | 'dark';
  colorTheme: string;
  ragEnabled: boolean;
  maxContextTokens: number;
  messageRetrievalEnabled: boolean;
  predefinedPrompts: { id: string; name: string; content: string }[];
  setBackupInterval: (minutes: number) => void;
  setThemeMode: (mode: 'light' | 'dark') => void;
  setColorTheme: (theme: string) => void;
  setPredefinedPrompts: (prompts: { id: string; name: string; content: string }[]) => void;
  addPredefinedPrompt: (prompt: { id: string; name: string; content: string }) => void;
  updatePredefinedPrompt: (prompt: { id: string; name: string; content: string }) => void;
  deletePredefinedPrompt: (id: string) => void;
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
    mockAddPredefinedPrompt.mockImplementation((): Promise<string> => Promise.resolve('id-1'));
    mockPutPredefinedPrompt.mockImplementation((): Promise<string> => Promise.resolve('id-1'));
    mockDeletePredefinedPrompt.mockImplementation((): Promise<void> => Promise.resolve());
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

  it('clearAuth removes backupInterval from localStorage but keeps it in state; keeps theme localStorage keys but resets state to defaults', () => {
    const store = loadAuthStore();

    store.getState().setBackupInterval(45);
    store.getState().setThemeMode('light');
    store.getState().setColorTheme('ocean');

    store.getState().clearAuth();

    const state = store.getState();
    // backupInterval is removed from localStorage but state is not reset
    expect(state.backupInterval).toBe(45);
    expect(localStorage.getItem('backupInterval')).toBeNull();
    // themeMode/colorTheme are NOT removed from localStorage but ARE reset in state
    expect(state.themeMode).toBe('dark');
    expect(state.colorTheme).toBe('default');
    expect(localStorage.getItem('themeMode')).toBe('light');
    expect(localStorage.getItem('colorTheme')).toBe('ocean');
  });

  it('predefined prompt CRUD updates state and logs DB failures without throwing', async () => {
    const store = loadAuthStore();
    // Wait for the module-level toArray().then(setPredefinedPrompts) to settle
    // so it doesn't overwrite our manual state setup below.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const logSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);

    const promptA = { id: 'p1', name: 'Prompt A', content: 'Alpha' };
    const promptAUpdated = { id: 'p1', name: 'Prompt A+', content: 'Alpha+' };
    const promptB = { id: 'p2', name: 'Prompt B', content: 'Beta' };

    store.getState().setPredefinedPrompts([promptA]);

    mockAddPredefinedPrompt.mockImplementationOnce((): Promise<string> => Promise.reject(new Error('add failed')));
    store.getState().addPredefinedPrompt(promptB);
    await Promise.resolve();

    expect(store.getState().predefinedPrompts).toHaveLength(2);
    expect(store.getState().predefinedPrompts.find((p) => p.id === 'p2')).toEqual(promptB);

    mockPutPredefinedPrompt.mockImplementationOnce((): Promise<string> => Promise.reject(new Error('put failed')));
    store.getState().updatePredefinedPrompt(promptAUpdated);
    await Promise.resolve();

    expect(store.getState().predefinedPrompts.find((p) => p.id === 'p1')?.content).toBe('Alpha+');

    mockDeletePredefinedPrompt.mockImplementationOnce((): Promise<void> => Promise.reject(new Error('delete failed')));
    store.getState().deletePredefinedPrompt('p2');
    await Promise.resolve();

    expect(store.getState().predefinedPrompts.find((p) => p.id === 'p2')).toBeUndefined();
    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
