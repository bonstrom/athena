import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Settings from './Settings';
import { useAuthStore } from '../store/AuthStore';
import { useProviderStore } from '../store/ProviderStore';
import { useBackupStore } from '../store/BackupStore';
import { BackupService } from '../services/backupService';
import { llmSuggestionService } from '../services/llmSuggestionService';
import { getMoonshotBalance, getDeepSeekBalance } from '../services/llmService';

jest.mock('../components/ThemeSelector', () => ({
  __esModule: true,
  default: (): JSX.Element => <div data-testid="theme-selector" />,
}));

jest.mock('../components/ProviderCard', () => ({
  ProviderCard: ({ provider }: { provider: { name: string } }): JSX.Element => <div>{provider.name}</div>,
  AddProviderCard: (): JSX.Element => <div>Add Provider Card</div>,
}));

jest.mock('../components/ImportDialog', () => ({
  __esModule: true,
  default: (): JSX.Element => <div data-testid="import-dialog" />,
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('../store/ProviderStore', () => ({
  useProviderStore: jest.fn(),
}));

jest.mock('../store/BackupStore', () => ({
  useBackupStore: jest.fn(),
}));

jest.mock('../services/backupService', () => ({
  BackupService: {
    getAutoBackupHandle: jest.fn(),
    downloadBackup: jest.fn(),
    clearAutoBackupHandle: jest.fn(),
    selectAutoBackupFile: jest.fn(),
    performAutoBackup: jest.fn(),
  },
}));

jest.mock('../services/llmSuggestionService', () => ({
  llmSuggestionService: {
    setOnProgress: jest.fn(),
    loadModel: jest.fn(),
    deleteModel: jest.fn(),
    resetDownload: jest.fn(),
  },
}));

jest.mock('../services/llmService', () => ({
  getMoonshotBalance: jest.fn(),
  getDeepSeekBalance: jest.fn(),
}));

const mockUseAuthStore = useAuthStore as unknown as jest.Mock;
const mockUseProviderStore = useProviderStore as unknown as jest.Mock;
const mockUseBackupStore = useBackupStore as unknown as jest.Mock;
const mockBackupService = BackupService as unknown as {
  getAutoBackupHandle: jest.Mock;
};
const mockLlmSuggestionService = llmSuggestionService as unknown as {
  setOnProgress: jest.Mock;
};
const mockGetMoonshotBalance = getMoonshotBalance as jest.MockedFunction<typeof getMoonshotBalance>;
const mockGetDeepSeekBalance = getDeepSeekBalance as jest.MockedFunction<typeof getDeepSeekBalance>;

function buildAuthState(): Record<string, unknown> {
  return {
    userName: 'Alex',
    backupInterval: 30,
    customInstructions: 'Be concise',
    scratchpadRules: 'Rule set',
    chatWidth: 'lg',
    chatFontSize: 16,
    setUserName: jest.fn(),
    setBackupInterval: jest.fn(),
    setCustomInstructions: jest.fn(),
    setScratchpadRules: jest.fn(),
    setChatWidth: jest.fn(),
    setChatFontSize: jest.fn(),
    predefinedPrompts: [],
    addPredefinedPrompt: jest.fn(),
    updatePredefinedPrompt: jest.fn(),
    deletePredefinedPrompt: jest.fn(),
    llmSuggestionEnabled: false,
    replyPredictionEnabled: false,
    replyPredictionModel: 'same',
    llmModelSelected: 'qwen3.5-0.8b',
    llmModelDownloadStatus: {},
    setLlmSuggestionEnabled: jest.fn(),
    setReplyPredictionEnabled: jest.fn(),
    setReplyPredictionModel: jest.fn(),
    setLlmModelSelected: jest.fn(),
    topicPreloadCount: 5,
    setTopicPreloadCount: jest.fn(),
    messageTruncateChars: 500,
    setMessageTruncateChars: jest.fn(),
    ragEnabled: false,
    setRagEnabled: jest.fn(),
    maxContextTokens: 16000,
    setMaxContextTokens: jest.fn(),
    messageRetrievalEnabled: true,
    setMessageRetrievalEnabled: jest.fn(),
    askUserEnabled: true,
    setAskUserEnabled: jest.fn(),
    aiSummaryEnabled: false,
    setAiSummaryEnabled: jest.fn(),
    summaryModel: 'same',
    setSummaryModel: jest.fn(),
    defaultMaxContextMessages: 10,
    setDefaultMaxContextMessages: jest.fn(),
    showCameraButton: 'auto',
    setShowCameraButton: jest.fn(),
  };
}

describe('Settings page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: jest.fn((): string => 'prompt-uuid') },
      writable: true,
    });

    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);

    mockUseProviderStore.mockReturnValue({
      providers: [
        {
          id: 'p1',
          name: 'Provider A',
          apiKeyEncrypted: '',
        },
      ],
    });

    mockUseBackupStore.mockReturnValue({
      status: 'no_handle',
      lastBackupTime: null,
      setStatus: jest.fn(),
      setLastBackupTime: jest.fn(),
    });

    mockBackupService.getAutoBackupHandle.mockResolvedValue(null);
    mockGetMoonshotBalance.mockResolvedValue(null);
    mockGetDeepSeekBalance.mockResolvedValue(null);
    mockLlmSuggestionService.setOnProgress.mockImplementation(() => undefined);
  });

  it('renders settings and saves trimmed user-level values', async () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.change(screen.getByLabelText('User Name'), { target: { value: '  New User  ' } });
    fireEvent.change(screen.getByLabelText('Custom Instructions (System Prompt)'), { target: { value: '  New instructions  ' } });
    fireEvent.change(screen.getByLabelText('Scratchpad Rules (System Prompt)'), { target: { value: '  New scratchpad rules  ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(authState.setUserName).toHaveBeenCalledWith('New User');
      expect(authState.setCustomInstructions).toHaveBeenCalledWith('New instructions');
      expect(authState.setScratchpadRules).toHaveBeenCalledWith('New scratchpad rules');
    });
  });

  it('adds a predefined prompt from the prompt form', async () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Predefined Prompt' }));
    fireEvent.change(screen.getByLabelText('Name (e.g., Programming)'), { target: { value: 'Code style' } });
    fireEvent.change(screen.getByLabelText('Context / Instructions'), { target: { value: 'Prefer concise TypeScript.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Prompt' }));

    await waitFor(() => {
      expect(authState.addPredefinedPrompt).toHaveBeenCalledTimes(1);
    });

    const added = authState.addPredefinedPrompt.mock.calls[0][0] as { id: string; name: string; content: string };
    expect(added.id).toBe('prompt-uuid');
    expect(added.name).toBe('Code style');
    expect(added.content).toBe('Prefer concise TypeScript.');
  });
});
