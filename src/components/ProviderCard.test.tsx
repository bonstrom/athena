import { fireEvent, render, screen } from '@testing-library/react';
import { ProviderCard } from './ProviderCard';
import { useProviderStore } from '../store/ProviderStore';
import { useAuthStore } from '../store/AuthStore';
import { DEFAULT_MODELS, DEFAULT_PROVIDERS, encodeApiKey, LlmProvider, UserChatModel } from '../types/provider';
import { createUserChatModel, selectorize } from '../testUtils';

interface ProviderStoreSlice {
  models: UserChatModel[];
  setProviderKey: jest.Mock<void, [string, string]>;
  updateModel: jest.Mock<void, [UserChatModel]>;
}

jest.mock('../store/ProviderStore', () => ({ useProviderStore: jest.fn() }));
jest.mock('../store/AuthStore', () => ({ useAuthStore: jest.fn() }));

const mockUseProviderStore = useProviderStore as unknown as jest.Mock<ProviderStoreSlice>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock<{ currency: string }>;

describe('ProviderCard', () => {
  let state: ProviderStoreSlice;
  let provider: LlmProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = { ...DEFAULT_PROVIDERS[0], apiKeyEncrypted: '' };
    state = {
      models: DEFAULT_MODELS.map((model) => ({ ...model })),
      setProviderKey: jest.fn<ReturnType<ProviderStoreSlice['setProviderKey']>, [string, string]>(),
      updateModel: jest.fn<ReturnType<ProviderStoreSlice['updateModel']>, [UserChatModel]>(),
    };
    mockUseProviderStore.mockReturnValue(state);
    selectorize(mockUseAuthStore, { currency: 'USD' });
  });

  it('shows predefined models without provider or model editors', () => {
    state.models.push(createUserChatModel({ id: 'custom-model', providerId: provider.id, label: 'Custom model' }));
    render(<ProviderCard provider={provider} balanceLabel="$12.34" />);

    expect(screen.getByRole('heading', { name: provider.name })).toBeInTheDocument();
    expect(screen.getByText('No key')).toBeInTheDocument();
    expect(screen.getByText('Balance: $12.34')).toBeInTheDocument();
    for (const model of DEFAULT_MODELS.filter((entry) => entry.providerId === provider.id)) {
      expect(screen.getByRole('checkbox', { name: model.label })).toBeChecked();
    }
    expect(screen.queryByText('Custom model')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add|edit|delete (model|provider)/i })).not.toBeInTheDocument();
  });

  it('saves a trimmed API key only on explicit save', () => {
    render(<ProviderCard provider={provider} />);
    const input = screen.getByLabelText(`${provider.name} API key`);
    expect(input).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: `Save ${provider.name} API key` })).toBeDisabled();

    fireEvent.change(input, { target: { value: '  test-key  ' } });
    expect(state.setProviderKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: `Save ${provider.name} API key` }));

    expect(state.setProviderKey).toHaveBeenCalledWith(provider.id, 'test-key');
  });

  it('removes an existing API key without changing model preferences', () => {
    provider.apiKeyEncrypted = encodeApiKey('test-key');
    render(<ProviderCard provider={provider} />);
    expect(screen.getByText('Key set')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Remove ${provider.name} API key` }));

    expect(state.setProviderKey).toHaveBeenCalledWith(provider.id, '');
    expect(screen.getByLabelText(`${provider.name} API key`)).toHaveValue('');
    expect(state.updateModel).not.toHaveBeenCalled();
  });

  it('reflects saved API key changes', () => {
    const { rerender } = render(<ProviderCard provider={provider} />);
    rerender(<ProviderCard provider={{ ...provider, apiKeyEncrypted: encodeApiKey('replacement-key') }} />);
    expect(screen.getByLabelText(`${provider.name} API key`)).toHaveValue('replacement-key');
    expect(screen.getByText('Key set')).toBeInTheDocument();
  });

  it.each([true, false])('toggles an initially enabled=%s model without changing its definition', (enabled) => {
    const model = state.models.find((entry) => entry.providerId === provider.id);
    if (!model) throw new Error('Expected a predefined model');
    model.enabled = enabled;
    render(<ProviderCard provider={provider} />);

    fireEvent.click(screen.getByRole('checkbox', { name: model.label }));

    expect(state.updateModel).toHaveBeenCalledWith({ ...model, enabled: !enabled });
    expect(state.setProviderKey).not.toHaveBeenCalled();
  });
});
