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
import { useUiStore } from '../store/UiStore';
import { createUserChatModel, createLlmProvider, createTopic as createTopicFixture } from '../testUtils';

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
jest.mock('../store/UiStore', () => ({
  useUiStore: Object.assign(jest.fn(), { getState: jest.fn() }),
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
  providers: LlmProvider[];
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
const mockUseUiStore = useUiStore as unknown as jest.Mock & { getState: jest.Mock };
const mockSuggestionService = llmSuggestionService as jest.Mocked<typeof llmSuggestionService>;

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

interface MockRecognition {
  start: jest.Mock;
  stop: jest.Mock;
  abort: jest.Mock;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function createMockRecognitionEvent(transcript: string): SpeechRecognitionEvent {
  const alternative: SpeechRecognitionAlternative = { transcript, confidence: 1 };

  const result = {
    isFinal: true as const,
    length: 1,
    item: (_index: number): SpeechRecognitionAlternative => alternative,
    0: alternative,
    [Symbol.iterator]: function* (): IterableIterator<SpeechRecognitionAlternative> {
      yield alternative;
    },
  };

  const results = {
    length: 1,
    item: (_index: number): SpeechRecognitionResult => result as unknown as SpeechRecognitionResult,
    0: result,
    [Symbol.iterator]: function* (): IterableIterator<SpeechRecognitionResult> {
      yield result as unknown as SpeechRecognitionResult;
    },
  };

  return {
    resultIndex: 0,
    results: results as unknown as SpeechRecognitionResultList,
  } as SpeechRecognitionEvent;
}

describe('Composer', () => {
  let authStore: AuthStoreSlice;
  let providerStore: ProviderStoreSlice;
  let chatStore: ChatStoreSlice;
  let topicStore: TopicStoreSlice;
  let notificationStore: NotificationStoreSlice;
  let onSend: jest.MockedFunction<OnSendHandler>;
  let consoleErrorSpy: jest.SpyInstance<void, Parameters<typeof console.error>>;
  let mockRecognition: MockRecognition;

  beforeEach(() => {
    jest.clearAllMocks();

    let uuidCounter = 0;

    mockRecognition = {
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
      continuous: false,
      interimResults: false,
      lang: '',
      onresult: null,
      onerror: null,
      onend: null,
    };

    const MockSpeechRecognition = jest.fn((): MockRecognition => mockRecognition);

    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockSpeechRecognition,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      writable: true,
      configurable: true,
    });

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

    const selectedModel = createUserChatModel({
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
      isBuiltIn: true,
    });
    const selectedProvider = createLlmProvider({
      id: 'builtin-moonshot',
      name: 'Moonshot',
      baseUrl: 'https://api.moonshot.ai/v1/chat/completions',
      apiKeyEncrypted: 'encrypted-key',
      supportsWebSearch: true,
      requiresReasoningFallback: true,
      isBuiltIn: true,
    });

    providerStore = {
      getAvailableModels: (): UserChatModel[] => [selectedModel],
      getProviderForModel: (): LlmProvider => selectedProvider,
      providers: [],
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
      topics: [createTopicFixture({ id: 'topic-1', name: 'Topic 1' })],
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
    mockUseUiStore.mockReturnValue({ currentlySpeakingMessageId: null, isMobile: false });
    mockUseUiStore.getState.mockReturnValue({ setCurrentlySpeakingMessageId: jest.fn() });
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
  it('hides the temperature selection UI when forceTemperature is set', () => {
    const forcedModel = createUserChatModel({ forceTemperature: 1.0 });
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

  it('shows the temperature selection UI when forceTemperature is NOT set', () => {
    const normalModel = createUserChatModel({ forceTemperature: null });
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

  it('shows MicIcon and is enabled on mobile with empty input', () => {
    render(<Composer sending={false} onSend={onSend} isMobile />);

    const micButton = screen.getByRole('button', { name: 'Start Voice Input' });
    expect(micButton).toBeInTheDocument();
    expect(micButton).not.toBeDisabled();
  });

  it('starts speech recognition when mic button is clicked on mobile', () => {
    render(<Composer sending={false} onSend={onSend} isMobile />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Voice Input' }));

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    expect(mockRecognition.continuous).toBe(false);
    expect(mockRecognition.interimResults).toBe(false);
    expect(mockRecognition.lang).toBe('en-US');
  });

  it('auto-sends transcript on speech recognition result', () => {
    render(<Composer sending={false} onSend={onSend} isMobile />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Voice Input' }));

    const handler = mockRecognition.onresult;
    expect(handler).not.toBeNull();

    const event = createMockRecognitionEvent('Hello world');
    if (handler) {
      handler(event);
    }

    expect(onSend).toHaveBeenCalledWith('Hello world', []);
  });

  it('does not send empty transcript', () => {
    render(<Composer sending={false} onSend={onSend} isMobile />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Voice Input' }));

    const handler = mockRecognition.onresult;
    expect(handler).not.toBeNull();

    const event = createMockRecognitionEvent('   ');
    if (handler) {
      handler(event);
    }

    expect(onSend).not.toHaveBeenCalled();
  });

  it('stops speech recognition when mic button is clicked while listening', () => {
    render(<Composer sending={false} onSend={onSend} isMobile />);

    // Start listening
    fireEvent.click(screen.getByRole('button', { name: 'Start Voice Input' }));
    expect(mockRecognition.start).toHaveBeenCalledTimes(1);

    // Click again to stop — button now shows "Stop Voice Input"
    fireEvent.click(screen.getByRole('button', { name: 'Stop Voice Input' }));

    expect(mockRecognition.stop).toHaveBeenCalledTimes(1);
  });

  it('shows SendIcon on mobile when input has text', () => {
    render(<Composer sending={false} onSend={onSend} isMobile />);

    fireEvent.change(screen.getByPlaceholderText('Message...'), { target: { value: 'Hello' } });

    const sendButton = screen.getByRole('button', { name: 'Send Message' });
    expect(sendButton).toBeInTheDocument();
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);
    expect(onSend).toHaveBeenCalledWith('Hello', []);
  });

  it('shows StopCircleIcon and Stop Reading tooltip when TTS is active and input is empty', () => {
    mockUseUiStore.mockReturnValue({ currentlySpeakingMessageId: 'some-msg-id' });

    render(<Composer sending={false} onSend={onSend} isMobile={false} />);

    const stopButton = screen.getByRole('button', { name: 'Stop Reading' });
    expect(stopButton).toBeInTheDocument();
    expect(stopButton).not.toBeDisabled();
  });

  it('notifies user when microphone permission is denied', () => {
    render(<Composer sending={false} onSend={onSend} isMobile />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Voice Input' }));

    const handler = mockRecognition.onerror;
    expect(handler).not.toBeNull();

    if (handler) {
      handler({ error: 'not-allowed' } as SpeechRecognitionErrorEvent);
    }

    expect(notificationStore.addNotification).toHaveBeenCalledWith(
      'Microphone access denied',
      'Please allow microphone access in your browser settings.',
    );
  });

  it('notifies user on speech recognition network error', () => {
    render(<Composer sending={false} onSend={onSend} isMobile />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Voice Input' }));

    const handler = mockRecognition.onerror;
    expect(handler).not.toBeNull();

    if (handler) {
      handler({ error: 'network' } as SpeechRecognitionErrorEvent);
    }

    expect(notificationStore.addNotification).toHaveBeenCalledWith(
      'Speech recognition error',
      'A network error occurred. Please check your connection.',
    );
  });

  it('does not notify on silent error types (aborted, no-speech)', () => {
    render(<Composer sending={false} onSend={onSend} isMobile />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Voice Input' }));

    const handler = mockRecognition.onerror;
    expect(handler).not.toBeNull();

    if (handler) {
      handler({ error: 'aborted' } as SpeechRecognitionErrorEvent);
      handler({ error: 'no-speech' } as SpeechRecognitionErrorEvent);
    }

    expect(notificationStore.addNotification).not.toHaveBeenCalled();
  });

  it('notifies user on unknown speech recognition error', () => {
    render(<Composer sending={false} onSend={onSend} isMobile />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Voice Input' }));

    const handler = mockRecognition.onerror;
    expect(handler).not.toBeNull();

    if (handler) {
      handler({ error: 'audio-capture' } as SpeechRecognitionErrorEvent);
    }

    expect(notificationStore.addNotification).toHaveBeenCalledWith('Speech recognition error', 'Recognition failed: audio-capture');
  });

  it('stops speech recognition on unmount', () => {
    const { unmount } = render(<Composer sending={false} onSend={onSend} isMobile />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Voice Input' }));
    expect(mockRecognition.start).toHaveBeenCalledTimes(1);

    unmount();

    expect(mockRecognition.stop).toHaveBeenCalledTimes(1);
  });
});
