import { create } from 'zustand';
import { DEFAULT_MODELS, DEFAULT_PROVIDERS, LlmProvider, UserChatModel, encodeApiKey, getApiKey } from '../types/provider';

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORAGE_KEY_PROVIDERS = 'athena_providers';
const STORAGE_KEY_MODELS = 'athena_models';

function loadProviders(): LlmProvider[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROVIDERS);
    if (raw) return JSON.parse(raw) as LlmProvider[];
  } catch {
    // corrupt storage
  }
  return [];
}

function loadModels(): UserChatModel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MODELS);
    if (raw) return JSON.parse(raw) as UserChatModel[];
  } catch {
    // corrupt storage
  }
  return [];
}

function saveProviders(providers: LlmProvider[]): void {
  localStorage.setItem(STORAGE_KEY_PROVIDERS, JSON.stringify(providers));
}

function saveModels(models: UserChatModel[]): void {
  localStorage.setItem(STORAGE_KEY_MODELS, JSON.stringify(models));
}

function isLocalBaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.trim().toLowerCase();
  return normalized.includes('localhost') || normalized.includes('127.0.0.1') || normalized.includes('[::1]');
}

function providerCanBeUsedWithoutKey(provider: LlmProvider): boolean {
  return isLocalBaseUrl(provider.baseUrl);
}

// ── Migration from old individual API key fields ──────────────────────────────

interface OldKeyMap {
  openAiKey: string | null;
  deepSeekKey: string | null;
  googleApiKey: string | null;
  moonshotApiKey: string | null;
  minimaxKey: string | null;
}

function migrateOldKeys(): OldKeyMap {
  return {
    openAiKey: localStorage.getItem('openAiKey'),
    deepSeekKey: localStorage.getItem('deepSeekKey'),
    googleApiKey: localStorage.getItem('googleApiKey'),
    moonshotApiKey: localStorage.getItem('moonshotApiKey'),
    minimaxKey: localStorage.getItem('minimaxKey'),
  };
}

function clearOldKeys(): void {
  ['openAiKey', 'deepSeekKey', 'googleApiKey', 'moonshotApiKey', 'minimaxKey'].forEach((k) => localStorage.removeItem(k));
}

// ── Seeding (first run or migration) ─────────────────────────────────────────

function seedProvidersWithKeys(oldKeys: OldKeyMap): LlmProvider[] {
  const keyMap: Record<string, string | null> = {
    'builtin-openai': oldKeys.openAiKey,
    'builtin-deepseek': oldKeys.deepSeekKey,
    'builtin-google': oldKeys.googleApiKey,
    'builtin-moonshot': oldKeys.moonshotApiKey,
    'builtin-minimax': oldKeys.minimaxKey,
  };

  return DEFAULT_PROVIDERS.map((p) => ({
    ...p,
    // The old keys are already encoded with SecurityUtils.encode — reuse as-is
    apiKeyEncrypted: keyMap[p.id] ?? '',
  }));
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface ProviderState {
  providers: LlmProvider[];
  models: UserChatModel[];

  // Provider CRUD
  addProvider: (provider: LlmProvider) => void;
  updateProvider: (provider: LlmProvider) => void;
  deleteProvider: (providerId: string) => void;
  setProviderKey: (providerId: string, rawKey: string) => void;

  // Model CRUD
  addModel: (model: UserChatModel) => void;
  updateModel: (model: UserChatModel) => void;
  deleteModel: (modelId: string) => void;

  // Selectors
  getProviderById: (id: string) => LlmProvider | undefined;
  getModelById: (id: string) => UserChatModel | undefined;
  getAvailableModels: () => UserChatModel[];
  getProviderForModel: (model: UserChatModel) => LlmProvider | undefined;
  hasAnyApiKey: () => boolean;
}

function initStore(): Pick<ProviderState, 'providers' | 'models'> {
  let providers = loadProviders();
  let models = loadModels();

  const hasStoredProviders = providers.length > 0;

  if (!hasStoredProviders) {
    // First run or migrating from old format
    const oldKeys = migrateOldKeys();
    const hasOldKeys = [oldKeys.openAiKey, oldKeys.deepSeekKey, oldKeys.googleApiKey, oldKeys.moonshotApiKey, oldKeys.minimaxKey].some(
      (k) => k !== null && k.length > 0,
    );

    providers = hasOldKeys ? seedProvidersWithKeys(oldKeys) : DEFAULT_PROVIDERS.map((p) => ({ ...p, apiKeyEncrypted: '' }));

    if (hasOldKeys) {
      clearOldKeys();
    }

    models = DEFAULT_MODELS;
    saveProviders(providers);
    saveModels(models);
  }

  return { providers, models };
}

const { providers: initialProviders, models: initialModels } = initStore();

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: initialProviders,
  models: initialModels,

  addProvider: (provider: LlmProvider): void => {
    set((state) => {
      const next = [...state.providers, provider];
      saveProviders(next);
      return { providers: next };
    });
  },

  updateProvider: (provider: LlmProvider): void => {
    set((state) => {
      const next = state.providers.map((p) => (p.id === provider.id ? provider : p));
      saveProviders(next);
      return { providers: next };
    });
  },

  deleteProvider: (providerId: string): void => {
    set((state) => {
      const removedModels = state.models.filter((m) => m.providerId === providerId);
      const nextProviders = state.providers.filter((p) => p.id !== providerId);
      const nextModels = state.models.filter((m) => m.providerId !== providerId);

      // If the currently persisted selection points to a removed model, fall back.
      const selected = localStorage.getItem('athena_selected_model');
      if (selected) {
        const removed = removedModels.some((m) => m.id === selected || m.apiModelId === selected);
        if (removed) {
          if (nextModels.length > 0) {
            localStorage.setItem('athena_selected_model', nextModels[0].id);
          } else {
            localStorage.removeItem('athena_selected_model');
          }
        }
      }

      saveProviders(nextProviders);
      saveModels(nextModels);
      return { providers: nextProviders, models: nextModels };
    });
  },

  setProviderKey: (providerId: string, rawKey: string): void => {
    set((state) => {
      const next = state.providers.map((p) => (p.id === providerId ? { ...p, apiKeyEncrypted: rawKey ? encodeApiKey(rawKey) : '' } : p));
      saveProviders(next);
      return { providers: next };
    });
  },

  addModel: (model: UserChatModel): void => {
    set((state) => {
      const next = [...state.models, model];
      saveModels(next);
      return { models: next };
    });
  },

  updateModel: (model: UserChatModel): void => {
    set((state) => {
      const next = state.models.map((m) => (m.id === model.id ? model : m));
      saveModels(next);
      return { models: next };
    });
  },

  deleteModel: (modelId: string): void => {
    set((state) => {
      const next = state.models.filter((m) => m.id !== modelId);
      saveModels(next);
      return { models: next };
    });
  },

  getProviderById: (id: string): LlmProvider | undefined => {
    return get().providers.find((p) => p.id === id);
  },

  getModelById: (id: string): UserChatModel | undefined => {
    return get().models.find((m) => m.id === id);
  },

  getAvailableModels: (): UserChatModel[] => {
    const { models, providers } = get();
    return models.filter((m) => {
      if (!m.enabled) return false;
      const provider = providers.find((p) => p.id === m.providerId);
      if (!provider) return false;
      const hasKey = getApiKey(provider).length > 0;
      return hasKey || providerCanBeUsedWithoutKey(provider);
    });
  },

  getProviderForModel: (model: UserChatModel): LlmProvider | undefined => {
    return get().providers.find((p) => p.id === model.providerId);
  },

  hasAnyApiKey: (): boolean => {
    return get().getAvailableModels().length > 0;
  },
}));
