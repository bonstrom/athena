import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ForkTabs from './ForkTabs';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import { useAuthStore } from '../store/AuthStore';
import { createTopic } from '../testUtils';

interface TopicLike {
  id: string;
  activeForkId?: string;
  forks?: { id: string; name: string; createdOn: string }[];
}

interface TopicStoreSlice {
  topics: TopicLike[];
  switchFork: (topicId: string, forkId: string) => Promise<void>;
  deleteFork: (topicId: string, forkId: string) => Promise<void>;
  renameFork: (topicId: string, forkId: string, name: string) => Promise<void>;
  reorderFork: (topicId: string, fromIndex: number, toIndex: number) => Promise<void>;
}

interface ChatStoreSlice {
  fetchMessages: (topicId: string, forkId?: string) => Promise<void>;
}

interface AuthStoreSlice {
  chatFontSize: number;
}

const mockSwitchFork = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());
const mockDeleteFork = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());
const mockRenameFork = jest.fn<Promise<void>, [string, string, string]>(() => Promise.resolve());
const mockReorderFork = jest.fn<Promise<void>, [string, number, number]>(() => Promise.resolve());
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

jest.mock('@dnd-kit/core');
jest.mock('@dnd-kit/sortable');
jest.mock('@dnd-kit/utilities');
jest.mock('@dnd-kit/modifiers');

type UseTopicStoreMock = jest.Mock<TopicStoreSlice> & {
  getState: jest.Mock<{ topics: TopicLike[] }>;
};

const mockUseTopicStore = useTopicStore as unknown as UseTopicStoreMock;
const mockUseChatStore = useChatStore as unknown as jest.Mock<ChatStoreSlice>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock<AuthStoreSlice>;

function mockTopicStoreReturn(topic: TopicLike): void {
  mockUseTopicStore.mockReturnValue({
    topics: [topic],
    switchFork: (...args: [string, string]): Promise<void> => mockSwitchFork(...args),
    deleteFork: (...args: [string, string]): Promise<void> => mockDeleteFork(...args),
    renameFork: (...args: [string, string, string]): Promise<void> => mockRenameFork(...args),
    reorderFork: (...args: [string, number, number]): Promise<void> => mockReorderFork(...args),
  });
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
      renameFork: (...args: [string, string, string]): Promise<void> => mockRenameFork(...args),
      reorderFork: (...args: [string, number, number]): Promise<void> => mockReorderFork(...args),
    });
    mockUseTopicStore.getState.mockReturnValue({ topics: [{ id: 'topic-1', activeForkId: 'main' }] });

    const { container } = render(<ForkTabs topicId="topic-1" />);

    expect(container.firstChild).toBeNull();
  });

  it('switches fork and fetches messages when another tab is selected', async () => {
    const topic = createTopic({
      activeForkId: 'main',
      forks: [
        { id: 'main', name: 'Main', createdOn: '2026-01-01T00:00:00.000Z' },
        { id: 'branch-2', name: 'Branch 2', createdOn: '2026-01-02T00:00:00.000Z' },
      ],
    });
    mockTopicStoreReturn(topic);
    mockUseTopicStore.getState.mockReturnValue({ topics: [topic] });

    render(<ForkTabs topicId="topic-1" />);

    fireEvent.click(screen.getByRole('tab', { name: /branch 2/i }));

    await waitFor(() => {
      expect(mockSwitchFork).toHaveBeenCalledWith('topic-1', 'branch-2');
      expect(mockFetchMessages).toHaveBeenCalledWith('topic-1', 'branch-2');
    });
  });

  it('deletes a fork after confirmation and refreshes active fork messages', async () => {
    const topic = createTopic({
      activeForkId: 'main',
      forks: [
        { id: 'main', name: 'Main', createdOn: '2026-01-01T00:00:00.000Z' },
        { id: 'branch-2', name: 'Branch 2', createdOn: '2026-01-02T00:00:00.000Z' },
      ],
    });
    mockTopicStoreReturn(topic);
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

  it('renames a fork after confirmation', async () => {
    const topic = createTopic({
      activeForkId: 'main',
      forks: [
        { id: 'main', name: 'Main', createdOn: '2026-01-01T00:00:00.000Z' },
        { id: 'branch-2', name: 'Branch 2', createdOn: '2026-01-02T00:00:00.000Z' },
      ],
    });
    mockTopicStoreReturn(topic);
    mockUseTopicStore.getState.mockReturnValue({ topics: [topic] });

    render(<ForkTabs topicId="topic-1" />);

    fireEvent.click(screen.getByLabelText('Rename branch Branch 2'));

    const input = screen.getByLabelText('Branch name');
    fireEvent.change(input, { target: { value: 'My Branch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => {
      expect(mockRenameFork).toHaveBeenCalledWith('topic-1', 'branch-2', 'My Branch');
    });
  });

  it('renders tabs in the order of the forks array', () => {
    const topic = createTopic({
      activeForkId: 'main',
      forks: [
        { id: 'z-last', name: 'Z Last', createdOn: '2026-01-03T00:00:00.000Z' },
        { id: 'main', name: 'Main', createdOn: '2026-01-01T00:00:00.000Z' },
        { id: 'a-first', name: 'A First', createdOn: '2026-01-02T00:00:00.000Z' },
      ],
    });
    mockTopicStoreReturn(topic);
    mockUseTopicStore.getState.mockReturnValue({ topics: [topic] });

    render(<ForkTabs topicId="topic-1" />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent('Z Last');
    expect(tabs[1]).toHaveTextContent('Main');
    expect(tabs[2]).toHaveTextContent('A First');
  });
});
