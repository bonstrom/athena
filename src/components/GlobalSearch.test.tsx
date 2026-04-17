import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GlobalSearch } from './GlobalSearch';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { athenaDb } from '../database/AthenaDb';

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
}));

jest.mock('../database/AthenaDb', () => ({
  athenaDb: {
    topics: {
      where: jest.fn(),
      bulkGet: jest.fn(),
    },
    messages: {
      where: jest.fn(),
    },
  },
}));

const mockUseNavigate = useNavigate as unknown as jest.Mock<(path: string) => void>;
const mockUseUiStore = useUiStore as unknown as jest.Mock<{ isMobile: boolean; closeDrawer: () => void }>;
const mockAthenaDb = athenaDb as unknown as {
  topics: {
    where: jest.Mock;
    bulkGet: jest.Mock;
  };
  messages: {
    where: jest.Mock;
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

  it('searches and navigates to selected result topic', async () => {
    const navigate = jest.fn<void, [string]>();
    const closeDrawer = jest.fn<void, []>();
    mockUseNavigate.mockReturnValue(navigate);
    mockUseUiStore.mockReturnValue({ isMobile: true, closeDrawer });

    const startsWithIgnoreCase = jest.fn().mockReturnValue({
      filter: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([{ id: 't1', name: 'Topic One', updatedOn: '2026-04-17T10:00:00.000Z', isDeleted: false }]),
      }),
    });
    const topicDeletedChain = {
      equals: jest.fn().mockReturnValue({
        filter: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      }),
    };
    const messageDeletedChain = {
      equals: jest.fn().mockReturnValue({
        filter: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    mockAthenaDb.topics.where.mockImplementation((field: string) => {
      if (field === 'name') return { startsWithIgnoreCase };
      return topicDeletedChain;
    });
    mockAthenaDb.messages.where.mockImplementation(() => messageDeletedChain);
    mockAthenaDb.topics.bulkGet.mockResolvedValue([]);

    render(<GlobalSearch />);

    fireEvent.change(screen.getByLabelText('Search topics and messages'), { target: { value: 'topic' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Topic One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Topic One'));

    expect(navigate).toHaveBeenCalledWith('/chat/t1');
    expect(closeDrawer).toHaveBeenCalledTimes(1);
  });

  it('shows empty-state text when no matches are found', async () => {
    mockUseNavigate.mockReturnValue(jest.fn());
    mockUseUiStore.mockReturnValue({ isMobile: false, closeDrawer: jest.fn() });

    const startsWithIgnoreCase = jest.fn().mockReturnValue({
      filter: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      }),
    });
    const topicDeletedChain = {
      equals: jest.fn().mockReturnValue({
        filter: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      }),
    };
    const messageDeletedChain = {
      equals: jest.fn().mockReturnValue({
        filter: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    mockAthenaDb.topics.where.mockImplementation((field: string) => {
      if (field === 'name') return { startsWithIgnoreCase };
      return topicDeletedChain;
    });
    mockAthenaDb.messages.where.mockImplementation(() => messageDeletedChain);
    mockAthenaDb.topics.bulkGet.mockResolvedValue([]);

    render(<GlobalSearch />);

    fireEvent.change(screen.getByLabelText('Search topics and messages'), { target: { value: 'none' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    expect(await screen.findByText('No results found for "none"')).toBeInTheDocument();
  });
});
