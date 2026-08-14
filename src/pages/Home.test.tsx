import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from './Home';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/AuthStore';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import { useProviderStore } from '../store/ProviderStore';
import { selectorize } from '../testUtils';

jest.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }): React.ReactElement => <>{children}</>,
  useNavigate: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../store/TopicStore', () => ({ useTopicStore: jest.fn() }));
jest.mock('../store/ChatStore', () => ({ useChatStore: jest.fn() }));
jest.mock('../store/ProviderStore', () => ({ useProviderStore: jest.fn() }));

jest.mock('../components/Composer', () => ({
  __esModule: true,
  default: ({ onSend }: { onSend: (content: string, attachments?: unknown[]) => void }): React.ReactElement => (
    <button onClick={(): void => onSend('Hello draft', [])}>send</button>
  ),
}));

const mockUseNavigate = useNavigate as unknown as jest.Mock<(path: string) => void>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock;
const mockUseTopicStore = useTopicStore as unknown as jest.Mock;
const mockUseChatStore = useChatStore as unknown as jest.Mock;
const mockUseProviderStore = useProviderStore as unknown as jest.Mock;

describe('Home page', () => {
  let navigate: jest.MockedFunction<(path: string) => void>;
  let createTopic: jest.Mock;
  let sendMessageStream: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    navigate = jest.fn();
    createTopic = jest.fn();
    sendMessageStream = jest.fn();
    mockUseNavigate.mockReturnValue(navigate);
    selectorize(mockUseAuthStore, { userName: 'Alex' });
    selectorize(mockUseTopicStore, { createTopic });
    selectorize(mockUseChatStore, { sending: false, sendMessageStream });
  });

  it('renders the greeting and empty composer', () => {
    selectorize(mockUseProviderStore, { hasAnyApiKey: (): boolean => true });
    render(<Home />);

    expect(screen.getByText('Hi, Alex')).toBeInTheDocument();
    expect(screen.getByText('What would you like to talk about?')).toBeInTheDocument();
  });

  it('shows a provider setup prompt when no API key is available', () => {
    selectorize(mockUseProviderStore, { hasAnyApiKey: (): boolean => false });
    render(<Home />);

    expect(screen.getByText(/Add a provider and API key/)).toBeInTheDocument();
  });

  it('does not show the setup prompt when an API key is available', () => {
    selectorize(mockUseProviderStore, { hasAnyApiKey: (): boolean => true });
    render(<Home />);

    expect(screen.queryByText(/Add a provider and API key/)).not.toBeInTheDocument();
  });

  it('creates a topic and sends the draft on first send', async () => {
    selectorize(mockUseProviderStore, { hasAnyApiKey: (): boolean => true });
    createTopic.mockResolvedValue({ id: 'topic-123' });

    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/chat/topic-123');
      expect(sendMessageStream).toHaveBeenCalledWith('Hello draft', 'topic-123', undefined, []);
    });
  });
});
