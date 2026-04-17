import { render, waitFor } from '@testing-library/react';
import ModelSelector, { getDefaultModel, type ChatModel } from './ModelSelector';
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

    const onChange = jest.fn<void, [ChatModel]>();

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
});
