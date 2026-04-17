import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProvidersSettings from './ProvidersSettings';
import { useProviderStore } from '../store/ProviderStore';

interface ProviderStoreSlice {
  providers: {
    id: string;
    name: string;
    baseUrl: string;
    messageFormat: 'openai' | 'anthropic';
    apiKeyEncrypted: string;
    supportsWebSearch: boolean;
    requiresReasoningFallback: boolean;
    payloadOverridesJson: string;
    isBuiltIn: boolean;
  }[];
  addProvider: (provider: {
    id: string;
    name: string;
    baseUrl: string;
    messageFormat: 'openai' | 'anthropic';
    apiKeyEncrypted: string;
    supportsWebSearch: boolean;
    requiresReasoningFallback: boolean;
    payloadOverridesJson: string;
    isBuiltIn: boolean;
  }) => void;
  updateProvider: (provider: {
    id: string;
    name: string;
    baseUrl: string;
    messageFormat: 'openai' | 'anthropic';
    apiKeyEncrypted: string;
    supportsWebSearch: boolean;
    requiresReasoningFallback: boolean;
    payloadOverridesJson: string;
    isBuiltIn: boolean;
  }) => void;
  deleteProvider: (id: string) => void;
  models?: { id: string; providerId: string }[];
}

jest.mock('../store/ProviderStore', () => ({
  useProviderStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

type UseProviderStoreMock = jest.Mock<ProviderStoreSlice> & {
  getState: jest.Mock<{ models: { id: string; providerId: string }[] }>;
};

const mockUseProviderStore = useProviderStore as unknown as UseProviderStoreMock;

describe('ProvidersSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: jest.fn((): string => 'provider-uuid') },
      writable: true,
    });
  });

  it('adds a provider from add form', async () => {
    const addProvider = jest.fn<void, [ProviderStoreSlice['providers'][0]]>();

    mockUseProviderStore.mockReturnValue({
      providers: [],
      addProvider,
      updateProvider: jest.fn(),
      deleteProvider: jest.fn(),
    });
    mockUseProviderStore.getState.mockReturnValue({ models: [] });

    render(<ProvidersSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Provider' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Custom API' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://example.com/v1/chat/completions' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'secret-key' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add Provider$/i }));

    await waitFor(() => {
      expect(addProvider).toHaveBeenCalledTimes(1);
    });

    const added = addProvider.mock.calls[0][0];
    expect(added.id).toBe('provider-uuid');
    expect(added.name).toBe('Custom API');
    expect(added.baseUrl).toBe('https://example.com/v1/chat/completions');
  });

  it('deletes provider when confirmed', () => {
    const deleteProvider = jest.fn<void, [string]>();
    jest.spyOn(window, 'confirm').mockImplementation((): boolean => true);

    mockUseProviderStore.mockReturnValue({
      providers: [
        {
          id: 'p1',
          name: 'Provider A',
          baseUrl: 'https://example.com',
          messageFormat: 'openai',
          apiKeyEncrypted: '',
          supportsWebSearch: false,
          requiresReasoningFallback: false,
          payloadOverridesJson: '',
          isBuiltIn: false,
        },
      ],
      addProvider: jest.fn(),
      updateProvider: jest.fn(),
      deleteProvider,
    });
    mockUseProviderStore.getState.mockReturnValue({ models: [] });

    render(<ProvidersSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteProvider).toHaveBeenCalledWith('p1');
  });
});
