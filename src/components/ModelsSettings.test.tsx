import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModelsSettings from './ModelsSettings';
import { useProviderStore } from '../store/ProviderStore';

interface ProviderStoreSlice {
  providers: { id: string; name: string }[];
  models: {
    id: string;
    label: string;
    apiModelId: string;
    providerId: string;
    input: number;
    cachedInput: number;
    output: number;
    streaming: boolean;
    supportsTemperature: boolean;
    supportsTools: boolean;
    supportsVision: boolean;
    supportsFiles: boolean;
    contextWindow: number;
    forceTemperature: number | null;
    enforceAlternatingRoles: boolean;
    maxTokensOverride: number | null;
    isBuiltIn: boolean;
    enabled: boolean;
    thinkingParseMode?: 'api-native' | 'tag-based' | 'none';
    thinkingOpenTag?: string;
    thinkingCloseTag?: string;
  }[];
  addModel: (model: ProviderStoreSlice['models'][0]) => void;
  updateModel: (model: ProviderStoreSlice['models'][0]) => void;
  deleteModel: (id: string) => void;
}

jest.mock('../store/ProviderStore', () => ({
  useProviderStore: jest.fn(),
}));

const mockUseProviderStore = useProviderStore as unknown as jest.Mock<ProviderStoreSlice>;

describe('ModelsSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: jest.fn((): string => 'model-uuid') },
      writable: true,
    });
  });

  it('adds a model from add form', async () => {
    const addModel: jest.MockedFunction<(model: ProviderStoreSlice['models'][0]) => void> = jest.fn();

    mockUseProviderStore.mockReturnValue({
      providers: [{ id: 'p1', name: 'Provider A' }],
      models: [],
      addModel,
      updateModel: jest.fn(),
      deleteModel: jest.fn(),
    });

    render(<ModelsSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
    fireEvent.change(screen.getByLabelText('Display Label'), { target: { value: 'My Model' } });
    fireEvent.change(screen.getByLabelText('API Model ID'), { target: { value: 'my-model-id' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add Model$/i }));

    await waitFor(() => {
      expect(addModel).toHaveBeenCalledTimes(1);
    });

    const added = addModel.mock.calls[0][0];
    expect(added.id).toBe('model-uuid');
    expect(added.label).toBe('My Model');
    expect(added.apiModelId).toBe('my-model-id');
    expect(added.providerId).toBe('p1');
  });

  it('deletes model when confirmed', () => {
    const deleteModel: jest.MockedFunction<(id: string) => void> = jest.fn();
    jest.spyOn(window, 'confirm').mockImplementation((): boolean => true);

    mockUseProviderStore.mockReturnValue({
      providers: [{ id: 'p1', name: 'Provider A' }],
      models: [
        {
          id: 'm1',
          label: 'Model A',
          apiModelId: 'model-a',
          providerId: 'p1',
          input: 0,
          cachedInput: 0,
          output: 0,
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
        },
      ],
      addModel: jest.fn(),
      updateModel: jest.fn(),
      deleteModel,
    });

    render(<ModelsSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteModel).toHaveBeenCalledWith('m1');
  });
});
