import { render, screen, waitFor } from '@testing-library/react';
import ModelSelector, { getDefaultModel, getDefaultTopicNameModel, getAvailableModels, getModelByApiId, type ChatModel } from './ModelSelector';
import { useProviderStore } from '../store/ProviderStore';

jest.mock('../store/ProviderStore', () => ({
  useProviderStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

interface ProviderStoreStateForSelector {
  getAvailableModels: () => ChatModel[];
  models: ChatModel[];
}

interface ProviderStoreStateForDefault {
  models: ChatModel[];
  getAvailableModels: () => ChatModel[];
}

type UseProviderStoreMock = jest.Mock<ProviderStoreStateForSelector> & {
  getState: jest.Mock<ProviderStoreStateForDefault>;
};

const mockUseProviderStore = useProviderStore as unknown as UseProviderStoreMock;

function buildModel(overrides: Partial<ChatModel>): ChatModel {
  return {
    id: 'builtin-gpt-5-4-nano',
    label: 'GPT-5.4 Nano',
    apiModelId: 'gpt-5.4-nano',
    providerId: 'builtin-openai',
    input: 0.2,
    cachedInput: 0.02,
    output: 1.25,
    streaming: true,
    supportsTemperature: false,
    supportsTools: true,
    supportsVision: true,
    supportsFiles: true,
    contextWindow: 128_000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
    ...overrides,
  };
}

describe('ModelSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('maps legacy saved Kimi model IDs to K2 Turbo in getDefaultModel', () => {
    const turbo = buildModel({
      id: 'builtin-kimi-k2-turbo',
      label: 'Kimi K2 Turbo Preview',
      apiModelId: 'kimi-k2-turbo-preview',
      providerId: 'builtin-moonshot',
    });

    mockUseProviderStore.getState.mockReturnValue({
      models: [turbo],
      getAvailableModels: (): ChatModel[] => [turbo],
    });

    localStorage.setItem('athena_selected_model', 'builtin-kimi-k2-5');

    const selected = getDefaultModel();

    expect(selected.id).toBe('builtin-kimi-k2-turbo');
  });

  it('auto-corrects invalid selected model to first available option and avoids out-of-range warning', async () => {
    const invalidSelected = buildModel({
      id: 'builtin-kimi-k2-5',
      label: 'Kimi 2.5',
      apiModelId: 'kimi-k2.5',
      providerId: 'builtin-moonshot',
    });
    const available = buildModel({
      id: 'builtin-kimi-k2-turbo',
      label: 'Kimi K2 Turbo Preview',
      apiModelId: 'kimi-k2-turbo-preview',
      providerId: 'builtin-moonshot',
    });

    const onChange = jest.fn<undefined, [ChatModel]>();

    mockUseProviderStore.mockReturnValue({
      getAvailableModels: (): ChatModel[] => [available],
      models: [available],
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation((): void => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);

    render(<ModelSelector selectedModel={invalidSelected} onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(available);
    });

    const outOfRangeLogged = [...warnSpy.mock.calls, ...errorSpy.mock.calls].some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('out-of-range value')),
    );
    expect(outOfRangeLogged).toBe(false);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('renders empty state message when no models available', (): void => {
    const onChange = jest.fn<undefined, [ChatModel]>();

    mockUseProviderStore.mockReturnValue({
      getAvailableModels: (): ChatModel[] => [],
      models: [],
    });

    render(<ModelSelector selectedModel={undefined} onChange={onChange} />);

    expect(screen.getByText(/no models available/i)).toBeInTheDocument();
  });

  it('returns first available model when saved model is not available', (): void => {
    const gpt4 = buildModel({
      id: 'builtin-gpt-4',
      label: 'GPT-4',
      apiModelId: 'gpt-4',
    });
    const gpt35 = buildModel({
      id: 'builtin-gpt-35',
      label: 'GPT-3.5',
      apiModelId: 'gpt-3.5',
    });

    mockUseProviderStore.getState.mockReturnValue({
      models: [gpt4, gpt35],
      getAvailableModels: (): ChatModel[] => [gpt35],
    });

    localStorage.setItem('athena_selected_model', 'builtin-gpt-4');

    const selected = getDefaultModel();

    expect(selected.id).toBe('builtin-gpt-35');
    expect(localStorage.getItem('athena_selected_model')).toBe('builtin-gpt-35');
  });

  it('falls back to models[0] when no available models exist', (): void => {
    const gpt4 = buildModel({
      id: 'builtin-gpt-4',
      label: 'GPT-4',
      apiModelId: 'gpt-4',
    });

    mockUseProviderStore.getState.mockReturnValue({
      models: [gpt4],
      getAvailableModels: (): ChatModel[] => [],
    });

    const selected = getDefaultModel();

    expect(selected.id).toBe('builtin-gpt-4');
  });

  it('getDefaultTopicNameModel prefers nano or flash models', (): void => {
    const nano = buildModel({
      id: 'builtin-gpt-nano',
      label: 'GPT Nano',
      apiModelId: 'gpt-nano',
    });
    const standard = buildModel({
      id: 'builtin-gpt-4',
      label: 'GPT-4',
      apiModelId: 'gpt-4',
    });

    mockUseProviderStore.getState.mockReturnValue({
      models: [standard, nano],
      getAvailableModels: (): ChatModel[] => [standard, nano],
    });

    const result = getDefaultTopicNameModel();
    expect(result.apiModelId).toMatch(/nano|flash/);
  });

  it('getDefaultTopicNameModel falls back to first available when no nano/flash exists', (): void => {
    const gpt4 = buildModel({
      id: 'builtin-gpt-4',
      label: 'GPT-4',
      apiModelId: 'gpt-4',
    });

    mockUseProviderStore.getState.mockReturnValue({
      models: [gpt4],
      getAvailableModels: (): ChatModel[] => [gpt4],
    });

    const result = getDefaultTopicNameModel();
    expect(result.id).toBe('builtin-gpt-4');
  });

  it('getAvailableModels delegates to provider store', (): void => {
    const gpt4 = buildModel({
      id: 'builtin-gpt-4',
      label: 'GPT-4',
      apiModelId: 'gpt-4',
    });

    mockUseProviderStore.getState.mockReturnValue({
      models: [gpt4],
      getAvailableModels: (): ChatModel[] => [gpt4],
    });

    const available = getAvailableModels();
    expect(available).toHaveLength(1);
    expect(available[0].id).toBe('builtin-gpt-4');
  });

  it('getModelByApiId finds model by API ID', (): void => {
    const gpt4 = buildModel({
      id: 'builtin-gpt-4',
      label: 'GPT-4',
      apiModelId: 'gpt-4',
    });

    mockUseProviderStore.getState.mockReturnValue({
      models: [gpt4],
      getAvailableModels: (): ChatModel[] => [gpt4],
    });

    const found = getModelByApiId('gpt-4');
    expect(found?.id).toBe('builtin-gpt-4');
  });

  it('getModelByApiId returns undefined for non-existent API ID', (): void => {
    const gpt4 = buildModel({
      id: 'builtin-gpt-4',
      label: 'GPT-4',
      apiModelId: 'gpt-4',
    });

    mockUseProviderStore.getState.mockReturnValue({
      models: [gpt4],
      getAvailableModels: (): ChatModel[] => [gpt4],
    });

    const found = getModelByApiId('gpt-3.5');
    expect(found).toBeUndefined();
  });
});
