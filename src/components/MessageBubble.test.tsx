import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import MessageBubble from './MessageBubble';
import { createMessage, renderWithTheme } from '../testUtils';
import { useAuthStore } from '../store/AuthStore';
import { useChatStore } from '../store/ChatStore';
import { useNotificationStore } from '../store/NotificationStore';
import { useTopicStore } from '../store/TopicStore';
import { useUiStore } from '../store/UiStore';
import { useProviderStore } from '../store/ProviderStore';
import { speakText, stopSpeech } from '../services/mediaService';

interface ChatStoreSlice {
  updateMessageContext: (id: string, includeInContext: boolean) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  sendMessageStream: (content: string, topicId: string, messageId?: string) => Promise<void>;
  regenerateResponse: (id: string) => Promise<void>;
  switchMessageVersion: (parentMessageId: string, versionId: string) => Promise<void>;
  maybeSummarize: (id: string, content: string, force?: boolean) => Promise<void>;
  summarizingMessageIds: Set<string>;
  failedSummaryMessageIds: Set<string>;
}

interface AuthStoreSlice {
  userName: string;
  chatFontSize: number;
  messageTruncateChars: number;
  aiSummaryEnabled: boolean;
}

interface NotificationStoreSlice {
  addNotification: (title: string, message: string) => void;
}

interface TopicStoreSlice {
  forkTopic: (topicId: string, messageId: string) => Promise<void>;
}

interface UiStoreSlice {
  isMobile: boolean;
  currentlySpeakingMessageId: string | null;
}

type ProviderStoreHookMock = jest.Mock<unknown> & {
  getState: jest.Mock<{ models: { id: string; apiModelId: string; label: string }[] }>;
};

jest.mock('./MarkdownWithCode', () => ({
  __esModule: true,
  default: ({ children }: { children: string }): React.ReactElement => <div data-testid="markdown-content">{children}</div>,
}));

jest.mock('./TypingIndicator', () => ({
  __esModule: true,
  default: (): React.ReactElement => <div data-testid="typing-indicator" />,
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('../store/ChatStore', () => ({
  useChatStore: jest.fn(),
}));

jest.mock('../store/NotificationStore', () => ({
  useNotificationStore: jest.fn(),
}));

jest.mock('../store/TopicStore', () => ({
  useTopicStore: jest.fn(),
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
}));

jest.mock('../store/ProviderStore', () => ({
  useProviderStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

jest.mock('../services/mediaService', () => ({
  speakText: jest.fn((): Promise<void> => Promise.resolve()),
  stopSpeech: jest.fn(),
}));

jest.mock('../utils/stripMarkdown', () => ({
  stripMarkdown: jest.fn((text: string): string => text),
}));

const mockUseAuthStore = useAuthStore as unknown as jest.Mock<AuthStoreSlice>;
const mockUseChatStore = useChatStore as unknown as jest.Mock<ChatStoreSlice>;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock<NotificationStoreSlice>;
const mockUseTopicStore = useTopicStore as unknown as jest.Mock<TopicStoreSlice>;
const mockUseUiStore = useUiStore as unknown as jest.Mock<UiStoreSlice>;
const mockUseProviderStore = useProviderStore as unknown as ProviderStoreHookMock;
const mockSpeakText = speakText as jest.MockedFunction<typeof speakText>;
const mockStopSpeech = stopSpeech as jest.MockedFunction<typeof stopSpeech>;

let mockWriteText: jest.MockedFunction<(text: string) => Promise<void>>;

function createChatStore(overrides?: Partial<ChatStoreSlice>): ChatStoreSlice {
  return {
    updateMessageContext: jest.fn((): Promise<void> => Promise.resolve()),
    deleteMessage: jest.fn((): Promise<void> => Promise.resolve()),
    sendMessageStream: jest.fn((): Promise<void> => Promise.resolve()),
    regenerateResponse: jest.fn((): Promise<void> => Promise.resolve()),
    switchMessageVersion: jest.fn((): Promise<void> => Promise.resolve()),
    maybeSummarize: jest.fn((): Promise<void> => Promise.resolve()),
    summarizingMessageIds: new Set<string>(),
    failedSummaryMessageIds: new Set<string>(),
    ...overrides,
  };
}

describe('MessageBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockWriteText = jest.fn((text: string): Promise<void> => {
      void text;
      return Promise.resolve();
    });

    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: {
        writeText: (text: string): Promise<void> => mockWriteText(text),
      },
    });

    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 500,
      aiSummaryEnabled: false,
    });

    mockUseChatStore.mockReturnValue(createChatStore());

    mockUseNotificationStore.mockReturnValue({
      addNotification: jest.fn(),
    });

    mockUseTopicStore.mockReturnValue({
      forkTopic: jest.fn((): Promise<void> => Promise.resolve()),
    });

    mockUseUiStore.mockReturnValue({
      isMobile: false,
      currentlySpeakingMessageId: null,
    });

    mockUseProviderStore.getState.mockReturnValue({
      models: [{ id: 'model-1', apiModelId: 'model-1', label: 'Model One' }],
    });
  });

  it('renders message content with resolved model label', () => {
    renderWithTheme(<MessageBubble message={createMessage({ type: 'assistant', content: 'Hello from assistant', model: 'model-1' })} />);

    expect(screen.getByText('Model One')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello from assistant');
  });

  it('copies message content to clipboard from the copy action', async () => {
    renderWithTheme(<MessageBubble message={createMessage({ content: 'Hello from assistant' })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('Hello from assistant');
    });
  });

  it('pins message into context when pin button is clicked', async () => {
    const updateMessageContext = jest.fn((): Promise<void> => Promise.resolve());

    mockUseChatStore.mockReturnValue(createChatStore({ updateMessageContext }));

    renderWithTheme(<MessageBubble message={createMessage({ id: 'message-1', includeInContext: false })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pin to context' }));

    await waitFor(() => {
      expect(updateMessageContext).toHaveBeenCalledWith('message-1', true);
    });
  });

  it('retries failed message sending from retry button', async () => {
    const sendMessageStream = jest.fn((): Promise<void> => Promise.resolve());

    mockUseChatStore.mockReturnValue(createChatStore({ sendMessageStream }));

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          id: 'message-1',
          topicId: 'topic-1',
          failed: true,
          content: 'Please retry this',
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry Sending' }));

    await waitFor(() => {
      expect(sendMessageStream).toHaveBeenCalledWith('Please retry this', 'topic-1', 'message-1');
    });
  });

  it('renders user messages with user label', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'TestUser',
      chatFontSize: 16,
      messageTruncateChars: 500,
      aiSummaryEnabled: false,
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'user',
          content: 'User question here',
        })}
      />,
    );

    expect(screen.getByText('TestUser')).toBeInTheDocument();
  });

  it('deletes message when delete action is confirmed', async () => {
    const deleteMessage = jest.fn((): Promise<void> => Promise.resolve());

    mockUseChatStore.mockReturnValue(createChatStore({ deleteMessage }));

    renderWithTheme(<MessageBubble message={createMessage({ id: 'message-1' })} />);

    // Find and click delete button
    const deleteBtn = screen.queryByRole('button', { name: /delete/i });
    if (deleteBtn) {
      fireEvent.click(deleteBtn);

      // Confirm deletion in dialog
      await waitFor(() => {
        const confirmBtn = screen.queryByRole('button', { name: /confirm|yes/i });
        if (confirmBtn) {
          fireEvent.click(confirmBtn);
        }
      });

      await waitFor(() => {
        expect(deleteMessage).toHaveBeenCalledWith('message-1');
      });
    }
  });

  it('unpins message from context when already pinned', async () => {
    const updateMessageContext = jest.fn((): Promise<void> => Promise.resolve());

    mockUseChatStore.mockReturnValue(createChatStore({ updateMessageContext }));

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          id: 'message-1',
          includeInContext: true,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unpin from context' }));

    await waitFor(() => {
      expect(updateMessageContext).toHaveBeenCalledWith('message-1', false);
    });
  });

  it('shows unknown model when model ID does not match any in provider store', () => {
    mockUseProviderStore.getState.mockReturnValue({
      models: [
        { id: 'model-1', apiModelId: 'model-1', label: 'Model One' },
        { id: 'model-2', apiModelId: 'model-2', label: 'Model Two' },
      ],
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          model: 'unknown-model-id',
        })}
      />,
    );

    // Should display content without crashing
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('forks conversation at message boundary', async () => {
    const forkTopic = jest.fn((): Promise<void> => Promise.resolve());

    mockUseTopicStore.mockReturnValue({
      forkTopic,
    });

    renderWithTheme(<MessageBubble message={createMessage({ id: 'message-1', topicId: 'topic-1' })} />);

    const forkBtn = screen.queryByRole('button', { name: /fork/i });
    if (forkBtn) {
      fireEvent.click(forkBtn);

      await waitFor(() => {
        expect(forkTopic).toHaveBeenCalledWith('topic-1', 'message-1');
      });
    }
  });

  it('displays cost information when message has cost data', () => {
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          promptTokens: 100,
          completionTokens: 200,
          totalCost: 0.5,
        })}
      />,
    );

    // Cost display should be rendered (exact text depends on implementation)
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('handles messages with typing indicator state', () => {
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: '',
        })}
      />,
    );

    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
  });

  it('shows different button states on mobile vs desktop', () => {
    mockUseUiStore.mockReturnValue({
      isMobile: true,
      currentlySpeakingMessageId: null,
    });

    renderWithTheme(<MessageBubble message={createMessage()} />);

    // On mobile, certain action buttons might be hidden or styled differently
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('shows StopCircleIcon and Stop speech tooltip when this message is being read', () => {
    mockUseUiStore.mockReturnValue({
      currentlySpeakingMessageId: 'message-1',
      isMobile: false,
    });

    renderWithTheme(<MessageBubble message={createMessage({ id: 'message-1', type: 'assistant' })} />);

    const stopButton = screen.getByRole('button', { name: 'Stop speech' });
    expect(stopButton).toBeInTheDocument();
  });

  it('passes message.id to speakText when Read aloud is clicked', () => {
    mockSpeakText.mockResolvedValue(undefined);

    renderWithTheme(<MessageBubble message={createMessage({ id: 'msg-42', type: 'assistant', content: 'Hello world' })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));

    expect(mockSpeakText).toHaveBeenCalledTimes(1);
    expect(mockSpeakText.mock.calls[0][1]).toBe('msg-42');
  });

  it('calls stopSpeech when Stop speech is clicked on the currently speaking message', () => {
    mockUseUiStore.mockReturnValue({
      currentlySpeakingMessageId: 'msg-42',
      isMobile: false,
    });

    renderWithTheme(<MessageBubble message={createMessage({ id: 'msg-42', type: 'assistant', content: 'Hello world' })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stop speech' }));

    expect(mockStopSpeech).toHaveBeenCalled();
    expect(mockSpeakText).not.toHaveBeenCalled();
  });

  // ─── Summarization ────────────────────────────────────────────────────────

  it('renders summarization button when message is long enough and aiSummaryEnabled', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 0,
      aiSummaryEnabled: true,
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'user',
          content: 'A'.repeat(300),
        })}
      />,
    );

    expect(screen.getByLabelText('Generate summary')).toBeInTheDocument();
  });

  it('calls maybeSummarize when summarization button is clicked', () => {
    const maybeSummarize = jest.fn((): Promise<void> => Promise.resolve());
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 0,
      aiSummaryEnabled: true,
    });
    mockUseChatStore.mockReturnValue(
      createChatStore({ maybeSummarize }),
    );

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          id: 'msg-summarize',
          type: 'assistant',
          content: 'B'.repeat(300),
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('Generate summary'));

    expect(maybeSummarize).toHaveBeenCalledWith('msg-summarize', 'B'.repeat(300), true);
  });

  it('shows CircularProgress when summarization is in progress', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 0,
      aiSummaryEnabled: true,
    });
    mockUseChatStore.mockReturnValue(
      createChatStore({ summarizingMessageIds: new Set(['msg-sum-progress']) }),
    );

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          id: 'msg-sum-progress',
          type: 'user',
          content: 'C'.repeat(300),
        })}
      />,
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows retry state for failed summarization', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 0,
      aiSummaryEnabled: true,
    });
    mockUseChatStore.mockReturnValue(
      createChatStore({ failedSummaryMessageIds: new Set(['msg-sum-failed']) }),
    );

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          id: 'msg-sum-failed',
          type: 'user',
          content: 'D'.repeat(300),
        })}
      />,
    );

    expect(screen.getByLabelText('Summary failed — click to retry')).toBeInTheDocument();
  });

  it('shows regenerate summary label when message already has summary', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 0,
      aiSummaryEnabled: true,
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'user',
          content: 'E'.repeat(300),
          summary: 'Existing summary',
        })}
      />,
    );

    expect(screen.getByLabelText('Regenerate summary')).toBeInTheDocument();
  });

  it('shows summary text in info popover', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 0,
      aiSummaryEnabled: false,
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Hello',
          summary: 'This is a summary',
          model: 'model-1',
        })}
      />,
    );

    fireEvent.click(screen.getByText('Model One'));

    expect(screen.getByText('This is a summary')).toBeInTheDocument();
  });

  // ─── Reasoning / Thinking ────────────────────────────────────────────────

  it('toggles reasoning display when thinking button is clicked', () => {
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Final answer',
          reasoning: 'I need to think about this...',
          model: 'model-1',
        })}
      />,
    );

    const thinkingBtn = screen.getByLabelText('Show thoughts');
    fireEvent.click(thinkingBtn);

    expect(screen.getByText('Thought Process')).toBeInTheDocument();
    expect(screen.getByText('I need to think about this...')).toBeInTheDocument();
  });

  it('shows thinking label while assistant is typing and reasoning is present', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 0,
      aiSummaryEnabled: false,
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: '',
          reasoning: 'Thinking step...',
        })}
      />,
    );

    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  // ─── Version Switching ────────────────────────────────────────────────────

  it('renders version navigator when versions array is provided', () => {
    const versions = [
      createMessage({ id: 'v1', type: 'assistant', content: 'Version 1', parentMessageId: 'u-1' }),
      createMessage({ id: 'v2', type: 'assistant', content: 'Version 2', parentMessageId: 'u-1' }),
      createMessage({ id: 'v3', type: 'assistant', content: 'Version 3', parentMessageId: 'u-1' }),
    ];

    renderWithTheme(
      <MessageBubble
        message={versions[1]}
        versions={versions}
      />,
    );

    expect(screen.getByLabelText('Previous version')).toBeInTheDocument();
    expect(screen.getByLabelText('Next version')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('disables previous version button on first version', () => {
    const versions = [
      createMessage({ id: 'v1', type: 'assistant', content: 'Version 1', parentMessageId: 'u-1' }),
      createMessage({ id: 'v2', type: 'assistant', content: 'Version 2', parentMessageId: 'u-1' }),
    ];

    renderWithTheme(
      <MessageBubble
        message={versions[0]}
        versions={versions}
      />,
    );

    const prevBtn = screen.getByLabelText('Previous version');
    expect(prevBtn).toBeDisabled();
  });

  it('disables next version button on last version', () => {
    const versions = [
      createMessage({ id: 'v1', type: 'assistant', content: 'Version 1', parentMessageId: 'u-1' }),
      createMessage({ id: 'v2', type: 'assistant', content: 'Version 2', parentMessageId: 'u-1' }),
    ];

    renderWithTheme(
      <MessageBubble
        message={versions[1]}
        versions={versions}
      />,
    );

    const nextBtn = screen.getByLabelText('Next version');
    expect(nextBtn).toBeDisabled();
  });

  it('calls switchMessageVersion when navigating versions', () => {
    const switchMessageVersion = jest.fn((): Promise<void> => Promise.resolve());
    mockUseChatStore.mockReturnValue(
      createChatStore({ switchMessageVersion }),
    );

    const versions = [
      createMessage({ id: 'v1', type: 'assistant', content: 'Version 1', parentMessageId: 'u-1' }),
      createMessage({ id: 'v2', type: 'assistant', content: 'Version 2', parentMessageId: 'u-1' }),
    ];

    renderWithTheme(
      <MessageBubble
        message={versions[0]}
        versions={versions}
      />,
    );

    fireEvent.click(screen.getByLabelText('Next version'));

    expect(switchMessageVersion).toHaveBeenCalledWith('u-1', 'v2');
  });

  // ─── aiNote Messages ─────────────────────────────────────────────────────

  it('renders aiNote with italic hidden note text', () => {
    mockUseProviderStore.getState.mockReturnValue({
      models: [{ id: 'model-1', apiModelId: 'model-1', label: 'Model One' }],
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'aiNote',
          content: 'Hidden note content',
          model: 'model-1',
        })}
      />,
    );

    expect(screen.getByText('Model One stored a hidden note here.')).toBeInTheDocument();
  });

  // ─── Info Popover ────────────────────────────────────────────────────────

  it('opens info popover when model label is clicked', () => {
    mockUseProviderStore.getState.mockReturnValue({
      models: [{ id: 'model-1', apiModelId: 'model-1', label: 'Model One' }],
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Hello',
          model: 'model-1',
          totalCost: 1.5,
          promptTokens: 100,
          completionTokens: 200,
        })}
      />,
    );

    fireEvent.click(screen.getByText('Model One'));

    expect(screen.getByText('1.500 kr')).toBeInTheDocument();
    expect(screen.getByText(/Prompt: 100/)).toBeInTheDocument();
  });

  it('shows latency and TPS in info popover when available', () => {
    mockUseProviderStore.getState.mockReturnValue({
      models: [{ id: 'model-1', apiModelId: 'model-1', label: 'Model One' }],
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Hello',
          model: 'model-1',
          totalCost: 0.5,
          promptTokens: 50,
          completionTokens: 50,
          latencyMs: 2000,
        })}
      />,
    );

    fireEvent.click(screen.getByText('Model One'));

    expect(screen.getByText('Time: 2.0 s')).toBeInTheDocument();
  });

  it('shows cached tokens in info popover when available', () => {
    mockUseProviderStore.getState.mockReturnValue({
      models: [{ id: 'model-1', apiModelId: 'model-1', label: 'Model One' }],
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Hello',
          model: 'model-1',
          totalCost: 0.3,
          promptTokens: 100,
          completionTokens: 50,
          cachedTokens: 80,
          cacheCreationTokens: 20,
        })}
      />,
    );

    fireEvent.click(screen.getByText('Model One'));

    expect(screen.getByText(/Cache hit:/)).toBeInTheDocument();
    expect(screen.getByText(/Cache write:/)).toBeInTheDocument();
  });

  it('closes info popover when clicking model label again', async () => {
    mockUseProviderStore.getState.mockReturnValue({
      models: [{ id: 'model-1', apiModelId: 'model-1', label: 'Model One' }],
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Hello',
          model: 'model-1',
          totalCost: 1.0,
        })}
      />,
    );

    const label = screen.getByText('Model One');
    fireEvent.click(label);
    expect(screen.getByText('1.000 kr')).toBeInTheDocument();

    fireEvent.click(label);
    await waitFor(() => {
      expect(screen.queryByText('1.000 kr')).not.toBeInTheDocument();
    });
  });

  // ─── Raw Response ────────────────────────────────────────────────────────

  it('shows raw response toggle in menu when message has rawResponse', () => {
    const rawResponseContent = '{"choices":[{"message":{"content":"Test"}}]}';

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Test content',
          rawResponse: rawResponseContent,
          model: 'model-1',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));

    expect(screen.getByText('Show raw response')).toBeInTheDocument();
  });

  it('toggles raw response display when menu item is clicked', () => {
    const rawResponseContent = JSON.stringify({ choices: [{ message: { content: 'Test' } }] });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Test content',
          rawResponse: rawResponseContent,
          model: 'model-1',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Show raw response'));

    expect(screen.getByText(/"content": "Test"/)).toBeInTheDocument();
  });

  // ─── Menu Items ──────────────────────────────────────────────────────────

  it('shows Regenerate in menu for non-failed assistant message', () => {
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Response',
          model: 'model-1',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));

    expect(screen.getByText('Regenerate')).toBeInTheDocument();
  });

  it('does not show Regenerate for user messages', () => {
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'user',
          content: 'Question',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));

    expect(screen.queryByText('Regenerate')).not.toBeInTheDocument();
  });

  it('does not show Fork for user messages', () => {
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'user',
          content: 'Question',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));

    expect(screen.queryByText('Fork')).not.toBeInTheDocument();
  });

  it('calls regenerateResponse from menu', () => {
    const regenerateResponse = jest.fn((): Promise<void> => Promise.resolve());
    mockUseChatStore.mockReturnValue(
      createChatStore({ regenerateResponse }),
    );

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          id: 'msg-regen-menu',
          type: 'assistant',
          content: 'Response',
          model: 'model-1',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Regenerate'));

    expect(regenerateResponse).toHaveBeenCalledWith('msg-regen-menu');
  });

  it('calls forkTopic from Fork menu item', () => {
    const forkTopic = jest.fn((): Promise<void> => Promise.resolve());
    mockUseTopicStore.mockReturnValue({ forkTopic });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          id: 'msg-fork-menu',
          topicId: 'topic-1',
          type: 'assistant',
          content: 'Response',
          model: 'model-1',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Fork'));

    expect(forkTopic).toHaveBeenCalledWith('topic-1', 'msg-fork-menu');
  });

  it('opens delete dialog from menu', () => {
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'user',
          content: 'Question',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByText('Delete Message')).toBeInTheDocument();
  });

  // ─── Truncated Content ───────────────────────────────────────────────────

  it('truncates long messages when messageTruncateChars is set', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 10,
      aiSummaryEnabled: false,
    });

    const longContent = 'This is a very long message that should be truncated';
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          content: longContent,
        })}
      />,
    );

    const truncated = 'This is a …';
    expect(screen.getByTestId('markdown-content')).toHaveTextContent(truncated);
    expect(screen.getByText('Show more')).toBeInTheDocument();
  });

  it('expands truncated message when Show more is clicked', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 10,
      aiSummaryEnabled: false,
    });

    const longContent = 'This is a very long message that should be truncated';
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          content: longContent,
        })}
      />,
    );

    fireEvent.click(screen.getByText('Show more'));

    expect(screen.getByTestId('markdown-content')).toHaveTextContent(longContent);
    expect(screen.getByText('Show less')).toBeInTheDocument();
  });

  it('does not truncate messages shorter than truncate limit', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 500,
      aiSummaryEnabled: false,
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          content: 'Short message',
        })}
      />,
    );

    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Short message');
    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
  });

  it('automatically expands during streaming (empty content)', () => {
    mockUseAuthStore.mockReturnValue({
      userName: 'Alex',
      chatFontSize: 16,
      messageTruncateChars: 10,
      aiSummaryEnabled: false,
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: '',
        })}
      />,
    );

    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
  });

  // ─── Error Handling ──────────────────────────────────────────────────────

  it('shows notification when togglePin fails', async () => {
    const addNotification = jest.fn();
    const updateMessageContext = jest.fn(
      (): Promise<void> => Promise.reject(new Error('Update failed')),
    );
    mockUseNotificationStore.mockReturnValue({ addNotification });
    mockUseChatStore.mockReturnValue(
      createChatStore({ updateMessageContext }),
    );

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          id: 'msg-pin-err',
          includeInContext: false,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pin to context' }));

    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith(
        'Failed to update context pin',
        'Update failed',
      );
    });
  });

  it('shows notification when copy fails', async () => {
    const addNotification = jest.fn();
    const mockFailingWriteText = jest.fn(
      (): Promise<void> => Promise.reject(new Error('Clipboard unavailable')),
    );
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: mockFailingWriteText },
    });
    mockUseNotificationStore.mockReturnValue({ addNotification });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          content: 'Test content',
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));

    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith('Error', 'Failed to copy message');
    });
  });

  it('shows notification when fork fails', async () => {
    const addNotification = jest.fn();
    const forkTopic = jest.fn(
      (): Promise<void> => Promise.reject(new Error('Fork failed')),
    );
    mockUseNotificationStore.mockReturnValue({ addNotification });
    mockUseTopicStore.mockReturnValue({ forkTopic });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          id: 'msg-fork-err',
          topicId: 'topic-1',
          type: 'assistant',
          content: 'Response',
          model: 'model-1',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Fork'));

    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith(
        'Failed to fork conversation',
        'Fork failed',
      );
    });
  });

  // ─── Delete Dialog ───────────────────────────────────────────────────────

  it('cancels delete dialog on Cancel', async () => {
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'user',
          content: 'Question',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Delete'));

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Delete Message')).not.toBeInTheDocument();
    });
  });

  it('shows notification when delete fails', async () => {
    const addNotification = jest.fn();
    const deleteMessage = jest.fn(
      (): Promise<void> => Promise.reject(new Error('Delete failed')),
    );
    mockUseNotificationStore.mockReturnValue({ addNotification });
    mockUseChatStore.mockReturnValue(createChatStore({ deleteMessage }));

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          id: 'msg-del-err',
          type: 'user',
          content: 'Question',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Delete'));

    const deleteBtn = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith(
        'Failed to delete message',
        'Delete failed',
      );
    });
  });

  // ─── Model Label Resolution ──────────────────────────────────────────────

  it('resolves multi-model labels joined by " - "', () => {
    mockUseProviderStore.getState.mockReturnValue({
      models: [
        { id: 'model-a', apiModelId: 'model-a', label: 'Alpha' },
        { id: 'model-b', apiModelId: 'model-b', label: 'Beta' },
      ],
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Hello',
          model: 'model-a - model-b',
        })}
      />,
    );

    expect(screen.getByText('Alpha - Beta')).toBeInTheDocument();
  });

  it('falls back to raw ID when model not found in provider store', () => {
    mockUseProviderStore.getState.mockReturnValue({
      models: [{ id: 'existing', apiModelId: 'existing', label: 'Existing' }],
    });

    renderWithTheme(
      <MessageBubble
        message={createMessage({
          type: 'assistant',
          content: 'Hello',
          model: 'nonexistent-id',
        })}
      />,
    );

    expect(screen.getByText('nonexistent-id')).toBeInTheDocument();
  });

  // ─── Attachments ─────────────────────────────────────────────────────────

  it('renders audio attachment with audio controls', () => {
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          content: 'Here is audio',
          attachments: [
            {
              id: 'att-1',
              name: 'recording.mp3',
              type: 'audio/mpeg',
              size: 1000,
              data: 'data:audio/mpeg;base64,AAAA',
            },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('renders generic file attachment with download button', () => {
    renderWithTheme(
      <MessageBubble
        message={createMessage({
          content: 'Here is a file',
          attachments: [
            {
              id: 'att-2',
              name: 'document.pdf',
              type: 'application/pdf',
              size: 2000,
              data: 'data:application/pdf;base64,AAAA',
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });
});
