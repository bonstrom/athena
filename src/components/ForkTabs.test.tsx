import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ForkTabs from './ForkTabs';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import { useAuthStore } from '../store/AuthStore';

interface TopicLike {
  id: string;
  activeForkId?: string;
  forks?: { id: string; name: string; createdOn: string }[];
}

interface TopicStoreSlice {
  topics: TopicLike[];
  switchFork: (topicId: string, forkId: string) => Promise<void>;
  deleteFork: (topicId: string, forkId: string) => Promise<void>;
}

interface ChatStoreSlice {
  fetchMessages: (topicId: string, forkId?: string) => Promise<void>;
}

interface AuthStoreSlice {
  chatFontSize: number;
}

const mockSwitchFork = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());
const mockDeleteFork = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());
const mockFetchMessages = jest.fn<Promise<void>, [string, string?]>(() => Promise.resolve());

jest.mock('../store/TopicStore', () => ({
  useTopicStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

jest.mock('../store/ChatStore', () => ({
  useChatStore: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

type UseTopicStoreMock = jest.Mock<TopicStoreSlice> & {
  getState: jest.Mock<{ topics: TopicLike[] }>;
};

const mockUseTopicStore = useTopicStore as unknown as UseTopicStoreMock;
const mockUseChatStore = useChatStore as unknown as jest.Mock<ChatStoreSlice>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock<AuthStoreSlice>;

function makeTopic(): TopicLike {
  return {
    id: 'topic-1',
    activeForkId: 'main',
    forks: [
      { id: 'main', name: 'Main', createdOn: '2026-01-01T00:00:00.000Z' },
      { id: 'branch-2', name: 'Branch 2', createdOn: '2026-01-02T00:00:00.000Z' },
    ],
  };
}

describe('ForkTabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChatStore.mockReturnValue({ fetchMessages: (...args: [string, string?]): Promise<void> => mockFetchMessages(...args) });
    mockUseAuthStore.mockReturnValue({ chatFontSize: 16 });
  });

  it('renders nothing when topic has no forks or only one fork', () => {
    mockUseTopicStore.mockReturnValue({
      topics: [{ id: 'topic-1', forks: [{ id: 'main', name: 'Main', createdOn: '2026-01-01T00:00:00.000Z' }] }],
      switchFork: (...args: [string, string]): Promise<void> => mockSwitchFork(...args),
      deleteFork: (...args: [string, string]): Promise<void> => mockDeleteFork(...args),
    });
    mockUseTopicStore.getState.mockReturnValue({ topics: [{ id: 'topic-1', activeForkId: 'main' }] });

    const { container } = render(<ForkTabs topicId="topic-1" />);

    expect(container.firstChild).toBeNull();
  });

  it('switches fork and fetches messages when another tab is selected', async () => {
    const topic = makeTopic();
    mockUseTopicStore.mockReturnValue({
      topics: [topic],
      switchFork: (...args: [string, string]): Promise<void> => mockSwitchFork(...args),
      deleteFork: (...args: [string, string]): Promise<void> => mockDeleteFork(...args),
    });
    mockUseTopicStore.getState.mockReturnValue({ topics: [topic] });

    render(<ForkTabs topicId="topic-1" />);

    fireEvent.click(screen.getByRole('tab', { name: /branch 2/i }));

    await waitFor(() => {
      expect(mockSwitchFork).toHaveBeenCalledWith('topic-1', 'branch-2');
      expect(mockFetchMessages).toHaveBeenCalledWith('topic-1', 'branch-2');
    });
  });

  it('deletes a fork after confirmation and refreshes active fork messages', async () => {
    const topic = makeTopic();
    mockUseTopicStore.mockReturnValue({
      topics: [topic],
      switchFork: (...args: [string, string]): Promise<void> => mockSwitchFork(...args),
      deleteFork: (...args: [string, string]): Promise<void> => mockDeleteFork(...args),
    });
    mockUseTopicStore.getState.mockReturnValue({
      topics: [{ ...topic, activeForkId: 'main', forks: [{ id: 'main', name: 'Main', createdOn: topic.forks?.[0].createdOn ?? '' }] }],
    });

    render(<ForkTabs topicId="topic-1" />);

    fireEvent.click(screen.getByLabelText('Delete branch Branch 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockDeleteFork).toHaveBeenCalledWith('topic-1', 'branch-2');
      expect(mockFetchMessages).toHaveBeenCalledWith('topic-1', 'main');
    });
  });
});
