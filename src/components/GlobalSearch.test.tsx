import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GlobalSearch } from './GlobalSearch';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { useChatStore } from '../store/ChatStore';
import { athenaDb } from '../database/AthenaDb';
import Fuse from 'fuse.js';
import { MockStoreHookWithGetState } from '../testUtils';

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
}));

jest.mock('../store/ChatStore', () => ({
  useChatStore: Object.assign(jest.fn(), {
    getState: jest.fn(),
  }),
}));

jest.mock('../database/AthenaDb', () => ({
  athenaDb: {
    topics: {
      bulkGet: jest.fn(),
      toCollection: jest.fn(),
    },
    messages: {
      toCollection: jest.fn(),
    },
    predefinedPrompts: {
      toArray: jest.fn().mockResolvedValue([]),
    },
  },
}));

const mockSearch = jest.fn().mockReturnValue([]);
Fuse.prototype.search = mockSearch;

const useNavigateMock = useNavigate as unknown as jest.Mock<(path: string) => void>;
const useUiStoreMock = useUiStore as unknown as jest.Mock<{ isMobile: boolean; closeDrawer: () => void }>;
const useChatStoreMock = useChatStore as unknown as MockStoreHookWithGetState<
  jest.Mock<Record<string, unknown>>,
  { highlightedMessageId?: string | null; setHighlightedMessageId: jest.Mock }
>;
const athenaDbMock = athenaDb as unknown as {
  topics: {
    bulkGet: jest.Mock;
    toCollection: jest.Mock;
  };
  messages: {
    toCollection: jest.Mock;
  };
};

describe('GlobalSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    const setHighlightedMessageId = jest.fn();
    (useChatStoreMock.getState as jest.Mock).mockReturnValue({
      highlightedMessageId: null,
      setHighlightedMessageId,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('searches topics with fuzzy matching and navigates to selected result', async () => {
    const navigate = jest.fn();
    const closeDrawer = jest.fn();
    useNavigateMock.mockReturnValue(navigate);
    useUiStoreMock.mockReturnValue({ isMobile: true, closeDrawer });

    const topicItem = {
      id: 't1',
      name: 'Aider install on CachyOS',
      updatedOn: '2026-04-17T10:00:00.000Z',
      isDeleted: false,
    };

    const topicCollectionChain = {
      filter: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([topicItem]),
      }),
    };
    athenaDbMock.topics.toCollection.mockReturnValue(topicCollectionChain);

    mockSearch.mockReturnValue([{ item: topicItem, score: 0.1 }]);

    render(<GlobalSearch />);

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'cachy' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Aider install on CachyOS')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Aider install on CachyOS'));

    expect(navigate).toHaveBeenCalledWith('/chat/t1');
    expect(closeDrawer).toHaveBeenCalledTimes(1);
  });

  it('shows empty-state text when no fuzzy matches are found', async () => {
    useNavigateMock.mockReturnValue(jest.fn());
    useUiStoreMock.mockReturnValue({ isMobile: false, closeDrawer: jest.fn() });

    const topicCollectionChain = {
      filter: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      }),
    };
    athenaDbMock.topics.toCollection.mockReturnValue(topicCollectionChain);

    mockSearch.mockReturnValue([]);

    render(<GlobalSearch />);

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'nonexistent' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    expect(await screen.findByText('No results found for "nonexistent"')).toBeInTheDocument();
  });

  it('searches messages with fuzzy matching and displays parent topic name', async () => {
    useNavigateMock.mockReturnValue(jest.fn());
    useUiStoreMock.mockReturnValue({ isMobile: false, closeDrawer: jest.fn() });

    const messageItem = {
      id: 'm1',
      topicId: 't1',
      content: 'To install Aider on CachyOS, use yay -S aider',
      isDeleted: false,
      created: '2026-04-17T12:00:00.000Z',
    };
    const parentTopic = {
      id: 't1',
      name: 'Aider install',
      isDeleted: false,
    };

    const messageCollectionChain = {
      filter: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([messageItem]),
      }),
    };
    const topicChain = {
      filter: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      }),
    };
    athenaDbMock.topics.toCollection.mockReturnValue(topicChain);
    athenaDbMock.messages.toCollection.mockReturnValue(messageCollectionChain);
    athenaDbMock.topics.bulkGet.mockResolvedValue([parentTopic]);

    mockSearch.mockReturnValue([
      {
        item: messageItem,
        score: 0.15,
        matches: [{ key: 'content', indices: [[13, 20]] }],
      },
    ]);

    render(<GlobalSearch />);

    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: 'cachyos' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    // Switch to messages mode by clicking the chip
    fireEvent.click(screen.getByText('Topics'));

    await waitFor(() => {
      expect(screen.getByText('Aider install')).toBeInTheDocument();
    });
  });

  it('sets highlightedMessageId when clicking a message search result', async () => {
    const navigate = jest.fn();
    const closeDrawer = jest.fn();
    useNavigateMock.mockReturnValue(navigate);
    useUiStoreMock.mockReturnValue({ isMobile: false, closeDrawer });

    const messageItem = {
      id: 'm1',
      topicId: 't1',
      content: 'To install Aider on CachyOS, use yay -S aider',
      isDeleted: false,
      created: '2026-04-17T12:00:00.000Z',
    };
    const parentTopic = {
      id: 't1',
      name: 'Aider install',
      isDeleted: false,
    };

    const messageCollectionChain = {
      filter: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([messageItem]),
      }),
    };
    const topicChain = {
      filter: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      }),
    };
    athenaDbMock.topics.toCollection.mockReturnValue(topicChain);
    athenaDbMock.messages.toCollection.mockReturnValue(messageCollectionChain);
    athenaDbMock.topics.bulkGet.mockResolvedValue([parentTopic]);

    mockSearch.mockReturnValue([
      {
        item: messageItem,
        score: 0.15,
        matches: [{ key: 'content', indices: [[13, 20]] }],
      },
    ]);

    render(<GlobalSearch />);

    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: 'cachyos' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    // Switch to messages mode
    fireEvent.click(screen.getByText('Topics'));

    await waitFor(() => {
      expect(screen.getByText('Aider install')).toBeInTheDocument();
    });

    // Get the setHighlightedMessageId mock from beforeEach setup
    const state = (useChatStoreMock.getState as jest.Mock<{ setHighlightedMessageId: jest.Mock }>)();
    const mockSetHighlighted = state.setHighlightedMessageId;

    fireEvent.click(screen.getByText('Aider install'));

    expect(mockSetHighlighted).toHaveBeenCalledWith('m1');
    expect(navigate).toHaveBeenCalledWith('/chat/t1');
  });

  it('does not search with fewer than 3 characters', () => {
    useNavigateMock.mockReturnValue(jest.fn());
    useUiStoreMock.mockReturnValue({ isMobile: false, closeDrawer: jest.fn() });

    render(<GlobalSearch />);

    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: 'ab' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('shows error message when search fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation((): void => {
      /* ignore */
    });
    useNavigateMock.mockReturnValue(jest.fn());
    useUiStoreMock.mockReturnValue({ isMobile: false, closeDrawer: jest.fn() });

    const topicCollectionChain = {
      filter: jest.fn().mockReturnValue({
        toArray: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      }),
    };
    athenaDbMock.topics.toCollection.mockReturnValue(topicCollectionChain);

    render(<GlobalSearch />);

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'test query' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    expect(await screen.findByText('Search failed. Please try again.')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith('Search failed:', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('re-opens dropdown on focus when query has 3+ characters', async () => {
    useNavigateMock.mockReturnValue(jest.fn());
    useUiStoreMock.mockReturnValue({ isMobile: false, closeDrawer: jest.fn() });

    const topicCollectionChain = {
      filter: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      }),
    };
    athenaDbMock.topics.toCollection.mockReturnValue(topicCollectionChain);
    mockSearch.mockReturnValue([]);

    render(<GlobalSearch />);

    const input = screen.getByLabelText('Search');

    // Type a query to open the dropdown
    fireEvent.change(input, { target: { value: 'test' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    // Wait for the async search to complete
    await waitFor(() => {
      expect(screen.getByText('No results found for "test"')).toBeInTheDocument();
    });

    // Simulate click away to close
    fireEvent.click(document.body);

    // Verify dropdown closed
    expect(screen.queryByText('No results found for "test"')).not.toBeInTheDocument();

    // Re-focus the input — dropdown should reopen
    fireEvent.focus(input);

    // The dropdown should be open again (the "No results" text appears)
    expect(screen.getByText('No results found for "test"')).toBeInTheDocument();
  });
});
