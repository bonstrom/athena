import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddProviderCard, ProviderCard } from './ProviderCard';
import { useProviderStore } from '../store/ProviderStore';
import { LlmProvider, UserChatModel } from '../types/provider';

interface ProviderStoreSlice {
  models: UserChatModel[];
  addProvider: (provider: LlmProvider) => void;
  deleteProvider: (providerId: string) => void;
  updateProvider: (provider: LlmProvider) => void;
}

type ProviderStoreHookMock = jest.Mock<ProviderStoreSlice> & {
  getState: jest.Mock<{
    updateModel: (model: UserChatModel) => void;
    deleteModel: (modelId: string) => void;
  }>;
};

jest.mock('../store/ProviderStore', () => ({
  useProviderStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

const mockUseProviderStore = useProviderStore as unknown as ProviderStoreHookMock;

function createProvider(overrides?: Partial<LlmProvider>): LlmProvider {
  return {
    id: 'provider-1',
    name: 'Provider One',
    baseUrl: 'https://example.com/v1/chat/completions',
    messageFormat: 'openai',
    apiKeyEncrypted: '',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: false,
    ...overrides,
  };
}

function createModel(overrides?: Partial<UserChatModel>): UserChatModel {
  return {
    id: 'model-1',
    label: 'Model One',
    apiModelId: 'model-one',
    providerId: 'provider-1',
    input: 1,
    cachedInput: 0.5,
    output: 2,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: false,
    supportsFiles: false,
    contextWindow: 128000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: false,
    enabled: true,
    thinkingParseMode: 'api-native',
    thinkingOpenTag: '<think>',
    thinkingCloseTag: '</think>',
    ...overrides,
  };
}

describe('ProviderCard and AddProviderCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Object.defineProperty(globalThis, 'crypto', {
      writable: true,
      value: {
        randomUUID: jest.fn((): string => 'provider-uuid'),
      },
    });

    mockUseProviderStore.mockReturnValue({
      models: [],
      addProvider: jest.fn(),
      deleteProvider: jest.fn(),
      updateProvider: jest.fn(),
    });

    mockUseProviderStore.getState.mockReturnValue({
      updateModel: jest.fn(),
      deleteModel: jest.fn(),
    });
  });

  it('adds a custom provider from AddProviderCard form', async () => {
    const addProvider = jest.fn<undefined, [LlmProvider]>();
    mockUseProviderStore.mockReturnValue({
      models: [],
      addProvider,
      deleteProvider: jest.fn(),
      updateProvider: jest.fn(),
    });

    render(<AddProviderCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Custom Provider' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Custom API' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://custom.example.com/v1/chat/completions' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'secret-key' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Provider' }));

    await waitFor(() => {
      expect(addProvider).toHaveBeenCalledTimes(1);
    });

    const added = addProvider.mock.calls[0][0];
    expect(added.id).toBe('provider-uuid');
    expect(added.name).toBe('Custom API');
    expect(added.baseUrl).toBe('https://custom.example.com/v1/chat/completions');
    expect(added.messageFormat).toBe('openai');
    expect(added.apiKeyEncrypted).not.toBe('secret-key');
    expect(added.apiKeyEncrypted.length).toBeGreaterThan(0);
  });

  it('renders provider model list and no-key status', () => {
    mockUseProviderStore.mockReturnValue({
      models: [createModel()],
      addProvider: jest.fn(),
      deleteProvider: jest.fn(),
      updateProvider: jest.fn(),
    });

    render(<ProviderCard provider={createProvider()} balanceLabel="123.45" />);

    expect(screen.getByText('Provider One')).toBeInTheDocument();
    expect(screen.getByText('No key')).toBeInTheDocument();
    expect(screen.getByText('Balance: 123.45')).toBeInTheDocument();
    expect(screen.getByText('Model One')).toBeInTheDocument();
  });

  it('deletes provider after confirmation', () => {
    const deleteProvider = jest.fn<undefined, [string]>();
    jest.spyOn(window, 'confirm').mockImplementation((): boolean => true);

    mockUseProviderStore.mockReturnValue({
      models: [],
      addProvider: jest.fn(),
      deleteProvider,
      updateProvider: jest.fn(),
    });

    const { container } = render(<ProviderCard provider={createProvider()} />);

    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[1]);

    expect(deleteProvider).toHaveBeenCalledWith('provider-1');
  });
});
