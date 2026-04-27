import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TopicList } from './TopicList';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import { useAuthStore } from '../store/AuthStore';
import { useUiStore } from '../store/UiStore';
import { useNavigate, useParams } from 'react-router-dom';
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
  deleteTopics: (ids: string[]) => Promise<void>;
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
const mockDeleteTopics = jest.fn<Promise<void>, [string[]]>(() => Promise.resolve());
const mockNavigate: jest.MockedFunction<(path: string) => void> = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
  useParams: jest.fn(),
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
}));

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
const mockUseUiStore = useUiStore as unknown as jest.Mock;
const mockUseNavigate = useNavigate as unknown as jest.Mock;
const mockUseParams = useParams as unknown as jest.Mock;
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
    mockDeleteTopics.mockImplementation((): Promise<void> => Promise.resolve());
    mockUseNavigate.mockReturnValue(mockNavigate);
    mockUseParams.mockReturnValue({ topicId: undefined });
    mockUseUiStore.mockReturnValue({ selectedTopicIds: new Set<string>(), selectAllTopics: jest.fn(), clearTopicSelection: jest.fn() });

    const topics = createTopics();

    mockUseTopicStore.mockReturnValue({
      topics,
      loading: false,
      visibleTopicCount: 2,
      loadTopics: async (): Promise<void> => {
        await mockLoadTopics();
      },
      increaseVisibleTopicCount: (): void => mockIncreaseVisibleTopicCount(),
      deleteTopics: async (ids: string[]): Promise<void> => {
        await mockDeleteTopics(ids);
      },
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
      deleteTopics: async (ids: string[]): Promise<void> => {
        await mockDeleteTopics(ids);
      },
    });

    render(<TopicList />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  describe('bulk delete', () => {
    function renderWithSelection(selectedIds: string[]): { mockClearTopicSelection: jest.Mock; mockSelectAllTopics: jest.Mock } {
      const mockClearTopicSelection = jest.fn();
      const mockSelectAllTopics = jest.fn();
      mockUseUiStore.mockReturnValue({
        selectedTopicIds: new Set<string>(selectedIds),
        selectAllTopics: mockSelectAllTopics,
        clearTopicSelection: mockClearTopicSelection,
      });
      render(<TopicList />);
      return { mockClearTopicSelection, mockSelectAllTopics };
    }

    it('shows selection toolbar with count when topics are selected', () => {
      renderWithSelection(['t1', 't2']);

      expect(screen.getByText('2 selected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    });

    it('shows Select All button when not all visible topics are selected', () => {
      renderWithSelection(['t1']);

      expect(screen.getByRole('button', { name: 'Select All' })).toBeInTheDocument();
    });

    it('hides Select All button when all visible topics are already selected', () => {
      // visibleTopicCount is 2, so t1 and t2 are visible
      renderWithSelection(['t1', 't2']);

      expect(screen.queryByRole('button', { name: 'Select All' })).not.toBeInTheDocument();
    });

    it('Select All calls selectAllTopics with visible topic IDs', () => {
      const { mockSelectAllTopics } = renderWithSelection(['t1']);

      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));

      expect(mockSelectAllTopics).toHaveBeenCalledWith(['t1', 't2']);
    });

    it('Clear button calls clearTopicSelection', () => {
      const { mockClearTopicSelection } = renderWithSelection(['t1']);

      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

      expect(mockClearTopicSelection).toHaveBeenCalledTimes(1);
    });

    it('Delete button opens confirmation dialog', () => {
      renderWithSelection(['t1']);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(screen.getByRole('heading', { name: /Delete 1 Topics/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete All' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('Cancel closes dialog without calling deleteTopics', async () => {
      renderWithSelection(['t1']);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Delete All' })).not.toBeInTheDocument();
      });
      expect(mockDeleteTopics).not.toHaveBeenCalled();
    });

    it('Delete All calls deleteTopics with selected IDs and clears selection', async () => {
      const { mockClearTopicSelection } = renderWithSelection(['t1', 't2']);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete All' }));

      await waitFor(() => {
        expect(mockDeleteTopics).toHaveBeenCalledWith(['t1', 't2']);
        expect(mockClearTopicSelection).toHaveBeenCalledTimes(1);
      });
    });

    it('navigates to / after deleting the currently active topic', async () => {
      mockUseParams.mockReturnValue({ topicId: 't1' });
      renderWithSelection(['t1']);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete All' }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('does not navigate when the active topic is not among the deleted IDs', async () => {
      mockUseParams.mockReturnValue({ topicId: 't3' });
      renderWithSelection(['t1', 't2']);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete All' }));

      await waitFor(() => {
        expect(mockDeleteTopics).toHaveBeenCalledWith(['t1', 't2']);
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
