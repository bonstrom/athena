import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatView from './ChatView';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '../store/AuthStore';
import { useChatStore } from '../store/ChatStore';
import { useTopicStore } from '../store/TopicStore';

jest.mock('../components/Composer', () => ({
  __esModule: true,
  default: ({ onSend }: { onSend: (content: string) => void }): React.ReactElement => (
    <button
      onClick={(): void => {
        onSend('hello');
      }}
    >
      send
    </button>
  ),
}));

jest.mock('../components/MessageList', () => ({
  __esModule: true,
  default: ({ onSuggestionSelect }: { onSuggestionSelect: (s: string) => void }): React.ReactElement => (
    <button
      onClick={(): void => {
        onSuggestionSelect('suggested reply');
      }}
    >
      suggest
    </button>
  ),
}));

jest.mock('../components/ForkTabs', () => ({
  __esModule: true,
  default: ({ topicId }: { topicId: string }): React.ReactElement => <div data-testid="fork-tabs">{topicId}</div>,
}));

jest.mock('@mui/material', () => {
  const actual = jest.requireActual<typeof import('@mui/material')>('@mui/material');
  return {
    ...actual,
    useMediaQuery: jest.fn(() => false),
  };
});

jest.mock('react-router-dom', () => ({
  useParams: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('../store/ChatStore', () => {
  const getStateMock = jest.fn().mockReturnValue({ sending: false, stopSending: jest.fn() });
  const hookFn = jest.fn(() => ({
    messagesByTopic: {},
    sending: false,
    sendMessageStream: jest.fn((): Promise<void> => Promise.resolve()),
    fetchMessages: jest.fn((): Promise<void> => Promise.resolve()),
    pendingSuggestions: null,
    clearSuggestions: jest.fn(),
    isSuggestionsLoading: false,
    stopSending: jest.fn(),
  }));
  return {
    useChatStore: Object.assign(hookFn, { getState: getStateMock }),
  };
});

jest.mock('../store/TopicStore', () => ({
  useTopicStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

const mockUseParams = useParams as unknown as jest.Mock<{ topicId?: string }>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock<{ chatWidth: 'lg' | 'full'; defaultMaxContextMessages: number }>;
const mockUseChatStore = useChatStore as unknown as jest.Mock<{
  messagesByTopic: Record<string, unknown[]>;
  sending: boolean;
  sendMessageStream: (content: string, topicId: string) => Promise<void>;
  fetchMessages: (topicId: string) => Promise<void>;
  pendingSuggestions: string[] | null;
  clearSuggestions: () => void;
  isSuggestionsLoading: boolean;
  stopSending: () => void;
}>;

type UseTopicStoreMock = jest.Mock<unknown> & {
  getState: jest.Mock<{ topics: { id: string; maxContextMessages?: number }[] }>;
};

const mockUseTopicStore = useTopicStore as unknown as UseTopicStoreMock;

describe('ChatView page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseParams.mockReturnValue({ topicId: 'topic-1' });
    mockUseAuthStore.mockReturnValue({ chatWidth: 'lg', defaultMaxContextMessages: 10 });

    (useChatStore as unknown as { getState: jest.Mock }).getState.mockReturnValue({
      sending: false,
      stopSending: jest.fn(),
    });

    mockUseChatStore.mockReturnValue({
      messagesByTopic: { 'topic-1': [] },
      sending: false,
      sendMessageStream: jest.fn((): Promise<void> => Promise.resolve()),
      fetchMessages: jest.fn((): Promise<void> => Promise.resolve()),
      pendingSuggestions: ['suggested reply'],
      clearSuggestions: jest.fn(),
      isSuggestionsLoading: false,
      stopSending: jest.fn(),
    });

    mockUseTopicStore.mockImplementation((selector: (state: { topics: { id: string; maxContextMessages?: number }[] }) => unknown): unknown =>
      selector({ topics: [{ id: 'topic-1', maxContextMessages: 20 }] }),
    );
    mockUseTopicStore.getState.mockReturnValue({ topics: [{ id: 'topic-1' }] });
  });

  it('renders chat content and sends suggestion through store action', async () => {
    const clearSuggestions = jest.fn((): void => undefined);
    const sendMessageStream = jest.fn((_: string, __: string): Promise<void> => Promise.resolve());
    const fetchMessages = jest.fn((_: string): Promise<void> => Promise.resolve());

    mockUseChatStore.mockReturnValue({
      messagesByTopic: { 'topic-1': [] },
      sending: false,
      sendMessageStream,
      fetchMessages,
      pendingSuggestions: ['suggested reply'],
      clearSuggestions,
      isSuggestionsLoading: false,
      stopSending: jest.fn(),
    });

    render(<ChatView />);

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalledWith('topic-1');
    });

    fireEvent.click(screen.getByText('suggest'));

    expect(clearSuggestions).toHaveBeenCalledTimes(2);
    expect(sendMessageStream).toHaveBeenCalledWith('suggested reply', 'topic-1');
    expect(screen.getByTestId('fork-tabs')).toHaveTextContent('topic-1');
  });

  it('shows topic-not-found error when route topic does not exist', async () => {
    const fetchMessages = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
    mockUseChatStore.mockReturnValue({
      messagesByTopic: {},
      sending: false,
      sendMessageStream: jest.fn((): Promise<void> => Promise.resolve()),
      fetchMessages,
      pendingSuggestions: null,
      clearSuggestions: jest.fn(),
      isSuggestionsLoading: false,
      stopSending: jest.fn(),
    });
    mockUseTopicStore.getState.mockReturnValue({ topics: [{ id: 'other-topic' }] });

    render(<ChatView />);

    expect(await screen.findByText('Topic not found')).toBeInTheDocument();
  });

  it('shows error message when fetchMessages fails', async () => {
    const fetchMessages = jest.fn<Promise<void>, [string]>(() => Promise.reject(new Error('IndexedDB error')));
    mockUseChatStore.mockReturnValue({
      messagesByTopic: {},
      sending: false,
      sendMessageStream: jest.fn((): Promise<void> => Promise.resolve()),
      fetchMessages,
      pendingSuggestions: null,
      clearSuggestions: jest.fn(),
      isSuggestionsLoading: false,
      stopSending: jest.fn(),
    });

    render(<ChatView />);

    expect(await screen.findByText('Failed to load messages. Please try again or reload the page.')).toBeInTheDocument();
  });

  it('calls stopSending on unmount when sending is true', () => {
    const stopSending = jest.fn();
    (useChatStore as unknown as { getState: jest.Mock }).getState.mockReturnValue({
      sending: true,
      stopSending,
    });

    mockUseChatStore.mockReturnValue({
      messagesByTopic: { 'topic-1': [] },
      sending: true,
      sendMessageStream: jest.fn((): Promise<void> => Promise.resolve()),
      fetchMessages: jest.fn((): Promise<void> => Promise.resolve()),
      pendingSuggestions: null,
      clearSuggestions: jest.fn(),
      isSuggestionsLoading: false,
      stopSending,
    });

    const { unmount } = render(<ChatView />);
    unmount();

    expect(stopSending).toHaveBeenCalled();
  });

  it('does not call stopSending on unmount when not sending', () => {
    const stopSending = jest.fn();
    (useChatStore as unknown as { getState: jest.Mock }).getState.mockReturnValue({
      sending: false,
      stopSending,
    });

    mockUseChatStore.mockReturnValue({
      messagesByTopic: { 'topic-1': [] },
      sending: false,
      sendMessageStream: jest.fn((): Promise<void> => Promise.resolve()),
      fetchMessages: jest.fn((): Promise<void> => Promise.resolve()),
      pendingSuggestions: null,
      clearSuggestions: jest.fn(),
      isSuggestionsLoading: false,
      stopSending,
    });

    const { unmount } = render(<ChatView />);
    unmount();

    expect(stopSending).not.toHaveBeenCalled();
  });
});
