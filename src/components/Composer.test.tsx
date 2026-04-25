import type { JSX } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Composer from './Composer';
import { useAuthStore } from '../store/AuthStore';
import { useProviderStore } from '../store/ProviderStore';
import { useChatStore } from '../store/ChatStore';
import { useTopicStore } from '../store/TopicStore';
import { useNotificationStore } from '../store/NotificationStore';
import { llmSuggestionService } from '../services/llmSuggestionService';
import { UserChatModel, LlmProvider } from '../types/provider';
import { Topic, Message, Attachment } from '../database/AthenaDb';

jest.mock('./TopicContextDialog', () => {
  function MockTopicContextDialog(): JSX.Element {
    return <div>Topic Context Dialog</div>;
  }

  MockTopicContextDialog.displayName = 'MockTopicContextDialog';
  return MockTopicContextDialog;
});
jest.mock('./ScratchpadDialog', () => {
  function MockScratchpadDialog(): JSX.Element {
    return <div>Scratchpad Dialog</div>;
  }

  MockScratchpadDialog.displayName = 'MockScratchpadDialog';
  return MockScratchpadDialog;
});
jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));
jest.mock('../store/ProviderStore', () => ({
  useProviderStore: jest.fn(),
}));
jest.mock('../store/TopicStore', () => ({
  useTopicStore: jest.fn(),
}));
jest.mock('../store/NotificationStore', () => ({
  useNotificationStore: jest.fn(),
}));
jest.mock('../services/llmSuggestionService', () => ({
  llmSuggestionService: {
    loadModel: jest.fn(),
    cancelSuggestion: jest.fn(),
    getSuggestion: jest.fn(),
  },
}));
jest.mock('../store/ChatStore', () => ({
  useChatStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

interface AuthStoreSlice {
  chatWidth: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  setChatWidth: (width: 'sm' | 'md' | 'lg' | 'xl' | 'full') => void;
  chatFontSize: number;
  setChatFontSize: (size: number) => void;
  predefinedPrompts: { id: string; name: string; content: string }[];
  llmSuggestionEnabled: boolean;
  llmModelSelected: 'qwen3.5-0.8b' | 'qwen3.5-2b';
  llmModelDownloadStatus: Record<string, 'not_downloaded' | 'downloading' | 'downloaded' | undefined>;
  defaultMaxContextMessages: number;
  showCameraButton: 'auto' | 'always' | 'never';
}

interface ProviderStoreSlice {
  getAvailableModels: () => UserChatModel[];
  getProviderForModel: (model: UserChatModel) => LlmProvider | undefined;
}

interface PendingUserQuestionState {
  question: string;
  context: string;
  resolve: (answer: string) => void;
  reject: (reason?: unknown) => void;
}

interface ChatStoreSlice {
  selectedModel: UserChatModel;
  setSelectedModel: (model: UserChatModel) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  currentTopicId: string | null;
  stopSending: () => Promise<string | null>;
  messagesByTopic: Record<string, Message[] | undefined>;
  pendingUserQuestion: PendingUserQuestionState | null;
  resolvePendingQuestion: (answer: string) => void;
  webSearchEnabled: boolean;
  setWebSearchEnabled: (value: boolean) => void;
  imageGenerationEnabled: boolean;
  setImageGenerationEnabled: (value: boolean) => void;
  musicGenerationEnabled: boolean;
  setMusicGenerationEnabled: (value: boolean) => void;
}

interface TopicStoreSlice {
  topics: Topic[];
  updateTopicMaxContextMessages: (id: string, maxContextMessages: number) => Promise<void>;
  updateTopicPromptSelection: (id: string, selectedPromptIds: string[]) => Promise<void>;
}

interface NotificationStoreSlice {
  addNotification: (title: string, message?: string) => void;
}

type OnSendHandler = (content: string, attachments?: Attachment[]) => void;

type UseChatStoreMock = jest.Mock<ChatStoreSlice> & {
  getState: jest.Mock<{ currentTopicId: string | null }>;
};

const mockUseAuthStore = useAuthStore as unknown as jest.Mock<AuthStoreSlice>;
const mockUseProviderStore = useProviderStore as unknown as jest.Mock<ProviderStoreSlice>;
const mockUseChatStore = useChatStore as unknown as UseChatStoreMock;
const mockUseTopicStore = useTopicStore as unknown as jest.Mock<TopicStoreSlice>;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock<NotificationStoreSlice>;
const mockSuggestionService = llmSuggestionService as jest.Mocked<typeof llmSuggestionService>;

function buildModel(overrides: Partial<UserChatModel> = {}): UserChatModel {
  return {
    id: 'builtin-kimi-k2-turbo',
    label: 'Kimi K2 Turbo Preview',
    apiModelId: 'kimi-k2-turbo-preview',
    providerId: 'builtin-moonshot',
    input: 1.15,
    cachedInput: 0.12,
    output: 4.5,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: true,
    supportsFiles: true,
    supportsThinking: false,
    contextWindow: 128000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
    ...overrides,
  };
}

function buildProvider(overrides: Partial<LlmProvider> = {}): LlmProvider {
  return {
    id: 'builtin-moonshot',
    name: 'Moonshot',
    baseUrl: 'https://api.moonshot.ai/v1/chat/completions',
    messageFormat: 'openai',
    apiKeyEncrypted: 'encrypted-key',
    supportsWebSearch: true,
    requiresReasoningFallback: true,
    payloadOverridesJson: '',
    isBuiltIn: true,
    ...overrides,
  };
}

function createTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-1',
    name: 'Topic 1',
    createdOn: '2026-04-20T00:00:00.000Z',
    updatedOn: '2026-04-20T00:00:00.000Z',
    isDeleted: false,
    selectedPromptIds: [],
    ...overrides,
  };
}

class MockFileReader {
  public result: string | ArrayBuffer | null = null;
  public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
  public onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

  readAsDataURL(file: Blob): void {
    this.result = `data:${file.type};base64,mock-data`;
    if (this.onload) {
      this.onload.call(this as unknown as FileReader, new ProgressEvent('load') as ProgressEvent<FileReader>);
    }
  }
}

describe('Composer', () => {
  let authStore: AuthStoreSlice;
  let providerStore: ProviderStoreSlice;
  let chatStore: ChatStoreSlice;
  let topicStore: TopicStoreSlice;
  let notificationStore: NotificationStoreSlice;
  let onSend: jest.MockedFunction<OnSendHandler>;
  let consoleErrorSpy: jest.SpyInstance<void, Parameters<typeof console.error>>;

  beforeEach(() => {
    jest.clearAllMocks();

    let uuidCounter = 0;

    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: jest.fn((): string => `generated-uuid-${++uuidCounter}`) },
      writable: true,
    });
    Object.defineProperty(window, 'requestAnimationFrame', {
      value: (callback: FrameRequestCallback): number => {
        callback(0);
        return 0;
      },
      writable: true,
    });
    Object.defineProperty(window, 'FileReader', {
      value: MockFileReader,
      writable: true,
    });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]): void => {
      const [firstArg] = args;
      if (typeof firstArg === 'string' && firstArg.includes("The Menu component doesn't accept a Fragment as a child.")) {
        return;
      }
    });

    authStore = {
      chatWidth: 'lg',
      setChatWidth: jest.fn(),
      chatFontSize: 16,
      setChatFontSize: jest.fn(),
      predefinedPrompts: [{ id: 'prompt-1', name: 'System Prompt', content: 'Prompt content' }],
      llmSuggestionEnabled: false,
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
      defaultMaxContextMessages: 10,
      showCameraButton: 'never',
    };

    const selectedModel = buildModel();
    const selectedProvider = buildProvider();

    providerStore = {
      getAvailableModels: (): UserChatModel[] => [selectedModel],
      getProviderForModel: (): LlmProvider => selectedProvider,
    };

    chatStore = {
      selectedModel,
      setSelectedModel: jest.fn(),
      temperature: 1,
      setTemperature: jest.fn(),
      currentTopicId: 'topic-1',
      stopSending: jest.fn((): Promise<string | null> => Promise.resolve(null)),
      messagesByTopic: { 'topic-1': [] },
      pendingUserQuestion: null,
      resolvePendingQuestion: jest.fn(),
      webSearchEnabled: false,
      setWebSearchEnabled: jest.fn(),
      imageGenerationEnabled: true,
      setImageGenerationEnabled: jest.fn(),
      musicGenerationEnabled: true,
      setMusicGenerationEnabled: jest.fn(),
    };

    topicStore = {
      topics: [createTopic()],
      updateTopicMaxContextMessages: jest.fn((): Promise<void> => Promise.resolve()),
      updateTopicPromptSelection: jest.fn((): Promise<void> => Promise.resolve()),
    };

    notificationStore = {
      addNotification: jest.fn(),
    };

    onSend = jest.fn<ReturnType<OnSendHandler>, Parameters<OnSendHandler>>();

    mockUseAuthStore.mockReturnValue(authStore);
    mockUseProviderStore.mockReturnValue(providerStore);
    mockUseChatStore.mockReturnValue(chatStore);
    mockUseChatStore.getState.mockReturnValue({ currentTopicId: 'topic-1' });
    mockUseTopicStore.mockReturnValue(topicStore);
    mockUseNotificationStore.mockReturnValue(notificationStore);
    mockSuggestionService.getSuggestion.mockResolvedValue('');
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('sends the composed message and clears the input', () => {
    render(<Composer sending={false} onSend={onSend} isMobile={false} />);

    fireEvent.change(screen.getByPlaceholderText('Type your message...'), { target: { value: 'Hello Athena' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));

    expect(onSend).toHaveBeenCalledWith('Hello Athena', []);
    expect(screen.getByPlaceholderText('Type your message...')).toHaveValue('');
  });

  it('resolves a pending user question instead of sending a new message', () => {
    chatStore.pendingUserQuestion = {
      question: 'Which model should I use?',
      context: 'Need clarification',
      resolve: jest.fn(),
      reject: jest.fn(),
    };
    mockUseChatStore.mockReturnValue(chatStore);

    render(<Composer sending={false} onSend={onSend} isMobile={false} />);

    fireEvent.change(screen.getByPlaceholderText("Answer the assistant's question..."), { target: { value: 'Use the fast one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));

    expect(chatStore.resolvePendingQuestion).toHaveBeenCalledWith('Use the fast one');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('restores the stopped content when generation is cancelled on the same topic', async () => {
    chatStore.stopSending = jest.fn((): Promise<string | null> => Promise.resolve('Recovered draft'));
    mockUseChatStore.mockReturnValue(chatStore);

    render(<Composer sending onSend={onSend} isMobile={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stop Generation' }));

    await waitFor(() => {
      expect(chatStore.stopSending).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue('Recovered draft')).toBeInTheDocument();
    });
  });

  it('enables web search and disables conflicting generation modes', () => {
    render(<Composer sending={false} onSend={onSend} isMobile={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Web Search' }));

    expect(chatStore.setImageGenerationEnabled).toHaveBeenCalledWith(false);
    expect(chatStore.setMusicGenerationEnabled).toHaveBeenCalledWith(false);
    expect(chatStore.setWebSearchEnabled).toHaveBeenCalledWith(true);
  });

  it('adds and removes an uploaded image attachment', async () => {
    const { container } = render(<Composer sending={false} onSend={onSend} isMobile={false} />);
    const input = container.querySelector('input[type="file"][multiple]');

    expect(input).not.toBeNull();

    const file = new File(['image-bytes'], 'diagram.png', { type: 'image/png' });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment diagram.png' }));

    await waitFor(() => {
      expect(screen.queryByText('diagram.png')).not.toBeInTheDocument();
    });
  });

  it('notifies when an uploaded file exceeds the size limit', async () => {
    const { container } = render(<Composer sending={false} onSend={onSend} isMobile={false} />);
    const input = container.querySelector('input[type="file"][multiple]');

    expect(input).not.toBeNull();

    const oversizedFile = new File(['too-large'], 'large.png', { type: 'image/png' });
    Object.defineProperty(oversizedFile, 'size', { value: 11 * 1024 * 1024 });

    fireEvent.change(input as HTMLInputElement, { target: { files: [oversizedFile] } });

    await waitFor(() => {
      expect(notificationStore.addNotification).toHaveBeenCalledWith('File too large', 'large.png exceeds the 10MB limit.');
    });
  });

  it('supports adding and deleting extra pages in expanded mode', async () => {
    render(<Composer sending={false} onSend={onSend} isMobile={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand message composer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add page' }));

    expect(screen.getByText('Page 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete page Page 2' }));

    await waitFor(() => {
      expect(screen.queryByText('Page 2')).not.toBeInTheDocument();
    });
  });
  it('hides the temperature selection UI when forceTemperature is set', async () => {
    const forcedModel = buildModel({ forceTemperature: 1.0 });
    chatStore.selectedModel = forcedModel;
    providerStore.getAvailableModels = (): UserChatModel[] => [forcedModel];
    mockUseChatStore.mockReturnValue(chatStore);
    mockUseProviderStore.mockReturnValue(providerStore);

    render(<Composer sending={false} onSend={onSend} isMobile={false} />);

    // Open the settings menu
    fireEvent.click(screen.getByRole('button', { name: 'Adjust parameters' }));

    // Verify "Temperature Presets" is NOT in the document
    expect(screen.queryByText('Temperature Presets')).not.toBeInTheDocument();
  });

  it('shows the temperature selection UI when forceTemperature is NOT set', async () => {
    const normalModel = buildModel({ forceTemperature: null });
    chatStore.selectedModel = normalModel;
    providerStore.getAvailableModels = (): UserChatModel[] => [normalModel];
    mockUseChatStore.mockReturnValue(chatStore);
    mockUseProviderStore.mockReturnValue(providerStore);

    render(<Composer sending={false} onSend={onSend} isMobile={false} />);

    // Open the settings menu
    fireEvent.click(screen.getByRole('button', { name: 'Adjust parameters' }));

    // Verify "Temperature Presets" is in the document
    expect(screen.getByText('Temperature Presets')).toBeInTheDocument();
  });
});
