import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from './Home';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useLogout } from '../store/AuthStore';
import { useTopicStore } from '../store/TopicStore';

jest.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }): React.ReactElement => <>{children}</>,
  useNavigate: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
  useLogout: jest.fn(),
}));

jest.mock('../store/TopicStore', () => ({
  useTopicStore: jest.fn(),
}));

const mockUseNavigate = useNavigate as unknown as jest.Mock<(path: string) => void>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock<{ userName: string }>;
const mockUseLogout = useLogout as unknown as jest.Mock<() => void>;
const mockUseTopicStore = useTopicStore as unknown as jest.Mock<{
  topics: { id: string; name: string; updatedOn: string }[];
  createTopic: () => Promise<{ id: string } | null>;
}>;

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLogout.mockReturnValue(jest.fn());
  });

  it('renders empty-state recent topics', () => {
    mockUseNavigate.mockReturnValue(jest.fn());
    mockUseAuthStore.mockReturnValue({ userName: 'Alex' });
    mockUseTopicStore.mockReturnValue({ topics: [], createTopic: (): Promise<null> => Promise.resolve(null) });

    render(<Home />);

    expect(screen.getByText('Hello, Alex')).toBeInTheDocument();
    expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
  });

  it('creates topic and navigates when starting a new conversation', async () => {
    const navigate = jest.fn<void, [string]>();
    mockUseNavigate.mockReturnValue(navigate);
    mockUseAuthStore.mockReturnValue({ userName: 'Alex' });
    mockUseTopicStore.mockReturnValue({
      topics: [],
      createTopic: (): Promise<{ id: string }> => Promise.resolve({ id: 'topic-123' }),
    });

    render(<Home />);

    fireEvent.click(screen.getByRole('button', { name: 'Start a New Conversation' }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/chat/topic-123');
    });
  });
});
