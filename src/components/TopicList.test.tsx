import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TopicList } from './TopicList';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import { useAuthStore } from '../store/AuthStore';
import { groupTopicsByDate } from '../utils/groupTopicsByDate';

interface TopicLike {
  id: string;
  name: string;
  updatedOn: string;
}

interface TopicStoreSlice {
  topics: TopicLike[];
  loading: boolean;
  visibleTopicCount: number;
  loadTopics: () => Promise<void>;
  increaseVisibleTopicCount: () => void;
}

interface ChatSelectorState {
  preloadTopics: (ids: string[]) => Promise<void>;
}

interface AuthSelectorState {
  topicPreloadCount: number;
}

const mockLoadTopics = jest.fn<Promise<void>, []>(() => Promise.resolve());
const mockIncreaseVisibleTopicCount: jest.MockedFunction<() => void> = jest.fn(() => undefined);
const mockPreloadTopics = jest.fn<Promise<void>, [string[]]>(() => Promise.resolve());

jest.mock('./TopicListItem', () => ({
  TopicListItem: ({ topic }: { topic: TopicLike }): React.ReactElement => <div data-testid="topic-item">{topic.name}</div>,
}));

jest.mock('../store/TopicStore', () => ({
  useTopicStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

jest.mock('../store/ChatStore', () => ({
  useChatStore: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('../utils/groupTopicsByDate', () => ({
  groupTopicsByDate: jest.fn(),
}));

type UseTopicStoreMock = jest.Mock<TopicStoreSlice> & {
  getState: jest.Mock<{ topics: TopicLike[] }>;
};

const mockUseTopicStore = useTopicStore as unknown as UseTopicStoreMock;
const mockUseChatStore = useChatStore as unknown as jest.Mock;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock;
const mockGroupTopicsByDate = groupTopicsByDate as jest.MockedFunction<typeof groupTopicsByDate>;

function createTopics(): TopicLike[] {
  return [
    { id: 't1', name: 'Topic 1', updatedOn: '2026-04-17T10:00:00.000Z' },
    { id: 't2', name: 'Topic 2', updatedOn: '2026-04-16T10:00:00.000Z' },
    { id: 't3', name: 'Topic 3', updatedOn: '2026-04-15T10:00:00.000Z' },
  ];
}

describe('TopicList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadTopics.mockImplementation((): Promise<void> => Promise.resolve());
    mockPreloadTopics.mockImplementation((): Promise<void> => Promise.resolve());

    const topics = createTopics();

    mockUseTopicStore.mockReturnValue({
      topics,
      loading: false,
      visibleTopicCount: 2,
      loadTopics: async (): Promise<void> => {
        await mockLoadTopics();
      },
      increaseVisibleTopicCount: (): void => mockIncreaseVisibleTopicCount(),
    });
    mockUseTopicStore.getState.mockReturnValue({ topics });

    mockUseChatStore.mockImplementation((selector: (state: ChatSelectorState) => unknown): unknown =>
      selector({
        preloadTopics: async (ids: string[]): Promise<void> => {
          await mockPreloadTopics(ids);
        },
      }),
    );

    mockUseAuthStore.mockImplementation((selector: (state: AuthSelectorState) => unknown): unknown => selector({ topicPreloadCount: 2 }));

    mockGroupTopicsByDate.mockImplementation((items) => [
      {
        label: 'Recent',
        topics: items,
      },
    ]);
  });

  it('loads topics on mount and preloads recent topic IDs', async () => {
    render(<TopicList />);

    await waitFor(() => {
      expect(mockLoadTopics).toHaveBeenCalledTimes(1);
      expect(mockPreloadTopics).toHaveBeenCalledWith(['t1', 't2']);
    });
  });

  it('shows Load Older Topics and calls increaseVisibleTopicCount on click', () => {
    render(<TopicList />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Older Topics' }));

    expect(mockIncreaseVisibleTopicCount).toHaveBeenCalledTimes(1);
  });

  it('shows loading spinner when loading is true', () => {
    const topics = createTopics();
    mockUseTopicStore.mockReturnValue({
      topics,
      loading: true,
      visibleTopicCount: 2,
      loadTopics: async (): Promise<void> => {
        await mockLoadTopics();
      },
      increaseVisibleTopicCount: (): void => mockIncreaseVisibleTopicCount(),
    });

    render(<TopicList />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
