import type { LlmProvider, UserChatModel } from '../../types/provider';

interface ProviderStoreState {
  providers: LlmProvider[];
  models: UserChatModel[];
  addProvider: (provider: LlmProvider) => void;
  addModel: (model: UserChatModel) => void;
  updateProvider: (provider: LlmProvider) => void;
  updateModel: (model: UserChatModel) => void;
  deleteModel: (modelId: string) => void;
  setProviderKey: (providerId: string, rawKey: string) => void;
  getProviderById: (id: string) => LlmProvider | undefined;
  getModelById: (id: string) => UserChatModel | undefined;
  getAvailableModels: () => UserChatModel[];
  getProviderForModel: (model: UserChatModel) => LlmProvider | undefined;
  getFirstWebSearchModel: () => UserChatModel | undefined;
  hasAnyApiKey: () => boolean;
  deleteProvider: (providerId: string) => void;
  resetProvider: (providerId: string) => void;
}

const mockAddNotification = jest.fn<undefined, [string, string | undefined]>();
const mockRemoveNotification = jest.fn<undefined, [string]>();

jest.mock('../../store/NotificationStore', () => ({
  useNotificationStore: Object.assign(
    jest.fn(() => ({
      notifications: [],
      addNotification: mockAddNotification,
      removeNotification: mockRemoveNotification,
    })),
    {
      getState: () => ({
        notifications: [],
        addNotification: mockAddNotification,
        removeNotification: mockRemoveNotification,
      }),
    },
  ),
}));

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

  it('removes selected model key when no models remain after deleting all providers', () => {
    const store = loadProviderStore();
    const initialModel = store.getState().models[0] as UserChatModel | undefined;

    if (initialModel) {
      localStorage.setItem('athena_selected_model', initialModel.id);
    }

    const providerIds = store.getState().providers.map((p) => p.id);
    for (const id of providerIds) {
      store.getState().deleteProvider(id);
    }

    expect(store.getState().models).toHaveLength(0);
    expect(localStorage.getItem('athena_selected_model')).toBeNull();
  });

  it('returns local-provider models without API keys from getAvailableModels', () => {
    const store = loadProviderStore();

    const localProvider: LlmProvider = {
      id: 'custom-local',
      name: 'Local LLM',
      baseUrl: 'http://localhost:1234/v1/chat/completions',
      messageFormat: 'openai',
      apiKeyEncrypted: '',
      supportsWebSearch: false,
      requiresReasoningFallback: false,
      payloadOverridesJson: '',
      isBuiltIn: false,
    };
    const localModel: UserChatModel = {
      id: 'custom-local-model',
      label: 'Local Model',
      apiModelId: 'local-model',
      providerId: 'custom-local',
      input: 0,
      cachedInput: 0,
      output: 0,
      streaming: true,
      supportsTemperature: true,
      supportsTools: true,
      supportsVision: false,
      supportsFiles: false,
      supportsThinking: false,
      contextWindow: 8192,
      forceTemperature: null,
      enforceAlternatingRoles: false,
      maxTokensOverride: null,
      isBuiltIn: false,
      enabled: true,
    };

    store.getState().addProvider(localProvider);
    store.getState().addModel(localModel);

    const available = store.getState().getAvailableModels();
    expect(available.some((m) => m.id === 'custom-local-model')).toBe(true);
  });
});

describe('ProviderStore selectors', () => {
  let store: ProviderStoreLike;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    store = loadProviderStore();
  });

  it('getProviderById returns existing provider', () => {
    const provider = store.getState().getProviderById('builtin-openai');
    expect(provider).toBeDefined();
    expect(provider?.name).toBe('OpenAI');
  });

  it('getProviderById returns undefined for nonexistent provider', () => {
    expect(store.getState().getProviderById('nonexistent')).toBeUndefined();
  });

  it('getModelById returns existing model', () => {
    const model = store.getState().getModelById('builtin-deepseek-v4-flash');
    expect(model).toBeDefined();
    expect(model?.label).toBe('DeepSeek V4 Flash');
  });

  it('getModelById returns undefined for nonexistent model', () => {
    expect(store.getState().getModelById('nonexistent-model')).toBeUndefined();
  });

  it('getProviderForModel returns provider for a given model', () => {
    const model = store.getState().models.find((m) => m.providerId === 'builtin-openai');
    expect(model).toBeDefined();
    if (model) {
      const provider = store.getState().getProviderForModel(model);
      expect(provider).toBeDefined();
      expect(provider?.id).toBe('builtin-openai');
    }
  });

  it('getProviderForModel returns undefined for model with missing provider', () => {
    const orphanModel: UserChatModel = {
      id: 'orphan-model',
      label: 'Orphan',
      apiModelId: 'orphan',
      providerId: 'nonexistent-provider',
      input: 0,
      cachedInput: 0,
      output: 0,
      streaming: true,
      supportsTemperature: true,
      supportsTools: true,
      supportsVision: false,
      supportsFiles: false,
      supportsThinking: false,
      contextWindow: 8192,
      forceTemperature: null,
      enforceAlternatingRoles: false,
      maxTokensOverride: null,
      isBuiltIn: false,
      enabled: true,
    };

    expect(store.getState().getProviderForModel(orphanModel)).toBeUndefined();
  });

  it('getFirstWebSearchModel returns model when provider has key and supports webSearch', () => {
    store.getState().setProviderKey('builtin-moonshot', 'test-key');

    const wsModel = store.getState().getFirstWebSearchModel();
    expect(wsModel).toBeDefined();
    expect(wsModel?.providerId).toBe('builtin-moonshot');
  });

  it('getFirstWebSearchModel returns undefined when no web search provider has key', () => {
    const wsModel = store.getState().getFirstWebSearchModel();
    expect(wsModel).toBeUndefined();
  });

  it('getAvailableModels excludes disabled models', () => {
    store.getState().setProviderKey('builtin-openai', 'test-key');

    const models = store.getState().models;
    const openAiModel = models.find((m) => m.providerId === 'builtin-openai');
    expect(openAiModel).toBeDefined();

    if (openAiModel) {
      store.getState().updateModel({ ...openAiModel, enabled: false });

      const available = store.getState().getAvailableModels();
      expect(available.some((m) => m.id === openAiModel.id)).toBe(false);
    }
  });

  it('getAvailableModels sorts by provider name then model label', () => {
    store.getState().setProviderKey('builtin-openai', 'test-key');
    store.getState().setProviderKey('builtin-deepseek', 'test-key');

    const available = store.getState().getAvailableModels();
    expect(available.length).toBeGreaterThan(1);

    for (let i = 1; i < available.length; i++) {
      const prev = available[i - 1];
      const curr = available[i];
      const prevProvider = store.getState().getProviderForModel(prev);
      const currProvider = store.getState().getProviderForModel(curr);
      expect(prevProvider).toBeDefined();
      expect(currProvider).toBeDefined();
      if (prevProvider && currProvider) {
        const order =
          prevProvider.name.localeCompare(currProvider.name) ||
          prev.label.localeCompare(curr.label);
        expect(order).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe('ProviderStore CRUD operations', () => {
  let store: ProviderStoreLike;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    store = loadProviderStore();
  });

  it('updateModel updates a model and persists', () => {
    const model = store.getState().models[0];
    expect(model).toBeDefined();

    const updated = { ...model, label: 'Updated Label' };
    store.getState().updateModel(updated);

    const stored = JSON.parse(localStorage.getItem('athena_models') ?? '[]') as UserChatModel[];
    const found = stored.find((m) => m.id === model.id);
    expect(found?.label).toBe('Updated Label');
  });

  it('updateProvider updates a provider and persists', () => {
    const provider = store.getState().providers[0];
    expect(provider).toBeDefined();

    const updated = { ...provider, name: 'Renamed Provider' };
    store.getState().updateProvider(updated);

    const stored = JSON.parse(localStorage.getItem('athena_providers') ?? '[]') as LlmProvider[];
    const found = stored.find((p) => p.id === provider.id);
    expect(found?.name).toBe('Renamed Provider');
  });

  it('deleteModel removes a model and persists', () => {
    const model = store.getState().models[0];
    expect(model).toBeDefined();

    store.getState().deleteModel(model.id);

    const stored = JSON.parse(localStorage.getItem('athena_models') ?? '[]') as UserChatModel[];
    expect(stored.some((m) => m.id === model.id)).toBe(false);
  });

  it('addProvider and addModel persist to localStorage', () => {
    const newProvider: LlmProvider = {
      id: 'custom-static',
      name: 'Custom Static',
      baseUrl: 'https://api.example.com/v1',
      messageFormat: 'openai',
      apiKeyEncrypted: '',
      supportsWebSearch: false,
      requiresReasoningFallback: false,
      payloadOverridesJson: '',
      isBuiltIn: false,
    };

    const newModel: UserChatModel = {
      id: 'custom-static-model',
      label: 'Custom Static Model',
      apiModelId: 'static-model',
      providerId: 'custom-static',
      input: 0.5,
      cachedInput: 0.05,
      output: 1.0,
      streaming: true,
      supportsTemperature: true,
      supportsTools: true,
      supportsVision: false,
      supportsFiles: false,
      supportsThinking: false,
      contextWindow: 32768,
      forceTemperature: null,
      enforceAlternatingRoles: false,
      maxTokensOverride: null,
      isBuiltIn: false,
      enabled: true,
    };

    store.getState().addProvider(newProvider);
    store.getState().addModel(newModel);

    const providers = store.getState().providers;
    const models = store.getState().models;
    expect(providers.some((p) => p.id === 'custom-static')).toBe(true);
    expect(models.some((m) => m.id === 'custom-static-model')).toBe(true);

    const storedProviders = JSON.parse(localStorage.getItem('athena_providers') ?? '[]') as LlmProvider[];
    const storedModels = JSON.parse(localStorage.getItem('athena_models') ?? '[]') as UserChatModel[];
    expect(storedProviders.some((p) => p.id === 'custom-static')).toBe(true);
    expect(storedModels.some((m) => m.id === 'custom-static-model')).toBe(true);
  });
});

describe('ProviderStore migrations', () => {
  function seedProvider(...ids: string[]): void {
    const allProviders = [
      {
        id: 'builtin-openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        messageFormat: 'openai',
        apiKeyEncrypted: '',
        supportsWebSearch: false,
        requiresReasoningFallback: false,
        payloadOverridesJson: '',
        isBuiltIn: true,
      },
      {
        id: 'builtin-deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1/chat/completions',
        messageFormat: 'openai',
        apiKeyEncrypted: '',
        supportsWebSearch: false,
        requiresReasoningFallback: false,
        payloadOverridesJson: '',
        isBuiltIn: true,
      },
      {
        id: 'builtin-google',
        name: 'Google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        messageFormat: 'openai',
        apiKeyEncrypted: '',
        supportsWebSearch: false,
        requiresReasoningFallback: false,
        payloadOverridesJson: '',
        isBuiltIn: true,
      },
      {
        id: 'builtin-moonshot',
        name: 'Moonshot',
        baseUrl: 'https://api.moonshot.ai/v1/chat/completions',
        messageFormat: 'openai',
        apiKeyEncrypted: '',
        supportsWebSearch: true,
        requiresReasoningFallback: true,
        payloadOverridesJson: '',
        isBuiltIn: true,
      },
      {
        id: 'builtin-minimax',
        name: 'MiniMax',
        baseUrl: 'https://api.minimax.io/anthropic/v1/messages',
        messageFormat: 'anthropic',
        apiKeyEncrypted: '',
        supportsWebSearch: false,
        requiresReasoningFallback: false,
        payloadOverridesJson: JSON.stringify({ max_tokens: 4096 }),
        isBuiltIn: true,
      },
    ];
    localStorage.setItem('athena_providers', JSON.stringify(ids.length > 0 ? allProviders.filter((p) => ids.includes(p.id)) : allProviders));
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('migrates DeepSeek Chat to V4 Flash selection key', () => {
    seedProvider('builtin-deepseek');
    localStorage.setItem('athena_selected_model', 'builtin-deepseek-chat');

    const store = loadProviderStore();
    const selected = localStorage.getItem('athena_selected_model');
    expect(selected).toBe('builtin-deepseek-v4-flash');
    // The store should have models loaded after migration
    expect(store.getState().models.length).toBeGreaterThan(0);
  });

  it('migrates DeepSeek Reasoner to V4 Pro selection key', () => {
    seedProvider('builtin-deepseek');
    localStorage.setItem('athena_selected_model', 'builtin-deepseek-reasoner');

    const store = loadProviderStore();
    const selected = localStorage.getItem('athena_selected_model');
    expect(selected).toBe('builtin-deepseek-v4-pro');
    expect(store.getState().models.length).toBeGreaterThan(0);
  });

  it('updates built-in model properties from new defaults', () => {
    // Must include at least one provider so migration path is taken
    localStorage.setItem(
      'athena_providers',
      JSON.stringify([
        {
          id: 'builtin-deepseek',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com/v1/chat/completions',
          messageFormat: 'openai',
          apiKeyEncrypted: '',
          supportsWebSearch: false,
          requiresReasoningFallback: false,
          payloadOverridesJson: '',
          isBuiltIn: true,
        },
      ]),
    );
    const oldModels: UserChatModel[] = [
      {
        id: 'builtin-deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        apiModelId: 'deepseek-v4-flash',
        providerId: 'builtin-deepseek',
        input: 99, // old/wrong value
        cachedInput: 99,
        output: 99,
        streaming: true,
        supportsTemperature: true,
        supportsTools: true,
        supportsVision: false,
        supportsFiles: false,
        supportsThinking: true,
        contextWindow: 999, // old value
        forceTemperature: null,
        enforceAlternatingRoles: false,
        maxTokensOverride: null,
        isBuiltIn: true,
        enabled: true,
      },
    ];

    localStorage.setItem('athena_models', JSON.stringify(oldModels));
    seedProvider('builtin-deepseek');

    const store = loadProviderStore();
    const updated = store.getState().models.find((m) => m.id === 'builtin-deepseek-v4-flash');
    expect(updated).toBeDefined();
    if (updated) {
      expect(updated.input).not.toBe(99);
      expect(updated.contextWindow).not.toBe(999);
    }
  });

  it('migrates Kimi 2.6 forceTemperature from 0.6 to 1.0', () => {
    seedProvider('builtin-moonshot');
    const oldModels: UserChatModel[] = [
      {
        id: 'builtin-kimi-k2-6',
        label: 'Kimi 2.6',
        apiModelId: 'kimi-k2.6',
        providerId: 'builtin-moonshot',
        input: 0.95,
        cachedInput: 0.16,
        output: 4.0,
        streaming: true,
        supportsTemperature: true,
        supportsTools: true,
        supportsVision: true,
        supportsFiles: true,
        supportsThinking: false,
        contextWindow: 262_144,
        forceTemperature: 0.6,
        enforceAlternatingRoles: false,
        maxTokensOverride: null,
        isBuiltIn: true,
        enabled: true,
      },
    ];

    localStorage.setItem('athena_models', JSON.stringify(oldModels));

    const store = loadProviderStore();
    const updated = store.getState().models.find((m) => m.id === 'builtin-kimi-k2-6');
    expect(updated).toBeDefined();
    if (!updated) { throw new Error('Expected model to be defined'); }
    expect(updated.forceTemperature).toBe(1.0);
  });

  it('adds missing built-in models to existing storage', () => {
    localStorage.setItem(
      'athena_providers',
      JSON.stringify([
        {
          id: 'builtin-deepseek',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com/v1/chat/completions',
          messageFormat: 'openai',
          apiKeyEncrypted: '',
          supportsWebSearch: false,
          requiresReasoningFallback: false,
          payloadOverridesJson: '',
          isBuiltIn: true,
        },
      ]),
    );
    localStorage.setItem(
      'athena_models',
      JSON.stringify([
        {
          id: 'builtin-deepseek-v4-flash',
          label: 'DeepSeek V4 Flash',
          apiModelId: 'deepseek-v4-flash',
          providerId: 'builtin-deepseek',
          input: 0.14,
          cachedInput: 0.028,
          output: 0.28,
          streaming: true,
          supportsTemperature: true,
          supportsTools: true,
          supportsVision: false,
          supportsFiles: false,
          supportsThinking: true,
          contextWindow: 1000000,
          forceTemperature: null,
          enforceAlternatingRoles: false,
          maxTokensOverride: null,
          isBuiltIn: true,
          enabled: true,
        },
      ]),
    );

    const store = loadProviderStore();
    expect(store.getState().models.length).toBeGreaterThan(1);
  });

  it('removes built-in models no longer in defaults', () => {
    localStorage.setItem(
      'athena_models',
      JSON.stringify([
        {
          id: 'builtin-deepseek-v4-flash',
          label: 'DeepSeek V4 Flash',
          apiModelId: 'deepseek-v4-flash',
          providerId: 'builtin-deepseek',
          input: 0.14,
          cachedInput: 0.028,
          output: 0.28,
          streaming: true,
          supportsTemperature: true,
          supportsTools: true,
          supportsVision: false,
          supportsFiles: false,
          supportsThinking: true,
          contextWindow: 1000000,
          forceTemperature: null,
          enforceAlternatingRoles: false,
          maxTokensOverride: null,
          isBuiltIn: true,
          enabled: true,
        },
        {
          id: 'obsolete-builtin',
          label: 'Obsolete Model',
          apiModelId: 'obsolete-id',
          providerId: 'builtin-deepseek',
          input: 0.1,
          cachedInput: 0.01,
          output: 0.2,
          streaming: true,
          supportsTemperature: true,
          supportsTools: true,
          supportsVision: false,
          supportsFiles: false,
          supportsThinking: false,
          contextWindow: 4096,
          forceTemperature: null,
          enforceAlternatingRoles: false,
          maxTokensOverride: null,
          isBuiltIn: true,
          enabled: true,
        },
      ]),
    );
    seedProvider('builtin-deepseek');

    const store = loadProviderStore();
    const hasObsolete = store.getState().models.some((m) => m.id === 'obsolete-builtin');
    expect(hasObsolete).toBe(false);
  });

  it('preserves custom (non-builtin) models during migration', () => {
    const customModel: UserChatModel = {
      id: 'my-custom-model',
      label: 'My Custom',
      apiModelId: 'my-custom',
      providerId: 'builtin-openai',
      input: 1.0,
      cachedInput: 0.1,
      output: 2.0,
      streaming: true,
      supportsTemperature: true,
      supportsTools: true,
      supportsVision: false,
      supportsFiles: false,
      supportsThinking: false,
      contextWindow: 16000,
      forceTemperature: null,
      enforceAlternatingRoles: false,
      maxTokensOverride: null,
      isBuiltIn: false,
      enabled: true,
    };

    localStorage.setItem(
      'athena_models',
      JSON.stringify([
        {
          id: 'builtin-deepseek-v4-flash',
          label: 'DeepSeek V4 Flash',
          apiModelId: 'deepseek-v4-flash',
          providerId: 'builtin-deepseek',
          input: 0.14,
          cachedInput: 0.028,
          output: 0.28,
          streaming: true,
          supportsTemperature: true,
          supportsTools: true,
          supportsVision: false,
          supportsFiles: false,
          supportsThinking: true,
          contextWindow: 1000000,
          forceTemperature: null,
          enforceAlternatingRoles: false,
          maxTokensOverride: null,
          isBuiltIn: true,
          enabled: true,
        },
        customModel,
      ]),
    );
    seedProvider('builtin-openai', 'builtin-deepseek');

    const store = loadProviderStore();
    expect(store.getState().models.some((m) => m.id === 'my-custom-model')).toBe(true);
  });

  it('updates built-in provider names from new defaults', () => {
    localStorage.setItem(
      'athena_providers',
      JSON.stringify([
        {
          id: 'builtin-openai',
          name: 'Old OpenAI Name',
          baseUrl: 'https://api.openai.com/v1/chat/completions',
          messageFormat: 'openai',
          apiKeyEncrypted: '',
          supportsWebSearch: false,
          requiresReasoningFallback: false,
          payloadOverridesJson: '',
          isBuiltIn: true,
        },
      ]),
    );
    localStorage.setItem('athena_models', JSON.stringify([]));

    const store = loadProviderStore();
    const provider = store.getState().getProviderById('builtin-openai');
    expect(provider).toBeDefined();
    expect(provider?.name).toBe('OpenAI');
  });

  it('reorders built-in models to match DEFAULT_MODELS order', () => {
    localStorage.setItem(
      'athena_models',
      JSON.stringify([
        {
          id: 'builtin-gpt-5-4',
          label: 'GPT-5.4',
          apiModelId: 'gpt-5.4',
          providerId: 'builtin-openai',
          input: 2.5,
          cachedInput: 0.25,
          output: 15,
          streaming: true,
          supportsTemperature: false,
          supportsTools: true,
          supportsVision: true,
          supportsFiles: true,
          supportsThinking: false,
          contextWindow: 128000,
          forceTemperature: null,
          enforceAlternatingRoles: false,
          maxTokensOverride: null,
          isBuiltIn: true,
          enabled: true,
        },
        {
          id: 'builtin-deepseek-v4-flash',
          label: 'DeepSeek V4 Flash',
          apiModelId: 'deepseek-v4-flash',
          providerId: 'builtin-deepseek',
          input: 0.14,
          cachedInput: 0.028,
          output: 0.28,
          streaming: true,
          supportsTemperature: true,
          supportsTools: true,
          supportsVision: false,
          supportsFiles: false,
          supportsThinking: true,
          contextWindow: 1000000,
          forceTemperature: null,
          enforceAlternatingRoles: false,
          maxTokensOverride: null,
          isBuiltIn: true,
          enabled: true,
        },
      ]),
    );
    seedProvider('builtin-openai', 'builtin-deepseek');

    const store = loadProviderStore();
    const builtinIds = store
      .getState()
      .models.filter((m) => m.isBuiltIn)
      .map((m) => m.id);

    const deepseekIdx = builtinIds.indexOf('builtin-deepseek-v4-flash');
    const gpt4Idx = builtinIds.indexOf('builtin-gpt-5-4');
    expect(deepseekIdx).toBeLessThan(gpt4Idx);
  });

  it('handles corrupt model storage and re-seeds', () => {
    localStorage.setItem('athena_models', '{not-json');
    localStorage.setItem('athena_providers', '[{"id":"builtin-openai","name":"OpenAI","baseUrl":"https://api.openai.com/v1/chat/completions","messageFormat":"openai","apiKeyEncrypted":"","supportsWebSearch":false,"requiresReasoningFallback":false,"payloadOverridesJson":"","isBuiltIn":true}]');

    const store = loadProviderStore();
    expect(store.getState().models.length).toBeGreaterThan(0);

    const stored = JSON.parse(localStorage.getItem('athena_models') ?? 'null') as unknown;
    expect(stored).not.toBeNull();
  });
});

describe('resetProvider', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('resets a built-in provider to default values while preserving the API key', () => {
    localStorage.setItem(
      'athena_providers',
      JSON.stringify([
        {
          id: 'builtin-openai',
          name: 'My Custom Name',
          baseUrl: 'https://custom.example.com/v1',
          messageFormat: 'anthropic',
          apiKeyEncrypted: 'pretend-encrypted-key-xyz',
          supportsWebSearch: true,
          requiresReasoningFallback: true,
          payloadOverridesJson: '{"max_tokens":1}',
          isBuiltIn: true,
        },
      ]),
    );

    const store = loadProviderStore();
    store.getState().resetProvider('builtin-openai');

    const provider = store.getState().providers.find((p) => p.id === 'builtin-openai');
    expect(provider).toBeDefined();
    if (!provider) { throw new Error('Expected provider to be defined'); }
    expect(provider.name).toBe('OpenAI');
    expect(provider.baseUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(provider.messageFormat).toBe('openai');
    expect(provider.supportsWebSearch).toBe(false);
    expect(provider.requiresReasoningFallback).toBe(false);
    expect(provider.payloadOverridesJson).toBe('');
    expect(provider.apiKeyEncrypted).toBe('pretend-encrypted-key-xyz');
  });

  it('does nothing for a non-built-in provider', () => {
    const customProvider: LlmProvider = {
      id: 'custom-test-provider',
      name: 'Custom Test',
      baseUrl: 'https://custom.example.com/v1',
      messageFormat: 'openai',
      apiKeyEncrypted: 'custom-key',
      supportsWebSearch: true,
      requiresReasoningFallback: false,
      payloadOverridesJson: '{"something":1}',
      isBuiltIn: false,
    };

    localStorage.setItem('athena_providers', JSON.stringify([customProvider]));

    const store = loadProviderStore();
    store.getState().resetProvider('custom-test-provider');

    const provider = store.getState().providers.find((p) => p.id === 'custom-test-provider');
    expect(provider).toBeDefined();
    if (!provider) { throw new Error('Expected provider to be defined'); }
    expect(provider.name).toBe('Custom Test');
    expect(provider.baseUrl).toBe('https://custom.example.com/v1');
    expect(provider.supportsWebSearch).toBe(true);
    expect(provider.payloadOverridesJson).toBe('{"something":1}');
  });

  it('does nothing for an unknown provider ID', () => {
    const store = loadProviderStore();
    const initialCount = store.getState().providers.length;
    store.getState().resetProvider('nonexistent-id');
    expect(store.getState().providers).toHaveLength(initialCount);
  });
});

describe('ProviderStore — localStorage resilience', () => {
  let originalSetItem: (key: string, value: string) => void;
  let originalGetItem: (key: string) => string | null;
  let originalRemoveItem: (key: string) => void;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    mockAddNotification.mockReset();
    originalSetItem = Storage.prototype.setItem.bind(localStorage);
    originalGetItem = Storage.prototype.getItem.bind(localStorage);
    originalRemoveItem = Storage.prototype.removeItem.bind(localStorage);
  });

  afterEach(() => {
    Storage.prototype.setItem = originalSetItem;
    Storage.prototype.getItem = originalGetItem;
    Storage.prototype.removeItem = originalRemoveItem;
  });

  it('surfaces a notification when saveProviders fails due to quota exceeded', () => {
    Storage.prototype.setItem = jest.fn((): void => {
      throw new Error('QuotaExceededError');
    });

    const store = loadProviderStore();

    const newProvider: LlmProvider = {
      id: 'custom-quota',
      name: 'Custom Quota Test',
      baseUrl: 'https://api.example.com/v1',
      messageFormat: 'openai',
      apiKeyEncrypted: '',
      supportsWebSearch: false,
      requiresReasoningFallback: false,
      payloadOverridesJson: '',
      isBuiltIn: false,
    };

    store.getState().addProvider(newProvider);

    expect(mockAddNotification).toHaveBeenCalledWith('Storage is full — your latest changes were not saved.');
    expect(store.getState().providers.some((p) => p.id === 'custom-quota')).toBe(true);
  });

  it('surfaces a notification when saveModels fails due to quota exceeded', () => {
    Storage.prototype.setItem = jest.fn((): void => {
      throw new Error('QuotaExceededError');
    });

    const store = loadProviderStore();

    const newModel: UserChatModel = {
      id: 'custom-quota-model',
      label: 'Custom Quota Model',
      apiModelId: 'quota-model',
      providerId: 'builtin-openai',
      input: 0,
      cachedInput: 0,
      output: 0,
      streaming: true,
      supportsTemperature: true,
      supportsTools: true,
      supportsVision: false,
      supportsFiles: false,
      supportsThinking: false,
      contextWindow: 8192,
      forceTemperature: null,
      enforceAlternatingRoles: false,
      maxTokensOverride: null,
      isBuiltIn: false,
      enabled: true,
    };

    store.getState().addModel(newModel);

    expect(mockAddNotification).toHaveBeenCalledWith('Storage is full — your latest changes were not saved.');
    expect(store.getState().models.some((m) => m.id === 'custom-quota-model')).toBe(true);
  });

  it('surfaces a notification when setProviderKey fails due to quota exceeded', () => {
    const store = loadProviderStore();

    Storage.prototype.setItem = jest.fn((): void => {
      throw new Error('QuotaExceededError');
    });

    store.getState().setProviderKey('builtin-openai', 'test-key');

    expect(mockAddNotification).toHaveBeenCalledWith('Storage is full — your latest changes were not saved.');
  });

  it('initStore returns defaults when localStorage.getItem throws (unavailable storage)', () => {
    Storage.prototype.getItem = jest.fn((): null => {
      throw new Error('SecurityError: Access denied');
    });
    Storage.prototype.setItem = jest.fn();

    const store = loadProviderStore();

    expect(store.getState().providers.length).toBeGreaterThan(0);
    expect(store.getState().models.length).toBeGreaterThan(0);
  });

  it('deleteProvider handles selected_model fallback when setItem throws', () => {
    const store = loadProviderStore();
    const state = store.getState();

    const selectedOpenAiModel = state.models.find((m) => m.providerId === 'builtin-openai');
    if (!selectedOpenAiModel) {
      throw new Error('Expected at least one OpenAI model in defaults');
    }
    localStorage.setItem('athena_selected_model', selectedOpenAiModel.id);

    Storage.prototype.setItem = jest.fn((): void => {
      throw new Error('QuotaExceededError');
    });
    Storage.prototype.removeItem = jest.fn();

    store.getState().deleteProvider('builtin-openai');

    const remainingModels = store.getState().models;
    expect(remainingModels.some((m) => m.providerId === 'builtin-openai')).toBe(false);
  });

  it('deleteProvider removes selected_model key when no models remain and removeItem throws', () => {
    const store = loadProviderStore();
    const initialModel = store.getState().models[0] as UserChatModel | undefined;
    if (initialModel) {
      localStorage.setItem('athena_selected_model', initialModel.id);
    }

    Storage.prototype.setItem = jest.fn((): void => {
      throw new Error('QuotaExceededError');
    });
    Storage.prototype.removeItem = jest.fn((): void => {
      throw new Error('QuotaExceededError');
    });

    const providerIds = store.getState().providers.map((p) => p.id);
    for (const id of providerIds) {
      store.getState().deleteProvider(id);
    }

    expect(store.getState().models).toHaveLength(0);
  });

  it('initStore handles DeepSeek V4 migration when setItem throws', () => {
    localStorage.setItem('athena_selected_model', 'builtin-deepseek-chat');
    localStorage.setItem(
      'athena_providers',
      JSON.stringify([
        {
          id: 'builtin-deepseek',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com/v1/chat/completions',
          messageFormat: 'openai',
          apiKeyEncrypted: '',
          supportsWebSearch: false,
          requiresReasoningFallback: false,
          payloadOverridesJson: '',
          isBuiltIn: true,
        },
      ]),
    );

    Storage.prototype.setItem = jest.fn((): void => {
      throw new Error('QuotaExceededError');
    });

    const store = loadProviderStore();
    expect(store.getState().models.length).toBeGreaterThan(0);
  });
});

describe('ProviderStore — input validation', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    mockAddNotification.mockReset();
  });

  const validProvider: LlmProvider = {
    id: 'custom-valid',
    name: 'Valid Provider',
    baseUrl: 'https://api.example.com/v1/chat/completions',
    messageFormat: 'openai',
    apiKeyEncrypted: '',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: false,
  };

  it('addProvider accepts a valid provider', () => {
    const store = loadProviderStore();
    store.getState().addProvider(validProvider);
    expect(store.getState().providers.some((p) => p.id === 'custom-valid')).toBe(true);
  });

  it('addProvider rejects empty trimmed name', () => {
    const store = loadProviderStore();
    expect(() => store.getState().addProvider({ ...validProvider, name: '   ' })).toThrow('Provider name is required.');
  });

  it('addProvider rejects empty baseUrl', () => {
    const store = loadProviderStore();
    expect(() => store.getState().addProvider({ ...validProvider, baseUrl: '' })).toThrow('Provider base URL is required.');
  });

  it('addProvider rejects invalid URL format', () => {
    const store = loadProviderStore();
    expect(() => store.getState().addProvider({ ...validProvider, baseUrl: 'not-a-url' })).toThrow(
      'Provider base URL is not a valid URL.',
    );
  });

  it('addProvider rejects invalid messageFormat', () => {
    const store = loadProviderStore();
    expect(() => store.getState().addProvider({ ...validProvider, messageFormat: 'invalid' as 'openai' })).toThrow(
      'Provider message format must be "openai" or "anthropic".',
    );
  });

  it('addProvider accepts anthropic messageFormat', () => {
    const store = loadProviderStore();
    store.getState().addProvider({ ...validProvider, messageFormat: 'anthropic' });
    expect(store.getState().providers.some((p) => p.id === 'custom-valid')).toBe(true);
  });

  it('updateProvider applies the same validation', () => {
    const store = loadProviderStore();
    // First add a valid provider that we can then try to update
    store.getState().addProvider(validProvider);

    expect(() => store.getState().updateProvider({ ...validProvider, name: '' })).toThrow('Provider name is required.');
  });
});
