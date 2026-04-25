import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddProviderCard, ProviderCard } from './ProviderCard';
import { useProviderStore } from '../store/ProviderStore';
import { encodeApiKey, LlmProvider, UserChatModel } from '../types/provider';

type ProviderHandler = (provider: LlmProvider) => void;
type ProviderIdHandler = (providerId: string) => void;
type ModelHandler = (model: UserChatModel) => void;
type ModelIdHandler = (modelId: string) => void;

interface ProviderStoreSlice {
  models: UserChatModel[];
  addProvider: (provider: LlmProvider) => void;
  deleteProvider: (providerId: string) => void;
  updateProvider: (provider: LlmProvider) => void;
  addModel: (model: UserChatModel) => void;
  updateModel: (model: UserChatModel) => void;
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
    supportsThinking: false,
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
      addModel: jest.fn(),
      updateModel: jest.fn(),
    });

    mockUseProviderStore.getState.mockReturnValue({
      updateModel: jest.fn(),
      deleteModel: jest.fn(),
    });
  });

  it('adds a custom provider from AddProviderCard form', async () => {
    const addProvider: jest.MockedFunction<ProviderHandler> = jest.fn();
    mockUseProviderStore.mockReturnValue({
      models: [],
      addProvider,
      deleteProvider: jest.fn(),
      updateProvider: jest.fn(),
      addModel: jest.fn(),
      updateModel: jest.fn(),
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

  it('resets add provider form on cancel and shows JSON validation errors', () => {
    render(<AddProviderCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Custom Provider' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discarded Provider' } });
    fireEvent.click(screen.getByText('ADVANCED'));
    fireEvent.change(screen.getByLabelText('Payload Overrides (JSON)'), { target: { value: '{invalid' } });

    expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Provider' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Custom Provider' }));

    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument();
  });

  it('renders provider model list, provider chips, and model status chips', () => {
    mockUseProviderStore.mockReturnValue({
      models: [
        createModel({
          supportsVision: true,
          enforceAlternatingRoles: true,
          forceTemperature: 0.4,
        }),
      ],
      addProvider: jest.fn(),
      deleteProvider: jest.fn(),
      updateProvider: jest.fn(),
      addModel: jest.fn(),
      updateModel: jest.fn(),
    });

    render(
      <ProviderCard provider={createProvider({ apiKeyEncrypted: encodeApiKey('secret-key'), supportsWebSearch: true })} balanceLabel="123.45" />,
    );

    expect(screen.getByText('Provider One')).toBeInTheDocument();
    expect(screen.getByText('Key set')).toBeInTheDocument();
    expect(screen.getByText('Web Search')).toBeInTheDocument();
    expect(screen.getByText('Balance: 123.45')).toBeInTheDocument();
    expect(screen.getByText('Model One')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Vision')).toBeInTheDocument();
    expect(screen.getByText('Alt-roles')).toBeInTheDocument();
    expect(screen.getByText('T=0.4')).toBeInTheDocument();
    expect(screen.getByText('10kr | 20kr /1M')).toBeInTheDocument();
  });

  it('updates provider settings with advanced options and a new API key', async () => {
    const updateProvider: jest.MockedFunction<ProviderHandler> = jest.fn();
    mockUseProviderStore.mockReturnValue({
      models: [],
      addProvider: jest.fn(),
      deleteProvider: jest.fn(),
      updateProvider,
      addModel: jest.fn(),
      updateModel: jest.fn(),
    });

    const { container } = render(
      <ProviderCard
        provider={createProvider({
          apiKeyEncrypted: encodeApiKey('old-key'),
          payloadOverridesJson: '',
        })}
      />,
    );

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    fireEvent.click(buttons[0]);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated Provider' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://updated.example.com/v1/chat/completions' } });
    fireEvent.change(screen.getByLabelText('API Key (leave blank to keep current)'), { target: { value: 'new-secret' } });
    fireEvent.click(screen.getByText('ADVANCED'));
    fireEvent.click(screen.getByLabelText('Supports $web_search builtin (Moonshot-style)'));
    fireEvent.click(screen.getByLabelText('Requires reasoning_content fallback in assistant messages'));
    fireEvent.change(screen.getByLabelText('Payload Overrides (JSON)'), { target: { value: '{"max_tokens":4096}' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(updateProvider).toHaveBeenCalledTimes(1);
    });

    const updatedProvider = updateProvider.mock.calls[0][0];
    expect(updatedProvider).toMatchObject({
      id: 'provider-1',
      name: 'Updated Provider',
      baseUrl: 'https://updated.example.com/v1/chat/completions',
      supportsWebSearch: true,
      requiresReasoningFallback: true,
      payloadOverridesJson: '{"max_tokens":4096}',
    });
    expect(updatedProvider.apiKeyEncrypted).toBeTruthy();
    expect(updatedProvider.apiKeyEncrypted).not.toBe('new-secret');
    expect(screen.queryByText('Provider Settings')).not.toBeInTheDocument();
  });

  it('toggles and deletes a model via store state handlers', () => {
    const updateModel: jest.MockedFunction<ModelHandler> = jest.fn();
    const deleteModel: jest.MockedFunction<ModelIdHandler> = jest.fn();
    jest.spyOn(window, 'confirm').mockImplementation((): boolean => true);

    mockUseProviderStore.mockReturnValue({
      models: [createModel()],
      addProvider: jest.fn(),
      deleteProvider: jest.fn(),
      updateProvider: jest.fn(),
      addModel: jest.fn(),
      updateModel: jest.fn(),
    });
    mockUseProviderStore.getState.mockReturnValue({
      updateModel,
      deleteModel,
    });

    const { container } = render(<ProviderCard provider={createProvider()} />);

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(updateModel).toHaveBeenCalledWith(expect.objectContaining({ id: 'model-1', enabled: false }));

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    fireEvent.click(buttons[3]);

    expect(deleteModel).toHaveBeenCalledWith('model-1');
  });

  it('adds a model with advanced overrides', async () => {
    const addModel: jest.MockedFunction<ModelHandler> = jest.fn();
    mockUseProviderStore.mockReturnValue({
      models: [],
      addProvider: jest.fn(),
      deleteProvider: jest.fn(),
      updateProvider: jest.fn(),
      addModel,
      updateModel: jest.fn(),
    });

    render(<ProviderCard provider={createProvider()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
    fireEvent.change(screen.getByLabelText('Display Label'), { target: { value: 'Reasoner' } });
    fireEvent.change(screen.getByLabelText('API Model ID'), { target: { value: 'reasoner-v1' } });
    fireEvent.click(screen.getByText('BEHAVIORAL OVERRIDES'));
    fireEvent.click(screen.getByLabelText('Enforce alternating roles (required for DeepSeek Reasoner)'));
    fireEvent.change(screen.getByLabelText('Force Temperature'), { target: { value: '0.6' } });
    fireEvent.change(screen.getByLabelText('Max Tokens Override'), { target: { value: '4096' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));

    await waitFor(() => {
      expect(addModel).toHaveBeenCalledTimes(1);
    });

    expect(addModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'provider-uuid',
        label: 'Reasoner',
        apiModelId: 'reasoner-v1',
        providerId: 'provider-1',
        forceTemperature: 0.6,
        maxTokensOverride: 4096,
        enforceAlternatingRoles: true,
      }),
    );
    expect(screen.queryByText('Edit Model')).not.toBeInTheDocument();
  });

  it('edits an existing model including tag-based thinking settings', async () => {
    const updateModel: jest.MockedFunction<ModelHandler> = jest.fn();
    mockUseProviderStore.mockReturnValue({
      models: [
        createModel({
          thinkingParseMode: 'tag-based',
          thinkingOpenTag: '<reasoning>',
          thinkingCloseTag: '</reasoning>',
        }),
      ],
      addProvider: jest.fn(),
      deleteProvider: jest.fn(),
      updateProvider: jest.fn(),
      addModel: jest.fn(),
      updateModel,
    });

    const { container } = render(<ProviderCard provider={createProvider()} />);

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    fireEvent.click(buttons[2]);

    fireEvent.change(screen.getByLabelText('Display Label'), { target: { value: 'Model Two' } });
    fireEvent.change(screen.getByLabelText('Open Tag'), { target: { value: '<thinker>' } });
    fireEvent.change(screen.getByLabelText('Close Tag'), { target: { value: '</thinker>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(updateModel).toHaveBeenCalledTimes(1);
    });

    expect(updateModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'model-1',
        label: 'Model Two',
        thinkingParseMode: 'tag-based',
        thinkingOpenTag: '<thinker>',
        thinkingCloseTag: '</thinker>',
      }),
    );
  });

  it('deletes provider after confirmation', () => {
    const deleteProvider: jest.MockedFunction<ProviderIdHandler> = jest.fn();
    jest.spyOn(window, 'confirm').mockImplementation((): boolean => true);

    mockUseProviderStore.mockReturnValue({
      models: [],
      addProvider: jest.fn(),
      deleteProvider,
      updateProvider: jest.fn(),
      addModel: jest.fn(),
      updateModel: jest.fn(),
    });

    const { container } = render(<ProviderCard provider={createProvider()} />);

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    fireEvent.click(buttons[1]);

    expect(deleteProvider).toHaveBeenCalledWith('provider-1');
  });
});
