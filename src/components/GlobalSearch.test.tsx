import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GlobalSearch } from './GlobalSearch';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { athenaDb } from '../database/AthenaDb';
import Fuse from 'fuse.js';

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
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
  },
}));

const mockSearch = jest.fn().mockReturnValue([]);
Fuse.prototype.search = mockSearch;

const useNavigateMock = useNavigate as unknown as jest.Mock<(path: string) => void>;
const useUiStoreMock = useUiStore as unknown as jest.Mock<{ isMobile: boolean; closeDrawer: () => void }>;
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

    mockSearch.mockReturnValue([
      { item: topicItem, score: 0.1 },
    ]);

    render(<GlobalSearch />);

    fireEvent.change(screen.getByLabelText('Search topics'), { target: { value: 'cachy' } });

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

    fireEvent.change(screen.getByLabelText('Search topics'), { target: { value: 'nonexistent' } });

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

    const input = screen.getByLabelText('Search topics');
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

  it('does not search with fewer than 3 characters', () => {
    useNavigateMock.mockReturnValue(jest.fn());
    useUiStoreMock.mockReturnValue({ isMobile: false, closeDrawer: jest.fn() });

    render(<GlobalSearch />);

    const input = screen.getByLabelText('Search topics');
    fireEvent.change(input, { target: { value: 'ab' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    expect(mockSearch).not.toHaveBeenCalled();
  });
});
