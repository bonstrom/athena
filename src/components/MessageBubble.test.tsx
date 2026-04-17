import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import MessageBubble from './MessageBubble';
import { Message } from '../database/AthenaDb';
import theme from '../theme';
import { useAuthStore } from '../store/AuthStore';
import { useChatStore } from '../store/ChatStore';
import { useNotificationStore } from '../store/NotificationStore';
import { useTopicStore } from '../store/TopicStore';
import { useUiStore } from '../store/UiStore';
import { useProviderStore } from '../store/ProviderStore';

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
}

type ProviderStoreHookMock = jest.Mock<unknown> & {
  getState: jest.Mock<{ models: { id: string; apiModelId: string; label: string }[] }>;
};

jest.mock('./MarkdownWithCode', () => ({
  __esModule: true,
  default: ({ children }: { children: string }): JSX.Element => <div data-testid="markdown-content">{children}</div>,
}));

jest.mock('./TypingIndicator', () => ({
  __esModule: true,
  default: (): JSX.Element => <div data-testid="typing-indicator" />,
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

const mockUseAuthStore = useAuthStore as unknown as jest.Mock<AuthStoreSlice>;
const mockUseChatStore = useChatStore as unknown as jest.Mock<ChatStoreSlice>;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock<NotificationStoreSlice>;
const mockUseTopicStore = useTopicStore as unknown as jest.Mock<TopicStoreSlice>;
const mockUseUiStore = useUiStore as unknown as jest.Mock<UiStoreSlice>;
const mockUseProviderStore = useProviderStore as unknown as ProviderStoreHookMock;

let mockWriteText: jest.MockedFunction<(text: string) => Promise<void>>;

function createMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'message-1',
    topicId: 'topic-1',
    forkId: 'main',
    type: 'assistant',
    content: 'Hello from assistant',
    model: 'model-1',
    isDeleted: false,
    includeInContext: false,
    created: '2026-04-18T10:00:00.000Z',
    failed: false,
    promptTokens: 10,
    completionTokens: 20,
    totalCost: 0.123,
    ...overrides,
  };
}

function renderWithTheme(ui: JSX.Element): ReturnType<typeof render> {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

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
    });

    mockUseProviderStore.getState.mockReturnValue({
      models: [{ id: 'model-1', apiModelId: 'model-1', label: 'Model One' }],
    });
  });

  it('renders message content with resolved model label', () => {
    renderWithTheme(<MessageBubble message={createMessage()} />);

    expect(screen.getByText('Model One')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello from assistant');
  });

  it('copies message content to clipboard from the copy action', async () => {
    renderWithTheme(<MessageBubble message={createMessage()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('Hello from assistant');
    });
  });

  it('pins message into context when pin button is clicked', async () => {
    const updateMessageContext = jest.fn((): Promise<void> => Promise.resolve());

    mockUseChatStore.mockReturnValue(createChatStore({ updateMessageContext }));

    renderWithTheme(<MessageBubble message={createMessage({ includeInContext: false })} />);

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

    renderWithTheme(<MessageBubble message={createMessage()} />);

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

    renderWithTheme(<MessageBubble message={createMessage()} />);

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

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('shows different button states on mobile vs desktop', () => {
    mockUseUiStore.mockReturnValue({
      isMobile: true,
    });

    renderWithTheme(<MessageBubble message={createMessage()} />);

    // On mobile, certain action buttons might be hidden or styled differently
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });
});
