import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Settings from './Settings';
import { useAuthStore } from '../store/AuthStore';
import { useProviderStore } from '../store/ProviderStore';
import { useBackupStore } from '../store/BackupStore';
import { BackupService } from '../services/backupService';
import { llmSuggestionService } from '../services/llmSuggestionService';
import { getMoonshotBalance, getDeepSeekBalance } from '../services/llmService';
import { BackupMode, BackupStatus } from '../store/BackupStore';

interface PredefinedPrompt {
  id: string;
  name: string;
  content: string;
}

interface AuthState {
  userName: string;
  backupInterval: number;
  customInstructions: string;
  scratchpadRules: string;
  chatWidth: string;
  chatFontSize: number;
  setUserName: jest.MockedFunction<(name: string) => void>;
  setBackupInterval: jest.MockedFunction<(minutes: number) => void>;
  setCustomInstructions: jest.MockedFunction<(instructions: string) => void>;
  setScratchpadRules: jest.MockedFunction<(rules: string) => void>;
  setChatWidth: jest.MockedFunction<(width: string) => void>;
  setChatFontSize: jest.MockedFunction<(size: number) => void>;
  predefinedPrompts: PredefinedPrompt[];
  addPredefinedPrompt: jest.MockedFunction<(prompt: PredefinedPrompt) => void>;
  updatePredefinedPrompt: jest.MockedFunction<(prompt: PredefinedPrompt) => void>;
  deletePredefinedPrompt: jest.MockedFunction<(id: string) => void>;
  llmSuggestionEnabled: boolean;
  replyPredictionEnabled: boolean;
  replyPredictionModel: string;
  llmModelSelected: 'qwen3.5-0.8b' | 'qwen3.5-2b';
  llmModelDownloadStatus: Record<string, 'not_downloaded' | 'downloading' | 'downloaded' | undefined>;
  setLlmSuggestionEnabled: jest.MockedFunction<(enabled: boolean) => void>;
  setReplyPredictionEnabled: jest.MockedFunction<(enabled: boolean) => void>;
  setReplyPredictionModel: jest.MockedFunction<(model: string) => void>;
  setLlmModelSelected: jest.MockedFunction<(model: 'qwen3.5-0.8b' | 'qwen3.5-2b') => void>;
  topicPreloadCount: number;
  setTopicPreloadCount: jest.MockedFunction<(count: number) => void>;
  messageTruncateChars: number;
  setMessageTruncateChars: jest.MockedFunction<(chars: number) => void>;
  ragEnabled: boolean;
  setRagEnabled: jest.MockedFunction<(enabled: boolean) => void>;
  maxContextTokens: number;
  setMaxContextTokens: jest.MockedFunction<(tokens: number) => void>;
  messageRetrievalEnabled: boolean;
  setMessageRetrievalEnabled: jest.MockedFunction<(enabled: boolean) => void>;
  askUserEnabled: boolean;
  setAskUserEnabled: jest.MockedFunction<(enabled: boolean) => void>;
  aiSummaryEnabled: boolean;
  setAiSummaryEnabled: jest.MockedFunction<(enabled: boolean) => void>;
  summaryModel: string;
  setSummaryModel: jest.MockedFunction<(model: string) => void>;
  defaultMaxContextMessages: number;
  setDefaultMaxContextMessages: jest.MockedFunction<(count: number) => void>;
  showCameraButton: 'auto' | 'always' | 'never';
  setShowCameraButton: jest.MockedFunction<(value: 'auto' | 'always' | 'never') => void>;
  ttsEnabled: boolean;
  ttsVoiceId: string;
  setTtsEnabled: jest.MockedFunction<(enabled: boolean) => void>;
  setTtsVoiceId: jest.MockedFunction<(voiceId: string) => void>;
}

interface BackupStoreState {
  status: BackupStatus;
  lastBackupTime: string | null;
  backupMode: BackupMode;
  setStatus: jest.MockedFunction<(status: BackupStatus) => void>;
  setLastBackupTime: jest.MockedFunction<(time: string | null) => void>;
  setBackupMode: jest.MockedFunction<(mode: BackupMode) => void>;
}

interface MockedBackupService {
  getAutoBackupHandle: jest.Mock;
  downloadBackup: jest.Mock;
  clearAutoBackupHandle: jest.Mock;
  selectAutoBackupFile: jest.Mock;
  performAutoBackup: jest.Mock;
  getInternalBackupFile: jest.Mock;
}

jest.mock('../components/ThemeSelector', () => ({
  __esModule: true,
  default: (): React.ReactElement => <div data-testid="theme-selector" />,
}));

jest.mock('../components/ProviderCard', () => ({
  ProviderCard: ({ provider }: { provider: { name: string } }): React.ReactElement => <div>{provider.name}</div>,
  AddProviderCard: (): React.ReactElement => <div>Add Provider Card</div>,
}));

jest.mock('../components/ImportDialog', () => ({
  __esModule: true,
  default: (): React.ReactElement => <div data-testid="import-dialog" />,
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
    getInternalBackupFile: jest.fn(),
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

jest.mock('../database/AthenaDb', () => ({
  athenaDb: {
    messages: {
      toArray: jest.fn(),
    },
  },
}));

const mockUseAuthStore = useAuthStore as unknown as jest.Mock<AuthState>;
const mockUseProviderStore = useProviderStore as unknown as jest.Mock;
const mockUseBackupStore = useBackupStore as unknown as jest.Mock<BackupStoreState>;
const mockBackupService = BackupService as unknown as MockedBackupService;
const mockLlmSuggestionService = llmSuggestionService as unknown as {
  setOnProgress: jest.Mock;
  loadModel: jest.Mock;
  deleteModel: jest.Mock;
  resetDownload: jest.Mock;
};
const mockGetMoonshotBalance = getMoonshotBalance as jest.MockedFunction<typeof getMoonshotBalance>;
const mockGetDeepSeekBalance = getDeepSeekBalance as jest.MockedFunction<typeof getDeepSeekBalance>;

function buildAuthState(): AuthState {
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
    ttsEnabled: false,
    ttsVoiceId: 'English_Graceful_Lady',
    setTtsEnabled: jest.fn(),
    setTtsVoiceId: jest.fn(),
  };
}

function buildBackupStoreState(overrides?: Partial<BackupStoreState>): BackupStoreState {
  return {
    status: 'idle',
    lastBackupTime: null,
    backupMode: 'none',
    setStatus: jest.fn(),
    setLastBackupTime: jest.fn(),
    setBackupMode: jest.fn(),
    ...overrides,
  };
}

/** Finds a Select combobox by its InputLabel text. Matches only <label> elements. */
function getComboboxByLabel(labelText: string): HTMLElement {
  const label = screen.getByText((content, element) => {
    return element?.tagName === 'LABEL' && content.trim() === labelText;
  });
  const formControl = label.closest('.MuiFormControl-root');
  if (!formControl) throw new Error(`No FormControl found for label "${labelText}"`);
  const combobox: Element | null = formControl.querySelector('[role="combobox"]');
  if (!combobox) throw new Error(`No combobox found for label "${labelText}"`);
  return combobox as HTMLElement;
}

describe('Settings page', () => {
  let backupStoreState: BackupStoreState;

  beforeEach(() => {
    jest.clearAllMocks();

    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: jest.fn((): string => 'prompt-uuid') },
      writable: true,
    });

    (window as unknown as Record<string, unknown>).showSaveFilePicker = jest.fn();

    if (typeof URL.createObjectURL !== 'function') {
      (URL as unknown as Record<string, unknown>).createObjectURL = jest.fn().mockReturnValue('blob:test');
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      (URL as unknown as Record<string, unknown>).revokeObjectURL = jest.fn();
    }

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

    backupStoreState = buildBackupStoreState();
    mockUseBackupStore.mockReturnValue(backupStoreState);

    mockBackupService.getAutoBackupHandle.mockResolvedValue(null);
    mockBackupService.downloadBackup.mockResolvedValue(undefined);
    mockBackupService.clearAutoBackupHandle.mockResolvedValue(undefined);
    mockBackupService.selectAutoBackupFile.mockResolvedValue(true);
    mockBackupService.performAutoBackup.mockResolvedValue(undefined);
    mockBackupService.getInternalBackupFile.mockResolvedValue(null);
    mockGetMoonshotBalance.mockResolvedValue(null);
    mockGetDeepSeekBalance.mockResolvedValue(null);
    mockLlmSuggestionService.setOnProgress.mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).brave;
  });

  // ── Existing tests ──

  it('renders settings and saves trimmed user-level values', async () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.change(screen.getByLabelText('User Name'), { target: { value: '  New User  ' } });
    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.change(screen.getByLabelText('Custom Instructions (System Prompt)'), { target: { value: '  New instructions  ' } });
    fireEvent.change(screen.getByLabelText(/Scratchpad Rules/i), { target: { value: '  New scratchpad rules  ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Instructions' }));

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

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Add Prompt' }));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Code style' } });
    fireEvent.change(screen.getByLabelText(/Content/i), { target: { value: 'Prefer concise TypeScript.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(authState.addPredefinedPrompt).toHaveBeenCalledTimes(1);
    });

    const added = authState.addPredefinedPrompt.mock.calls[0][0];
    expect(added.id).toBe('prompt-uuid');
    expect(added.name).toBe('Code style');
    expect(added.content).toBe('Prefer concise TypeScript.');
  });

  it('handleDownloadModel calls loadModel with correct model id', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    const loadModelSpy = jest.spyOn(llmSuggestionService, 'loadModel').mockImplementation(jest.fn());

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(loadModelSpy).toHaveBeenCalledWith('onnx-community/Qwen3.5-0.8B-ONNX', true);
    loadModelSpy.mockRestore();
  });

  it('handleDeleteModel shows confirm dialog and calls deleteModel', async () => {
    const authState = buildAuthState();
    authState.llmModelDownloadStatus = { 'onnx-community/Qwen3.5-0.8B-ONNX': 'downloaded' };
    mockUseAuthStore.mockReturnValue(authState);
    const deleteModelSpy = jest.spyOn(llmSuggestionService, 'deleteModel').mockResolvedValue();
    window.confirm = jest.fn(() => true);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Delete downloaded model'));
    await waitFor(() => {
      expect(deleteModelSpy).toHaveBeenCalledWith('onnx-community/Qwen3.5-0.8B-ONNX');
    });
    deleteModelSpy.mockRestore();
  });

  it('handleResetDownload calls resetDownload and clears progress', () => {
    const authState = buildAuthState();
    authState.llmModelDownloadStatus = { 'onnx-community/Qwen3.5-0.8B-ONNX': 'downloading' };
    mockUseAuthStore.mockReturnValue(authState);
    const resetDownloadSpy = jest.spyOn(llmSuggestionService, 'resetDownload').mockImplementation(jest.fn());

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(resetDownloadSpy).toHaveBeenCalledWith('onnx-community/Qwen3.5-0.8B-ONNX');
    resetDownloadSpy.mockRestore();
  });

  it('shows summary model dropdown when aiSummaryEnabled is true', () => {
    const authState = buildAuthState();
    authState.aiSummaryEnabled = true;
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    expect(screen.getByText('Same as active chat model')).toBeInTheDocument();
  });

  it('shows prediction model dropdown when replyPredictionEnabled is true', () => {
    const authState = buildAuthState();
    authState.replyPredictionEnabled = true;
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    expect(screen.getByText('Same as active chat model')).toBeInTheDocument();
  });

  // ── Tab 0: General ──

  it('shows "Settings saved successfully" after save', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));

    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully.')).toBeInTheDocument();
    });
  });

  it('renders chat width selector and calls setChatWidth on change', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    render(<Settings />);

    const select = getComboboxByLabel('Max Chat Width');

    fireEvent.mouseDown(select);
    fireEvent.click(screen.getByRole('option', { name: 'Compact (600px)' }));

    expect(authState.setChatWidth).toHaveBeenCalledWith('sm');
  });

  it('renders chat font size selector', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    render(<Settings />);

    const select = getComboboxByLabel('Chat Font Size');

    fireEvent.mouseDown(select);
    fireEvent.click(screen.getByRole('option', { name: 'Compact (14px)' }));

    expect(authState.setChatFontSize).toHaveBeenCalledWith(14);
  });

  it('topic preload count selector calls setTopicPreloadCount on change', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    render(<Settings />);

    const select = getComboboxByLabel('Topic Preload Count');

    fireEvent.mouseDown(select);
    fireEvent.click(screen.getByRole('option', { name: '50 topics' }));

    expect(authState.setTopicPreloadCount).toHaveBeenCalledWith(50);
  });

  it('message preview length selector calls setMessageTruncateChars', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    render(<Settings />);

    const select = getComboboxByLabel('Message Preview Length');

    fireEvent.mouseDown(select);
    fireEvent.click(screen.getByRole('option', { name: 'Maximum (4000 characters)' }));

    expect(authState.setMessageTruncateChars).toHaveBeenCalledWith(4000);
  });

  it('camera button selector calls setShowCameraButton', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    render(<Settings />);

    const select = getComboboxByLabel('Camera Button');

    fireEvent.mouseDown(select);
    fireEvent.click(screen.getByRole('option', { name: 'Always show' }));

    expect(authState.setShowCameraButton).toHaveBeenCalledWith('always');
  });

  it('shows MiniMax key message when no MiniMax provider is configured', () => {
    render(<Settings />);

    expect(screen.getByText(/Configure a MiniMax API key/)).toBeInTheDocument();
  });

  it('shows TTS controls when MiniMax provider has an API key', () => {
    mockUseProviderStore.mockReturnValue({
      providers: [
        { id: 'p1', name: 'Provider A', apiKeyEncrypted: '' },
        { id: 'builtin-minimax', name: 'MiniMax', apiKeyEncrypted: 'some-key' },
      ],
    });

    render(<Settings />);

    expect(screen.getByText(/Enable text-to-speech/)).toBeInTheDocument();
  });

  it('TTS toggle calls setTtsEnabled', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    mockUseProviderStore.mockReturnValue({
      providers: [
        { id: 'builtin-minimax', name: 'MiniMax', apiKeyEncrypted: 'some-key' },
      ],
    });

    render(<Settings />);

    fireEvent.click(screen.getByLabelText(/enable text-to-speech/i));

    expect(authState.setTtsEnabled).toHaveBeenCalledWith(true);
  });

  it('shows voice selector when TTS is enabled', () => {
    const authState = buildAuthState();
    authState.ttsEnabled = true;
    mockUseAuthStore.mockReturnValue(authState);
    mockUseProviderStore.mockReturnValue({
      providers: [
        { id: 'builtin-minimax', name: 'MiniMax', apiKeyEncrypted: 'some-key' },
      ],
    });

    render(<Settings />);

    expect(screen.getByText((content, element) => element?.tagName === 'LABEL' && content.trim() === 'Voice')).toBeInTheDocument();
  });

  it('voice selector calls setTtsVoiceId on change', () => {
    const authState = buildAuthState();
    authState.ttsEnabled = true;
    mockUseAuthStore.mockReturnValue(authState);
    mockUseProviderStore.mockReturnValue({
      providers: [
        { id: 'builtin-minimax', name: 'MiniMax', apiKeyEncrypted: 'some-key' },
      ],
    });

    render(<Settings />);

    const select = getComboboxByLabel('Voice');
    fireEvent.mouseDown(select);
    fireEvent.click(screen.getByRole('option', { name: 'Trustworthy Man' }));

    expect(authState.setTtsVoiceId).toHaveBeenCalledWith('English_Trustworthy_Man');
  });

  it('renders the ThemeSelector component', () => {
    render(<Settings />);

    expect(screen.getByTestId('theme-selector')).toBeInTheDocument();
  });

  // ── Tab 1: Providers ──

  it('renders provider cards and add provider card', () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /providers/i }));

    expect(screen.getByText('Provider A')).toBeInTheDocument();
    expect(screen.getByText('Add Provider Card')).toBeInTheDocument();
  });

  it('fetches and displays Moonshot balance', async () => {
    mockUseProviderStore.mockReturnValue({
      providers: [
        { id: 'builtin-moonshot', name: 'Moonshot', apiKeyEncrypted: 'some-key' },
      ],
    });
    mockGetMoonshotBalance.mockResolvedValue({ available_balance: 5.0 } as { available_balance: number });

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /providers/i }));

    await waitFor(() => {
      expect(mockGetMoonshotBalance).toHaveBeenCalled();
    });
  });

  it('fetches and displays DeepSeek balance', async () => {
    mockUseProviderStore.mockReturnValue({
      providers: [
        { id: 'builtin-deepseek', name: 'DeepSeek', apiKeyEncrypted: 'some-key' },
      ],
    });
    mockGetDeepSeekBalance.mockResolvedValue({ balance: 100, currency: 'CNY' } as { balance: number; currency: string });

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /providers/i }));

    await waitFor(() => {
      expect(mockGetDeepSeekBalance).toHaveBeenCalled();
    });
  });

  it('does not fetch balance when provider has no API key', async () => {
    mockUseProviderStore.mockReturnValue({
      providers: [
        { id: 'builtin-moonshot', name: 'Moonshot', apiKeyEncrypted: '' },
        { id: 'builtin-deepseek', name: 'DeepSeek', apiKeyEncrypted: '' },
      ],
    });

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /providers/i }));

    await waitFor(() => {
      expect(mockGetMoonshotBalance).not.toHaveBeenCalled();
      expect(mockGetDeepSeekBalance).not.toHaveBeenCalled();
    });
  });

  // ── Tab 2: AI Intelligence ──

  it('max context tokens selector calls setMaxContextTokens', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    const select = getComboboxByLabel('Max Context Tokens');

    fireEvent.mouseDown(select);
    fireEvent.click(screen.getByRole('option', { name: '64k — Maximum' }));

    expect(authState.setMaxContextTokens).toHaveBeenCalledWith(64000);
  });

  it('default recent messages selector calls setDefaultMaxContextMessages', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    const select = getComboboxByLabel('Default Recent Messages');

    fireEvent.mouseDown(select);
    fireEvent.click(screen.getByRole('option', { name: '50 messages' }));

    expect(authState.setDefaultMaxContextMessages).toHaveBeenCalledWith(50);
  });

  it('AI toggles call their respective store setters', () => {
    const authState = buildAuthState();
    authState.messageRetrievalEnabled = true;
    authState.askUserEnabled = true;
    authState.aiSummaryEnabled = false;
    authState.replyPredictionEnabled = false;
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    fireEvent.click(screen.getByLabelText(/message retrieval tool/i));
    fireEvent.click(screen.getByLabelText(/ask user tool/i));
    fireEvent.click(screen.getByLabelText(/ai message summaries/i));
    fireEvent.click(screen.getByLabelText(/reply prediction/i));

    expect(authState.setMessageRetrievalEnabled).toHaveBeenCalledWith(false);
    expect(authState.setAskUserEnabled).toHaveBeenCalledWith(false);
    expect(authState.setAiSummaryEnabled).toHaveBeenCalledWith(true);
    expect(authState.setReplyPredictionEnabled).toHaveBeenCalledWith(true);
  });

  it('RAG and type-ahead toggles call their setters', () => {
    const authState = buildAuthState();
    authState.ragEnabled = false;
    authState.llmSuggestionEnabled = false;
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    fireEvent.click(screen.getByLabelText(/semantic search/i));
    fireEvent.click(screen.getByLabelText(/type-ahead suggestions/i));

    expect(authState.setRagEnabled).toHaveBeenCalledWith(true);
    expect(authState.setLlmSuggestionEnabled).toHaveBeenCalledWith(true);
  });

  it('model dropdown calls setLlmModelSelected on change', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    const select = getComboboxByLabel('Model');

    fireEvent.mouseDown(select);
    fireEvent.click(screen.getByRole('option', { name: /Qwen3.5 2B/ }));

    expect(authState.setLlmModelSelected).toHaveBeenCalledWith('qwen3.5-2b');
  });

  it('shows "Model Downloaded" badge and Update button', () => {
    const authState = buildAuthState();
    authState.llmModelDownloadStatus = { 'onnx-community/Qwen3.5-0.8B-ONNX': 'downloaded' };
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    expect(screen.getByText('Model Downloaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
  });

  it('shows "Downloading Model..." text when downloading', () => {
    const authState = buildAuthState();
    authState.llmModelDownloadStatus = { 'onnx-community/Qwen3.5-0.8B-ONNX': 'downloading' };
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    expect(screen.getByText('Downloading Model...')).toBeInTheDocument();
  });

  it('shows progress information when llmProgress is set while downloading', () => {
    const authState = buildAuthState();
    authState.llmModelDownloadStatus = { 'onnx-community/Qwen3.5-0.8B-ONNX': 'downloading' };
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    const setOnProgressMock = mockLlmSuggestionService.setOnProgress;
    type ProgressCallback = (progress: { progress: number; loaded: number; total: number }) => void;
    const onProgressCalls = setOnProgressMock.mock.calls as [ProgressCallback][];
    const onProgressCallback = onProgressCalls[0]?.[0];
    expect(onProgressCallback).toBeDefined();
    act(() => {
      onProgressCallback({ progress: 42.5, loaded: 100 * 1024 * 1024, total: 235 * 1024 * 1024 });
    });

    expect(screen.getByText(/42.5%/)).toBeInTheDocument();
  });

  it('shows "Model not downloaded" by default', () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /ai intelligence/i }));

    expect(screen.getByText('Model not downloaded')).toBeInTheDocument();
  });

  // ── Tab 3: Prompts & Data ──

  it('displays scratchpad helper text with limit', () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(screen.getByText(/Instructions for long-term memory scratchpad/)).toBeInTheDocument();
  });

  it('reset rules button resets the scratchpad textarea to defaults', () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Reset Rules' }));

    const textarea = screen.getByLabelText(/Scratchpad Rules/i);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const textareaEl = textarea as HTMLTextAreaElement;
    expect(textareaEl.value).toContain('You have a private scratchpad');
  });

  it('edits an existing predefined prompt', async () => {
    const authState = buildAuthState();
    const existingPrompt = { id: 'p1', name: 'Old Name', content: 'Old content' };
    authState.predefinedPrompts = [existingPrompt];
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Old Name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Old content')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Name$/), { target: { value: 'New Name' } });
    fireEvent.change(screen.getByLabelText(/^Content$/), { target: { value: 'New content' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(authState.updatePredefinedPrompt).toHaveBeenCalledWith({
        id: 'p1',
        name: 'New Name',
        content: 'New content',
      });
    });
  });

  it('cancels editing a prompt', () => {
    const authState = buildAuthState();
    authState.predefinedPrompts = [{ id: 'p1', name: 'Prompt', content: 'content' }];
    mockUseAuthStore.mockReturnValue(authState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Prompt' })).toBeInTheDocument();
  });

  it('deletes a predefined prompt with confirmation', () => {
    const authState = buildAuthState();
    authState.predefinedPrompts = [{ id: 'p1', name: 'My Prompt', content: 'content' }];
    mockUseAuthStore.mockReturnValue(authState);
    window.confirm = jest.fn(() => true);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(window.confirm).toHaveBeenCalledWith('Delete prompt "My Prompt"?');
    expect(authState.deletePredefinedPrompt).toHaveBeenCalledWith('p1');
  });

  it('delete button does nothing if confirm is cancelled', () => {
    const authState = buildAuthState();
    authState.predefinedPrompts = [{ id: 'p1', name: 'My Prompt', content: 'content' }];
    mockUseAuthStore.mockReturnValue(authState);
    window.confirm = jest.fn(() => false);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(authState.deletePredefinedPrompt).not.toHaveBeenCalled();
  });

  it('export JSON button calls downloadBackup', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: /export json/i }));

    await waitFor(() => {
      expect(mockBackupService.downloadBackup).toHaveBeenCalled();
    });
  });

  it('export failure shows alert', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    mockBackupService.downloadBackup.mockRejectedValueOnce(new Error('fail'));
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: /export json/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to export backup.');
    });
    alertSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('import button opens ImportDialog', () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();

    const file = new File(['{"data":{}}'], 'backup.json', { type: 'application/json' });
    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [file] } });
    }

    expect(screen.getByTestId('import-dialog')).toBeInTheDocument();
  });

  it('external auto-backup toggle ON calls selectAutoBackupFile and sets backup mode', async () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    mockBackupService.selectAutoBackupFile.mockResolvedValueOnce(true);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByTestId('backup-external-toggle'));

    await waitFor(() => {
      expect(mockBackupService.selectAutoBackupFile).toHaveBeenCalled();
      expect(backupStoreState.setBackupMode).toHaveBeenCalledWith('external');
    });
  });

  it('external auto-backup toggle ON shows alert on failure', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    mockBackupService.selectAutoBackupFile.mockRejectedValueOnce(new Error('fail'));
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByTestId('backup-external-toggle'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to setup'));
    });
    alertSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('external auto-backup toggle OFF with confirm clears handle', async () => {
    backupStoreState.backupMode = 'external';
    mockUseBackupStore.mockReturnValue(backupStoreState);
    mockBackupService.clearAutoBackupHandle.mockResolvedValueOnce(undefined);
    window.confirm = jest.fn(() => true);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByTestId('backup-external-toggle'));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Disable external'));

    await waitFor(() => {
      expect(mockBackupService.clearAutoBackupHandle).toHaveBeenCalled();
      expect(backupStoreState.setBackupMode).toHaveBeenCalledWith('none');
    });
  });

  it('external auto-backup toggle OFF does nothing if confirm cancelled', () => {
    backupStoreState.backupMode = 'external';
    mockUseBackupStore.mockReturnValue(backupStoreState);
    window.confirm = jest.fn(() => false);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByTestId('backup-external-toggle'));

    expect(window.confirm).toHaveBeenCalled();
    expect(mockBackupService.clearAutoBackupHandle).not.toHaveBeenCalled();
  });

  it('internal auto-backup toggle ON performs backup', async () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    mockBackupService.performAutoBackup.mockResolvedValueOnce(undefined);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByTestId('backup-internal-toggle'));

    expect(backupStoreState.setBackupMode).toHaveBeenCalledWith('internal');

    await waitFor(() => {
      expect(mockBackupService.performAutoBackup).toHaveBeenCalled();
    });
  });

  it('internal auto-backup toggle OFF with confirm sets mode to none', () => {
    backupStoreState.backupMode = 'internal';
    mockUseBackupStore.mockReturnValue(backupStoreState);
    window.confirm = jest.fn(() => true);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByTestId('backup-internal-toggle'));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Disable internal'));
    expect(backupStoreState.setBackupMode).toHaveBeenCalledWith('none');
  });

  it('internal auto-backup toggle OFF does nothing if confirm cancelled', () => {
    backupStoreState.backupMode = 'internal';
    mockUseBackupStore.mockReturnValue(backupStoreState);
    window.confirm = jest.fn(() => false);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByTestId('backup-internal-toggle'));

    expect(window.confirm).toHaveBeenCalled();
    expect(backupStoreState.setBackupMode).not.toHaveBeenCalledWith('none');
  });

  it('shows backup active status when external backup is on', () => {
    backupStoreState.backupMode = 'external';
    backupStoreState.status = 'success';
    mockUseBackupStore.mockReturnValue(backupStoreState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows "Authorization Required" and Authorize Now button', () => {
    backupStoreState.backupMode = 'external';
    backupStoreState.status = 'permission_required';
    mockUseBackupStore.mockReturnValue(backupStoreState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(screen.getByText('Authorization Required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Authorize Now' })).toBeInTheDocument();
  });

  it('Authorize Now button calls performAutoBackup with interactive=true', async () => {
    backupStoreState.backupMode = 'external';
    backupStoreState.status = 'permission_required';
    mockUseBackupStore.mockReturnValue(backupStoreState);
    mockBackupService.performAutoBackup.mockResolvedValueOnce(undefined);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Authorize Now' }));

    await waitFor(() => {
      expect(mockBackupService.performAutoBackup).toHaveBeenCalledWith(true);
    });
  });

  it('shows "Backing up..." when backup is in progress', () => {
    backupStoreState.backupMode = 'external';
    backupStoreState.status = 'in-progress';
    mockUseBackupStore.mockReturnValue(backupStoreState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(screen.getByText('Backing up...')).toBeInTheDocument();
  });

  it('Change Location button calls selectAutoBackupFile', async () => {
    backupStoreState.backupMode = 'external';
    mockUseBackupStore.mockReturnValue(backupStoreState);
    mockBackupService.selectAutoBackupFile.mockResolvedValueOnce(true);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Change Location' }));

    await waitFor(() => {
      expect(mockBackupService.selectAutoBackupFile).toHaveBeenCalled();
    });
  });

  it('internal backup download button downloads a backup file', async () => {
    backupStoreState.backupMode = 'internal';
    mockUseBackupStore.mockReturnValue(backupStoreState);
    const mockFile = new File(['backup-data'], 'backup.json', { type: 'application/json' });
    mockBackupService.getInternalBackupFile.mockResolvedValueOnce(mockFile);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Download Current Backup' }));

    await waitFor(() => {
      expect(mockBackupService.getInternalBackupFile).toHaveBeenCalled();
    });
  });

  it('internal backup download shows alert when no file found', async () => {
    backupStoreState.backupMode = 'internal';
    mockUseBackupStore.mockReturnValue(backupStoreState);
    mockBackupService.getInternalBackupFile.mockResolvedValueOnce(null);
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Download Current Backup' }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('No internal backup found.');
    });
    alertSpy.mockRestore();
  });

  it('shows backup frequency selector when backup is active', () => {
    backupStoreState.backupMode = 'external';
    mockUseBackupStore.mockReturnValue(backupStoreState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(getComboboxByLabel('Frequency')).toBeInTheDocument();
  });

  it('backup frequency selector calls setBackupInterval on change', () => {
    const authState = buildAuthState();
    mockUseAuthStore.mockReturnValue(authState);
    backupStoreState.backupMode = 'external';
    mockUseBackupStore.mockReturnValue(backupStoreState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    const select = getComboboxByLabel('Frequency');
    fireEvent.mouseDown(select);
    fireEvent.click(screen.getByRole('option', { name: '1 Minute' }));

    expect(authState.setBackupInterval).toHaveBeenCalledWith(1);
  });

  it('shows last backup time when available', () => {
    backupStoreState.backupMode = 'external';
    backupStoreState.lastBackupTime = '2024-01-01T12:00:00.000Z';
    mockUseBackupStore.mockReturnValue(backupStoreState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(screen.getByText(/Last backup:/)).toBeInTheDocument();
  });

  it('shows "No backup yet" when no backup time', () => {
    backupStoreState.backupMode = 'external';
    backupStoreState.lastBackupTime = null;
    mockUseBackupStore.mockReturnValue(backupStoreState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(screen.getByText('No backup yet')).toBeInTheDocument();
  });

  it('hides backup frequency when mode is none', () => {
    backupStoreState.backupMode = 'none';
    mockUseBackupStore.mockReturnValue(backupStoreState);

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(screen.queryByText('Frequency')).not.toBeInTheDocument();
  });

  it('disables external backup toggle when File System API not supported', () => {
    const orig = window.showSaveFilePicker;
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(screen.getByTestId('backup-external-toggle')).toBeDisabled();

    (window as unknown as Record<string, unknown>).showSaveFilePicker = orig;
  });

  it('shows Brave warning when FS API not supported and Brave detected', () => {
    const origShowSave = window.showSaveFilePicker;
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    (navigator as unknown as Record<string, unknown>).brave = {};

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(screen.getByText('Brave Privacy Tip')).toBeInTheDocument();

    (window as unknown as Record<string, unknown>).showSaveFilePicker = origShowSave;
  });

  it('disables internal backup toggle when OPFS not supported', () => {
    const storageDesc = Object.getOwnPropertyDescriptor(navigator, 'storage');
    Object.defineProperty(navigator, 'storage', { value: {}, writable: true, configurable: true });

    render(<Settings />);

    fireEvent.click(screen.getByRole('tab', { name: /data/i }));

    expect(screen.getByTestId('backup-internal-toggle')).toBeDisabled();

    if (storageDesc) {
      Object.defineProperty(navigator, 'storage', storageDesc);
    }
  });
});
