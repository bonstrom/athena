import type { LlmProvider, UserChatModel } from '../../types/provider';

interface ProviderStoreState {
  providers: LlmProvider[];
  models: UserChatModel[];
  setProviderKey: (providerId: string, rawKey: string) => void;
  getAvailableModels: () => UserChatModel[];
  hasAnyApiKey: () => boolean;
  deleteProvider: (providerId: string) => void;
}

interface ProviderStoreLike {
  getState: () => ProviderStoreState;
}

function loadProviderStore(): ProviderStoreLike {
  let loadedStore!: ProviderStoreLike;

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loadedStore = (require('../../store/ProviderStore') as { useProviderStore: ProviderStoreLike }).useProviderStore;
  });

  return loadedStore;
}

describe('ProviderStore', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('seeds providers and models on first load and persists them', () => {
    const store = loadProviderStore();
    const state = store.getState();

    expect(state.providers.length).toBeGreaterThan(0);
    expect(state.models.length).toBeGreaterThan(0);

    const storedProviders = localStorage.getItem('athena_providers');
    const storedModels = localStorage.getItem('athena_models');
    expect(storedProviders).not.toBeNull();
    expect(storedModels).not.toBeNull();
  });

  it('recovers from corrupt storage by re-seeding defaults', () => {
    localStorage.setItem('athena_providers', '{not-json');
    localStorage.setItem('athena_models', '{not-json');

    const store = loadProviderStore();
    const state = store.getState();

    expect(state.providers.length).toBeGreaterThan(0);
    expect(state.models.length).toBeGreaterThan(0);
    expect((): void => {
      JSON.parse(localStorage.getItem('athena_providers') ?? '');
    }).not.toThrow();
    expect((): void => {
      JSON.parse(localStorage.getItem('athena_models') ?? '');
    }).not.toThrow();
  });

  it('setProviderKey enables available models for that provider and updates hasAnyApiKey', () => {
    const store = loadProviderStore();
    const stateBefore = store.getState();

    expect(stateBefore.hasAnyApiKey()).toBe(false);
    expect(stateBefore.getAvailableModels()).toHaveLength(0);

    store.getState().setProviderKey('builtin-openai', 'test-key');

    const stateAfter = store.getState();
    const openAiModels = stateAfter.getAvailableModels().filter((m) => m.providerId === 'builtin-openai');

    expect(stateAfter.hasAnyApiKey()).toBe(true);
    expect(openAiModels.length).toBeGreaterThan(0);

    const storedProviders = JSON.parse(localStorage.getItem('athena_providers') ?? '[]') as LlmProvider[];
    const openAiProvider = storedProviders.find((p) => p.id === 'builtin-openai');
    expect(openAiProvider).toBeDefined();
    expect(openAiProvider?.apiKeyEncrypted).not.toBe('test-key');
    expect(openAiProvider?.apiKeyEncrypted.length).toBeGreaterThan(0);
  });

  it('deleteProvider updates selected model when current selection belongs to removed provider', () => {
    const store = loadProviderStore();
    const state = store.getState();

    const selectedOpenAiModel = state.models.find((m) => m.providerId === 'builtin-openai');
    expect(selectedOpenAiModel).toBeDefined();
    if (!selectedOpenAiModel) {
      throw new Error('Expected at least one OpenAI model in defaults');
    }

    localStorage.setItem('athena_selected_model', selectedOpenAiModel.id);

    store.getState().deleteProvider('builtin-openai');

    const nextSelection = localStorage.getItem('athena_selected_model');
    const remainingModels = store.getState().models;

    expect(remainingModels.some((m) => m.providerId === 'builtin-openai')).toBe(false);
    expect(nextSelection).not.toBe(selectedOpenAiModel.id);
    expect(nextSelection).toBe(remainingModels[0]?.id ?? null);
  });
});
