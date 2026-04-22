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

// ── Seeding (first run) ───────────────────────────────────────────────────────


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
    // First run
    providers = DEFAULT_PROVIDERS.map((p) => ({ ...p, apiKeyEncrypted: '' }));
    models = DEFAULT_MODELS;
    saveProviders(providers);
    saveModels(models);
  } else {
    // Migration: Update built-in models with new defaults from DEFAULT_MODELS (e.g. forceTemperature)
    let modelsChanged = false;
    const existingModelIds = new Set(models.map((m) => m.id));

    // 1. Add missing built-in models
    for (const def of DEFAULT_MODELS) {
      if (!existingModelIds.has(def.id)) {
        models.push(def);
        modelsChanged = true;
      }
    }

    // 2. Update existing built-in models
    models = models.map((m) => {
      if (!m.isBuiltIn) return m;
      const def = DEFAULT_MODELS.find((dm) => dm.id === m.id);
      if (!def) return m;

      // Update specific properties that might have changed in code but need to persist in storage
      let updated = false;
      const next = { ...m };

      if (m.forceTemperature !== def.forceTemperature) {
        next.forceTemperature = def.forceTemperature;
        updated = true;
      }
      if (m.input !== def.input) {
        next.input = def.input;
        updated = true;
      }
      if (m.cachedInput !== def.cachedInput) {
        next.cachedInput = def.cachedInput;
        updated = true;
      }
      if (m.output !== def.output) {
        next.output = def.output;
        updated = true;
      }
      if (m.contextWindow !== def.contextWindow) {
        next.contextWindow = def.contextWindow;
        updated = true;
      }

      if (updated) {
        modelsChanged = true;
        return next;
      }
      return m;
    });

    // 3. Remove built-in models that are no longer in DEFAULT_MODELS
    const currentDefaultIds = new Set(DEFAULT_MODELS.map((dm) => dm.id));
    const nextModels = models.filter((m) => !m.isBuiltIn || currentDefaultIds.has(m.id));
    if (nextModels.length !== models.length) {
      models = nextModels;
      modelsChanged = true;
    }

    if (modelsChanged) saveModels(models);

    // 4. Update built-in providers (e.g. name changes)
    let providersChanged = false;
    for (let i = 0; i < providers.length; i++) {
      const p = providers[i];
      if (!p.isBuiltIn) continue;
      const def = DEFAULT_PROVIDERS.find((dp) => dp.id === p.id);
      if (def && p.name !== def.name) {
        providers[i] = { ...p, name: def.name };
        providersChanged = true;
      }
    }
    if (providersChanged) saveProviders(providers);
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
    const available = models.filter((m) => {
      if (!m.enabled) return false;
      const provider = providers.find((p) => p.id === m.providerId);
      if (!provider) return false;
      const hasKey = getApiKey(provider).length > 0;
      return hasKey || providerCanBeUsedWithoutKey(provider);
    });

    return [...available].sort((a, b) => {
      const pA = providers.find((p) => p.id === a.providerId)?.name ?? '';
      const pB = providers.find((p) => p.id === b.providerId)?.name ?? '';

      if (pA !== pB) {
        return pA.localeCompare(pB);
      }
      return a.label.localeCompare(b.label);
    });
  },

  getProviderForModel: (model: UserChatModel): LlmProvider | undefined => {
    return get().providers.find((p) => p.id === model.providerId);
  },

  hasAnyApiKey: (): boolean => {
    return get().getAvailableModels().length > 0;
  },
}));
