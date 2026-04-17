import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatView from './ChatView';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '../store/AuthStore';
import { useChatStore } from '../store/ChatStore';
import { useTopicStore } from '../store/TopicStore';

jest.mock('../components/Composer', () => ({
  __esModule: true,
  default: ({ onSend }: { onSend: (content: string) => void }): JSX.Element => (
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
  default: ({ onSuggestionSelect }: { onSuggestionSelect: (s: string) => void }): JSX.Element => (
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
  default: ({ topicId }: { topicId: string }): JSX.Element => <div data-testid="fork-tabs">{topicId}</div>,
}));

jest.mock('@mui/material', () => {
  const actual = jest.requireActual('@mui/material') as Record<string, unknown>;
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

jest.mock('../store/ChatStore', () => ({
  useChatStore: jest.fn(),
}));

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
    mockUseChatStore.mockReturnValue({
      messagesByTopic: { 'topic-1': [] },
      sending: false,
      sendMessageStream: jest.fn((): Promise<void> => Promise.resolve()),
      fetchMessages: jest.fn((): Promise<void> => Promise.resolve()),
      pendingSuggestions: ['suggested reply'],
      clearSuggestions: jest.fn(),
      isSuggestionsLoading: false,
    });

    mockUseTopicStore.mockImplementation((selector: (state: { topics: { id: string; maxContextMessages?: number }[] }) => unknown): unknown =>
      selector({ topics: [{ id: 'topic-1', maxContextMessages: 20 }] }),
    );
    mockUseTopicStore.getState.mockReturnValue({ topics: [{ id: 'topic-1' }] });
  });

  it('renders chat content and sends suggestion through store action', async () => {
    const clearSuggestions = jest.fn<void, []>();
    const sendMessageStream = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());
    const fetchMessages = jest.fn<Promise<void>, [string]>(() => Promise.resolve());

    mockUseChatStore.mockReturnValue({
      messagesByTopic: { 'topic-1': [] },
      sending: false,
      sendMessageStream,
      fetchMessages,
      pendingSuggestions: ['suggested reply'],
      clearSuggestions,
      isSuggestionsLoading: false,
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
    });
    mockUseTopicStore.getState.mockReturnValue({ topics: [{ id: 'other-topic' }] });

    render(<ChatView />);

    expect(await screen.findByText('Topic not found')).toBeInTheDocument();
  });
});
